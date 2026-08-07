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
5. Trigger `slack-intake-submission` fires **AFTER INSERT OR UPDATE, with no WHEN clause**, POSTing the whole row to the n8n webhook `client-onboarding` (workflow `lRl1e9D8owq9GeoX`), which posts to Slack **`#client-onboarding`** (a private channel, not `#all-velocity-ai-partners`). Draft creation fires it too, not just submission — n8n swallows the repeat autosaves, so in practice it is roughly one `<!channel>` message per new form plus one on submit (verified 2026-08-02: 199 trigger fires on 7/31 produced 6 Slack messages).
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

## Secure credential handoff (`handoff.html`) — one-use links

For collecting API credentials from someone outside Velocity (a CRM vendor, a
franchisor support desk, a client's IT contact) without emailing secrets and
without making them create an account anywhere.

- `handoff.html` + `handoff.js` + `handoff.css` — standalone, decoupled from
  `form.js`/`styles.css`. Reached directly at `/handoff.html?t=<token>`; no
  entry in the `index.html` variant router because it is not an intake form.
- Table `credential_handoffs` (migration `019`), edge function
  `credential-handoff` (`verify_jwt=false`).

**Why it does not reuse `location_intake_submissions`:** that table's trigger
posts every insert and update to the `#client-onboarding` Slack channel. Sending
credentials must not generate a Slack message (user directive 2026-08-04).

**Why the write goes through an edge function** rather than an anon RLS policy
like every other form here: single-use has to be server-enforced. Whoever holds
the link holds the anon key too, so an anon UPDATE policy is replayable. The
table has no anon grants at all; the guarantee is the conditional
`update ... where submitted_at is null` inside the function.

**No drafts, no autosave.** Every other form in this repo saves to localStorage
on each keystroke. This one deliberately does not: credentials should not
outlive the submit.

To issue a link:

```sql
insert into credential_handoffs (token, label, intro, expires_at, notes, fields)
values (
  encode(gen_random_bytes(24), 'base64')::text,  -- then strip +/= for URL safety
  'StretchMed — Momence API access',
  'Two studios, one form. Nothing here is shared outside the Velocity team.',
  now() + interval '14 days',
  'Sent to Dave, StretchMed support, thread #SUP-50950',
  '[{"key":"ki_client_id","label":"Client ID","group":"Kent Island","required":true}]'::jsonb
);
```

Then send `https://onboarding.velocityaipartners.app/handoff.html?t=<token>`.

After it comes back: read `payload`, move the values to their permanent home,
then **delete the row**. The table is a mailbox, not storage.

## Per-client pre-filled links — use `CLIENT_PREFILLS`, do NOT fork

When a client is worth a tailored link, add a **config entry**, not a new file.

**Do not copy the form.** Forking is how we got here: six variant files (`magretti`, `song-koh`, `gorman`, `pelaez-spata`, `western-springs`, `willowbrook`) each snapshotted `form.js` at a point in time and then stopped receiving fixes. None of them got the 2026-08-02 data-loss fixes, and they all still write `automation_goals.goals` instead of the Campaign Map's `.campaigns`. They are served by `vercel.json` rewrites that bypass `index.html` entirely, which is why nothing that improves the main form ever reaches them.

To build a new pre-filled link:

1. Add an entry to `CLIENT_PREFILLS` near the top of `form.js`: `heading`, `subheading`, `fields` (keyed by the real `name=` attribute), `hours`, `users`, and optionally `draftFields` and `campaigns`.

   **`fields` vs `draftFields` — the distinction is the point.** `fields` is chipped **"Pre-filled"** and means *we verified this for this studio* (signed agreement, the brand's own location page, the studio's own channels, our CRM): the client only has to confirm it. `draftFields` is chipped **"Draft"** and means *this is our starting point, carried over from how the locations we already run answer the same question*: the client is expected to edit it. Put anything brand-general in `draftFields`, and say what the chips mean in the `subheading`.

   Pricing belongs in `draftFields`, always. Our own knowledge base has Stretch Zone membership ladders ranging from $119/$200/$360/$480 to $139/$240/$440/$600, with drop-ins at $85, $90 and $95, and some studios quoting only a per-session range. A price chipped "Pre-filled" reads as *we looked this up for you*, an owner skims and accepts, and the AI then quotes another studio's rate card to a real lead. When seeding pricing, lead the field with the brand's do-not-quote-before-the-demo rule so an unedited value still fails safe.

   `campaigns` is an array of `camp_*` checkbox names to tick. Only seed campaigns matching scope that was actually sold and quantified for that client, and expect one section badge rather than 15 inline chips (see `SECTION_BADGE_REF` in `markAiSuggested()`).
2. Add a rewrite in `vercel.json`: `{ "source": "/<slug>", "destination": "/index.html" }`. Keep the destination as plain `index.html` — a query string in the destination never reaches the browser, which is why `clientSlug()` reads `location.pathname`, not `location.search`.
3. Bump `?v=N` on the `form.js` tag in `index.html`.
4. Add expectations to `test/prefill.mjs` and run `node test/prefill.mjs`.

`?client=<slug>` also works and is the form admin links should use. Both resolve to the same config.

🔴 **`applyClientPrefill()` must stay between `initDraftFromUrl()` and `captureAutosaveBaseline()`.** After the draft load so a returning client's own answers always win; before the baseline so seeded values count as zero changes. Move it below the baseline and an untouched form inserts a row the moment the client closes the tab (`visibilitychange -> hidden` calls `autosaveNow()` directly), which fires `slack-intake-submission` and pings `#client-onboarding` with `<!channel>` for a form nobody filled in. `test/prefill.mjs` guards this; the guard is mutation-verified.

Pre-filled rows are ordinary `location_intake_submissions` rows, so `/client-onboarding` review and `provision-from-intake` work unchanged and no migration is needed.

### The six legacy forks (to retire)

Still live, still stale. `song-koh` is **done**: `/reston`, `/song-koh` and `?form=song-koh` all now serve the live form via `CLIENT_PREFILLS.reston`, and `song-koh.{html,js,css}` are dead files kept only for reference. The remaining five (`magretti`, `gorman`, `pelaez-spata`, `western-springs`, `willowbrook`) should be migrated the same way. Three of them have live draft rows, so check `location_intake_submissions` before repointing a route.

**Rules that matter more than coverage:**

- **Pre-fill from verifiable sources only** — a signed agreement, the brand's official location page, or an existing location's knowledge base. Record the source in a comment on the `CLIENT_PREFILLS` entry. Every seeded field is chipped "Pre-filled" in the UI and the client is asked to correct anything wrong. Never invent an email, a phone, or a price to fill a field.
- **Label assumptions as assumptions.** If we're guessing a CRM platform, leave it blank and let the client pick rather than recording the guess as fact.
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
