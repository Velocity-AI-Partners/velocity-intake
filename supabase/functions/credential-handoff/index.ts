// credential-handoff -- anon-callable edge function (verify_jwt = false).
//
// Backs handoff.html: a one-use link that lets an outside party give us API
// credentials without email, without an account, and without a Slack ping.
//
// GET  ?token=<t>  -> { state, label, intro, fields }   (never returns payload)
// POST { token, values } -> { state: 'done' }           (accepted exactly once)
//
// Why an edge function instead of an anon-writable table like the intake form
// uses: single-use has to be enforced server-side. Anyone holding the link
// holds the anon key too, so an anon UPDATE policy can always be replayed. Here
// the browser never touches the table; the one-use guarantee is the conditional
// UPDATE below (`.is('submitted_at', null)`), which is atomic in Postgres.
//
// The function deliberately never logs submitted values, never returns them,
// and does not notify anywhere. Read them with SQL, move them to their
// permanent home, delete the row.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const TABLE = 'credential_handoffs';
const MAX_VALUE_LEN = 4000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function db() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase_env_missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Token shape is checked before it reaches the database so a malformed link
// cannot be used to probe with arbitrary strings.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Field = { key: string; label: string; type?: string; group?: string; help?: string; required?: boolean };

function stateOf(row: { expires_at: string; submitted_at: string | null }) {
  if (row.submitted_at) return 'used';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'open';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = db();

    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') || '';
      if (!TOKEN_RE.test(token)) return json({ state: 'invalid' });

      const { data, error } = await supabase
        .from(TABLE)
        .select('label, intro, fields, expires_at, submitted_at')
        .eq('token', token)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ state: 'invalid' });

      const state = stateOf(data);
      // Field definitions are not secret, but there is no reason to hand them
      // out once the link is spent.
      if (state !== 'open') return json({ state, label: data.label });
      return json({ state, label: data.label, intro: data.intro, fields: data.fields });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as { token?: string; values?: Record<string, unknown> } | null;
      const token = body?.token || '';
      const values = body?.values;
      if (!TOKEN_RE.test(token)) return json({ state: 'invalid' }, 400);
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        return json({ state: 'error', message: 'values must be an object' }, 400);
      }

      const { data: row, error: readErr } = await supabase
        .from(TABLE)
        .select('fields, expires_at, submitted_at')
        .eq('token', token)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) return json({ state: 'invalid' }, 404);

      const state = stateOf(row);
      if (state !== 'open') return json({ state }, 409);

      // Keep only declared keys, so the payload matches the request and a
      // tampered page cannot stuff the row with arbitrary content.
      const fields = (row.fields || []) as Field[];
      const allowed = new Map(fields.map((f) => [f.key, f]));
      const clean: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(values)) {
        const def = allowed.get(k);
        if (!def) continue;
        if (def.type === 'checkbox') clean[k] = v === true || v === 'true';
        else clean[k] = String(v ?? '').slice(0, MAX_VALUE_LEN);
      }
      const missing = fields
        .filter((f) => f.required && !(f.type === 'checkbox' ? clean[f.key] === true : String(clean[f.key] || '').trim()))
        .map((f) => f.label);
      if (missing.length) return json({ state: 'error', message: `Missing: ${missing.join(', ')}` }, 400);

      // The one-use gate. If another submission won the race, zero rows come
      // back and this caller is told the link is spent.
      const { data: updated, error: writeErr } = await supabase
        .from(TABLE)
        .update({
          payload: clean,
          submitted_at: new Date().toISOString(),
          submitted_user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
        })
        .eq('token', token)
        .is('submitted_at', null)
        .select('id');
      if (writeErr) throw writeErr;
      if (!updated || updated.length === 0) return json({ state: 'used' }, 409);

      return json({ state: 'done' });
    }

    return json({ state: 'error', message: 'method not allowed' }, 405);
  } catch (e) {
    // Never echo the caught value: it can carry request content.
    console.error('credential-handoff failed:', e instanceof Error ? e.message : 'unknown');
    return json({ state: 'error', message: 'server error' }, 500);
  }
});
