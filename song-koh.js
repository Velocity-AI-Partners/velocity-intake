(function () {
  'use strict';
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const DRAFT_KEY = 'velocity-song-koh-draft-v1';

  // Local preview never writes to prod or emails the client. ?live=1 overrides
  // for an end-to-end test on localhost.
  const PREVIEW = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && !/[?&]live=1\b/.test(location.search);

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // Patrick Song and Robert Koh operate six Stretch Zone studios (three VA,
  // three MD). Reston is the pilot and the only studio being onboarded here.
  // Kept as an array so the other five drop in as extra objects later.
  //
  // Known facts only: address, phone, and hours from the official
  // stretchzone.com/locations/reston-va page, verified 2026-07-30.
  const LOCATIONS = [
    {
      key: 'reston', name: 'Stretch Zone Reston', city: 'Reston',
      address: '1468 North Point Village Drive, Reston, VA 20194',
      phone: '(703) 822-5296',
      website: 'https://www.stretchzone.com/locations/reston-va',
      gbp: 'https://www.google.com/maps/search/?api=1&query=Stretch%20Zone%201468%20North%20Point%20Village%20Drive%20Reston%20VA%2020194',
      hours: { mon: ['08:00', '19:00'], tue: ['08:00', '19:00'], wed: ['08:00', '19:00'], thu: ['08:00', '19:00'], fri: ['08:00', '19:00'], sat: ['10:00', '16:00'], sun: ['10:00', '16:00'] }
    }
  ];

  const TONES = ['friendly', 'professional', 'motivational', 'humorous', 'upbeat'];
  const AUTOMATION_GOALS = ['book_demos', 'answer_faqs', 'followup_leads', 'reactivate_old', 'upsell', 'provide_directions'];
  const REACTIVATION_SEGMENTS = ['no_shows', 'cooled_leads', 'expired_members', 'paused', 'lost_sheep'];
  const HANDOFF_RULES = ['never', 'on_request', 'business_hours_request', 'complex'];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let userCounter = 0;

  /* ------------------------------ rendering ------------------------------ */

  function knownChip(text) {
    return `<span class="ai-suggested-chip sk-source-chip">${text}</span>`;
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
    <section class="sk-loc-card" data-loc="${i}">
      <h2>${loc.name}</h2>
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
        Google Business Profile URL ${knownChip('Google Maps link')}
        <input type="url" name="loc${i}_google_business_profile_url" value="${loc.gbp}" data-known>
        <small>This opens your studio on Google Maps. If you have your own g.page link, paste it here instead.</small>
      </label>
      <h3 class="sk-hours-title">Business Hours ${knownChip('From stretchzone.com')}</h3>
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

  function userRowHTML(i, name, email) {
    return `
      <div class="user-row sk-user-row" data-i="${i}">
        <div class="input-with-req"><input type="text" name="user_${i}_name" placeholder="Name (owner, GM, or studio account)" value="${name || ''}"></div>
        <div class="input-with-req"><input type="email" name="user_${i}_email" placeholder="Email" value="${email || ''}"></div>
        <button type="button" class="remove-user" aria-label="Remove user">&times;</button>
      </div>`;
  }

  function addUser(name, email) {
    const list = document.getElementById('users-list');
    list.insertAdjacentHTML('beforeend', userRowHTML(userCounter++, name, email));
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

    // Robert's email is deliberately blank — we don't have it on file.
    addUser('Patrick Song', 'patrick@alphaflexllc.com');
    addUser('Robert Koh', '');

    document.getElementById('users-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-user')) {
        e.target.closest('.user-row').remove();
        saveDraftSoon();
      }
    });
    document.getElementById('add-user').addEventListener('click', () => addUser('', ''));

    // Source chips ("From stretchzone.com", "Stretch Zone example") clear the
    // first time the client edits that field.
    document.querySelectorAll('#intake-form label').forEach(lab => {
      const chip = lab.querySelector('.sk-source-chip');
      const input = lab.querySelector('input, textarea');
      if (chip && input) input.addEventListener('input', () => chip.remove(), { once: true });
    });
  }

  /* --------------------------- edit tracking ----------------------------- */

  // Snapshot of the form exactly as we pre-filled it. Diffed at submit so the
  // submission records which fields the client changed.
  let prefillSnapshot = {};

  function formState() {
    const fd = new FormData(document.getElementById('intake-form'));
    const state = {};
    for (const [k, v] of fd.entries()) {
      if (k === 'honeypot' || typeof v !== 'string') continue;
      state[k] = k in state ? state[k] + ',' + v : v;
    }
    return state;
  }

  function changedFieldNames() {
    const now = formState();
    const keys = new Set([...Object.keys(prefillSnapshot), ...Object.keys(now)]);
    return [...keys].filter(k => (prefillSnapshot[k] || '') !== (now[k] || ''));
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
      if (name || email) users.push({ name, email, role: 'manager' });
    });
    return users;
  }

  // Mirrors the main form's buildPayload key set exactly (nulls where this
  // tailored form doesn't ask), so the row flows through the same
  // /client-onboarding review + provision-from-intake path untouched.
  function buildPayload() {
    const fd = new FormData(document.getElementById('intake-form'));
    const i = 0;
    const loc = LOCATIONS[i];
    const contactName = (fd.get('contact_name') || '').trim();
    const sharedNotes = (fd.get('notes') || '').trim();
    const locNotes = (fd.get(`loc${i}_notes`) || '').trim();
    const crmNote = (fd.get('crm_platform_note') || '').trim();

    // Strip the loc0_ prefix so the admin note reads cleanly, but keep the
    // studio's own notes field distinguishable from the shared one.
    const changed = changedFieldNames()
      .filter(k => k !== 'crm_platform_note')
      .map(k => k === `loc${i}_notes` ? 'studio_notes' : k.replace(`loc${i}_`, ''));

    const noteParts = [
      `Song/Koh Stretch Zone intake. Reston, VA is the pilot studio; the group operates six Stretch Zone studios (three VA, three MD). Primary contact: ${contactName || 'Patrick Song'}.`,
      locNotes && `Studio notes: ${locNotes}`,
      sharedNotes && `Shared notes: ${sharedNotes}`,
      crmNote && `Client says the CRM is NOT ClubReady: ${crmNote}`,
      changed.length && `Client updated: ${changed.join(', ')}`
    ].filter(Boolean);

    return {
      id: crypto.randomUUID(),
      status: 'pending',
      business_name: fd.get(`loc${i}_business_name`) || null,
      business_email: fd.get(`loc${i}_business_email`) || null,
      business_phone: fd.get(`loc${i}_business_phone`) || null,
      city: fd.get(`loc${i}_city`) || null,
      address: fd.get(`loc${i}_address`) || null,
      timezone: 'America/New_York',
      contact_email: fd.get('contact_email') || null,
      contact_phone: fd.get('contact_phone') || null,
      website_url: loc.website,
      google_business_profile_url: fd.get(`loc${i}_google_business_profile_url`) || null,
      hours: collectHours(fd, i),
      hours_confirmed: fd.get(`loc${i}_hours_confirmed`) === 'on',
      // ClubReady is the working assumption (every other Stretch Zone studio we
      // run is on it). If the client says otherwise we flip to 'other' rather
      // than record a platform we haven't confirmed.
      crm_platform: crmNote ? 'other' : 'clubready',
      crm_platform_other: crmNote || null,
      crm_store_id: fd.get(`loc${i}_crm_store_id`) || null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      chatbot_voice: fd.get('chatbot_voice') || null,
      chatbot_voice_notes: null,
      chatbot_tone: TONES.filter(t => fd.get(`tone_${t}`) === 'on'),
      chatbot_tone_notes: null,
      main_cta: fd.get('main_cta') || null,
      main_cta_other: null,
      assistant_name: fd.get('assistant_name') || null,
      intro_offer: fd.get('intro_offer') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      dashboard_users: collectUsers(),
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
        unique_value: null,
        first_visit: null,
        faq: fd.get('bk_faq') || null,
        testimonials: null,
        accepts_insurance: null,
        accepts_hsa_fsa: null,
        insurance_notes: null
      },
      // Same treatment George approved on the Magretti form: the AI focuses on
      // all of it, so every goal and reactivation segment is enrolled and the
      // win-back offer is the standard Stretch Zone one.
      automation_goals: {
        goals: AUTOMATION_GOALS.slice(),
        other_text: null,
        reactivation_segments: REACTIVATION_SEGMENTS.slice(),
        reactivation_segments_other: null,
        reactivation_offer: '10% off the first month when a previously cancelled member returns and rejoins'
      },
      handoff_config: {
        rule: HANDOFF_RULES.filter(r => fd.get(`handoff_${r}`) === 'on').join(', ') || null,
        rule_other: null
      },
      notification_config: {
        channels: ['email', 'sms'].filter(c => fd.get(`notify_${c}`) === 'on')
      },
      sms_cadence: { initial_delay: null, followup_cadence: null },
      kpi_targets: null,
      // One studio is being provisioned, so this row is single-location. The
      // six-studio group context lives in notes above.
      is_multi_location: false,
      parent_brand_name: 'Stretch Zone',
      parent_brand_other: null,
      booking_payment_link: null,
      instagram_handle: null,
      facebook_page_url: null,
      tiktok_handle: null,
      target_launch_date: fd.get('target_launch_date') || null,
      notes: noteParts.join(' | '),
      honeypot: fd.get('honeypot') || null,
      user_agent: navigator.userAgent
    };
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
    if (PREVIEW) s.querySelector('p').textContent = 'Preview mode: nothing was actually sent. On the live link this submits the Reston studio to the Velocity team.';
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
      const payload = buildPayload();
      await insertRow(payload);
      // The n8n workflow re-reads the row and emails contact_email a receipt.
      fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_id: payload.id })
      }).catch(() => {});
      showSuccess();
    } catch (err) {
      console.error(err);
      showError(`Something went wrong: ${err.message}. Try again, or email bill@velocityaipartners.ai.`);
      btn.disabled = false;
      btn.textContent = 'Confirm & submit';
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
    prefillSnapshot = formState();
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
