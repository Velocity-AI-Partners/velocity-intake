-- Staging schema for location_intake_submissions.
--
-- GENERATED from an introspection of production (jjckotsrhuxxftwmdlwc) on
-- 2026-08-02 rather than hand-written, so staging cannot drift from prod by a
-- typo. Applied only to the LOCAL Supabase stack (127.0.0.1:54322).
--
-- One deliberate omission from prod, and it matters: the
-- `slack-intake-submission` trigger is NOT created here. In prod it is AFTER
-- INSERT OR UPDATE with no WHEN clause and POSTs every row to the live n8n
-- webhook, which <!channel>s #client-onboarding. Recreating it in staging
-- would page the whole team on every test run.
--
-- user_roles/app_role are stubbed only so the admin policies compile; staging
-- never authenticates an admin.

create extension if not exists pgcrypto;

-- Enum values copied from prod exactly. An invented value here would let a test
-- seed a role that cannot exist in production. The ALTERs top up a type that an
-- earlier run may have created with fewer values; they are plain statements
-- because ADD VALUE is not allowed inside a DO block.
do $$ begin
  create type app_role as enum ('admin','member','manager','sandbox','franchisor','franchisee');
exception when duplicate_object then null; end $$;

alter type app_role add value if not exists 'admin';
alter type app_role add value if not exists 'member';
alter type app_role add value if not exists 'manager';
alter type app_role add value if not exists 'sandbox';
alter type app_role add value if not exists 'franchisor';
alter type app_role add value if not exists 'franchisee';

create table if not exists public.user_roles (
  user_id uuid not null,
  role app_role not null
);

-- Reads the x-draft-id request header. This is what scopes an anon client to
-- exactly one draft row (migration 016) -- without it PostgREST returns zero
-- rows and a draft link looks broken to the client.
create or replace function public.request_draft_id()
returns uuid language plpgsql stable as $function$
declare raw text;
begin
  raw := (current_setting('request.headers', true))::json ->> 'x-draft-id';
  if raw is null or raw = '' then return null; end if;
  return raw::uuid;
exception when others then return null;
end;
$function$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin NEW.updated_at = now(); return NEW; end;
$function$;

create table if not exists public.location_intake_submissions (
  id uuid default gen_random_uuid() not null primary key,
  submitted_at timestamp with time zone default now() not null,
  status text default 'pending'::text not null,
  business_name text,
  city text,
  address text,
  timezone text,
  contact_email text,
  contact_phone text,
  logo_url text,
  hours jsonb,
  crm_platform text,
  crm_username text,
  crm_password text,
  crm_store_id text,
  studio_phone_display text,
  assistant_name text,
  sign_off_name text,
  intro_offer text,
  has_free_trial boolean,
  trial_booking_url text,
  preferred_words text,
  avoid_words text,
  dashboard_users jsonb,
  business_knowledge jsonb,
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
  reviewer_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  honeypot text,
  user_agent text,
  crm_platform_other text,
  crm_account_confirmed boolean default false not null,
  parent_brand_other text,
  booking_payment_link text,
  business_email text,
  business_phone text,
  chatbot_voice text,
  chatbot_tone jsonb,
  main_cta text,
  main_cta_other text,
  chatbot_voice_notes text,
  chatbot_tone_notes text,
  automation_goals jsonb,
  handoff_config jsonb,
  notification_config jsonb,
  hours_confirmed boolean default false not null,
  sms_cadence jsonb,
  kpi_targets text,
  form_state jsonb,
  updated_at timestamp with time zone default now(),
  location_page_url text
);

alter table public.location_intake_submissions enable row level security;

do $$ begin
  create policy admin_select_intake on public.location_intake_submissions
    for select to authenticated
    using (exists (select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin'::app_role));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_update_intake on public.location_intake_submissions
    for update to authenticated
    using (exists (select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin'::app_role));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_delete_intake on public.location_intake_submissions
    for delete to authenticated
    using (exists (select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin'::app_role));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy anon_insert_intake on public.location_intake_submissions
    for insert to anon
    with check (((honeypot is null) or (honeypot = ''::text)) and (status = any (array['draft'::text,'pending'::text])));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy anon_select_own_draft on public.location_intake_submissions
    for select to anon
    using ((request_draft_id() is not null) and (id = request_draft_id()) and (status = any (array['draft'::text,'pending'::text])));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy anon_update_own_draft on public.location_intake_submissions
    for update to anon
    using ((request_draft_id() is not null) and (id = request_draft_id()) and (status = 'draft'::text))
    with check ((request_draft_id() is not null) and (id = request_draft_id()) and (status = any (array['draft'::text,'pending'::text])));
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger update_location_intake_submissions_updated_at
    before update on public.location_intake_submissions
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

-- The status allowlist. RLS separately restricts anon to draft/pending; this
-- constraint is what rejects a typo or an invented status from ANY role. It was
-- missing from the first version of this file, which meant a bad status value
-- passed every local test and would only have failed on the real write.
do $$ begin
  alter table public.location_intake_submissions
    add constraint location_intake_submissions_status_check
    check (status = any (array['draft'::text,'pending'::text,'reviewed'::text,'provisioned'::text,'rejected'::text]));
exception when duplicate_object then null; end $$;

create index if not exists idx_intake_submissions_status_submitted
  on public.location_intake_submissions using btree (status, submitted_at desc);

-- Prod grants ALL table privileges to all three roles and relies entirely on
-- RLS for enforcement. Granting less here would make a negative test pass for
-- the wrong reason (privilege denied rather than policy denied).
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on public.location_intake_submissions to anon, authenticated, service_role;
