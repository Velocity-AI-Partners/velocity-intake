-- Franchisor onboarding intake: standalone collect-and-review table.
-- Target: VAP App prod (jjckotsrhuxxftwmdlwc)
--
-- DELIBERATELY ISOLATED: no foreign keys, no triggers, no webhooks, and no
-- provisioning path consumes this table. Submissions are reviewed on the main
-- app's /client-onboarding page and carried into the new system manually.
--
-- Identity/meta live in flat columns; section content lives in jsonb buckets
-- so the form's questions can change without further migrations.

create table if not exists public.franchisor_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('draft','pending','reviewed','archived')),

  -- Which franchisor form produced this row (future-proofing for brand #2)
  form_variant text not null default 'beem',

  -- Franchisor & brand identity
  brand_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  corporate_address text,
  website_url text,
  logo_url text,

  -- jsonb buckets, one per form section
  socials jsonb,                -- { instagram, facebook, linkedin, youtube, tiktok }
  brand_colors jsonb,           -- unused by the current form (brand-assets section removed 2026-07-06); kept nullable for future use, as are logo_url and corporate_address
  additional_contacts jsonb,    -- [ { first_name, last_name, email }, ... ]
  locations jsonb,              -- [ { page_url, name, address, city_state, zip, timezone, hours: {mon..sun: {open,close,closed}}, studio_phone, crm_platform, crm_store_id, gm: {first_name,last_name,email}, location_users: [person...], notes }, ... ]
  brand_knowledge jsonb,        -- { service_description, pricing_structure, intro_offer, cancellation_policy, ideal_client, unique_value, voice_tone, approved_phrases, avoid_words, faq }
  franchise_rollout jsonb,      -- { kpi_targets, launch_timeline }

  notes text,

  -- Review meta (main app admins)
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,

  -- Spam signals
  honeypot text,
  user_agent text
);

alter table public.franchisor_intake_submissions enable row level security;

-- Role grants (required in addition to RLS policies)
grant insert, select, update on public.franchisor_intake_submissions to anon;
grant select, update on public.franchisor_intake_submissions to authenticated;
grant all on public.franchisor_intake_submissions to service_role;

-- Anon INSERT: honeypot must be empty, and only draft/pending statuses
drop policy if exists "anon_insert_franchisor_intake" on public.franchisor_intake_submissions;
create policy "anon_insert_franchisor_intake"
  on public.franchisor_intake_submissions
  for insert
  to anon
  with check (
    (honeypot is null or honeypot = '')
    and status in ('draft','pending')
  );

-- Anon SELECT: only draft rows (holder of the ?draft=<uuid> link can resume).
-- Once submitted (pending+), the row becomes admin-only.
drop policy if exists "anon_select_draft_franchisor_intake" on public.franchisor_intake_submissions;
create policy "anon_select_draft_franchisor_intake"
  on public.franchisor_intake_submissions
  for select
  to anon
  using (status = 'draft');

-- Anon UPDATE: only draft rows, and status can only move to draft/pending
drop policy if exists "anon_update_draft_franchisor_intake" on public.franchisor_intake_submissions;
create policy "anon_update_draft_franchisor_intake"
  on public.franchisor_intake_submissions
  for update
  to anon
  using (status = 'draft')
  with check (status in ('draft','pending'));

-- Authenticated SELECT / UPDATE gated to admins (existing user_roles table)
drop policy if exists "admin_select_franchisor_intake" on public.franchisor_intake_submissions;
create policy "admin_select_franchisor_intake"
  on public.franchisor_intake_submissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "admin_update_franchisor_intake" on public.franchisor_intake_submissions;
create policy "admin_update_franchisor_intake"
  on public.franchisor_intake_submissions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Index for admin review listing
create index if not exists idx_franchisor_intake_status_submitted
  on public.franchisor_intake_submissions (status, submitted_at desc);

-- Logo uploads reuse the existing 'intake-logos' bucket and its policies
-- (public read, anon insert) — no new storage objects needed.
