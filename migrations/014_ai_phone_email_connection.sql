-- How the AI Team Member should text/email: from the studio's OWN existing
-- number/email, or a NEW dedicated one Velocity provisions.
--   ai_phone_mode   'own' | 'dedicated'
--   ai_phone_number the existing number to text from (when mode = 'own')
--   ai_email_mode   'own' | 'dedicated'
--   ai_email_address the existing email to send from (when mode = 'own')
alter table public.location_intake_submissions
  add column if not exists ai_phone_mode text,
  add column if not exists ai_phone_number text,
  add column if not exists ai_email_mode text,
  add column if not exists ai_email_address text;
