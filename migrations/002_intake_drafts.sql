-- Velocity intake form: add "draft" status + anon SELECT/UPDATE on drafts only
-- Target: VAP App prod (jjckotsrhuxxftwmdlwc)
-- Enables the admin-prefill flow: admin fills form, hits "Save draft", sends
-- client a ?draft=<uuid> URL that resumes from the saved state.

-- 1. Extend status enum to allow 'draft'
alter table public.location_intake_submissions
  drop constraint if exists location_intake_submissions_status_check;

alter table public.location_intake_submissions
  add constraint location_intake_submissions_status_check
  check (status in ('draft','pending','reviewed','provisioned','rejected'));

-- 2. Tighten INSERT to disallow anon writing privileged statuses.
--    Anon can only create rows as 'draft' or 'pending'.
drop policy if exists "anon_insert_intake" on public.location_intake_submissions;
create policy "anon_insert_intake"
  on public.location_intake_submissions
  for insert
  to anon
  with check (
    (honeypot is null or honeypot = '')
    and status in ('draft','pending')
  );

-- 3. Anon SELECT, but ONLY on draft rows (holder of the UUID can load the form).
--    Once status flips to 'pending' or later, the row becomes admin-only again.
drop policy if exists "anon_select_draft_intake" on public.location_intake_submissions;
create policy "anon_select_draft_intake"
  on public.location_intake_submissions
  for select
  to anon
  using (status = 'draft');

-- 4. Anon UPDATE, ONLY on draft rows, and can only move status to draft or pending.
--    This lets the admin save draft edits and the client submit (draft -> pending).
--    Review states (reviewed, provisioned, rejected) stay admin-only.
drop policy if exists "anon_update_draft_intake" on public.location_intake_submissions;
create policy "anon_update_draft_intake"
  on public.location_intake_submissions
  for update
  to anon
  using (status = 'draft')
  with check (status in ('draft','pending'));

-- 5. Grants for the new anon operations
grant select, update on public.location_intake_submissions to anon;
