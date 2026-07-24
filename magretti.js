(function () {
  'use strict';
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const DRAFT_KEY = 'velocity-magretti-draft-v1';

  // Local preview never writes to prod or emails the client. ?live=1 overrides
  // for an end-to-end test on localhost.
  const PREVIEW = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && !/[?&]live=1\b/.test(location.search);

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // Known facts only: agreement of record + each studio's official
  // stretchzone.com location page (addresses, phones, hours verified 2026-07-24).
  const LOCATIONS = [
    {
      key: 'crofton', name: 'Stretch Zone Crofton', city: 'Crofton',
      address: '1633 Crofton Center, Crofton, MD 21114',
      phone: '(443) 292-4507',
      website: 'https://www.stretchzone.com/locations/crofton-md',
      hours: { mon: ['07:00', '19:00'], tue: ['07:00', '19:00'], wed: ['07:00', '19:00'], thu: ['07:00', '19:00'], fri: ['07:00', '19:00'], sat: ['07:00', '19:00'], sun: ['07:00', '17:00'] }
    },
    {
      key: 'annapolis', name: 'Stretch Zone Annapolis', city: 'Annapolis',
      address: '2315 Forest Drive, Unit A, Annapolis, MD 21401',
      phone: '(443) 458-5171',
      website: 'https://www.stretchzone.com/locations/annapolis-md',
      hours: { mon: ['07:00', '19:00'], tue: ['07:00', '19:00'], wed: ['07:00', '19:00'], thu: ['07:00', '19:00'], fri: ['07:00', '19:00'], sat: ['07:00', '19:00'], sun: ['07:00', '17:00'] }
    },
    {
      key: 'severna-park', name: 'Stretch Zone Severna Park', city: 'Severna Park',
      address: '550 Governor Ritchie Highway, Unit M, Severna Park, MD 21146',
      phone: '(240) 749-8269',
      website: 'https://www.stretchzone.com/locations/severna-park-md',
      hours: { mon: ['08:00', '20:00'], tue: ['08:00', '20:00'], wed: ['08:00', '20:00'], thu: ['08:00', '20:00'], fri: ['08:00', '20:00'], sat: ['09:00', '17:00'], sun: ['10:00', '14:00'] }
    }
  ];

  const TONES = ['friendly', 'professional', 'motivational', 'humorous', 'upbeat'];
  const AUTOMATION_GOALS = ['book_demos', 'answer_faqs', 'followup_leads', 'reactivate_old', 'upsell', 'provide_directions'];
  const REACTIVATION_SEGMENTS = ['no_shows', 'cooled_leads', 'expired_members', 'paused', 'lost_sheep'];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let userCounter = 0;

  /* ------------------------------ rendering ------------------------------ */

  function knownChip(text) {
    return `<span class="ai-suggested-chip mg-source-chip">${text}</span>`;
  }

  function hoursGridHTML(i, loc) {
    return DAYS.map(d => `
      <div class="day-label">${DAY_LABELS[d]}</div>
      <input type="time" name="loc${i}_hours_${d}_open" value="${loc.hours[d][0]}">
      <input type="time" name="loc${i}_hours_${d}_close" value="${loc.hours[d][1]}">
      <label class="closed-wrap"><input type="checkbox" name="loc${i}_hours_${d}_closed"> closed</label>
    `).join('');
  }

  function locationCardHTML(loc, i) {
    return `
    <section class="mg-loc-card" data-loc="${i}">
      <h2>${loc.name} <span class="mg-loc-num">Studio ${i + 1} of ${LOCATIONS.length}</span></h2>
      <label>
        Studio Name <span class="req" aria-hidden="true">*</span>
        <input type="text" name="loc${i}_business_name" required value="${loc.name}" data-known>
      </label>
      <label>
        Street Address ${knownChip('From stretchzone.com')} <span class="req" aria-hidden="true">*</span>
        <input type="text" name="loc${i}_address" required value="${loc.address}" data-known>
      </label>
      <label>
        City <span class="req" aria-hidden="true">*</span>
        <input type="text" name="loc${i}_city" required value="${loc.city}" data-known>
      </label>
      <label>
        Studio Phone ${knownChip('From stretchzone.com')}
        <input type="tel" name="loc${i}_business_phone" value="${loc.phone}" data-known>
      </label>
      <label>
        Studio Email
        <input type="email" name="loc${i}_business_email" placeholder="e.g. ${loc.city.toLowerCase().replace(/\s+/g, '')}@stretchzone.com">
        <small>The inbox this studio uses with leads and members.</small>
      </label>
      <label>
        ClubReady Store ID
        <input type="text" name="loc${i}_crm_store_id" placeholder="e.g. 12345">
      </label>
      <label>
        Google Business Profile URL
        <input type="url" name="loc${i}_google_business_profile_url" placeholder="https://g.page/...">
      </label>
      <h3 class="mg-hours-title">Business Hours ${knownChip('From stretchzone.com')}</h3>
      <div class="hours-grid" id="hours-grid-${i}">${hoursGridHTML(i, loc)}</div>
      <label class="attestation">
        <input type="checkbox" name="loc${i}_hours_confirmed" required>
        <span>These hours are correct for ${loc.name}. <span class="req" aria-hidden="true">*</span></span>
      </label>
      <label>
        Anything specific to this studio?
        <textarea name="loc${i}_notes" rows="2" placeholder="Different pricing, staffing notes, promos, anything unique to ${loc.city}"></textarea>
      </label>
    </section>`;
  }

  function accessOptionsHTML(selected) {
    const opts = [['all', 'All studios']]
      .concat(LOCATIONS.map((loc, i) => [`loc${i}`, loc.name]));
    return opts.map(([v, label]) =>
      `<option value="${v}"${v === selected ? ' selected' : ''}>${label}</option>`).join('');
  }

  function userRowHTML(i, name, email, access) {
    return `
      <div class="user-row mg-user-row" data-i="${i}">
        <div class="input-with-req"><input type="text" name="user_${i}_name" placeholder="Name (owner, GM, or studio account)" value="${name || ''}"></div>
        <div class="input-with-req"><input type="email" name="user_${i}_email" placeholder="Email" value="${email || ''}"></div>
        <select name="user_${i}_access" aria-label="Which studios this user can view">${accessOptionsHTML(access || 'all')}</select>
        <button type="button" class="remove-user" aria-label="Remove user">&times;</button>
      </div>`;
  }

  function addUser(name, email, access) {
    const list = document.getElementById('users-list');
    list.insertAdjacentHTML('beforeend', userRowHTML(userCounter++, name, email, access));
  }

  function renderAll() {
    document.getElementById('locations').innerHTML =
      LOCATIONS.map((loc, i) => locationCardHTML(loc, i)).join('');

    LOCATIONS.forEach((_, i) => {
      const grid = document.getElementById(`hours-grid-${i}`);
      grid.addEventListener('change', (e) => {
        const m = e.target.name && e.target.name.match(/^loc\d+_hours_(\w{3})_closed$/);
        if (!m) return;
        grid.querySelector(`[name="loc${i}_hours_${m[1]}_open"]`).disabled = e.target.checked;
        grid.querySelector(`[name="loc${i}_hours_${m[1]}_close"]`).disabled = e.target.checked;
      });
    });

    addUser('Joe Magretti', 'jmagretti@yahoo.com', 'all');
    addUser('Devon Magretti', '', 'all');
    LOCATIONS.forEach((_, i) => addUser('', '', `loc${i}`));

    document.getElementById('users-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-user')) {
        e.target.closest('.user-row').remove();
        saveDraftSoon();
      }
    });
    document.getElementById('add-user').addEventListener('click', () => addUser('', '', 'all'));

    // Source chips ("From stretchzone.com", "Stretch Zone example") clear the
    // first time the client edits that field.
    document.querySelectorAll('#intake-form label').forEach(lab => {
      const chip = lab.querySelector('.mg-source-chip');
      const input = lab.querySelector('input, textarea');
      if (chip && input) input.addEventListener('input', () => chip.remove(), { once: true });
    });
  }

  /* ------------------------------ autosave ------------------------------- */

  let saveTimer = null;
  function saveDraftSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 300);
  }

  function saveDraft() {
    const data = {};
    document.querySelectorAll('#intake-form [name]').forEach(el => {
      if (el.name === 'honeypot') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) data[el.name] = el.type === 'radio' ? el.value : true;
      } else if (el.value !== '') {
        data[el.name] = el.value;
      }
    });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function restoreDraft() {
    let data;
    try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return; }
    if (!data) return;
    // Recreate extra user rows beyond the two defaults
    const userIdx = Object.keys(data).map(k => k.match(/^user_(\d+)_/)).filter(Boolean).map(m => +m[1]);
    while (userCounter <= Math.max(-1, ...userIdx)) addUser('', '');
    for (const [name, value] of Object.entries(data)) {
      const els = document.querySelectorAll(`#intake-form [name="${CSS.escape(name)}"]`);
      if (!els.length) continue;
      if (els[0].type === 'radio') {
        const el = document.querySelector(`#intake-form [name="${CSS.escape(name)}"][value="${CSS.escape(String(value))}"]`);
        if (el) el.checked = true;
      } else if (els[0].type === 'checkbox') {
        els[0].checked = true;
        els[0].dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        els[0].value = value;
      }
    }
  }

  /* ------------------------------ payloads ------------------------------- */

  function collectHours(fd, i) {
    const hours = {};
    for (const d of DAYS) {
      const closed = fd.get(`loc${i}_hours_${d}_closed`) === 'on';
      hours[d] = closed
        ? { closed: true }
        : { open: fd.get(`loc${i}_hours_${d}_open`), close: fd.get(`loc${i}_hours_${d}_close`), closed: false };
    }
    return hours;
  }

  function collectUsers() {
    const users = [];
    document.querySelectorAll('#users-list .user-row').forEach(row => {
      const name = row.querySelector('[name$="_name"]').value.trim();
      const email = row.querySelector('[name$="_email"]').value.trim();
      const access = row.querySelector('[name$="_access"]').value;
      if (name || email) users.push({ name, email, role: 'manager', access });
    });
    return users;
  }

  // A location's row only carries the users who can see that studio.
  function usersForLocation(allUsers, i) {
    return allUsers
      .filter(u => u.access === 'all' || u.access === `loc${i}`)
      .map(u => ({ name: u.name, email: u.email, role: u.role }));
  }

  // Mirrors the main form's buildPayload key set exactly (nulls where this
  // tailored form doesn't ask), so the three rows flow through the same
  // /client-onboarding review + provision-from-intake path untouched.
  function buildPayloads() {
    const fd = new FormData(document.getElementById('intake-form'));
    const contactName = (fd.get('contact_name') || '').trim();
    const sharedNotes = (fd.get('notes') || '').trim();
    const allUsers = collectUsers();

    const shared = {
      status: 'pending',
      timezone: 'America/New_York',
      contact_email: fd.get('contact_email') || null,
      contact_phone: fd.get('contact_phone') || null,
      crm_platform: 'clubready',
      crm_platform_other: null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      chatbot_voice: fd.get('chatbot_voice') || null,
      chatbot_voice_notes: null,
      chatbot_tone: TONES.filter(t => fd.get(`tone_${t}`) === 'on'),
      chatbot_tone_notes: null,
      main_cta: fd.get('main_cta') || null,
      main_cta_other: null,
      intro_offer: fd.get('intro_offer') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      business_knowledge: {
        service_description: fd.get('bk_service_description') || null,
        single_session_rate: fd.get('bk_single_session_rate') || null,
        membership_pricing: fd.get('bk_membership_pricing') || null,
        package_pricing: fd.get('bk_package_pricing') || null,
        promotions: fd.get('bk_promotions') || null,
        cancellation_policy: fd.get('bk_cancellation_policy') || null,
        eligibility: fd.get('bk_eligibility') || null,
        ideal_client: fd.get('bk_ideal_client') || null,
        pain_points: null,
        lead_sources: [],
        lead_sources_other: null,
        unique_value: fd.get('bk_unique_value') || null,
        first_visit: fd.get('bk_first_visit') || null,
        faq: fd.get('bk_faq') || null,
        testimonials: null,
        accepts_insurance: null,
        accepts_hsa_fsa: null,
        insurance_notes: null
      },
      automation_goals: {
        goals: AUTOMATION_GOALS.filter(g => fd.get(`goal_${g}`) === 'on'),
        other_text: null,
        reactivation_segments: REACTIVATION_SEGMENTS.filter(s => fd.get(`react_${s}`) === 'on'),
        reactivation_segments_other: null,
        reactivation_offer: fd.get('reactivation_offer') || null
      },
      handoff_config: { rule: fd.get('handoff_rule') || null, rule_other: null },
      notification_config: {
        channels: ['email', 'sms'].filter(c => fd.get(`notify_${c}`) === 'on')
      },
      sms_cadence: { initial_delay: null, followup_cadence: null },
      kpi_targets: null,
      is_multi_location: true,
      parent_brand_name: 'Stretch Zone',
      parent_brand_other: null,
      booking_payment_link: null,
      instagram_handle: null,
      facebook_page_url: null,
      tiktok_handle: null,
      target_launch_date: fd.get('target_launch_date') || null,
      honeypot: fd.get('honeypot') || null,
      user_agent: navigator.userAgent
    };

    return LOCATIONS.map((loc, i) => {
      const locNotes = (fd.get(`loc${i}_notes`) || '').trim();
      const noteParts = [
        `Magretti multi-location intake (${i + 1} of ${LOCATIONS.length}). Primary contact: ${contactName || 'Joe Magretti'}.`,
        locNotes && `Studio notes: ${locNotes}`,
        sharedNotes && `Shared notes: ${sharedNotes}`
      ].filter(Boolean);
      return Object.assign({}, shared, {
        id: crypto.randomUUID(),
        business_name: fd.get(`loc${i}_business_name`) || null,
        business_email: fd.get(`loc${i}_business_email`) || null,
        business_phone: fd.get(`loc${i}_business_phone`) || null,
        city: fd.get(`loc${i}_city`) || null,
        address: fd.get(`loc${i}_address`) || null,
        website_url: loc.website,
        google_business_profile_url: fd.get(`loc${i}_google_business_profile_url`) || null,
        crm_store_id: fd.get(`loc${i}_crm_store_id`) || null,
        hours: collectHours(fd, i),
        hours_confirmed: fd.get(`loc${i}_hours_confirmed`) === 'on',
        dashboard_users: usersForLocation(allUsers, i),
        notes: noteParts.join(' | ')
      });
    });
  }

  /* ------------------------------ submit --------------------------------- */

  function showError(msg) {
    const box = document.getElementById('error-box');
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    document.getElementById('error-box').hidden = true;
  }

  function validate() {
    const fd = new FormData(document.getElementById('intake-form'));
    const problems = [];
    if (!EMAIL_RX.test(fd.get('contact_email') || '')) problems.push('a valid contact email');
    if (!(fd.get('contact_phone') || '').trim()) problems.push('a contact phone');
    if (fd.get('crm_account_confirmed') !== 'on') problems.push('the CRM admin-account confirmation');
    LOCATIONS.forEach((loc, i) => {
      if (!(fd.get(`loc${i}_business_name`) || '').trim()) problems.push(`${loc.city}: studio name`);
      if (!(fd.get(`loc${i}_address`) || '').trim()) problems.push(`${loc.city}: address`);
      if (fd.get(`loc${i}_hours_confirmed`) !== 'on') problems.push(`${loc.city}: confirm the hours`);
    });
    return problems;
  }

  async function insertRow(payload) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`Insert failed: ${resp.status} ${await resp.text()}`);
  }

  function showSuccess() {
    document.getElementById('intake-form').hidden = true;
    const s = document.getElementById('success-screen');
    if (PREVIEW) s.querySelector('p').textContent = 'Preview mode: nothing was actually sent. On the live link this submits all three studios to the Velocity team.';
    s.hidden = false;
    s.scrollIntoView({ behavior: 'smooth' });
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  async function doFinalSubmit() {
    hideError();
    const btn = document.getElementById('confirm-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    try {
      if (PREVIEW) { showSuccess(); return; }
      const payloads = buildPayloads();
      for (const p of payloads) await insertRow(p);
      // One receipt email, not three — the n8n workflow re-reads the row and
      // emails contact_email, which is the same on every row.
      fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_id: payloads[0].id })
      }).catch(() => {});
      showSuccess();
    } catch (err) {
      console.error(err);
      showError(`Something went wrong: ${err.message}. Try again, or email bill@velocityaipartners.ai.`);
      btn.disabled = false;
      btn.textContent = 'Confirm & submit all 3 studios';
    }
  }

  /* ------------------------------ progress ------------------------------- */

  function computeProgress() {
    const fd = new FormData(document.getElementById('intake-form'));
    const val = (n) => (fd.get(n) || '').trim();
    const checks = [
      !!val('contact_name'),
      EMAIL_RX.test(val('contact_email')),
      !!val('contact_phone'),
      fd.get('crm_account_confirmed') === 'on',
      !!val('chatbot_voice'),
      TONES.some(t => fd.get(`tone_${t}`) === 'on'),
      !!val('main_cta'),
      !!val('intro_offer'),
      !!val('bk_service_description'),
      !!(val('bk_single_session_rate') || val('bk_membership_pricing')),
      collectUsers().some(u => u.name && u.email && EMAIL_RX.test(u.email))
    ];
    LOCATIONS.forEach((_, i) => {
      checks.push(!!(val(`loc${i}_business_name`) && val(`loc${i}_address`) && val(`loc${i}_city`)));
      checks.push(!!val(`loc${i}_crm_store_id`));
      checks.push(fd.get(`loc${i}_hours_confirmed`) === 'on');
    });
    return { filled: checks.filter(Boolean).length, total: checks.length };
  }

  function updateProgressBar() {
    const { filled, total } = computeProgress();
    const pct = Math.round((filled / total) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    document.querySelector('.progress-bar').setAttribute('aria-valuenow', pct);
    document.getElementById('sticky-progress-fill').style.width = pct + '%';
    document.getElementById('sticky-progress-text').textContent = pct + '% complete';
  }

  function syncStickyOffset() {
    const bar = document.querySelector('.sticky-draft__bar');
    const track = document.querySelector('.sticky-draft__track');
    if (!bar) return;
    document.body.style.paddingTop = (bar.offsetHeight + (track ? track.offsetHeight : 0)) + 'px';
  }

  /* ------------------------------ init ----------------------------------- */

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
    restoreDraft();

    if (PREVIEW) document.getElementById('preview-banner').hidden = false;

    syncStickyOffset();
    updateProgressBar();
    window.addEventListener('resize', syncStickyOffset);

    const onEdit = () => { saveDraftSoon(); updateProgressBar(); };
    document.getElementById('intake-form').addEventListener('input', onEdit);
    document.getElementById('intake-form').addEventListener('change', onEdit);

    // Two-click guard instead of a confirm() dialog: first click arms, second clears.
    const startOver = document.getElementById('start-over');
    startOver.addEventListener('click', () => {
      if (startOver.dataset.armed !== '1') {
        startOver.dataset.armed = '1';
        startOver.textContent = 'Really start over? This clears your answers';
        setTimeout(() => { startOver.dataset.armed = ''; startOver.textContent = 'Start over'; }, 4000);
        return;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      location.reload();
    });

    document.getElementById('intake-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const problems = validate();
      if (problems.length) {
        showError(`Almost there. We still need: ${problems.join('; ')}.`);
        return;
      }
      hideError();
      document.getElementById('confirm-box').hidden = false;
      document.getElementById('confirm-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => {
      document.getElementById('confirm-box').hidden = true;
    });
    document.getElementById('confirm-submit').addEventListener('click', doFinalSubmit);
  });
})();
