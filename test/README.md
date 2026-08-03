# Tests

Two suites. Neither can write to production.

## Round-trip test — does the form record every answer?

```sh
supabase start                                                    # once per machine
docker exec -i supabase_db_jjckotsrhuxxftwmdlwc \
  psql postgresql://postgres:postgres@127.0.0.1:5432/postgres < test/staging-schema.sql
node test/roundtrip.mjs
```

Fills every field in the real form in real Chrome, presses **Save as draft**,
reloads the draft from the server, presses **Review & Submit** and confirms the
modal, then reads the row out of Postgres and asserts every answer survived.
26 checks.

**Why a browser.** On 2026-08-02 a regex deleted the `const payload =
buildPayload(...)` line. `node --check` passed, the page rendered normally, and
Save silently persisted nothing. Only pressing the actual button catches that.

**Why it cannot reach production.** `test/roundtrip.mjs` serves the repo over
localhost and rewrites the two hard-coded Supabase constants in `form.js` as the
file goes out. It counts the lines it changed and **refuses to run** unless
exactly two changed and no production host remains in the file. So if `form.js`
is ever restructured, the test aborts rather than quietly writing to prod.

Note the form treats `127.0.0.1` as PREVIEW mode and suppresses every write, so
the harness loads `?live=1`. That flag is what makes the writes real — against
local staging only.

## Extraction tests — does the AI pre-fill work?

```sh
deno test --allow-net --allow-env supabase/functions/scrape-location-page/extract_test.ts
SKIP_LIVE=1 deno test --allow-net ...                             # offline only
```

15 checks over `extract.ts`: HTML-to-text, JSON-LD recovery, the 15-minute hours
grid, and the SSRF guard. The three `LIVE:` tests hit real brand sites and are
the ones that would have caught the eleven-day pre-fill outage — the Firecrawl
key ran out of credits and every request 502'd with nobody watching.

## staging-schema.sql

Generated from an introspection of production, not hand-written. It deliberately
**omits the `slack-intake-submission` trigger**: in prod that is `AFTER INSERT OR
UPDATE` with no `WHEN` clause and POSTs every row to live n8n, which `<!channel>`s
`#client-onboarding`. Recreating it would page the team on every test run.

Everything else is meant to match prod exactly — 63 columns, 6 RLS policies, the
`status` CHECK allowlist, the `(status, submitted_at)` index, and full table
grants to `anon`/`authenticated`/`service_role` (prod grants all privileges and
relies entirely on RLS, so granting less here would make a negative test pass for
the wrong reason).

**If you change the schema in prod, regenerate this.** The first version of this
file was built from `information_schema.columns` alone, which silently missed the
CHECK constraint, the index and the grants — a bad `status` value passed every
local test and would only have failed on the real write. Column-level
introspection is not schema parity.
