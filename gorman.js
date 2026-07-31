(function () {
  'use strict';
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const DRAFT_KEY = 'velocity-gorman-draft-v1';

  // Local preview never writes to prod or emails the client. ?live=1 overrides
  // for an end-to-end test on localhost.
  const PREVIEW = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && !/[?&]live=1\b/.test(location.search);

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // Mike Gorman's deal record covers three locations; Brickell is the only
  // studio being onboarded here. Kept as an array so the others drop in later.
  //
  // The sibling studios are deliberately not named anywhere in this file. The
  // only source tying specific studios to Mike is sz-scorecard-import's
  // owner_name, which is known to mis-attribute owners. The three-location
  // count comes from the deal record George entered himself, which is solid.
  //
  // Known facts only: address, phone, and hours from the official
  // stretchzone.com/locations/brickell-fl page, verified 2026-07-30 against the
  // page's schema.org openingHours block and cross-checked against Yelp.
  //
  // `city` is the postal city ("Miami") because it lands in the city column;
  // `label` is the neighbourhood the client actually calls the studio.
  //
  // No studio email here on purpose: the official page publishes only a dummy
  // address, so we have nothing verified to pre-fill. Mike supplies it.
  const LOCATIONS = [
    {
      key: 'brickell', name: 'Stretch Zone Brickell', city: 'Miami', label: 'Brickell',
      address: '1390 Brickell Avenue, Suite 102, Miami, FL 33131',
      phone: '(786) 636-1305',
      website: 'https://www.stretchzone.com/locations/brickell-fl',
      gbp: 'https://www.google.com/maps/search/?api=1&query=Stretch%20Zone%201390%20Brickell%20Avenue%20Suite%20102%20Miami%20FL%2033131',
      hours: { mon: ['08:00', '21:00'], tue: ['08:00', '21:00'], wed: ['08:00', '21:00'], thu: ['08:00', '21:00'], fri: ['08:00', '21:00'], sat: ['09:00', '17:00'], sun: ['09:00', '17:00'] }
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
        <input type="email" name="loc${i}_business_email" placeholder="e.g. sz.${loc.label.toLowerCase().replace(/\s+/g, '')}.fl@stretchzone.com">
        <small>The inbox this studio uses with leads and members. Your location page does not list one publicly, so we left this for you.</small>
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
        <textarea name="loc${i}_notes" rows="2" placeholder="Different pricing, staffing notes, promos, anything unique to ${loc.label}"></textarea>
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

    // Mike is the sole owner on record for all three Florida studios, so he is
    // the only seeded user. Email and phone come from the deal record.
    addUser('Mike Gorman', 'stretchzonemike@gmail.com');

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

  // The raw field map. Used for the localStorage draft AND stored on the
  // server row as form_state, so a draft can be rehydrated exactly. The mapped
  // columns alone cannot do that: buildPayload composes `notes` from several
  // sources and that concatenation is not reversible.
  function collectFormState() {
    const data = {};
    document.querySelectorAll('#intake-form [name]').forEach(el => {
      if (el.name === 'honeypot') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) data[el.name] = el.type === 'radio' ? el.value : true;
      } else if (el.value !== '') {
        data[el.name] = el.value;
      }
    });
    return data;
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collectFormState())); } catch (e) {}
  }

  function applyFormState(data) {
    if (!data) return;
    // Recreate extra user rows beyond the seeded ones
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

  function restoreDraft() {
    let data;
    try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return; }
    applyFormState(data);
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
  // status is 'draft' while the client is still filling it in, 'pending' at
  // submit. id is supplied by draft-sync so a draft keeps one stable row.
  function buildPayload(status, id) {
    const fd = new FormData(document.getElementById('intake-form'));
    const i = 0;
    const loc = LOCATIONS[i];
    const contactName = (fd.get('contact_name') || '').trim();
    const sharedNotes = (fd.get('notes') || '').trim();
    const locNotes = (fd.get(`loc${i}_notes`) || '').trim();

    // Strip the loc0_ prefix so the admin note reads cleanly, but keep the
    // studio's own notes field distinguishable from the shared one.
    const changed = changedFieldNames()
      .map(k => k === `loc${i}_notes` ? 'studio_notes' : k.replace(`loc${i}_`, ''));

    const noteParts = [
      `Gorman Stretch Zone intake. Brickell (Miami, FL) is the pilot studio; the deal record covers three locations. Primary contact: ${contactName || 'Mike Gorman'}.`,
      'Pricing, intro offer, and cancellation copy were pre-filled from other Stretch Zone locations as examples — confirm against Brickell before provisioning.',
      locNotes && `Studio notes: ${locNotes}`,
      sharedNotes && `Shared notes: ${sharedNotes}`,
      changed.length && `Client updated: ${changed.join(', ')}`
    ].filter(Boolean);

    return {
      id: id,
      status: status,
      // Raw field map, so a draft opened on another device rehydrates exactly.
      form_state: collectFormState(),
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
      // George confirmed 2026-07-30 that Brickell is on ClubReady.
      crm_platform: 'clubready',
      crm_platform_other: null,
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
      // Same treatment George approved on the Magretti and Reston forms: the AI
      // focuses on all of it, so every goal and reactivation segment is
      // enrolled. The win-back offer is the one used at Westborough, West
      // Boylston, and Santa Rosa; other Stretch Zone studios offer a free demo
      // instead, so treat it as a starting point and confirm with Mike.
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
      // three-studio group context lives in notes above.
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
      if (!(fd.get(`loc${i}_business_name`) || '').trim()) problems.push(`${loc.label}: studio name`);
      if (!(fd.get(`loc${i}_address`) || '').trim()) problems.push(`${loc.label}: address`);
      if (fd.get(`loc${i}_hours_confirmed`) !== 'on') problems.push(`${loc.label}: confirm the hours`);
    });
    return problems;
  }

  /* ---------------------------- draft sync ------------------------------ */

  // Tells the truth about where the answers currently live. It must never say
  // "Saved to Velocity" when only localStorage has them.
  function setSyncLabel(state) {
    const el = document.querySelector('.sk-autosave-note');
    if (!el) return;
    if (state === 'saving') el.textContent = 'Saving...';
    else if (state === 'saved') el.textContent = 'Saved to Velocity';
    else if (state === 'preview') el.textContent = 'Preview mode';
    else el.textContent = 'Saved on this device';
  }

  const sync = VelocityDraftSync.create({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    table: TABLE,
    storageKey: DRAFT_KEY,
    preview: PREVIEW,
    buildPayload: buildPayload,
    onState: setSyncLabel
  });

  // Reached when the draft in the URL has already been submitted. Editing a
  // live submission from a stale link would silently diverge from what the
  // team is provisioning, so the form is closed instead.
  function showAlreadySubmitted() {
    document.getElementById('intake-form').hidden = true;
    const s = document.getElementById('success-screen');
    s.querySelector('h2').textContent = 'This form has already been submitted';
    s.querySelector('p').textContent = 'We have your onboarding details for Brickell. If something needs changing, email bill@velocityaipartners.ai and we will update it for you.';
    s.hidden = false;
  }

  function showSuccess() {
    document.getElementById('intake-form').hidden = true;
    const s = document.getElementById('success-screen');
    if (PREVIEW) s.querySelector('p').textContent = 'Preview mode: nothing was actually sent. On the live link this submits the Brickell studio to the Velocity team.';
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
      // Flips the existing draft row to 'pending', or inserts one outright if
      // the client never triggered a draft save. Returns the row id either way.
      const intakeId = await sync.submit();
      // The n8n workflow re-reads the row and emails contact_email a receipt.
      fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_id: intakeId })
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
    setSyncLabel(PREVIEW ? 'preview' : 'local-only');

    // The server draft is the shared truth. If one exists it wins over the
    // local copy, which is what lets another device, or another person holding
    // the same link, pick up where the last edit left off.
    sync.load().then(res => {
      if (!res) return;
      if (res.alreadySubmitted) { showAlreadySubmitted(); return; }
      applyFormState(res.row && res.row.form_state);
      updateProgressBar();
      saveDraft();
      setSyncLabel('saved');
    });

    syncStickyOffset();
    updateProgressBar();
    window.addEventListener('resize', syncStickyOffset);

    // Best-effort write when the tab is closed or backgrounded mid-edit.
    window.addEventListener('pagehide', () => sync.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sync.flush();
    });

    const onEdit = () => { saveDraftSoon(); sync.touch(); updateProgressBar(); };
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
      // Clear the local copy AND the draft pointer, and drop ?draft= from the
      // URL, or the reload would just pull the server draft straight back.
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_KEY + ':draft-id');
      } catch (e) {}
      try {
        const url = new URL(location.href);
        url.searchParams.delete('draft');
        history.replaceState({}, '', url.toString());
      } catch (e) {}
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
