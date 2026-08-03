// scrape-location-page — anon-callable edge function (verify_jwt = false).
//
// Takes a client-supplied location-page URL, fetches it directly, extracts the
// public business fields with Gemini (structured output), snaps hours to the
// form's 15-minute grid, and returns a form-field-keyed `suggested` object the
// intake form applies via applyScrapedSuggestions(). Read-only: it never writes
// the submission row and never returns any secret. Guardrails: http(s)-only +
// SSRF host block re-checked on every redirect hop, per-IP rate limit, and a
// per-URL cache.
//
// Fetching used to go through Firecrawl. That key ran out of credits and the
// whole feature returned 502 for eleven days before anyone noticed, so the
// dependency is gone: brand location pages are server-rendered and a plain
// fetch reads them fine. We keep what Firecrawl was actually buying us —
// main-content extraction — by pulling JSON-LD and the title out before
// flattening the markup, which on these pages is better structured than the
// markdown Firecrawl returned.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Gemini per George's direction (2026-07-22) — the Anthropic account behind the
// available key is unfunded. GEMINI_API_KEY is the primary provider; when it's
// absent the function falls back to Anthropic (ANTHROPIC_API_KEY) on Opus 4.8.
import {
  DAYS,
  MIN_USEFUL_CHARS,
  FINDER_PATH_RE,
  isBlockedHost,
  pageText,
  enrichmentLinks,
  snapHours,
} from './extract.ts';

const GEMINI_MODEL = 'gemini-3.5-flash';
const ANTHROPIC_MODEL = 'claude-opus-4-8';
const CACHE_TTL_HOURS = 24 * 7;     // reuse a scrape for a week
const RATE_LIMIT = 12;              // requests ...
const RATE_WINDOW_MIN = 60;        // ... per IP per hour
const MAX_ENRICH_PAGES = 2;        // also follow up to N About/Story/FAQ links
const COMBINED_MAX_CHARS = 90000;  // cap the combined text fed to the model



// Best-guess US state -> IANA timezone, using ONLY the values the form's
// timezone <select> offers. Predominant zone per state (a placeholder the
// client/team confirms or changes — multi-zone states pick the majority).
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/Kentucky/Louisville', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// applies directly. The model is told to OMIT anything not explicitly on the page.
const EXTRACT_TOOL = {
  name: 'location_fields',
  description: 'Public business details extracted from a single fitness/wellness studio LOCATION web page.',
  input_schema: {
    type: 'object',
    properties: {
      business_name: { type: 'string', description: 'The studio/location name shown on the page.' },
      business_email: { type: 'string' },
      business_phone: { type: 'string', description: 'Public phone number as shown.' },
      address: { type: 'string', description: 'Street address line 1.' },
      city: { type: 'string' },
      state: { type: 'string', description: 'Two-letter US state code if determinable.' },
      zip: { type: 'string' },
      website_url: { type: 'string' },
      google_business_profile_url: { type: 'string' },
      facebook_page_url: { type: 'string' },
      instagram_handle: { type: 'string', description: 'Handle without @, or full URL.' },
      tiktok_handle: { type: 'string' },
      booking_payment_link: { type: 'string', description: 'Online booking or trial signup URL.' },
      parent_brand_name: { type: 'string', description: 'The FRANCHISE brand name ONLY if this is a recognizable franchise (e.g. Club Pilates, Stretch Zone, StretchLab). Leave empty for an independent or standalone business, even if it has several locations.' },
      is_multi_location: { type: 'boolean', description: 'True only if this business is part of a multi-location chain or franchise (more than one location).' },
      bk_service_description: { type: 'string', description: 'Short description of services/classes offered.' },
      intro_offer: { type: 'string', description: 'New-client intro offer / first-visit promo, only if stated.' },
      main_cta: { type: 'string', description: 'The primary call-to-action the studio uses for new leads, as a short phrase, e.g. "Book a free intro", "Book a free demo", "Start a free trial", "Schedule a call". Only if clearly present.' },
      bk_unique_value: { type: 'string', description: 'What makes this studio unique: their story, philosophy, mission, or differentiators, summarized from the page / About / "our story" content.' },
      bk_ideal_client: { type: 'string', description: 'Who the studio is for, their ideal client or target audience, if described.' },
      bk_testimonials: { type: 'string', description: 'Notable client testimonials or reviews quoted on the page, if any (verbatim).' },
      bk_faq: { type: 'string', description: 'Frequently asked questions and their answers shown on the page, if any.' },
      hours: {
        type: 'object',
        description: 'Business hours per day, 24h HH:MM. Only include days you can determine.',
        properties: Object.fromEntries(DAYS.map((d) => [d, {
          type: 'object',
          properties: {
            open: { type: 'string', description: '24h HH:MM' },
            close: { type: 'string', description: '24h HH:MM' },
            closed: { type: 'boolean' },
          },
        }])),
      },
    },
  },
};

