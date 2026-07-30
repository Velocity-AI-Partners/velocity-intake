# CLAUDE.md

This file provides guidance to Claude Code when working on this repo. Read this first.

## What this is

Client-facing intake form for new Velocity AI Partners locations. A prospective client fills it out; data lands in Supabase; the Velocity team reviews and provisions on the main app's `/client-onboarding` page.

## Stack

- **Plain HTML + JS + CSS.** No framework, no npm, no build step.
- `index.html` — single page, all form markup
- `form.js` — form logic, hours grid, user repeater, Supabase REST submit, draft load/save
- `styles.css` — black/white/gray theme, mobile responsive
- Cache-busted via `?v=N` query strings on script/style tags. **Bump these when you change `form.js` or `styles.css`** or returning users will see stale files.

## Live URL

`https://onboarding.velocityaipartners.app/` (Vercel).

## Deploy

- Push to `main` → Vercel auto-deploys to the live URL. PR branches get preview deployments automatically.

## Data flow

1. Client fills form
2. If logo attached, direct upload to Supabase storage bucket `intake-logos` (public read, anon insert)
3. Form POSTs to `rest/v1/location_intake_submissions` with anon key
4. On final submit, the form also POSTs `{ intake_id }` to the n8n **Intake Confirmation Email** workflow (`v3ajDIEDjDmCwMvi`), which re-reads the row and emails the client's `contact_email` a receipt — guarded to `status='pending'`, credentials excluded
5. Supabase Database Webhook fires on INSERT → Slack notification in `#all-velocity-ai-partners`
6. Velocity admin reviews on main app's `/client-onboarding` page, chooses slug/brand/short_slug, clicks Provision
7. `provision-from-intake` edge function creates `locations`, `workflow_location_config`, `business_knowledge`, `ab_tests` rows

## Supabase

- **Project:** `jjckotsrhuxxftwmdlwc` (VAP production) — same as main app
- **Table:** `location_intake_submissions` — schema in `migrations/001_create_location_intake_submissions.sql`
- **Storage bucket:** `intake-logos` (public read, anon insert)
- **Anon key:** embedded in `form.js` line 3 — this is fine; public forms are expected to use the anon key with RLS-scoped policies

## RLS policies (enforced in Supabase)

- `anon` can INSERT into `location_intake_submissions` — honeypot field enforces basic bot defense
- `anon` can INSERT to `intake-logos` bucket — no size/type check server-side (2MB client-side)
- `authenticated` admins can SELECT + UPDATE — used by main app's `/client-onboarding` page

## Franchisor onboarding (standalone one-off — Beem Light Sauna)

- `franchisor.html` + `franchisor.js` + `franchisor.css` — fully standalone page, deliberately decoupled from `form.js`/`styles.css`. Reached via `?form=franchisor` (variant router in `index.html`) or `/franchisor.html` directly.
- **Collect-and-review only.** Rows land in `franchisor_intake_submissions` (migration `015`) — an isolated table with NO foreign keys, triggers, webhooks, or provisioning path. Admins review on the main app's `/client-onboarding` page (Franchisor Submissions card) and carry the data into the new system manually.
- **Edit the questions in the `FORM_SECTIONS` config block at the top of `franchisor.js`** — section content stores into jsonb buckets, so question changes need no migration. Flat columns are only identity/meta (brand_name, contact_*, logo_url, status...).
- Same draft pattern as the main form (`franchisor.html?draft=<uuid>`), same honeypot defense, same `intake-logos` bucket for the brand logo.
- Multi-location: repeatable location cards; per-location fields defined in `LOCATION_FIELDS` in `franchisor.js`.
- For a second franchisor brand later: new row value for `form_variant`, swap the logo/branding, adjust `FORM_SECTIONS` — same table.

## Per-client pre-filled variants (`magretti`, `song-koh`)

When a client is worth a tailored link, we fork a variant instead of sending them the generic form. Existing ones: `?form=magretti` (Joe and Devon Magretti, 3 Stretch Zone studios MD) and `?form=song-koh` (Patrick Song and Robert Koh, Stretch Zone Reston VA).

These are **not** like the franchisor form: they submit standard `location_intake_submissions` rows, so `/client-onboarding` review and `provision-from-intake` work unchanged and no migration is needed.

To build a new one:

