# Velocity Intake Form

Client-facing intake form for new Velocity AI Partners locations. Static HTML + JS, deployed to Vercel, submits to a Supabase table on the VAP production project.

## Live URL

https://onboarding.velocityaipartners.app/

## Stack

- `index.html` single page, no framework
- `styles.css` black/white/gray theme, mobile responsive
- `form.js` form logic, localStorage autosave, Supabase REST submit, storage bucket upload

## Data flow

1. Client fills form at the live URL
2. If logo attached, client-side upload to Supabase storage bucket `intake-logos`
3. Form POSTs to `rest/v1/location_intake_submissions` with anon key
4. On final submit, the form also POSTs `{ intake_id }` to the n8n **Intake Confirmation Email** workflow, which re-reads the row and emails the client's `contact_email` a receipt. Guarded to `status='pending'` (draft saves never trigger it); CRM/Twilio credentials are excluded from the email.
5. Supabase Database Webhook fires on INSERT, notifies Slack `#all-velocity-ai-partners`
6. Velocity admin reviews on main app's `/client-onboarding` page, fills in Velocity-only fields (slug, brand, Twilio), clicks Provision
7. `provision-from-intake` edge function creates `locations`, `workflow_location_config`, `business_knowledge`, and clones `ab_tests` rows

## Supabase config

Project: VAP App production (`jjckotsrhuxxftwmdlwc`)

Table: `location_intake_submissions` (see migration `001_create_location_intake_submissions.sql`)

Storage bucket: `intake-logos` (public read, anon insert)

RLS policies:
- anon INSERT on `location_intake_submissions` with honeypot check
- authenticated SELECT + UPDATE for admins only

## Slack webhook setup (one-time, manual)

1. Create an Incoming Webhook in the Velocity Slack workspace for `#all-velocity-ai-partners`
2. In Supabase Studio, go to Database > Webhooks
3. Create a webhook on `location_intake_submissions` for INSERT events, HTTP POST to the Slack webhook URL with body template:
   ```json
   {
     "text": "New intake: {{ record.business_name }} ({{ record.city }}, {{ record.crm_platform }}) - <https://supabase.com/dashboard/project/jjckotsrhuxxftwmdlwc/editor/{{ record.id }}|review>"
   }
   ```

## Confirmation email (n8n)

On final submit, `form.js` fires a best-effort `POST { intake_id }` to the n8n **Intake Confirmation Email** workflow (`v3ajDIEDjDmCwMvi`, webhook path `/webhook/intake-confirmation`). The workflow:

1. Re-reads the submission row from Supabase by `intake_id` (service-role, so it sees the full row).
2. Guards on `status = 'pending'` — drafts and later admin states never send.
3. Renders an HTML receipt of everything submitted **except** credentials (`crm_username`/`crm_password`, Twilio SID/token) and internal fields.
4. Emails it to the client's `contact_email` via the workflow's Gmail sender.

The trigger is fire-and-forget (`.catch(() => {})`) so a webhook hiccup never blocks the success screen; the workflow logic itself is maintained in n8n and mirrored in [`docs/intake-confirmation-email.md`](docs/intake-confirmation-email.md) for review.

## Honest v1 limitations

- CRM password stored in plain text. Only admins can SELECT; anon can only INSERT. Acceptable at current scale. Encrypt via `pgsodium` before enterprise rollout.
- Logo upload is client-side direct to bucket. No server-side validation of file type or malware scan.
- Honeypot-only bot defense. Upgrade to Cloudflare Turnstile if spam appears.

## Deploying

Push to `main`. Vercel auto-deploys to the live URL. PR branches get preview deployments automatically.
