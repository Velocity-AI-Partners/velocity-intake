-- 018_updated_at.sql
-- Applied to VAP production (jjckotsrhuxxftwmdlwc) on 2026-08-02.
--
-- WHY
-- The form now autosaves continuously (form.js, 2026-08-02). Rows change all the
-- time, but `submitted_at` only ever records when the row was created, so the
-- Drafts in Progress card on /client-onboarding cannot tell "this client never
-- opened their form" from "this client spent an hour and stalled at CRM Access".
-- That distinction is the whole point of watching drafts.
--
-- HOW
-- Reuses the existing public.update_updated_at_column(), which 12 other tables
-- already share (ab_tests, locations, location_integrations, profiles, ...).
-- Deliberately NOT re-created here: a CREATE OR REPLACE would silently alter
-- behaviour for every one of those tables.
--
-- SAFETY
-- Additive only. ADD COLUMN of a nullable timestamptz with no default is a
-- metadata-only change, so no existing row is rewritten. The default is set
-- AFTER the backfill so historical rows report their real age rather than the
-- migration timestamp.
--
-- Dry-run proof (BEGIN ... ROLLBACK before applying):
--   row_count                        15  -> 15
--   nulls_in_updated_at              0
--   backfilled_ok                    14  (= submitted_at)
--   trigger_bumped_one               1   (proves the trigger fires on UPDATE)
--   other_updated_at_triggers        12  -> 13  (nothing existing disturbed)
--   data_fingerprint                 1bb34e46ef97a8a347513369d398525a, unchanged
--                                    and matching an independently computed
--                                    baseline from the 2026-08-02 audit.
--
-- NOTE ON MIGRATION HISTORY
-- Applied via execute_sql, NOT `supabase migration up`, so there is no
-- supabase_migrations.schema_migrations row. That is deliberate and matches the
-- convention for this repo: ~/MigratedCodeBase owns this project's migration
-- history, and files-vs-rows there must stay drift-free. Files in this folder
-- are documentation of what was applied.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS update_location_intake_submissions_updated_at
--     ON public.location_intake_submissions;
--   ALTER TABLE public.location_intake_submissions DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.location_intake_submissions ADD COLUMN updated_at timestamptz;

UPDATE public.location_intake_submissions
   SET updated_at = submitted_at
 WHERE updated_at IS NULL;

ALTER TABLE public.location_intake_submissions
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE TRIGGER update_location_intake_submissions_updated_at
  BEFORE UPDATE ON public.location_intake_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
