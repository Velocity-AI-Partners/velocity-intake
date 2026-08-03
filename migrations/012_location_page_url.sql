-- The exact location web page the client pastes at the top of the intake form.
-- Seed URL for the AI prefill scrape; distinct from website_url (the business
-- homepage). Nullable — the AI prefill step is optional.
--
-- DEPLOY ORDER: apply this to prod BEFORE the form starts sending
-- `location_page_url` in its payload, or PostgREST rejects every save (PGRST204).
alter table public.location_intake_submissions
  add column if not exists location_page_url text;
