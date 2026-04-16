# Velocity Intake Form

Client-facing intake form for new Velocity AI Partners locations. Static HTML + JS, deployed to GitHub Pages, submits to a Supabase table on the VAP staging project.

## Live URL

https://velocity-ai-partners.github.io/velocity-intake/

## Stack

- `index.html` single page, no framework
- `styles.css` black/white/gray theme, mobile responsive
- `form.js` form logic, localStorage autosave, Supabase REST submit, storage bucket upload

## Data flow

1. Client fills form at the live URL
2. If logo attached, client-side upload to Supabase storage bucket `intake-logos`
3. Form POSTs to `rest/v1/location_intake_submissions` with anon key
4. Supabase Database Webhook fires on INSERT, notifies Slack `#all-velocity-ai-partners`
5. Velocity reviews submission in Supabase Studio, flips `status` from `pending` to `reviewed` or `rejected`
6. Approved submissions get manually transcribed into `workflow_location_config` by the admin (v1 scope)

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

## Honest v1 limitations

- CRM password stored in plain text. Only admins can SELECT; anon can only INSERT. Acceptable at current scale. Encrypt via `pgsodium` before enterprise rollout.
- No admin review UI yet; use Supabase Studio table editor or the forthcoming `/new-location` page after PR #196 merges.
- Logo upload is client-side direct to bucket. No server-side validation of file type or malware scan.
- Honeypot-only bot defense. Upgrade to Cloudflare Turnstile if spam appears.

## Deploying

Push to `main`. GitHub Action in `.github/workflows/deploy.yml` publishes to Pages.
