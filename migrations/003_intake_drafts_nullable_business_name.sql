-- Allow Save Draft with empty business_name.
-- Client-side validation still enforces business_name on Submit.
alter table public.location_intake_submissions
  alter column business_name drop not null;
