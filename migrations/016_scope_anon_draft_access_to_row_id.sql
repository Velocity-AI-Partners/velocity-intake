-- 016_scope_anon_draft_access_to_row_id.sql
--
-- WHY
-- ---
-- The anon policies from 002_intake_drafts.sql have no ownership check:
--
--   anon_select_draft_intake  USING (status IN ('draft','pending'))
--   anon_update_draft_intake  USING (status = 'draft')
--
-- The publishable key is embedded in the public form JS, so as anon you could
-- (all three verified against production in a rolled-back transaction):
--   1. list every draft and pending submission           -> 4 rows readable
--   2. edit any draft without knowing its id             -> bulk UPDATE landed
--   3. flip someone else's draft to 'pending'            -> submitted for them
--
-- Nothing sensitive sits in those rows today (0 rows carry crm_password,
-- crm_username or a Twilio token, because the per-client forms collect an
-- attestation instead of credentials), but they do carry client PII, and the
-- exposure gets materially worse once the per-client forms start writing
-- drafts: drafts linger for days instead of being provisioned and cleared.
--
-- WHAT THIS DOES
-- --------------
-- Makes the row id the capability. anon may read or update a row only by
-- presenting that row's uuid in an `x-draft-id` request header. Since a v4
-- uuid is unguessable, you cannot reach a row you were not given.
--
-- This is what the existing `?draft=<uuid>` link already implied; the policies
-- just never enforced it.
--
-- WHY NOT A SEPARATE TOKEN COLUMN
-- -------------------------------
-- A `draft_token` column with a server-side default would break the admin
-- pre-fill flow: admins create draft rows from /client-onboarding in
-- Velocity-App-Migrated-Codebase and email the client a `?draft=<uuid>` link
-- that carries no token, so the client could never read their own draft.
-- Using the id keeps that flow working with no change in the other repo.
--
-- TRADE-OFF, STATED PLAINLY
-- -------------------------
-- The capability travels in the query string, so it can appear in server logs
-- and Referer headers. That is already true of the current `?draft=<uuid>`
-- design; this migration does not make it worse. Moving the id into the URL
-- fragment would be a further hardening step, and is deliberately out of scope
-- here so this stays a policy-only change.
--
-- DEPLOY ORDER -- READ THIS
-- -------------------------
-- Must ship together with the JS that sends the header. form.js `fetchDraft()`
-- reads with the anon key and no header today, and `updateRow()` uses
-- `Prefer: return=representation`, which needs SELECT as well as UPDATE.
-- Applying this before the JS is deployed breaks the main form's ?draft= flow.
--
-- VERIFY BEFORE APPLYING
-- ----------------------
-- The n8n "Intake Confirmation Email" workflow (v3ajDIEDjDmCwMvi) re-reads the
-- submitted row to send the receipt. Service role key -> unaffected (bypasses
-- RLS). Anon key -> it breaks, and clients stop receiving confirmations.
-- Confirm which before applying. This is the main regression risk.

begin;

-- NULL-safe reader for the x-draft-id header. Returns NULL when the header is
-- missing, empty, or not a valid uuid, so every policy comparison fails closed.
-- plpgsql rather than sql so a bad cast is caught instead of raised.
create or replace function public.request_draft_id()
returns uuid
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := (current_setting('request.headers', true))::json ->> 'x-draft-id';
  if raw is null or raw = '' then
    return null;
  end if;
  return raw::uuid;
exception when others then
  return null;
end;
$$;

comment on function public.request_draft_id() is
  'Reads the x-draft-id request header as a uuid, NULL if absent or malformed. Used by the anon draft policies so a caller can only reach the row whose id it already holds.';

revoke all on function public.request_draft_id() from public;
grant execute on function public.request_draft_id() to anon, authenticated;

drop policy if exists anon_select_draft_intake on public.location_intake_submissions;
drop policy if exists anon_update_draft_intake on public.location_intake_submissions;

-- SELECT: only the row whose id you present. 'pending' stays readable because
-- form.js submits a draft with `Prefer: return=representation`, which reads the
-- row back after the status flip.
create policy anon_select_own_draft
  on public.location_intake_submissions
  for select
  to anon
  using (
    public.request_draft_id() is not null
    and id = public.request_draft_id()
    and status = any (array['draft', 'pending'])
  );

-- UPDATE: only your own row, only while it is still a draft, and it may only
-- move to draft or pending -- never straight to provisioned.
create policy anon_update_own_draft
  on public.location_intake_submissions
  for update
  to anon
  using (
    public.request_draft_id() is not null
    and id = public.request_draft_id()
    and status = 'draft'
  )
  with check (
    public.request_draft_id() is not null
    and id = public.request_draft_id()
    and status = any (array['draft', 'pending'])
  );

-- anon INSERT (anon_insert_intake) is deliberately unchanged: a public intake
-- form has to let strangers create rows. Its honeypot check and status
-- whitelist still apply.

commit;
