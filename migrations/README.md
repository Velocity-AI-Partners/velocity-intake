# Migrations

**There is no `schema_migrations` table for this repo.** By convention these are
applied to production by hand (`execute_sql` against `jjckotsrhuxxftwmdlwc`),
which leaves no record in the database of what ran. This file is that record —
**update it whenever you apply one.**

Verified against production on 2026-08-03.

| # | What | Applied to prod |
|---|---|---|
| 001 | create `location_intake_submissions` | yes |
| 002 | draft policies | yes (superseded by 016) |
| 003 | nullable `business_name` for drafts | yes |
| 004 | `crm_platform_other` | yes |
| 005 | parent brand dropdown | yes |
| 006 | business contact fields | yes |
| 007 | branding/voice fields | yes |
| 008 | branding/voice notes | yes |
| 009 | automation + handoff | yes |
| 010 | `hours_confirmed` | yes |
| 011 | sms cadence + KPIs | yes |
| 012 | `location_page_url` | **yes — applied 2026-08-03** |
| 013 | `scrape_cache` + `scrape_rate_limit` | yes |
| 014 | AI phone/email connection | **NO — see below** |
| 015 | create `franchisor_intake_submissions` | yes |
| 016 | scope anon draft access to the row id | yes |
| 016_REVERT | emergency rollback of 016 | **NO — deliberately not applied** |
| 017 | `form_state` | yes (column exists; see note) |
| 018 | `updated_at` + trigger | yes |

## Notes on the three that need explaining

**014 — not applied, and the form does not collect these fields.** It adds
`ai_phone_mode`, `ai_phone_number`, `ai_email_mode`, `ai_email_address`. No such
inputs exist in `index.html`, so applying it would add four permanently-null
columns. Kept as a record of intent. Apply it *with* the form change, not before.

**016_REVERT — an emergency runbook, not a migration.** Run it only if client
confirmation emails stop arriving after 016. It reopens three real holes (anon
can list every draft, edit any draft without knowing its id, and submit someone
else's). Read its header before running it.

**017 — the column exists but nothing writes it.** `formState()` in `form.js`
only ever writes to localStorage; `form_state` is never part of the submission
payload. Server-side drafts round-trip entirely through the hand-maintained
field list in `applyServerRowToForm()`. Either wire it up or drop the column —
right now it is dead weight that looks like a working feature.

## Deploy order matters

A migration that adds a column the form will send **must reach production before
the form does**, or PostgREST rejects the entire insert with `PGRST204` and every
save fails. `012` carries that warning in its header for exactly this reason.

The form deploys on push to `main` via Vercel, so: apply the SQL first, verify
the column exists, then push.

## Keeping staging honest

`test/staging-schema.sql` mirrors this table for the round-trip test. It is
generated from a production introspection, so **when you change prod, regenerate
it** — and remember that a column-level introspection alone silently misses CHECK
constraints, indexes and grants. See `test/README.md`.
