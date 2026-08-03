-- 016_REVERT.sql — emergency rollback for 016_scope_anon_draft_access_to_row_id
--
-- RUN THIS IF client confirmation emails stop arriving after 016 is applied.
--
-- The known risk: the n8n "Intake Confirmation Email" workflow (v3ajDIEDjDmCwMvi)
-- re-reads the submitted row to send the receipt. If it reads with the ANON key
-- it no longer matches any row under 016, because it does not send the
-- x-draft-id header. If it reads with the SERVICE ROLE key it bypasses RLS and
-- is unaffected.
--
-- Restores the exact pre-016 policies from 002_intake_drafts.sql.
--
-- COST OF REVERTING: the three holes come back — anon can list every draft and
-- pending row, edit any draft without knowing its id, and submit someone else's
-- draft. Acceptable briefly to keep receipts flowing; do not leave it here.
-- Fix forward instead by pointing n8n at the service role key, or by having it
-- send the x-draft-id header, then re-apply 016.

begin;

drop policy if exists anon_select_own_draft on public.location_intake_submissions;
drop policy if exists anon_update_own_draft on public.location_intake_submissions;

create policy anon_select_draft_intake
  on public.location_intake_submissions
  for select
  to anon
  using (status = any (array['draft', 'pending']));

create policy anon_update_draft_intake
  on public.location_intake_submissions
  for update
  to anon
  using (status = 'draft')
  with check (status = any (array['draft', 'pending']));

drop function if exists public.request_draft_id();

commit;

-- Verify afterwards:
--   select policyname, cmd from pg_policies
--   where tablename='location_intake_submissions' and roles::text like '%anon%';
-- Expect: anon_insert_intake, anon_select_draft_intake, anon_update_draft_intake
