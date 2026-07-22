-- Backing tables for the scrape-location-page edge function.
--   scrape_cache       — per-URL result cache (TTL enforced in the function)
--   scrape_rate_limit  — per-IP request counter (rolling window)
--
-- Both are SERVICE-ROLE ONLY: the edge function uses the service-role key, which
-- bypasses RLS. We enable RLS with NO policies so anon/authenticated clients get
-- no direct access (they can't read cached pages or tamper with the counter).

create table if not exists public.scrape_cache (
  url text primary key,
  result jsonb not null,
  scraped_at timestamptz not null default now()
);

create table if not exists public.scrape_rate_limit (
  ip text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.scrape_cache enable row level security;
alter table public.scrape_rate_limit enable row level security;
-- No policies are created on purpose => anon/authenticated have no access;
-- the edge function's service-role key bypasses RLS.
