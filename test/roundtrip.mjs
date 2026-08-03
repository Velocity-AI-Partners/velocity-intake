// Round-trip test for the intake form.
//
//   node test/roundtrip.mjs
//
// Fills every field in the real form in a real browser, saves a draft, reloads
// that draft from the server, submits it, then reads the row back out of the
// database and asserts every answer survived the whole trip.
//
// Why a browser and not a unit test: on 2026-08-02 a regex deleted the
// `const payload = buildPayload(...)` line. `node --check` passed, the page
// rendered fine, and Save silently persisted nothing. The only check that
// catches that class of bug is pressing the actual button.
//
// Everything runs against the LOCAL Supabase stack (test/staging-schema.sql).
// Nothing here can touch production: the Supabase URL is rewritten as the file
// is served, and the assertions read from local Postgres.
//
// Zero dependencies - no npm, matching the repo's no-build-step rule. Chrome is
// driven over the DevTools Protocol using Node's built-in WebSocket.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const REPO = new URL('..', import.meta.url).pathname;
const PORT = 8788;
const CDP_PORT = 9334;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const DB_CONTAINER = 'supabase_db_jjckotsrhuxxftwmdlwc';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- assertions
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : `\n         ${detail}`}`);
}

// ------------------------------------------------------------------ database
async function sql(query) {
  const { stdout } = await execFileP('docker', [
    'exec', '-i', DB_CONTAINER, 'psql', DB_URL, '-At', '-F', '', '-c', query,
  ], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

// -------------------------------------------------------------- file serving
// Serve the repo as-is, with one exception: form.js has the production
// Supabase URL and key hard-coded at the top. We rewrite exactly those two
// string literals so the form talks to local staging, and assert that the
// rewrite changed exactly two lines - if form.js is ever restructured, this
// test must fail loudly rather than silently testing against production.
async function serveFile(pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const buf = await readFile(join(REPO, rel.replace(/^\/+/, '')));
  if (!rel.endsWith('/form.js')) return buf;

  const src = buf.toString('utf8');
  const out = src
    .replace(/const SUPABASE_URL = '[^']*';/, `const SUPABASE_URL = '${LOCAL_URL}';`)
    .replace(/const SUPABASE_ANON_KEY = '[^']*';/, `const SUPABASE_ANON_KEY = '${LOCAL_KEY}';`);

  const changed = src.split('\n').filter((l, i) => l !== out.split('\n')[i]).length;
  if (changed !== 2) {
    throw new Error(`form.js rewrite changed ${changed} lines, expected exactly 2. ` +
      'Refusing to run - the test could be pointing at production.');
  }
  if (out.includes('jjckotsrhuxxftwmdlwc.supabase.co')) {
    throw new Error('form.js still references the production Supabase host after rewrite. Refusing to run.');
  }
  return Buffer.from(out, 'utf8');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        const p = new URL(req.url, 'http://x').pathname;
        const body = await serveFile(p);
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
        res.end(body);
      } catch (e) {
        if (/Refusing to run/.test(String(e.message))) { console.error(`\nFATAL: ${e.message}`); process.exit(2); }
        res.writeHead(404); res.end('not found');
      }
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

// ----------------------------------------------------------------------- CDP
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.session = null;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
    });
  }
  static async connect(port) {
    for (let i = 0; i < 40; i++) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
        return new CDP(ws);
      } catch { await sleep(250); }
    }
    throw new Error('could not reach Chrome DevTools');
  }
  send(method, params = {}, sessionId = this.session) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    });
  }
  async openTab() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' }, null);
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true }, null);
    this.session = sessionId;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    // Poll for readyState rather than racing a load event we may have missed.
    for (let i = 0; i < 60; i++) {
      try {
        const r = await this.eval('document.readyState === "complete" && !!document.getElementById("intake-form")');
        if (r === true) { await sleep(250); return; }
      } catch { /* navigating */ }
      await sleep(200);
    }
    throw new Error(`page never became ready: ${url}`);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
}

// ----------------------------------------------------------------- test data
// A distinct, recognisable value per field so a mix-up between two fields is
// visible in the diff rather than looking like a pass.
const VALUES = {
  business_name: 'Round Trip Test Studio',
  business_email: 'studio@roundtrip.test',
  business_phone: '(555) 010-2030',
  city: 'Testville',
  address: '900 Assertion Way, Suite 7',
  timezone: 'America/Chicago',
  contact_name: 'Dana Testerson',
  contact_email: 'dana@roundtrip.test',
  contact_phone: '(555) 040-5060',
  website_url: 'https://roundtrip.test',
  google_business_profile_url: 'https://g.page/roundtrip',
  instagram_handle: 'roundtriptest',
  facebook_page_url: 'https://facebook.com/roundtriptest',
  tiktok_handle: 'roundtriptok',
  crm_platform: 'other',
  crm_platform_other: 'Bespoke CRM 9000',
  assistant_name: 'Robin',
  trial_booking_url: 'https://roundtrip.test/book',
  main_cta: 'other',
  main_cta_other: 'Claim your free assessment',
  intro_offer: 'First session free for new clients',
  preferred_words: 'welcoming, expert',
  avoid_words: 'cheap, discount',
  bk_service_description: 'Assisted stretching and mobility work',
  bk_single_session_rate: '$60',
  bk_membership_pricing: '$220/mo for 4 sessions',
  bk_package_pricing: '$500 for 10 sessions',
  bk_promotions: 'Refer a friend, get one free',
  bk_cancellation_policy: '24 hours notice required',
  bk_eligibility: 'Adults 18 and over',
  bk_ideal_client: 'Desk workers with low back tightness',
  bk_pain_points: 'Stiffness, poor posture, recurring pain',
  bk_unique_value: 'Practitioner-assisted method, measured progress',
  bk_first_visit: 'Assessment plus a 25 minute stretch',
  bk_faq: 'Q: Do I need to be flexible? A: No.',
  bk_insurance_notes: 'HSA and FSA accepted, no direct billing',
  notes: 'This row was created by test/roundtrip.mjs',
  notify_email_address: 'alerts@roundtrip.test',
  notify_phone_number: '(555) 070-8090',
  location_page_url: 'https://roundtrip.test/locations/testville',
};

const CAMPAIGNS_EXPECTED = [
  'contacting_new_leads', 'complete_your_intro', 'booking_reminder', 'no_show_recovery',
  'missed_sale', 'cancel_recovery', 'post_visit_followup', 'member_rebooking',
  'client_retention_medium', 'client_retention_high', 'milestone_reminders',
  'birthday_milestones', 'lead_reactivation_warm', 'lead_reactivation_cold', 'ex_member_winback',
];

// Deliberately mixed, with times that are NOT the 09:00-17:00 default so a
// silently-dropped hours grid cannot masquerade as a pass. Sunday carries both
// times AND closed=true: one of the 2026-08-02 fixes was that ticking "closed"
// must stop destroying the times the client already entered, so this asserts
// that fix stays fixed.
const HOURS_EXPECTED = {
  mon: { open: '06:30', close: '20:00', closed: false },
  tue: { open: '06:30', close: '20:00', closed: false },
  wed: { open: '07:00', close: '19:00', closed: false },
  thu: { open: '06:30', close: '20:00', closed: false },
  fri: { open: '06:30', close: '18:00', closed: false },
  sat: { open: '08:00', close: '14:00', closed: false },
  sun: { open: '10:00', close: '12:00', closed: true },
};

const FILL_SCRIPT = `(() => {
  const form = document.getElementById('intake-form');
  const V = ${JSON.stringify(VALUES)};
  const HOURS = ${JSON.stringify(HOURS_EXPECTED)};
  const fire = (el, types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
  const setVal = (name, value) => {
    const el = form.elements[name];
    if (!el) return 'missing';
    el.value = value;
    fire(el, ['input', 'change']);
    return el.value === String(value) ? 'ok' : 'rejected:' + el.value;
  };

  const report = { set: {}, missing: [], campaigns: 0 };

  // Selects first: crm_platform and main_cta reveal their "other" text inputs.
  ['crm_platform', 'main_cta', 'timezone'].forEach(n => { report.set[n] = setVal(n, V[n]); });

  Object.keys(V).forEach(n => {
    if (['crm_platform','main_cta','timezone'].includes(n)) return;
    const r = setVal(n, V[n]);
    if (r === 'missing') report.missing.push(n); else report.set[n] = r;
  });

  // Attestation checkboxes.
  ['hours_confirmed', 'crm_account_confirmed'].forEach(n => {
    const el = form.elements[n];
    if (el) { el.checked = true; fire(el, ['change']); } else report.missing.push(n);
  });

  // Notification channels + routing to "someone else" so the extra fields apply.
  ['notify_email', 'notify_sms'].forEach(n => {
    const el = form.elements[n];
    if (el) { el.checked = true; fire(el, ['change']); } else report.missing.push(n);
  });
  const tgt = form.querySelector('[name="notify_target"][value="different"]');
  if (tgt) { tgt.checked = true; fire(tgt, ['change']); } else report.missing.push('notify_target=different');
  // Re-apply: toggling notify_target may have re-enabled/cleared these.
  setVal('notify_email_address', V.notify_email_address);
  setVal('notify_phone_number', V.notify_phone_number);

  // Radios.
  [['bk_accepts_insurance','no'], ['bk_accepts_hsa_fsa','yes']].forEach(([n, v]) => {
    const r = form.querySelector('[name="' + n + '"][value="' + v + '"]');
    if (r) { r.checked = true; fire(r, ['change']); } else report.missing.push(n + '=' + v);
  });

  // Every campaign in the map.
  Array.from(form.querySelectorAll('input[name^="camp_"]')).forEach(cb => {
    cb.checked = true; fire(cb, ['change']); report.campaigns++;
  });

  // Hours grid. Times are entered FIRST and "closed" ticked after, mirroring a
  // client who fills the week then marks Sunday closed - that ordering is what
  // used to destroy the times.
  Object.keys(HOURS).forEach(d => {
    const h = HOURS[d];
    const closed = form.elements['hours_' + d + '_closed'];
    const open = form.elements['hours_' + d + '_open'];
    const close = form.elements['hours_' + d + '_close'];
    if (open) { open.disabled = false; open.value = h.open; fire(open, ['input','change']); }
    if (close) { close.disabled = false; close.value = h.close; fire(close, ['input','change']); }
    if (closed) { closed.checked = !!h.closed; fire(closed, ['change']); }
  });

  // Dashboard user. renderUsers() always seeds row 0, so do NOT click "add
  // another user" - that would create a second, empty row. Fields are
  // user_<i>_name / _email / _role.
  const un = form.elements['user_0_name'];
  const ue = form.elements['user_0_email'];
  const ur = form.elements['user_0_role'];
  if (un) { un.value = 'Sam Manager'; fire(un, ['input','change']); } else report.missing.push('user_0_name');
  if (ue) { ue.value = 'sam@roundtrip.test'; fire(ue, ['input','change']); } else report.missing.push('user_0_email');
  if (ur) { ur.value = 'admin'; fire(ur, ['change']); } else report.missing.push('user_0_role');

  return report;
})()`;

// --------------------------------------------------------------------- main
let srv, chrome, profile, cdp;
try {
  srv = await startServer();
  profile = await mkdtemp(join(tmpdir(), 'intake-cdp-'));
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-dev-shm-usage',
    'about:blank',
  ], { stdio: 'ignore' });

  cdp = await CDP.connect(CDP_PORT);
  await cdp.openTab();

  console.log('\n--- fill and save draft ---');
  // ?live=1 is required: 127.0.0.1 is PREVIEW mode and suppresses every write.
  await cdp.goto(`http://127.0.0.1:${PORT}/index.html?live=1`);

  const fillReport = await cdp.eval(FILL_SCRIPT);
  check('every expected control exists in the form',
    fillReport.missing.length === 0, `missing: ${JSON.stringify(fillReport.missing)}`);
  check('all 15 campaign checkboxes present and ticked',
    fillReport.campaigns === 15, `ticked ${fillReport.campaigns}`);
  const rejected = Object.entries(fillReport.set).filter(([, v]) => v !== 'ok');
  check('no field rejected its test value', rejected.length === 0, JSON.stringify(rejected));

  // Press the real Save button. Autosave would eventually create the row on its
  // own, so this must assert the BUTTON works - the 2026-08-02 bug was in the
  // shared buildPayload() call that both paths depend on.
  const saveClicked = await cdp.eval(`(() => {
    const b = document.getElementById('save-draft-btn');
    if (!b) return 'no-save-button';
    b.click();
    return 'clicked';
  })()`);
  check('Save draft button exists and was clicked', saveClicked === 'clicked', String(saveClicked));

  // Wait for the row to appear in the database.
  let draftId = null;
  for (let i = 0; i < 40; i++) {
    const r = await sql(`select id from location_intake_submissions where business_name = '${VALUES.business_name}' order by submitted_at desc limit 1;`);
    if (r) { draftId = r.trim(); break; }
    await sleep(500);
  }
  check('Save draft actually wrote a row to the database', !!draftId,
    'no row appeared - this is the failure mode that shipped on 2026-08-02');
  if (!draftId) throw new Error('no draft row; cannot continue');

  const status0 = await sql(`select status from location_intake_submissions where id='${draftId}';`);
  check("saved row has status='draft'", status0 === 'draft', `got '${status0}'`);

  // --- reload the draft the way a client would, from the server -------------
  console.log('\n--- reload draft from server ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/index.html?live=1&draft=${draftId}`);
  await sleep(1200);

  const restored = await cdp.eval(`(() => {
    const form = document.getElementById('intake-form');
    const V = ${JSON.stringify(VALUES)};
    const out = { mismatched: [], hours: {}, campaigns: 0, users: null };
    Object.keys(V).forEach(n => {
      const el = form.elements[n];
      if (!el) { out.mismatched.push([n, 'MISSING', V[n]]); return; }
      const got = el.value;
      if (String(got) !== String(V[n])) out.mismatched.push([n, got, V[n]]);
    });
    ['mon','tue','wed','thu','fri','sat','sun'].forEach(d => {
      out.hours[d] = {
        closed: !!(form.elements['hours_'+d+'_closed'] || {}).checked,
        open: (form.elements['hours_'+d+'_open'] || {}).value,
        close: (form.elements['hours_'+d+'_close'] || {}).value,
      };
    });
    out.campaigns = Array.from(form.querySelectorAll('input[name^="camp_"]')).filter(c => c.checked).length;
    const un = form.elements['user_0_name'], ue = form.elements['user_0_email'], ur = form.elements['user_0_role'];
    out.users = { name: un && un.value, email: ue && ue.value, role: ur && ur.value };
    out.userRows = form.querySelectorAll('.user-row').length;
    out.hoursConfirmed = !!(form.elements['hours_confirmed'] || {}).checked;
    out.crmConfirmed = !!(form.elements['crm_account_confirmed'] || {}).checked;
    return out;
  })()`);

  const restoreMismatch = restored.mismatched;
  check('every text field survives a draft reload', restoreMismatch.length === 0,
    restoreMismatch.map(([n, got, want]) => `${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`).join('\n         '));

  const hoursBad = Object.entries(HOURS_EXPECTED).filter(([d, want]) => {
    const got = restored.hours[d];
    if (want.closed) return got.closed !== true;
    return got.closed !== false || got.open !== want.open || got.close !== want.close;
  });
  check('hours grid survives a draft reload, closed day included', hoursBad.length === 0,
    JSON.stringify(hoursBad.map(([d]) => [d, restored.hours[d], HOURS_EXPECTED[d]])));

  check('all 15 campaigns survive a draft reload', restored.campaigns === 15, `restored ${restored.campaigns}`);
  check('dashboard user survives a draft reload with its role',
    restored.users.name === 'Sam Manager' && restored.users.email === 'sam@roundtrip.test' && restored.users.role === 'admin',
    JSON.stringify(restored.users));
  check('attestation checkboxes survive a draft reload',
    restored.hoursConfirmed === true && restored.crmConfirmed === true,
    `hours_confirmed=${restored.hoursConfirmed} crm_account_confirmed=${restored.crmConfirmed}`);

  // --- submit ---------------------------------------------------------------
  console.log('\n--- submit ---');
  // Submit is two steps: #submit-btn validates and opens a review modal, then
  // #modal-confirm actually writes. Clicking only the first leaves status at
  // 'draft', which is exactly what a client abandoning the modal would do.
  const submitClicked = await cdp.eval(`(() => {
    const b = document.getElementById('submit-btn');
    if (!b) return 'no-submit-button';
    b.click();
    return 'clicked';
  })()`);
  check('Submit button exists and was clicked', submitClicked === 'clicked', String(submitClicked));

  await sleep(600);
  const validation = await cdp.eval(`(() => {
    const box = document.getElementById('error-box');
    const visible = box && !box.hidden && box.textContent.trim();
    const modal = document.getElementById('modal-confirm');
    return { blocked: visible ? box.textContent.trim() : null, modalPresent: !!modal,
             modalVisible: !!(modal && modal.offsetParent !== null) };
  })()`);
  check('a fully filled form passes validation and reaches the review modal',
    !validation.blocked && validation.modalVisible,
    `validation said: ${validation.blocked || '(nothing)'}; modal visible: ${validation.modalVisible}`);

  const confirmClicked = await cdp.eval(`(() => {
    const b = document.getElementById('modal-confirm');
    if (!b) return 'no-confirm-button';
    b.click();
    return 'clicked';
  })()`);
  check('review modal Confirm button was clicked', confirmClicked === 'clicked', String(confirmClicked));

  let finalStatus = '';
  for (let i = 0; i < 40; i++) {
    finalStatus = await sql(`select status from location_intake_submissions where id='${draftId}';`);
    if (finalStatus === 'pending') break;
    await sleep(500);
  }
  check("Submit flips status draft -> pending", finalStatus === 'pending', `status is '${finalStatus}'`);

  // --- assert against the stored row ---------------------------------------
  console.log('\n--- verify stored row ---');
  const row = JSON.parse(await sql(`select row_to_json(t) from location_intake_submissions t where id='${draftId}';`));

  const COLUMN_EXPECT = {
    business_name: VALUES.business_name, business_email: VALUES.business_email,
    business_phone: VALUES.business_phone, city: VALUES.city, address: VALUES.address,
    timezone: VALUES.timezone, contact_email: VALUES.contact_email, contact_phone: VALUES.contact_phone,
    website_url: VALUES.website_url, google_business_profile_url: VALUES.google_business_profile_url,
    instagram_handle: VALUES.instagram_handle, facebook_page_url: VALUES.facebook_page_url,
    tiktok_handle: VALUES.tiktok_handle, crm_platform: VALUES.crm_platform,
    crm_platform_other: VALUES.crm_platform_other, assistant_name: VALUES.assistant_name,
    trial_booking_url: VALUES.trial_booking_url, main_cta: VALUES.main_cta,
    main_cta_other: VALUES.main_cta_other, intro_offer: VALUES.intro_offer,
    preferred_words: VALUES.preferred_words, avoid_words: VALUES.avoid_words, notes: VALUES.notes,
  };
  const colBad = Object.entries(COLUMN_EXPECT).filter(([k, v]) => row[k] !== v);
  check('every flat column stored the submitted answer', colBad.length === 0,
    colBad.map(([k, v]) => `${k}: stored ${JSON.stringify(row[k])} want ${JSON.stringify(v)}`).join('\n         '));

  const hoursStoredBad = Object.entries(HOURS_EXPECTED).filter(([d, want]) => {
    const got = row.hours?.[d];
    return !got || got.closed !== want.closed || got.open !== want.open || got.close !== want.close;
  });
  check('hours stored exactly, and a closed day keeps the times the client entered',
    hoursStoredBad.length === 0,
    hoursStoredBad.map(([d, want]) => `${d}: stored ${JSON.stringify(row.hours?.[d])} want ${JSON.stringify(want)}`).join('\n         '));

  check('hours_confirmed and crm_account_confirmed stored true',
    row.hours_confirmed === true && row.crm_account_confirmed === true,
    `hours_confirmed=${row.hours_confirmed} crm_account_confirmed=${row.crm_account_confirmed}`);

  const storedCamps = row.automation_goals?.campaigns || [];
  const campMissing = CAMPAIGNS_EXPECTED.filter((c) => !storedCamps.includes(c));
  check('all 15 campaigns stored under automation_goals.campaigns',
    campMissing.length === 0 && storedCamps.length === 15,
    `stored ${storedCamps.length}: ${JSON.stringify(storedCamps)}; missing ${JSON.stringify(campMissing)}`);

  const bk = row.business_knowledge || {};
  const BK_EXPECT = {
    contact_name: VALUES.contact_name, service_description: VALUES.bk_service_description,
    single_session_rate: VALUES.bk_single_session_rate, membership_pricing: VALUES.bk_membership_pricing,
    package_pricing: VALUES.bk_package_pricing, promotions: VALUES.bk_promotions,
    cancellation_policy: VALUES.bk_cancellation_policy, eligibility: VALUES.bk_eligibility,
    ideal_client: VALUES.bk_ideal_client, pain_points: VALUES.bk_pain_points,
    unique_value: VALUES.bk_unique_value, first_visit: VALUES.bk_first_visit, faq: VALUES.bk_faq,
  };
  const bkBad = Object.entries(BK_EXPECT).filter(([k, v]) => bk[k] !== v);
  check('every business_knowledge answer stored', bkBad.length === 0,
    bkBad.map(([k, v]) => `${k}: stored ${JSON.stringify(bk[k])} want ${JSON.stringify(v)}`).join('\n         '));

  check('accepts_insurance stored as a real boolean false, not a string',
    bk.accepts_insurance === false, `stored ${JSON.stringify(bk.accepts_insurance)}`);

  const users = row.dashboard_users || [];
  check('dashboard user stored with the role the client chose',
    users.length === 1 && users[0].role === 'admin' && users[0].email === 'sam@roundtrip.test',
    JSON.stringify(users));

  const nc = row.notification_config || {};
  check('notification routing stored',
    nc.target === 'different' && nc.email === VALUES.notify_email_address &&
    nc.phone === VALUES.notify_phone_number && (nc.channels || []).length === 2,
    JSON.stringify(nc));

  check('has_free_trial derived from the CTA (other => false)',
    row.has_free_trial === false, `stored ${JSON.stringify(row.has_free_trial)}`);

  check('updated_at trigger moved updated_at past submitted_at',
    new Date(row.updated_at) >= new Date(row.submitted_at),
    `submitted_at=${row.submitted_at} updated_at=${row.updated_at}`);

  check('location_page_url (the AI prefill source page) is stored',
    row.location_page_url === VALUES.location_page_url,
    `stored ${JSON.stringify(row.location_page_url)} want ${JSON.stringify(VALUES.location_page_url)}`);

  // Show what a real client's submission actually looks like once stored.
  console.log(`\n--- the stored submission (id ${draftId}) ---`);
  const show = (label, value) => console.log(`  ${label.padEnd(24)} ${value}`);
  show('business', `${row.business_name} — ${row.address}, ${row.city}`);
  show('timezone', row.timezone);
  show('contact', `${row.business_knowledge?.contact_name} · ${row.contact_email} · ${row.contact_phone}`);
  show('AI Team Member', row.assistant_name);
  show('CRM', `${row.crm_platform}${row.crm_platform_other ? ` (${row.crm_platform_other})` : ''}, confirmed=${row.crm_account_confirmed}`);
  show('CTA', `${row.main_cta}${row.main_cta_other ? ` (${row.main_cta_other})` : ''} -> has_free_trial=${row.has_free_trial}`);
  show('hours', Object.entries(row.hours || {}).sort()
    .map(([d, h]) => `${d}${h.closed ? '=CLOSED' : `=${h.open}-${h.close}`}`).join(' '));
  show('campaigns', `${(row.automation_goals?.campaigns || []).length} selected`);
  show('dashboard users', JSON.stringify(row.dashboard_users));
  show('notifications', `${(row.notification_config?.channels || []).join('+')} -> ${row.notification_config?.target}`);
  show('knowledge fields', `${Object.values(row.business_knowledge || {}).filter(Boolean).length} answered`);
  show('status', `${row.status} (submitted ${row.submitted_at})`);

  if (process.env.KEEP === '1') {
    console.log(`\n  KEEP=1 — row left in staging for inspection:`);
    console.log(`  docker exec -i ${DB_CONTAINER} psql ${DB_URL} -c "select * from location_intake_submissions where id='${draftId}';"`);
  } else {
    await sql(`delete from location_intake_submissions where id='${draftId}';`);
  }
} finally {
  try { cdp?.ws?.close(); } catch { /* */ }
  try { chrome?.kill(); } catch { /* */ }
  try { srv?.close(); } catch { /* */ }
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(60)}\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}\n      ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
