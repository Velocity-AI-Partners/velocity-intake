-- 017_form_state.sql
--
-- WHY
-- ---
-- Ships with 016 to make server-side drafts work in the per-client forms.
--
-- A draft has to be rehydratable. The mapped columns alone are not enough,
-- because buildPayload() composes some of them lossily -- `notes` is built by
-- concatenating a boilerplate sentence, the studio's own notes, the shared
-- notes, and a list of fields the client changed. There is no way to split
-- that back into the two textareas it came from.
--
-- Without a faithful restore there is a live data-loss path: a client opening
-- ?draft=<uuid> on a second device would get a blank form, and their first
-- keystroke would PATCH that near-empty payload over real progress.
--
-- So we store the raw form field map next to the mapped columns. It happens to
-- be exactly the object the existing localStorage autosave already builds, so
-- save and restore reuse the code that is already there.
--
-- SCOPE
-- -----
-- Written only by the per-client variants (gorman, song-koh, magretti). The
-- main form (form.js) is deliberately NOT changed to write it: index.html has
-- crm_username / crm_password fields, and there is no reason to keep a second
-- plaintext copy of a credential in a jsonb blob.
--
-- Nothing downstream reads this column. provision-from-intake and the
-- /client-onboarding review page ignore unknown columns, so this is additive
-- and safe to apply ahead of the client code.

begin;

alter table public.location_intake_submissions
  add column if not exists form_state jsonb;

comment on column public.location_intake_submissions.form_state is
  'Raw form field map for draft rehydration, written by the per-client intake variants only. Mirrors the localStorage autosave shape. Not written by the main form, which collects credentials. Not read by provisioning.';

commit;