1. Copy `song-koh.{html,js,css}` to `<client>.{html,js,css}` (it's the simpler single-studio base; `magretti.*` is the multi-studio one).
2. Add one line to the variant router at the top of `index.html`.
3. Edit the `LOCATIONS` array and the `addUser(...)` seeds in `<client>.js`, and the `<h1>`, `<title>`, and `data-known` contact values in `<client>.html`.
4. Rename `DRAFT_KEY` so the new form doesn't collide with another variant's localStorage draft.
5. Keep the honeypot input, `noindex`, and the `?v=N` cache-busters.

**Rules that matter more than coverage:**

- **Pre-fill from verifiable sources only** — a signed agreement, the brand's official location page, or an existing location's knowledge base. Tag each pre-filled field with a source chip so the client can see what we filled and why. Never invent an email, a phone, or a price to fill a field.
- **Label assumptions as assumptions.** If we're guessing a CRM platform, give the client a field to correct it and write their answer to `crm_platform_other` rather than recording the guess as fact.
- **Verify the payload against the live schema before shipping.** Every key must be a real column in `location_intake_submissions` or PostgREST rejects the whole insert.
- **Test the submit path without writing to prod.** Localhost is preview-only; to exercise the real `buildPayload`, load with `?live=1` and stub `window.fetch` so the payload can be inspected while nothing leaves the browser.

## Form sections (for orientation)

1. Business info — name, address, timezone, contact, website, multi-location, logo
2. Hours — 7-day grid with closed toggle, 9am–5pm defaults
3. CRM access — platform dropdown, credentials, store ID, Twilio y/n
4. Branding & messaging — assistant name, sign-off, intro offer, trial URL, socials
5. Services & pricing — service description, pricing tiers, cancellation policy, eligibility
6. About & voice — ideal client, unique value, approved/forbidden phrases, first visit, FAQ
7. Dashboard users — name/email/role repeater (manager or admin)
8. Anything else — target launch date, notes

## Draft system

- URL `?draft=<uuid>` loads a server-side draft row and lets the user keep editing
- First "Save draft" click on a blank form inserts a new row with `status='draft'` and a fresh UUID, then rewrites the URL
- Subsequent saves PATCH the same row
- Submit flips `status` from `draft` to `pending`
- Admins pre-fill drafts from the main app's `/client-onboarding` Drafts in Progress card, then email the draft link to the client

## Conventions for new code

1. **No frameworks.** If you're about to reach for React/Vue/etc., stop — the whole point is a single 15KB HTML file that loads fast on mobile. Vanilla JS, IIFE pattern (see `form.js` line 1).
2. **No TypeScript.** Plain JS, no build step.
3. **Bump `?v=N` query strings** on `styles.css` and `form.js` script/link tags when you change those files.
4. **Keep the anon key in `form.js`.** It's not a secret; RLS policies do the real enforcement.
5. **Any new field** needs: (a) `<input>`/`<select>` in `index.html`, (b) collection in `buildPayload()` in `form.js`, (c) prefill in `applyServerRowToForm()` in `form.js`, (d) column in `location_intake_submissions` via a new numbered migration in `migrations/`, (e) consumption in main app's `provision-from-intake` edge function.
6. **Keep the honeypot field** (`name="honeypot"`, `class="honeypot"`). It's the only bot defense — without it, the form will get spammed.

## Git rules

Mirror the main app:

- **Never push directly to `main`.** Feature branch + PR.
- Branch naming: `<name>/<feature>` (developers: bill, tobias, george)
- Before starting: `git pull origin main`, then `git checkout -b <your-name>/<feature>`
- PRs require 1 approval + GH Action must pass

## Known v1 limitations (honest)

- CRM password stored in plain text in the submission row (RLS limits exposure; acceptable at current scale; `pgsodium` encryption is the upgrade path)
- Logo upload has no server-side validation (file type, malware scan)
- Honeypot-only bot defense — upgrade to Cloudflare Turnstile if spam appears
- Success-screen contact email hardcoded to `sirtobiaswade@gmail.com` — should be a shared inbox

## Relationship to the main app

Main app lives at `../Velocity-App-Migrated-Codebase`. Relevant files there:

- `src/pages/ClientOnboarding.tsx` — the admin review page
- `supabase/functions/provision-from-intake/index.ts` — the function called when an admin approves a submission
- Schema for `location_intake_submissions` is authored here (in `migrations/`) but lives in the same Supabase project as the main app
