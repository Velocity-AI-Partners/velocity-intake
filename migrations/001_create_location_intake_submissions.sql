-- Velocity intake form: submission table + storage bucket + RLS
-- Target: VAP Staging (kxkchytrjhgsndnvvxhc)

create table if not exists public.location_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','reviewed','provisioned','rejected')),

  -- Business info
  business_name text not null,
  city text,
  address text,
  timezone text,
  contact_email text,
  contact_phone text,
  logo_url text,

  -- Hours as jsonb: { mon: {open, close, closed}, tue: {...}, ... }
  hours jsonb,

  -- CRM credentials
  crm_platform text,
  crm_username text,
  crm_password text,
  crm_store_id text,

  -- Branding + messaging
  studio_phone_display text,
  assistant_name text,
  sign_off_name text,
  intro_offer text,
  has_free_trial boolean,
  trial_booking_url text,
  preferred_words text,
  avoid_words text,

  -- Dashboard users as jsonb: [{name, email, role}, ...]
  dashboard_users jsonb,

  -- Business knowledge for AI context (flattened to jsonb):
  --  service_description, single_session_rate, membership_pricing, package_pricing,
  --  cancellation_policy, eligibility, ideal_client, unique_value, current_members,
  --  approved_phrases, forbidden_claims, first_visit, faq
  business_knowledge jsonb,

  -- BRIEF #4 gap fields
  website_url text,
  google_business_profile_url text,
  instagram_handle text,
  facebook_page_url text,
  tiktok_handle text,
  existing_twilio boolean,
  existing_twilio_account_sid text,
  existing_twilio_auth_token text,
  is_multi_location boolean,
  parent_brand_name text,
  target_launch_date date,
  preferred_subdomain text,

  notes text,

  -- Meta + review
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,

  -- Spam signals
  honeypot text,
  user_agent text
);

alter table public.location_intake_submissions enable row level security;

-- Anon can INSERT only, and only if honeypot is empty
drop policy if exists "anon_insert_intake" on public.location_intake_submissions;
create policy "anon_insert_intake"
  on public.location_intake_submissions
  for insert
  to anon
  with check (honeypot is null or honeypot = '');

-- Authenticated SELECT / UPDATE gated to admins (uses existing user_roles table)
drop policy if exists "admin_select_intake" on public.location_intake_submissions;
create policy "admin_select_intake"
  on public.location_intake_submissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "admin_update_intake" on public.location_intake_submissions;
create policy "admin_update_intake"
  on public.location_intake_submissions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Index for admin reviewing pending submissions
create index if not exists idx_intake_submissions_status_submitted
  on public.location_intake_submissions (status, submitted_at desc);

-- Storage bucket for logo uploads
insert into storage.buckets (id, name, public)
values ('intake-logos', 'intake-logos', true)
on conflict (id) do nothing;

-- Storage RLS: anon can upload, everyone can read
drop policy if exists "intake_logos_anon_insert" on storage.objects;
create policy "intake_logos_anon_insert"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'intake-logos');

drop policy if exists "intake_logos_public_read" on storage.objects;
create policy "intake_logos_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'intake-logos');