const SYSTEM_PROMPT_BASE =
  'You extract structured business details from the text of a single fitness or wellness studio LOCATION web page. ' +
  'For FACTUAL fields (name, address, city, state, zip, phone, email, links, hours, intro_offer), only return values ' +
  'EXPLICITLY present in the page text — never guess, infer, approximate, or fabricate. ' +
  'For DESCRIPTIVE fields (bk_service_description, bk_unique_value, bk_ideal_client, bk_testimonials, bk_faq, main_cta), ' +
  'summarize faithfully from the page, About, or "our story" content when present; omit them if the page says nothing relevant. ' +
  'Never include internal or operational details (CRM, logins, staff names). If a field is not determinable, OMIT it.';
const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE + ' Always respond by calling the location_fields tool.';
const SYSTEM_PROMPT_JSON = SYSTEM_PROMPT_BASE + ' Respond with a single JSON object matching the provided schema.';

// Gemini's responseSchema is an OpenAPI-style subset (UPPERCASE type names).
// Derive it from the same EXTRACT_TOOL schema so the two providers stay in sync.
function toGeminiSchema(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, any> = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toGeminiSchema(v);
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return jsonError('POST only', 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    console.error('scrape: no GEMINI_API_KEY or ANTHROPIC_API_KEY configured');
    return jsonError('Prefill is not configured on the server.', 503);
  }

  // ---- parse + validate input ------------------------------------------------
  let input: any;
  try { input = await req.json(); } catch { return jsonError('Invalid JSON body.', 400); }
  const rawUrl = typeof input?.url === 'string' ? input.url.trim() : '';
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return jsonError('Please provide a valid URL.', 400); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonError('Only http(s) URLs are supported.', 400);
  }
  if (isBlockedHost(parsed.hostname)) return jsonError('That URL is not allowed.', 400);
  const url = parsed.toString();
  const cacheKey = (parsed.origin + parsed.pathname).toLowerCase().replace(/\/+$/, '') || parsed.origin;

  const admin = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

  // ---- rate limit (per IP, best-effort) -------------------------------------
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (admin) {
    try {
      const nowIso = new Date().toISOString();
      const { data: rl } = await admin.from('scrape_rate_limit').select('*').eq('ip', ip).maybeSingle();
      if (!rl) {
        await admin.from('scrape_rate_limit').insert({ ip, count: 1, window_start: nowIso });
      } else {
        const ageMin = (Date.now() - new Date(rl.window_start).getTime()) / 60000;
        if (ageMin > RATE_WINDOW_MIN) {
          await admin.from('scrape_rate_limit').update({ count: 1, window_start: nowIso }).eq('ip', ip);
        } else if (rl.count >= RATE_LIMIT) {
          return jsonError('Too many requests. Please wait a bit and try again.', 429);
        } else {
          await admin.from('scrape_rate_limit').update({ count: rl.count + 1 }).eq('ip', ip);
        }
      }
    } catch { /* rate-limit table missing/unavailable: fail open */ }

    // ---- cache hit -----------------------------------------------------------
    try {
      const { data: cached } = await admin
        .from('scrape_cache').select('result, scraped_at').eq('url', cacheKey).maybeSingle();
      if (cached?.result) {
        const ageH = (Date.now() - new Date(cached.scraped_at).getTime()) / 3600000;
        if (ageH < CACHE_TTL_HOURS) return jsonOk(cached.result);
      }
    } catch { /* cache table missing/unavailable: fall through to live scrape */ }
  }

  // ---- read the location page + up to 2 About/Story/FAQ pages ---------------
  const main = await pageText(url);
  if (!main.text.trim()) return jsonError('Could not read that page right now.', 502);

  // A stale or wrong location URL typically 301s to the brand's location
  // finder. Extracting that page yields confident nonsense, so name the real
  // problem instead: the client can fix it in five seconds if we tell them.
  const landedElsewhere =
    new URL(main.finalUrl).pathname.replace(/\/+$/, '').toLowerCase() !==
    parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (landedElsewhere && FINDER_PATH_RE.test(new URL(main.finalUrl).pathname)) {
    console.error(`scrape: ${url} redirected to finder page ${main.finalUrl}`);
    return jsonError(
      'That link redirects to your brand\'s location finder rather than a single studio page. ' +
      'Please paste the URL for your specific location.',
      422,
    );
  }
  if (main.text.length < MIN_USEFUL_CHARS) {
    console.error(`scrape: ${main.finalUrl} yielded only ${main.text.length} chars of text`);
    return jsonError('There was not enough readable text on that page to pre-fill from.', 502);
  }

  let combined = main.text;
  for (const eu of enrichmentLinks(main.html, main.finalUrl, MAX_ENRICH_PAGES)) {
    if (combined.length >= COMBINED_MAX_CHARS) break;
    const extra = await pageText(eu);
    if (extra.text.trim()) combined += `\n\n---\nAdditional page (${eu}):\n\n${extra.text}`;
  }
  combined = combined.slice(0, COMBINED_MAX_CHARS);

  // ---- extract (Gemini primary; Anthropic fallback when no Gemini key) ------
  const userPrompt = `Location page URL: ${url}\n\nScraped content (markdown, may include linked About/Story/FAQ pages):\n\n${combined}`;
  let extracted: any = {};
  try {
    if (GEMINI_API_KEY) {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': GEMINI_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT_JSON }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: toGeminiSchema(EXTRACT_TOOL.input_schema),
            },
          }),
        },
      );
      if (!gr.ok) {
        console.error('Gemini extraction failed:', gr.status, await gr.text());
        return jsonError(`Extraction failed (${gr.status}).`, 502);
      }
      const gj = await gr.json();
      const text = (gj?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p?.text || '')
        .join('');
      extracted = text ? JSON.parse(text) : {};
    } else {
      const ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        // NOTE: no temperature/top_p/top_k — Opus rejects sampling params.
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          tools: [EXTRACT_TOOL],
          tool_choice: { type: 'tool', name: 'location_fields' },
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!ar.ok) {
        console.error('Anthropic extraction failed:', ar.status, await ar.text());
        return jsonError(`Extraction failed (${ar.status}).`, 502);
      }
      const aj = await ar.json();
      const toolUse = Array.isArray(aj?.content) ? aj.content.find((c: any) => c.type === 'tool_use') : null;
      extracted = toolUse?.input || {};
    }
  } catch (e) {
    console.error('Extraction error:', e);
    return jsonError('Could not analyze the page right now.', 502);
  }

  // ---- shape the response (drop empties, snap hours) ------------------------
  if (extracted.hours) extracted.hours = snapHours(extracted.hours);
  // Best-guess timezone from state (a placeholder the client/team confirms).
  if (!extracted.timezone && typeof extracted.state === 'string') {
    const tz = STATE_TZ[extracted.state.trim().toUpperCase()];
    if (tz) extracted.timezone = tz;
  }
  const suggested: Record<string, any> = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (k === 'hours' && (!v || Object.keys(v).length === 0)) continue;
    suggested[k] = v;
  }
  const result = {
    suggested,
    filled_fields: Object.keys(suggested),
    source_url: url,
    scraped_at: new Date().toISOString(),
  };

  // ---- write cache (best-effort) --------------------------------------------
  if (admin) {
    try {
      await admin.from('scrape_cache').upsert({ url: cacheKey, result, scraped_at: result.scraped_at });
    } catch { /* ignore cache write failures */ }
  }

  return jsonOk(result);
});
