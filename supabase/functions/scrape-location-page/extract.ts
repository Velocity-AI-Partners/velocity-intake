// Page reading for scrape-location-page.
//
// Split out of index.ts so the extraction logic can be exercised directly by
// extract_test.ts. index.ts owns the HTTP endpoint and the model calls; this
// file owns "turn a URL into text a model can read", including the SSRF guard
// that has to run on every redirect hop.

export const PAGE_MAX_CHARS = 60000;      // cap the text taken from any one page
export const FETCH_TIMEOUT_MS = 15000;    // a slow brand site must not hang the function
export const MAX_REDIRECTS = 5;
export const MIN_USEFUL_CHARS = 200;      // below this there is nothing worth extracting

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A desktop UA: some brand sites serve a stripped or JS-only page to unknown
// clients, which is one way a "server-rendered" page can look empty.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Paths a brand redirects to when a location URL is stale or wrong — their
// location finder. Landing here means we are about to extract a generic
// marketing page, so we say so instead of filling the form with the wrong data.
export const FINDER_PATH_RE =
  /(?:location|store|studio|club|gym|find)[-_]?(?:search|finder|find|locator)|^\/(?:locations?|studios?|clubs?|search|find(?:-a-[a-z-]+)?)\/?$/i;

// SSRF defense-in-depth: reject localhost / private / link-local / metadata hosts.
export function isBlockedHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;       // link-local incl. 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 only. These prefix tests used to run against every hostname, which
  // blocked any real domain starting "fc"/"fd" — fcfitness.com, fdny.org.
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true;
    if (/^f[cd]/.test(h) || h.startsWith('fe80')) return true;
  }
  return false;
}

// A hostname can point into private space without looking like it. Wildcard
// DNS services (nip.io, sslip.io) embed the target address right in the name,
// and any attacker-controlled domain can simply publish an A record for
// 169.254.169.254. Firecrawl used to absorb this risk because it did the
// fetching from its own infrastructure; now that we fetch directly from the
// edge runtime — which holds the service-role key — the check is ours to make.
export function embeddedPrivateIp(hostname: string): boolean {
  const m = (hostname || '').toLowerCase().match(/(?:^|[.-])(\d{1,3})[-.](\d{1,3})[-.](\d{1,3})[-.](\d{1,3})(?:[.-]|$)/);
  if (!m) return false;
  return isBlockedHost(`${+m[1]}.${+m[2]}.${+m[3]}.${+m[4]}`);
}

// Resolve and check the actual addresses. Fails OPEN when DNS is unavailable
// (the edge runtime may not expose Deno.resolveDns) so a resolver hiccup never
// takes prefill down — the literal and embedded checks still stand on their own.
export async function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  const resolve = (Deno as unknown as { resolveDns?: (h: string, t: string) => Promise<string[]> })?.resolveDns;
  if (typeof resolve !== 'function') return false;
  for (const kind of ['A', 'AAAA']) {
    try {
      for (const ip of await resolve(hostname, kind)) {
        if (isBlockedHost(String(ip))) return true;
      }
    } catch { /* NXDOMAIN, no permission, or no record of this type */ }
  }
  return false;
}

// Decode the HTML entities that actually show up in address/hours text.
export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', bull: '•', middot: '·', deg: '°',
    trade: '™', reg: '®', copy: '©', eacute: 'é', times: '×',
  };
  return s.replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (m, g: string) => {
    if (g[0] === '#') {
      const hex = g[1] === 'x' || g[1] === 'X';
      const code = parseInt(hex ? g.slice(2) : g.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const k = g.toLowerCase();
    return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : m;
  });
}

