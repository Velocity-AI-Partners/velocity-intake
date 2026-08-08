// Client-prefill test for the intake form.
//
//   node test/prefill.mjs
//
// Proves the pre-filled client link (`/reston`) seeds the real form correctly
// and, critically, that seeding does NOT look like client activity.
//
// Why that second half matters: autosave mints a row once changedFieldCount()
// reaches 3, and the slack-intake-submission trigger fires on INSERT with no
// WHEN clause, so a phantom row pings #client-onboarding with <!channel> for a
// client who never typed a character. applyClientPrefill() therefore has to run
// BEFORE captureAutosaveBaseline(). This test is the regression guard on that
// ordering: move the call one line later and the "no phantom draft" check fails.
//
// Nothing here can reach production. 127.0.0.1 is PREVIEW mode, so insertRow()
// and updateRow() return early. We deliberately do NOT pass ?live=1. The signal
// we assert on is client-side (the ?draft= URL stamp and the autosave status
// text), which still happens under PREVIEW, so the canary works fully offline.
//
// Zero dependencies - Chrome over the DevTools Protocol using Node's built-in
// WebSocket, matching the repo's no-build-step rule.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname;
const PORT = 8789;
const CDP_PORT = 9335;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : `\n         ${detail}`}`);
}

// -------------------------------------------------------------- file serving
// Mirrors the production vercel.json rewrites: /reston and /song-koh serve
// index.html while the browser URL keeps the vanity path. That is the whole
// point of testing over a server instead of file:// - clientSlug() reads
// location.pathname, and a rewrite is the only way to reproduce it.
const REWRITES = {
  '/reston': '/index.html', '/song-koh': '/index.html',
  '/cool-springs': '/index.html', '/coolsprings': '/index.html',
  '/gaithersburg': '/index.html',
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        const p = new URL(req.url, 'http://x').pathname;
        const rel = REWRITES[p] || (p === '/' ? '/index.html' : p);
        const body = await readFile(join(REPO, rel.replace(/^\/+/, '')));
        res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream' });
        res.end(body);
      } catch (e) {
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
    for (let i = 0; i < 60; i++) {
      try {
        const r = await this.eval('document.readyState === "complete" && !!document.getElementById("intake-form")');
        if (r === true) { await sleep(400); return; }
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

// --------------------------------------------------------------- expectations
// Every value here must match a verifiable source, not just match the config:
// address/phone/hours from stretchzone.com/locations/reston-va (verified
// 2026-07-30 against Yelp); emails from George's "Welcome to Velocity AI
// Partners - Next Steps" thread; ClubReady confirmed by George in that email.
const EXPECT = {
  business_name: 'Stretch Zone Reston',
  city: 'Reston',
  address: '1468 North Point Village Drive, Reston, VA 20194',
  business_phone: '(703) 822-5296',
  timezone: 'America/New_York',
  website_url: 'https://www.stretchzone.com/locations/reston-va',
  contact_name: 'Patrick Song',
  contact_email: 'patrick@alphaflexllc.com',
  contact_phone: '(917) 642-8030',
  crm_platform: 'clubready',
};

// Every field name any check below reads. READ_FORM only returns what is
// listed here, so a field missing from this list reads as undefined and its
// check fails for the wrong reason.
const READ_KEYS = [...new Set([...Object.keys(EXPECT),
  'business_email', 'instagram_handle', 'facebook_page_url', 'main_cta',
  'location_page_url', 'google_business_profile_url', 'trial_booking_url',
  'intro_offer', 'bk_service_description', 'bk_membership_pricing',
  'bk_single_session_rate', 'bk_eligibility', 'bk_first_visit',
  'bk_ideal_client', 'bk_unique_value', 'bk_pain_points', 'bk_faq',
  'avoid_words', 'preferred_words',
])];

const READ_FORM = `(() => {
  const f = document.getElementById('intake-form');
  const val = (n) => { const e = f.elements[n]; return e ? e.value : null; };
  return {
    fields: ${JSON.stringify(READ_KEYS)}.reduce((a, k) => (a[k] = val(k), a), {}),
    chipCounts: [].slice.call(document.querySelectorAll('.ai-suggested-chip, .ai-suggested-badge'))
      .reduce((a, c) => (a[c.textContent] = (a[c.textContent] || 0) + 1, a), {}),
    campaignsChecked: [].slice.call(document.querySelectorAll('[name^="camp_"]'))
      .filter(c => c.checked).map(c => c.name).sort(),
    h1: (document.querySelector('header h1') || {}).textContent || '',
    lead: (document.querySelector('header p.lead') || {}).textContent || '',
    hours: {
      mon: [val('hours_mon_open'), val('hours_mon_close')],
      fri: [val('hours_fri_open'), val('hours_fri_close')],
      sat: [val('hours_sat_open'), val('hours_sat_close')],
      sun: [val('hours_sun_open'), val('hours_sun_close')],
    },
    users: [0, 1].map(i => ({ name: val('user_' + i + '_name'), email: val('user_' + i + '_email'), role: val('user_' + i + '_role') })),
    userRows: document.querySelectorAll('#users-list .user-row').length,
    chips: document.querySelectorAll('.ai-suggested-chip, .ai-suggested-badge').length,
    chipText: (document.querySelector('.ai-suggested-chip') || {}).textContent || '',
    campaignBoxes: document.querySelectorAll('[name^="camp_"]').length,
    crmOtherHidden: !!(document.getElementById('crm-other-wrap') || {}).hidden,
    draftInUrl: /[?&]draft=/.test(location.search),
    autosaveStatus: (document.getElementById('autosave-status') || {}).textContent || '',
  };
})()`;

// --------------------------------------------------------------------- main
let srv, chrome, profile, cdp;
try {
  srv = await startServer();
  profile = await mkdtemp(join(tmpdir(), 'prefill-chrome-'));
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-dev-shm-usage',
    'about:blank',
  ], { stdio: 'ignore' });

  cdp = await CDP.connect(CDP_PORT);
  await cdp.openTab();

  // ---------------------------------------------------- 1. the vanity path
  console.log('\n--- /reston (vercel rewrite, no query string) ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/reston`);
  const r = await cdp.eval(READ_FORM);

  for (const [k, want] of Object.entries(EXPECT)) {
    check(`prefilled ${k}`, r.fields[k] === want, `got ${JSON.stringify(r.fields[k])}, want ${JSON.stringify(want)}`);
  }
  check('heading greets Patrick and Rob', r.h1 === 'Welcome, Patrick and Rob', `got ${JSON.stringify(r.h1)}`);
  check('subheading asks them to correct anything wrong', /correct anything/i.test(r.lead), `got ${JSON.stringify(r.lead)}`);

  check('Mon-Fri hours are 08:00-19:00',
    r.hours.mon[0] === '08:00' && r.hours.mon[1] === '19:00' && r.hours.fri[0] === '08:00' && r.hours.fri[1] === '19:00',
    JSON.stringify(r.hours));
  check('Sat/Sun hours are 10:00-16:00',
    r.hours.sat[0] === '10:00' && r.hours.sat[1] === '16:00' && r.hours.sun[0] === '10:00' && r.hours.sun[1] === '16:00',
    JSON.stringify(r.hours));

  check('two dashboard user rows exist', r.userRows === 2, `got ${r.userRows}`);
  check('user 0 is Patrick Song', r.users[0].name === 'Patrick Song' && r.users[0].email === 'patrick@alphaflexllc.com',
    JSON.stringify(r.users[0]));
  check('user 1 is Rob Koh with his real address', r.users[1].name === 'Rob Koh' && r.users[1].email === 'rob@alphaflexllc.com',
    JSON.stringify(r.users[1]));
  check('both users default to admin', r.users[0].role === 'admin' && r.users[1].role === 'admin',
    JSON.stringify(r.users.map(u => u.role)));

  check('pre-filled fields are chipped', r.chips > 0, `got ${r.chips}`);
  check('chip says "Pre-filled", not "AI suggested"', r.chipText === 'Pre-filled', `got ${JSON.stringify(r.chipText)}`);
  check('crm "other" box stays hidden for a known CRM', r.crmOtherHidden === true, `hidden=${r.crmOtherHidden}`);

  // The whole reason for rebuilding rather than patching the fork: Reston is
  // now on the v2 form, so it has the Campaign Map the fork never got.
  check('all 15 Campaign Map checkboxes present', r.campaignBoxes === 15, `got ${r.campaignBoxes}`);

  // ------------------------------------- 2. seeding is not client activity
  console.log('\n--- no phantom draft (the ordering guard) ---');
  check('no draft id in the URL at load', r.draftInUrl === false, 'a draft was minted before the client touched anything');
  check('autosave status is silent at load', r.autosaveStatus.trim() === '', `got ${JSON.stringify(r.autosaveStatus)}`);

  await sleep(5500);
  const after = await cdp.eval(READ_FORM);
  check('still no draft after the autosave debounce elapses', after.draftInUrl === false,
    'a timer minted a draft with no client input');

  // THE guard. The two checks above cannot catch a wrong ordering on their own:
  // applyClientPrefill() assigns .value without dispatching events, so it never
  // calls scheduleAutosave() and no timer is ever armed. The path that DOES run
  // unconditionally is visibilitychange -> hidden, which calls autosaveNow()
  // directly. So the real-world symptom of capturing the baseline too early is:
  // the client opens their link, reads it, closes the tab without typing, and
  // changedFieldCount() reads ~20 -> a row is inserted -> the
  // slack-intake-submission trigger pings #client-onboarding with <!channel>
  // for a form nobody filled in. Verified by mutation: move applyClientPrefill()
  // below captureAutosaveBaseline() and this check fails while the rest pass.
  await cdp.eval(`(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return true;
  })()`);
  await sleep(1500);
  const hidden = await cdp.eval(READ_FORM);
  check('closing the tab without typing mints NO draft', hidden.draftInUrl === false,
    'applyClientPrefill() is running AFTER captureAutosaveBaseline() - the seeded values are being counted as client edits, so an untouched form inserts a row and pings Slack');

  // ------------------------------------------------- 3. positive control
  // Without this the checks above could pass because autosave is simply broken.
  // Fresh load so the visibilityState override above cannot influence it.
  console.log('\n--- positive control: real edits must still autosave ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/reston`);
  await cdp.eval(`(() => {
    const f = document.getElementById('intake-form');
    const set = (n, v) => { const e = f.elements[n]; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('assistant_name', 'Riley');
    set('intro_offer', 'First stretch free');
    set('bk_ideal_client', 'Active adults 35+');
  })()`);
  let fired = false;
  for (let i = 0; i < 30; i++) {
    const s = await cdp.eval(`({ d: /[?&]draft=/.test(location.search), s: (document.getElementById('autosave-status')||{}).textContent||'' })`);
    if (s.d || s.s.trim() !== '') { fired = true; break; }
    await sleep(500);
  }
  check('autosave fires after 3 genuine edits', fired,
    'autosave never fired, so the "no phantom draft" checks above prove nothing');

  // ------------------------------------------- 4. the generic form is clean
  console.log('\n--- the default form must be untouched ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/`);
  const plain = await cdp.eval(READ_FORM);
  check('default heading is still "Client Onboarding"', plain.h1 === 'Client Onboarding', `got ${JSON.stringify(plain.h1)}`);
  check('default form has no business name', !plain.fields.business_name, `got ${JSON.stringify(plain.fields.business_name)}`);
  check('default form has no contact email', !plain.fields.contact_email, `got ${JSON.stringify(plain.fields.contact_email)}`);
  check('default form has one user row', plain.userRows === 1, `got ${plain.userRows}`);
  check('default form has no prefill chips', plain.chips === 0, `got ${plain.chips}`);
  check('default hours stay at the 09:00-17:00 default',
    plain.hours.mon[0] === '09:00' && plain.hours.mon[1] === '17:00', JSON.stringify(plain.hours.mon));

  // -------------------------------------------------- 5. the legacy slug
  console.log('\n--- /song-koh (the slug already in George\'s sent mail) ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/song-koh`);
  const legacy = await cdp.eval(READ_FORM);
  check('/song-koh resolves to the same client', legacy.fields.business_name === 'Stretch Zone Reston',
    `got ${JSON.stringify(legacy.fields.business_name)}`);
  check('/song-koh greets Patrick and Rob', legacy.h1 === 'Welcome, Patrick and Rob', `got ${JSON.stringify(legacy.h1)}`);

  // ------------------------------------------------- 6. ?client= explicit
  console.log('\n--- ?client=reston (the admin-link form) ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/index.html?client=reston`);
  const q = await cdp.eval(READ_FORM);
  check('?client=reston prefills too', q.fields.business_name === 'Stretch Zone Reston',
    `got ${JSON.stringify(q.fields.business_name)}`);

  // -------------------------------------------- 7. the per-studio prefills
  // One entry per pre-filled client link. Every value below must match the
  // brand's own location page or a named CRM record, not merely match the
  // config -- a test that only asserts the config equals itself proves nothing
  // about whether we sent the client someone else's address.
  //
  // Each is scoped to ONE studio even where the owner has more: Chris also owns
  // Thompson's Station, Patrick and Rob own 6. One submission provisions exactly
  // one location, so every additional studio gets its own entry and its own
  // link and can never ride along on an existing form.
  const STUDIOS = [
    {
      path: '/cool-springs', alias: '/coolsprings', label: 'Cool Springs',
      // stretchzone.com/locations/cool-springs-tn (/franklin-tn serves the same
      // studio), read 2026-08-07, plus Sales Spark lead 8f5302d1.
      heading: 'Welcome, Chris', studio: /Cool Springs/i,
      owner: { name: 'Chris Morrison', email: 'morrison_chris@yahoo.com' },
      userRows: 1,
      fields: {
        business_name: 'Stretch Zone Cool Springs',
        city: 'Franklin',
        address: '330 Mayfield Drive, Suite C9, Franklin, TN 37067',
        business_phone: '(615) 721-5190',
        business_email: 'coolspringstn@stretchzone.com',
        instagram_handle: '@stretchzone_coolsprings',
        timezone: 'America/Chicago',
        website_url: 'https://www.stretchzone.com/locations/cool-springs-tn',
        location_page_url: 'https://www.stretchzone.com/locations/cool-springs-tn',
        contact_name: 'Chris Morrison',
        contact_email: 'morrison_chris@yahoo.com',
        contact_phone: '(615) 525-7470',
        crm_platform: 'clubready',
        main_cta: 'book_demo',
      },
      // Not asserted by value, only that they carry SOMETHING substantial: the
      // wording is editorial and will change, the presence is the contract.
      draftFilled: ['intro_offer', 'bk_service_description', 'bk_membership_pricing',
        'bk_single_session_rate', 'bk_eligibility', 'bk_first_visit', 'bk_ideal_client',
        'bk_unique_value', 'bk_pain_points', 'bk_faq', 'avoid_words', 'preferred_words'],
      // Left blank on purpose. A check here is the guard against someone later
      // "helpfully" seeding a booking URL or Facebook page we never confirmed.
      mustBeBlank: ['trial_booking_url', 'facebook_page_url'],
      campaigns: ['camp_client_retention_high', 'camp_client_retention_medium',
        'camp_contacting_new_leads', 'camp_lead_reactivation_cold', 'camp_lead_reactivation_warm'],
      hours: { mon: ['06:30', '20:00'], fri: ['06:30', '19:00'], sat: ['07:00', '16:00'], sun: ['08:00', '14:00'] },
    },
    {
      // Patrick Song and Rob Koh's SECOND studio. Signed 2026-08-07, $749/mo +
      // $500 setup, 60 days then month to month.
      //
      // Values from stretchzone.com/locations/gaithersburg-md read 2026-08-08,
      // cross-checked against the studio's Fresha listing (same phone, same 7
      // days of hours, and the same address with NO unit number). business_email
      // is decoded from that page's own Cloudflare-obfuscated mailto and is
      // corroborated by Sales Spark lead 3996e589; contact details are Patrick's
      // from `reston`, his phone matching lead 36dad8c2.
      path: '/gaithersburg', label: 'Gaithersburg',
      heading: 'Welcome back, Patrick and Rob', studio: /Gaithersburg/i,
      owner: { name: 'Patrick Song', email: 'patrick@alphaflexllc.com' },
      userRows: 2,
      fields: {
        business_name: 'Stretch Zone Gaithersburg',
        city: 'Gaithersburg',
        address: '251 Kentlands Boulevard, Gaithersburg, MD 20878',
        business_phone: '(301) 798-7376',
        business_email: 'gaithersburg@stretchzone.com',
        instagram_handle: '@stretchzone_gaithersburg',
        timezone: 'America/New_York',
        website_url: 'https://www.stretchzone.com/locations/gaithersburg-md',
        location_page_url: 'https://www.stretchzone.com/locations/gaithersburg-md',
        contact_name: 'Patrick Song',
        contact_email: 'patrick@alphaflexllc.com',
        contact_phone: '(917) 642-8030',
        crm_platform: 'clubready',
        main_cta: 'book_demo',
        // Verified for this studio, so it is Pre-filled rather than Draft:
        // their own page advertises a free 30-minute first stretch.
        intro_offer: 'The first 30-minute stretch is free.',
      },
      draftFilled: ['bk_service_description', 'bk_membership_pricing',
        'bk_single_session_rate', 'bk_eligibility', 'bk_first_visit', 'bk_ideal_client',
        'bk_unique_value', 'bk_pain_points', 'bk_faq', 'avoid_words', 'preferred_words'],
      mustBeBlank: ['trial_booking_url', 'facebook_page_url'],
      // Deliberately empty: nothing was quantified for Gaithersburg. The deal
      // carries no proposal and no scope notes, so ticking a box here would be
      // asserting a scope we made up. This assertion is the guard against
      // someone later copying Cool Springs' five ticks across.
      campaigns: [],
      hours: { mon: ['07:00', '19:00'], fri: ['07:00', '19:00'], sat: ['08:00', '16:00'], sun: ['08:00', '16:00'] },
    },
  ];

  for (const s of STUDIOS) {
    console.log(`\n--- ${s.path} (${s.owner.name}, ${s.label}) ---`);
    await cdp.goto(`http://127.0.0.1:${PORT}${s.path}`);
    const m = await cdp.eval(READ_FORM);

    for (const [k, want] of Object.entries(s.fields)) {
      check(`${s.label}: ${k}`, m.fields[k] === want, `got ${JSON.stringify(m.fields[k])}, want ${JSON.stringify(want)}`);
    }
    check(`${s.label}: heading greets the owner`, m.h1 === s.heading, `got ${JSON.stringify(m.h1)}`);
    // Every owner here runs more than one studio, so the page has to say WHICH
    // one this form is for, and still ask them to correct anything wrong.
    check(`${s.label}: subheading names the studio`, s.studio.test(m.lead), `got ${JSON.stringify(m.lead)}`);
    check(`${s.label}: subheading asks them to correct anything wrong`, /correct anything/i.test(m.lead), `got ${JSON.stringify(m.lead)}`);

    for (const [day, want] of Object.entries(s.hours)) {
      check(`${s.label}: ${day} hours ${want[0]}-${want[1]}`,
        m.hours[day] && m.hours[day][0] === want[0] && m.hours[day][1] === want[1],
        JSON.stringify(m.hours[day]));
    }

    check(`${s.label}: ${s.userRows} dashboard user row(s)`, m.userRows === s.userRows, `got ${m.userRows}`);
    check(`${s.label}: user 0 is ${s.owner.name}`,
      m.users[0].name === s.owner.name && m.users[0].email === s.owner.email,
      JSON.stringify(m.users[0]));

    // ---- the two-tier chip contract -------------------------------------
    // Verified values say "Pre-filled" (confirm this). Brand-carryover values
    // say "Draft" (edit this). Collapsing the two would tell Chris we looked up
    // his pricing when we did not, which is the whole risk with seeding it.
    for (const k of s.draftFilled) {
      check(`${s.label}: ${k} carries a draft`, typeof m.fields[k] === 'string' && m.fields[k].length > 30,
        `got ${JSON.stringify((m.fields[k] || '').slice(0, 60))}`);
    }
    for (const k of s.mustBeBlank) {
      check(`${s.label}: ${k} is left blank (unverified)`, !m.fields[k], `got ${JSON.stringify(m.fields[k])}`);
    }
    check(`${s.label}: both chip types are present`,
      m.chipCounts['Pre-filled'] > 0 && m.chipCounts['Draft'] > 0, JSON.stringify(m.chipCounts));
    check(`${s.label}: every draft field is chipped "Draft"`,
      m.chipCounts['Draft'] >= s.draftFilled.length,
      `${m.chipCounts['Draft']} draft chips for ${s.draftFilled.length} draft fields`);

    // The pricing field must lead with the do-not-quote rule. That line is what
    // stops the AI quoting another studio's numbers if Chris never edits them.
    check(`${s.label}: pricing leads with the do-not-quote-before-demo rule`,
      /^IMPORTANT: do not quote full membership pricing before the first stretch/.test(m.fields.bk_membership_pricing || ''),
      `starts ${JSON.stringify((m.fields.bk_membership_pricing || '').slice(0, 70))}`);
    // Non-negotiable compliance line for a non-medical provider.
    check(`${s.label}: avoid-words forbids medical claims`,
      /never claim we treat, cure, heal/i.test(m.fields.avoid_words || ''),
      `got ${JSON.stringify((m.fields.avoid_words || '').slice(0, 80))}`);

    check(s.campaigns.length
      ? `${s.label}: the contracted campaigns are ticked`
      : `${s.label}: NO campaigns are ticked (nothing was quantified)`,
      JSON.stringify(m.campaignsChecked) === JSON.stringify(s.campaigns),
      `got ${JSON.stringify(m.campaignsChecked)}, want ${JSON.stringify(s.campaigns)}`);
    check(`${s.label}: crm "other" box stays hidden`, m.crmOtherHidden === true, `hidden=${m.crmOtherHidden}`);
    // The reason for using CLIENT_PREFILLS instead of forking the form.
    check(`${s.label}: all 15 Campaign Map checkboxes present`, m.campaignBoxes === 15, `got ${m.campaignBoxes}`);
    check(`${s.label}: no phantom draft at load`, m.draftInUrl === false,
      'a draft row was minted before Chris touched anything, which pings #client-onboarding with <!channel>');

    // Re-prove the ordering guard on THIS link, not just on /reston. Chris's
    // page seeds ~30 values including five checkboxes, so it is by far the
    // heaviest prefill we have; if captureAutosaveBaseline() ever moves above
    // applyClientPrefill(), this is where it shows up first.
    await cdp.eval(`(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    })()`);
    await sleep(1500);
    const closed = await cdp.eval(READ_FORM);
    check(`${s.label}: closing the tab without typing mints NO draft`, closed.draftInUrl === false,
      'the seeded values are being counted as client edits, so an untouched form inserts a row and pings Slack');

    // The short alias is what actually gets texted, so it has to resolve.
    // Only hyphenated slugs need one; /gaithersburg is already one word.
    if (s.alias) {
      await cdp.goto(`http://127.0.0.1:${PORT}${s.alias}`);
      const a = await cdp.eval(READ_FORM);
      check(`${s.label}: ${s.alias} resolves to the same studio`, a.fields.business_name === s.fields.business_name,
        `got ${JSON.stringify(a.fields.business_name)}`);
    }
  }

  // Chris's link must not be Reston's. Both are Stretch Zone studios seeded
  // from adjacent config entries, so a copy/paste slip is the realistic failure
  // and it would send Chris a form that provisions someone else's studio.
  console.log('\n--- Cool Springs is not a copy of Reston ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/cool-springs`);
  const cs = await cdp.eval(READ_FORM);
  check('Cool Springs carries no Reston data',
    cs.fields.business_name === 'Stretch Zone Cool Springs' &&
    !/reston/i.test(JSON.stringify(cs.fields)) &&
    !/alphaflex/i.test(JSON.stringify(cs.users)),
    JSON.stringify(cs.fields));

  // Gaithersburg is the sharper version of the same risk. It is the SAME owners
  // as Reston, so it legitimately carries Patrick, Rob and alphaflexllc.com and
  // the check above would not catch a slip -- the only thing separating the two
  // forms is the studio's own address, phone, email and hours. If any Reston
  // studio data leaked across, this form would provision Reston a second time.
  console.log('\n--- Gaithersburg carries the right studio, not Reston ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/gaithersburg`);
  const g = await cdp.eval(READ_FORM);
  check('Gaithersburg carries no Reston studio data',
    g.fields.business_name === 'Stretch Zone Gaithersburg' &&
    !/reston/i.test(JSON.stringify(g.fields)) &&
    !/north point village/i.test(JSON.stringify(g.fields)) &&
    !/822-5296/.test(JSON.stringify(g.fields)),
    JSON.stringify(g.fields));
  check('Gaithersburg still carries the shared owners',
    /alphaflexllc\.com/.test(JSON.stringify(g.users)) && g.users[1].name === 'Rob Koh',
    JSON.stringify(g.users));

  // Reston must survive the change: same file, and its config sits directly
  // above the two newer entries.
  console.log('\n--- reston still works after adding the newer studios ---');
  await cdp.goto(`http://127.0.0.1:${PORT}/reston`);
  const still = await cdp.eval(READ_FORM);
  check('reston is unaffected', still.fields.business_name === 'Stretch Zone Reston' && still.userRows === 2,
    `got ${JSON.stringify(still.fields.business_name)}, ${still.userRows} user rows`);
  check('reston still carries its own address and phone',
    still.fields.address === '1468 North Point Village Drive, Reston, VA 20194' &&
    still.fields.business_phone === '(703) 822-5296',
    `got ${JSON.stringify(still.fields.address)}, ${JSON.stringify(still.fields.business_phone)}`);
} finally {
  if (cdp && cdp.ws) try { cdp.ws.close(); } catch {}
  if (chrome) try { chrome.kill('SIGKILL'); } catch {}
  if (srv) try { srv.close(); } catch {}
  if (profile) try { await rm(profile, { recursive: true, force: true }); } catch {}
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('\nFAILED:'); failed.forEach(f => console.log(`  - ${f.name}`)); }
process.exit(failed.length ? 1 : 0);