// Flatten HTML to readable text. Block-level tags become newlines so an address
// block and an hours table don't run together into one unreadable line.
export function htmlToText(html: string): string {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(script|style|noscript|svg|canvas|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  h = h.replace(/<(script|style|noscript|svg|canvas|template|iframe)\b[^>]*\/?>/gi, ' ');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/(p|div|section|article|li|tr|h[1-6]|td|th|dt|dd|blockquote|header|footer|nav|main|address)\s*>/gi, '\n');
  h = h.replace(/<(p|div|section|article|li|tr|h[1-6]|table|ul|ol|header|footer|nav|main|address)\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decodeEntities(h);
  h = h.replace(/[ \t ]+/g, ' ');
  h = h.replace(/ *\n[ \n]*/g, '\n');
  return h.trim();
}

// LocalBusiness JSON-LD carries address, phone and openingHours as clean data.
// When a page has it, it beats any prose extraction — so hand it to the model
// verbatim alongside the flattened text.
export function extractJsonLd(html: string): string {
  const out: string[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    const raw = decodeEntities((m[1] || '').trim());
    if (!raw) continue;
    try {
      // Re-serialize so malformed or enormous blobs can't poison the prompt.
      const parsed = JSON.parse(raw);
      const s = JSON.stringify(parsed);
      if (s.length <= 20000) out.push(s);
    } catch { /* a broken JSON-LD block is not worth failing the scrape over */ }
  }
  return out.join('\n');
}

// Fetch following redirects MANUALLY so the SSRF host check runs on every hop.
// `redirect: 'follow'` would let a public URL bounce us into the metadata
// service before we ever got to inspect where we landed.
export async function guardedFetch(
  startUrl: string,
): Promise<{ html: string; finalUrl: string; status: number; error?: string }> {
  let url = startUrl;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let u: URL;
      try { u = new URL(url); } catch { return { html: '', finalUrl: url, status: 0, error: 'invalid redirect target' }; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { html: '', finalUrl: url, status: 0, error: `blocked scheme ${u.protocol}` };
      }
      if (
        isBlockedHost(u.hostname) ||
        embeddedPrivateIp(u.hostname) ||
        await resolvesToBlockedAddress(u.hostname)
      ) {
        return { html: '', finalUrl: url, status: 0, error: `blocked host ${u.hostname}` };
      }
      const res = await fetch(u.toString(), {
        redirect: 'manual',
        signal: ctl.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        try { await res.body?.cancel(); } catch { /* already consumed */ }
        if (!loc) return { html: '', finalUrl: u.toString(), status: res.status, error: 'redirect without Location' };
        url = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        return { html: '', finalUrl: u.toString(), status: res.status, error: `HTTP ${res.status}` };
      }
      const ctype = res.headers.get('content-type') || '';
      if (ctype && !/text\/html|application\/xhtml|text\/plain/i.test(ctype)) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        return { html: '', finalUrl: u.toString(), status: res.status, error: `unsupported content-type ${ctype}` };
      }
      return { html: await res.text(), finalUrl: u.toString(), status: res.status };
    }
    return { html: '', finalUrl: url, status: 0, error: 'too many redirects' };
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : String((e as Error)?.message || e);
    return { html: '', finalUrl: url, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// Read one URL down to model-ready text: title + JSON-LD + flattened body.
// Returns '' on failure and logs WHY — the Firecrawl version swallowed every
// failure identically, which is how it stayed broken for eleven days.
export async function pageText(url: string): Promise<{ text: string; finalUrl: string; html: string }> {
  const { html, finalUrl, error } = await guardedFetch(url);
  if (error || !html) {
    console.error(`scrape: fetch failed for ${url}: ${error || 'empty body'}`);
    return { text: '', finalUrl, html: '' };
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const jsonLd = extractJsonLd(html);
  const body = htmlToText(html).slice(0, PAGE_MAX_CHARS);
  const parts: string[] = [];
  if (title) parts.push(`Page title: ${title}`);
  if (jsonLd) parts.push(`Structured data (JSON-LD):\n${jsonLd}`);
  if (body) parts.push(`Page text:\n${body}`);
  return { text: parts.join('\n\n'), finalUrl, html };
}

// Find up to `max` same-domain About/Story/FAQ-style links in the page HTML to
// also read for richer descriptive content. SSRF-guarded; skips the base page.
export function enrichmentLinks(html: string, baseUrl: string, max: number): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
  const kw = /(about|our[-\s]?story|story|mission|why|approach|faq|frequently|values|team|benefits)/i;
  const seen = new Set<string>([(base.origin + base.pathname).replace(/\/+$/, '')]);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    const href = decodeEntities(m[1] || '').trim();
    const text = decodeEntities((m[2] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    let abs: URL;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.hostname !== base.hostname || isBlockedHost(abs.hostname)) continue;
    const key = (abs.origin + abs.pathname).replace(/\/+$/, '');
    if (seen.has(key)) continue;
    if (!(kw.test(abs.pathname) || kw.test(text))) continue;
    seen.add(key);
    out.push(abs.toString());
  }
  return out;
}

// Snap a "HH:MM" 24h time to the nearest 15-minute increment so it matches a
// real <option> in the form's hours grid; null if unparseable.
export function snapTime(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let hh = +m[1];
  let mm = +m[2];
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  mm = Math.round(mm / 15) * 15;
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function snapHours(hours: any): Record<string, any> | null {
  if (!hours || typeof hours !== 'object') return null;
  const out: Record<string, any> = {};
  for (const d of DAYS) {
    const h = hours[d];
    if (!h || typeof h !== 'object') continue;
    if (h.closed) { out[d] = { closed: true }; continue; }
    const open = snapTime(h.open);
    const close = snapTime(h.close);
    if (open && close) out[d] = { open, close, closed: false };
  }
  return Object.keys(out).length ? out : null;
}

// Tool schema == the form's field names, so the model returns JSON the front end
