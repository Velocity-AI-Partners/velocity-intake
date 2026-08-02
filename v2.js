(() => {
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const BUCKET = 'intake-logos';

  // Local preview never writes to prod. The main form.js has no such guard, so
  // v2 adds the one the per-client variants already use. ?live=1 overrides for
  // a deliberate end-to-end test.
  const PREVIEW = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && !/[?&]live=1\b/.test(location.search);

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // Draft state: if the URL has ?draft=<uuid>, we are editing a server-side
  // draft. Save Draft writes back to the same row; Submit flips status to
  // 'pending'. If no draft param, we're on a blank form and the first Save
  // Draft creates a new row + puts its id in the URL.
  let draftId = null;
  let userCounter = 0;

  function getDraftIdFromUrl() {
    const m = window.location.search.match(/[?&]draft=([0-9a-fA-F-]{36})\b/);
    return m ? m[1] : null;
  }

  function setDraftIdInUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('draft', id);
    window.history.replaceState({}, '', url.toString());
  }

  function renderHours() {
    const grid = document.getElementById('hours-grid');
    grid.innerHTML = DAYS.map(d => `
      <div class="day-label">${DAY_LABELS[d]}</div>
      <input type="time" name="hours_${d}_open" value="09:00">
      <input type="time" name="hours_${d}_close" value="17:00">
      <label class="closed-wrap"><input type="checkbox" name="hours_${d}_closed"> closed</label>
    `).join('');

    grid.addEventListener('change', (e) => {
      if (e.target.name && e.target.name.endsWith('_closed')) {
        const day = e.target.name.split('_')[1];
        const openEl = grid.querySelector(`[name="hours_${day}_open"]`);
        const closeEl = grid.querySelector(`[name="hours_${day}_close"]`);
        openEl.disabled = e.target.checked;
        closeEl.disabled = e.target.checked;
      }
    });
  }

  function userRowHTML(i) {
    return `
      <div class="user-row" data-i="${i}">
        <div class="input-with-req">
          <input type="text" name="user_${i}_name" placeholder="Name">
          <span class="req" aria-hidden="true">*</span>
        </div>
        <div class="input-with-req">
          <input type="email" name="user_${i}_email" placeholder="Email">
          <span class="req" aria-hidden="true">*</span>
        </div>
        <button type="button" class="remove-user" aria-label="Remove user">&times;</button>
      </div>
    `;
  }

  function renderUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = userRowHTML(0);
    userCounter = 1;
    document.getElementById('add-user').addEventListener('click', addUser);
    list.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-user')) {
        const row = e.target.closest('.user-row');
        if (document.querySelectorAll('#users-list .user-row').length > 1) {
          row.remove();
          updateProgressBar();
        }
      }
    });
  }

  function addUser() {
    const list = document.getElementById('users-list');
    list.insertAdjacentHTML('beforeend', userRowHTML(userCounter));
    userCounter++;
    const lastRow = list.lastElementChild;
    const nameInput = lastRow && lastRow.querySelector('[name$="_name"]');
    if (nameInput) nameInput.focus();
  }

  function collectHours(fd) {
    const hours = {};
    for (const d of DAYS) {
      const closed = fd.get(`hours_${d}_closed`) === 'on';
      hours[d] = closed
        ? { closed: true }
        : { open: fd.get(`hours_${d}_open`), close: fd.get(`hours_${d}_close`), closed: false };
    }
    return hours;
  }

  const NOTIFICATION_CHANNELS = ['email', 'sms'];

  // The campaign lifecycle from the Campaign Map, in map order. These replace
  // the old abstract goal_* checkboxes: the client now picks real campaigns,
  // which map 1:1 onto campaign_toggles.campaign_type at provisioning time.
  const CAMPAIGNS = [
    'contacting_new_leads', 'lead_reactivation_warm', 'lead_reactivation_cold',
    'booking_reminder', 'no_show_recovery', 'cancel_recovery',
    'post_visit_followup', 'complete_your_intro',
    'missed_sale',
    'birthday_milestones', 'milestone_reminders', 'member_rebooking',
    'client_retention_medium', 'client_retention_high',
    'ex_member_winback'
  ];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RX = /(?:\d[^\d]*){7,}/;

  const LABELS = {
    // Campaigns, in Campaign Map order
    contacting_new_leads: 'Contacting New Leads',
    lead_reactivation_warm: 'Lead Reactivation · Warm',
    lead_reactivation_cold: 'Lead Reactivation · Cold',
    booking_reminder: 'Booking Reminder',
    no_show_recovery: 'No-Show Recovery',
    cancel_recovery: 'Cancel Recovery',
    post_visit_followup: 'Post-Visit Follow-Up',
    complete_your_intro: 'Complete Your Intro',
    missed_sale: 'Missed Sale',
    birthday_milestones: 'Birthday & Milestones',
    milestone_reminders: 'Milestone Reminders',
    member_rebooking: 'Member Rebooking',
    client_retention_medium: 'Client Retention · Medium',
    client_retention_high: 'Client Retention · High',
    ex_member_winback: 'Ex-Member Winback',
    // Notification channels + tones + voice
    email: 'Email',
    sms: 'SMS',
    friendly: 'Friendly',
    professional: 'Professional',
    motivational: 'Motivational',
    humorous: 'Humorous',
    upbeat: 'Upbeat',
    team: 'Team',
    owner: 'Owner',
    brand: 'Brand persona',
    unsure: 'Unsure — advise',
    // Main CTA
    book_demo: 'Book a free demo',
    schedule_call: 'Schedule a call',
    start_trial: 'Start free trial',
    buy_membership: 'Buy a membership',
    // Handoff
    never: 'Never — AI handles everything',
    on_request: 'Only on request',
    business_hours_request: 'During studio hours, on request',
    complex: 'When conversation gets complex',
    // CRM platforms
    clubready: 'ClubReady',
    wellnessliving: 'WellnessLiving',
    spark: 'Spark Membership',
    mindbody: 'Mindbody',
    arketa: 'Arketa',
    // Generic
    other: 'Other'
  };

  function label(key) {
    if (key == null || key === '') return '';
    return LABELS[key] || key;
  }

  function collectCampaigns(fd) {
    return CAMPAIGNS.filter(c => fd.get(`camp_${c}`) === 'on');
  }

  function collectNotificationChannels(fd) {
    return NOTIFICATION_CHANNELS.filter(c => fd.get(`notify_${c}`) === 'on');
  }

  function collectBusinessKnowledge(fd) {
    const yesNoToBool = (v) => v === 'yes' ? true : v === 'no' ? false : null;
    return {
      // TODO(migration 018): promote to a real contact_name column.
      contact_name: fd.get('contact_name') || null,
      service_description: fd.get('bk_service_description') || null,
      single_session_rate: fd.get('bk_single_session_rate') || null,
      membership_pricing: fd.get('bk_membership_pricing') || null,
      package_pricing: fd.get('bk_package_pricing') || null,
      promotions: fd.get('bk_promotions') || null,
      cancellation_policy: fd.get('bk_cancellation_policy') || null,
      eligibility: fd.get('bk_eligibility') || null,
      ideal_client: fd.get('bk_ideal_client') || null,
      pain_points: fd.get('bk_pain_points') || null,
      unique_value: fd.get('bk_unique_value') || null,
      first_visit: fd.get('bk_first_visit') || null,
      faq: fd.get('bk_faq') || null,
      accepts_insurance: yesNoToBool(fd.get('bk_accepts_insurance')),
      accepts_hsa_fsa: yesNoToBool(fd.get('bk_accepts_hsa_fsa')),
      insurance_notes: fd.get('bk_insurance_notes') || null
    };
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

  function clearStaleLocalStorage() {
    // Older versions used localStorage for autosave. Remove any leftover state
    // so the bare URL is always a fresh blank form.
    try { localStorage.removeItem('velocity-intake-draft-v1'); } catch (e) {}
  }

  function revealToggle(el, show) {
    if (!el) return;
    const wasHidden = el.hidden;
    el.hidden = !show;
    if (show && wasHidden) {
      el.classList.remove('reveal-in');
      // force reflow so the animation replays
      void el.offsetWidth;
      el.classList.add('reveal-in');
    }
  }

  function toggleCrmOther() {
    const select = document.querySelector('[name="crm_platform"]');
    const isOther = select && select.value === 'other';
    const wrap = document.getElementById('crm-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="crm_platform_other"]');
      if (input) input.value = '';
    }
  }

  function toggleMainCtaOther() {
    const select = document.querySelector('[name="main_cta"]');
    const isOther = select && select.value === 'other';
    const wrap = document.getElementById('main-cta-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="main_cta_other"]');
      if (input) input.value = '';
    }
  }

  function toggleNotifyTarget() {
    const radio = document.querySelector('[name="notify_target"][value="different"]');
    const isDifferent = radio && radio.checked;
    const wrap = document.getElementById('notify-different-wrap');
    revealToggle(wrap, isDifferent);
    if (!isDifferent && wrap) {
      wrap.querySelectorAll('input').forEach(i => { i.value = ''; });
    }
  }

  function applyConditionals() {
    toggleCrmOther();
    toggleMainCtaOther();
    toggleNotifyTarget();
  }

  function buildPayload(status) {
    const form = document.getElementById('intake-form');
    const fd = new FormData(form);
    return {
      status,
      business_name: fd.get('business_name') || null,
      business_email: fd.get('business_email') || null,
      business_phone: fd.get('business_phone') || null,
      city: fd.get('city') || null,
      address: fd.get('address') || null,
      timezone: fd.get('timezone') || null,
      contact_email: fd.get('contact_email') || null,
      contact_phone: fd.get('contact_phone') || null,
      // TODO(migration 018): contact_name has no column yet. Parked in the
      // business_knowledge bundle so the answer is not lost; move it to a real
      // column before this ships. See collectBusinessKnowledge().
      hours: collectHours(fd),
      hours_confirmed: fd.get('hours_confirmed') === 'on',
      crm_platform: fd.get('crm_platform') || null,
      crm_platform_other: fd.get('crm_platform_other') || null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      // Read by provision-from-intake but never collected until now: every
      // location provisioned with assistant_name NULL and booking_link NULL,
      // then got patched by hand. These close that gap.
      assistant_name: fd.get('assistant_name') || null,
      trial_booking_url: fd.get('trial_booking_url') || null,
      // Derived, not asked: a free demo or free trial CTA means the first visit
      // is free. Any other CTA (schedule a call, buy a membership) does not.
      has_free_trial: ['book_demo', 'start_trial'].includes(fd.get('main_cta')),
      main_cta: fd.get('main_cta') || null,
      main_cta_other: fd.get('main_cta_other') || null,
      intro_offer: fd.get('intro_offer') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      dashboard_users: collectUsers(),
      business_knowledge: collectBusinessKnowledge(fd),
      // Campaign map. `campaigns` are Campaign Map keys, which map 1:1 onto
      // campaign_toggles.campaign_type. TODO: provision-from-intake still reads
      // automation_goals.goals for its "AI Employee Goals" KB row and must be
      // updated to read `campaigns` and write campaign_toggles from it.
      automation_goals: {
        campaigns: collectCampaigns(fd)
      },
      notification_config: {
        channels: collectNotificationChannels(fd),
        target: fd.get('notify_target') || 'primary',
        email: fd.get('notify_email_address') || null,
        phone: fd.get('notify_phone_number') || null
      },
      website_url: fd.get('website_url') || null,
      google_business_profile_url: fd.get('google_business_profile_url') || null,
      instagram_handle: fd.get('instagram_handle') || null,
      facebook_page_url: fd.get('facebook_page_url') || null,
      tiktok_handle: fd.get('tiktok_handle') || null,
      target_launch_date: fd.get('target_launch_date') || null,
      notes: fd.get('notes') || null,
      honeypot: fd.get('honeypot') || null,
      user_agent: navigator.userAgent
    };
  }

  async function insertRow(payload) {
    if (PREVIEW) { console.log('[preview] INSERT suppressed. Payload:', payload); return; }
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
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Insert failed: ${resp.status} ${body}`);
    }
  }

  async function updateRow(id, payload) {
    if (PREVIEW) { console.log('[preview] PATCH suppressed for', id, 'Payload:', payload); return; }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // Required by migration 016: anon may only touch the row whose id it
        // presents here. Note this also needs SELECT, because
        // return=representation reads the row back.
        'x-draft-id': id,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Update failed: ${resp.status} ${body}`);
    }
    const rows = await resp.json();
    return rows[0];
  }

  async function fetchDraft(id) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          // Required by migration 016: without this the request succeeds but
          // matches zero rows, and the draft link looks broken to the client.
          'x-draft-id': id
        }
      }
    );
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Draft load failed: ${resp.status} ${body}`);
    }
    const rows = await resp.json();
    return rows[0] || null;
  }

  function applyServerRowToForm(row) {
    const form = document.getElementById('intake-form');
    const set = (name, value) => {
      const el = form.elements[name];
      if (!el || value == null) return;
      if (el.type === 'checkbox') { el.checked = !!value; return; }
      el.value = value;
    };
    const setRadio = (name, value) => {
      if (value == null) return;
      const stringValue = value === true ? 'yes' : value === false ? 'no' : String(value);
      const radio = form.querySelector(`[name="${name}"][value="${stringValue}"]`);
      if (radio) radio.checked = true;
    };


    set('business_name', row.business_name);
    set('business_email', row.business_email);
    set('business_phone', row.business_phone);
    set('city', row.city);
    set('address', row.address);
    set('timezone', row.timezone);
    set('contact_email', row.contact_email);
    set('contact_phone', row.contact_phone);
    set('website_url', row.website_url);
    set('google_business_profile_url', row.google_business_profile_url);

    const hoursConfirmedEl = form.elements['hours_confirmed'];
    if (hoursConfirmedEl) hoursConfirmedEl.checked = !!row.hours_confirmed;

    if (row.hours && typeof row.hours === 'object') {
      for (const d of DAYS) {
        const h = row.hours[d];
        if (!h) continue;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        if (h.closed) {
          if (closedEl) closedEl.checked = true;
          if (openEl) openEl.disabled = true;
          if (closeEl) closeEl.disabled = true;
        } else {
          if (closedEl) closedEl.checked = false;
          if (openEl) { openEl.disabled = false; if (h.open) openEl.value = h.open; }
          if (closeEl) { closeEl.disabled = false; if (h.close) closeEl.value = h.close; }
        }
      }
    }

    set('crm_platform', row.crm_platform);
    set('crm_platform_other', row.crm_platform_other);
    set('crm_account_confirmed', row.crm_account_confirmed);

    set('assistant_name', row.assistant_name);
    set('trial_booking_url', row.trial_booking_url);
    set('main_cta', row.main_cta);
    set('main_cta_other', row.main_cta_other);
    set('intro_offer', row.intro_offer);
    set('preferred_words', row.preferred_words);
    set('avoid_words', row.avoid_words);
    set('instagram_handle', row.instagram_handle);
    set('facebook_page_url', row.facebook_page_url);
    set('tiktok_handle', row.tiktok_handle);

    const bk = row.business_knowledge || {};
    set('bk_service_description', bk.service_description);
    set('bk_single_session_rate', bk.single_session_rate);
    set('bk_membership_pricing', bk.membership_pricing);
    set('bk_package_pricing', bk.package_pricing);
    set('bk_promotions', bk.promotions);
    set('bk_cancellation_policy', bk.cancellation_policy);
    set('bk_eligibility', bk.eligibility);
    set('bk_ideal_client', bk.ideal_client);
    set('bk_pain_points', bk.pain_points);
    set('contact_name', bk.contact_name);
    set('bk_unique_value', bk.unique_value);
    set('bk_first_visit', bk.first_visit);
    set('bk_faq', bk.faq);
    setRadio('bk_accepts_insurance', bk.accepts_insurance);
    setRadio('bk_accepts_hsa_fsa', bk.accepts_hsa_fsa);
    set('bk_insurance_notes', bk.insurance_notes);

    const ag = row.automation_goals;
    const campaigns = (ag && typeof ag === 'object' && Array.isArray(ag.campaigns))
      ? ag.campaigns : [];
    CAMPAIGNS.forEach(c => {
      const cb = form.elements[`camp_${c}`];
      if (cb) cb.checked = campaigns.includes(c);
    });

    const nc = row.notification_config || {};
    if (Array.isArray(nc.channels)) {
      NOTIFICATION_CHANNELS.forEach(c => {
        const cb = form.elements[`notify_${c}`];
        if (cb) cb.checked = nc.channels.includes(c);
      });
    }
    setRadio('notify_target', nc.target || 'primary');
    set('notify_email_address', nc.email);
    set('notify_phone_number', nc.phone);

    const users = Array.isArray(row.dashboard_users) ? row.dashboard_users : [];
    const list = document.getElementById('users-list');
    if (users.length > 0) {
      list.innerHTML = '';
      users.forEach((u, i) => {
        list.insertAdjacentHTML('beforeend', userRowHTML(i));
        const row = list.lastElementChild;
        row.querySelector('[name$="_name"]').value = u.name || '';
        row.querySelector('[name$="_email"]').value = u.email || '';
      });
      userCounter = users.length;
    }

    set('target_launch_date', row.target_launch_date);
    set('notes', row.notes);

    applyConditionals();
  }

  function showError(msg) {
    const box = document.getElementById('error-box');
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function findAllProblems() {
    const form = document.getElementById('intake-form');
    if (!form) return [];
    const fd = new FormData(form);
    const problems = [];

    const requiredEls = form.querySelectorAll('input[required], select[required], textarea[required]');
    for (const el of requiredEls) {
      if (el.offsetParent === null) continue;
      if (el.name === 'honeypot') continue;
      if (el.type === 'checkbox') {
        if (!el.checked) problems.push(el);
        continue;
      }
      const val = (el.value || '').trim();
      if (!val) { problems.push(el); continue; }
      if (el.type === 'email' && !EMAIL_RX.test(val)) problems.push(el);
      else if (el.type === 'tel' && !PHONE_RX.test(val)) problems.push(el);
    }

    if (fd.get('crm_platform') === 'other' && !(fd.get('crm_platform_other') || '').trim()) {
      problems.push(form.querySelector('[name="crm_platform_other"]'));
    }
    if (fd.get('main_cta') === 'other' && !(fd.get('main_cta_other') || '').trim()) {
      problems.push(form.querySelector('[name="main_cta_other"]'));
    }
    if (!(fd.get('bk_single_session_rate') || '').trim() && !(fd.get('bk_membership_pricing') || '').trim()) {
      problems.push(form.querySelector('[name="bk_single_session_rate"]'));
      problems.push(form.querySelector('[name="bk_membership_pricing"]'));
    }
    if (collectCampaigns(fd).length === 0) {
      problems.push(form.querySelector('[name="camp_contacting_new_leads"]'));
    }
    if (collectNotificationChannels(fd).length === 0) {
      problems.push(form.querySelector('[name="notify_email"]'));
    }

    document.querySelectorAll('#users-list .user-row').forEach(row => {
      const emailEl = row.querySelector('[name$="_email"]');
      const email = emailEl ? (emailEl.value || '').trim() : '';
      if (email && !EMAIL_RX.test(email)) problems.push(emailEl);
    });
    if (!collectUsers().some(u => u.name && u.email && EMAIL_RX.test(u.email))) {
      problems.push(form.querySelector('[name="user_0_name"]'));
    }

    const deduped = Array.from(new Set(problems.filter(Boolean)));
    return deduped.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
  }

  function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  }

  function markInvalid(el) {
    if (!el) return;
    let target = el;
    const attestation = el.closest('.attestation');
    const fieldset = el.closest('fieldset');
    if (attestation) target = attestation;
    else if (fieldset) target = fieldset;
    target.classList.add('field-error');
    const clearHandler = () => target.classList.remove('field-error');
    target.addEventListener('input', clearHandler, { once: true });
    target.addEventListener('change', clearHandler, { once: true });
  }

  function hideError() {
    document.getElementById('error-box').hidden = true;
  }

  // Two buttons now trigger the same save -- the one at the foot of the form and
  // the one in the sticky bar -- so their label and disabled state move together.
  function draftButtons() {
    return [
      document.getElementById('save-draft-btn'),
      document.getElementById('sticky-save-draft-btn'),
    ].filter(Boolean);
  }

  function setDraftButtonState(label, disabled) {
    draftButtons().forEach((btn) => {
      btn.textContent = label;
      btn.disabled = disabled;
    });
  }

  function setStickyPanelOpen(open) {
    const panel = document.getElementById('sticky-draft-panel');
    const toggle = document.getElementById('sticky-link-toggle');
    if (!panel || !toggle) return;
    panel.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = open ? 'Hide draft link' : 'Show draft link';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  function isStickyPanelOpen() {
    const panel = document.getElementById('sticky-draft-panel');
    return !!panel && panel.classList.contains('is-open');
  }

  function showDraftLink(scroll) {
    if (!draftId) return;
    const banner = document.getElementById('draft-banner');
    const linkEl = document.getElementById('draft-link');
    const url = `${window.location.origin}${window.location.pathname}?draft=${draftId}`;
    linkEl.value = url;
    banner.hidden = false;
    const stickyLink = document.getElementById('sticky-draft-link');
    if (stickyLink) stickyLink.value = url;
    // There is a link to show now, so the chevron becomes available.
    const toggle = document.getElementById('sticky-link-toggle');
    if (toggle) toggle.hidden = false;
    if (scroll) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSaveDraft(source) {
    hideError();
    const fromSticky = source === 'sticky';
    setDraftButtonState('Saving...', true);
    try {
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        const newId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        payload.id = newId;
        await insertRow(payload);
        draftId = newId;
        setDraftIdInUrl(newId);
      }
      // Reveal the link where the click came from: the sticky panel drops down in
      // place, while the footer button scrolls to the banner as it always has.
      showDraftLink(!fromSticky);
      if (fromSticky) setStickyPanelOpen(true);
      setDraftButtonState('Saved \u2713', true);
      setTimeout(() => setDraftButtonState('Save as draft', false), 1500);
    } catch (err) {
      console.error(err);
      showError(`Draft save failed: ${err.message}`);
      setDraftButtonState('Save as draft', false);
    }
  }

  // The bar is fixed to the top and always on screen, so the body needs padding
  // equal to its height or the bar would sit over the header. Measured rather
  // than hard-coded, so it stays correct if the bar's contents ever change.
  // Only the bar itself counts -- the drop-down panel is an overlay.
  function syncStickyOffset() {
    const bar = document.querySelector('.sticky-draft__bar');
    const track = document.querySelector('.sticky-draft__track');
    if (!bar) return;
    const h = bar.offsetHeight + (track ? track.offsetHeight : 0);
    document.body.style.paddingTop = h + 'px';
  }

  function initStickyDraftBar() {
    const bar = document.getElementById('sticky-draft');
    const form = document.getElementById('intake-form');
    if (!bar || !form) return;
    // initDraftFromUrl() runs before this and hides the form on an
    // already-submitted link. Bail out rather than float a Save draft button
    // over a form nobody can edit.
    if (form.hidden) {
      bar.hidden = true;
      return;
    }

    syncStickyOffset();
    window.addEventListener('resize', syncStickyOffset);

    document.getElementById('sticky-save-draft-btn')
      .addEventListener('click', () => handleSaveDraft('sticky'));

    document.getElementById('sticky-link-toggle')
      .addEventListener('click', () => setStickyPanelOpen(!isStickyPanelOpen()));

    document.getElementById('sticky-copy-link-btn').addEventListener('click', async () => {
      const linkEl = document.getElementById('sticky-draft-link');
      const btn = document.getElementById('sticky-copy-link-btn');
      try {
        await navigator.clipboard.writeText(linkEl.value);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      } catch (e) {
        // clipboard API needs a secure context / permission; fall back to select
        linkEl.select();
      }
    });
  }

  // Called once the form is gone (submitted, or already-submitted link) -- at
  // that point there is nothing left to save, so the bar comes off entirely and
  // the body padding it reserved is released.
  function disableStickyDraftBar() {
    const bar = document.getElementById('sticky-draft');
    if (!bar) return;
    setStickyPanelOpen(false);
    bar.hidden = true;
    document.body.style.paddingTop = '';
  }

  function generateUuid() {
    // Fallback for older browsers without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function renderSubmitSummary() {
    const form = document.getElementById('intake-form');
    const fd = new FormData(form);
    const container = document.getElementById('submit-summary');
    if (!container) return;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const yn = (v) => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—';
    const dash = (v) => {
      const s = (v == null ? '' : String(v)).trim();
      return s || '—';
    };

    const users = collectUsers();
    const campaigns = collectCampaigns(fd);
    const channels = collectNotificationChannels(fd);

    const crmDisplay = fd.get('crm_platform') === 'other' ? dash(fd.get('crm_platform_other')) + ' (other)' : label(fd.get('crm_platform')) || '—';
    const ctaDisplay = fd.get('main_cta') === 'other' ? dash(fd.get('main_cta_other')) + ' (other)' : label(fd.get('main_cta')) || '—';
    const campaignsDisplay = campaigns.length ? campaigns.map(label).join('\n') : '—';
    const channelsDisplay = channels.length ? channels.map(label).join(', ') : '—';
    const notifyTargetDisplay = fd.get('notify_target') === 'different'
      ? `${dash(fd.get('notify_email_address'))} / ${dash(fd.get('notify_phone_number'))}`
      : 'Same as primary contact';

    const hours = collectHours(fd);
    const hoursLines = DAYS.map(d => {
      const h = hours[d];
      const dl = DAY_LABELS[d];
      return h.closed ? `${dl}: closed` : `${dl}: ${h.open || '—'}–${h.close || '—'}`;
    });
    const hoursDisplay = hoursLines.join('\n');


    const usersDisplay = users.length
      ? users.map(u => `${u.name || '(no name)'} — ${u.email || '(no email)'}`).join('\n')
      : '—';

    const groups = [
      {
        heading: 'Your Team',
        items: [
          ['Primary contact', dash(fd.get('contact_name'))],
          ['Primary contact email', dash(fd.get('contact_email'))],
          ['Primary contact phone', dash(fd.get('contact_phone'))],
          ['Dashboard users', usersDisplay]
        ]
      },
      {
        heading: 'Studio Information',
        items: [
          ['Name', dash(fd.get('business_name'))],
          ['Business email', dash(fd.get('business_email'))],
          ['Business phone', dash(fd.get('business_phone'))],
          ['City', dash(fd.get('city'))],
          ['Address', dash(fd.get('address'))],
          ['Timezone', dash(fd.get('timezone'))],
          ['Website', dash(fd.get('website_url'))],
          ['Google Business Profile', dash(fd.get('google_business_profile_url'))]
        ]
      },
      {
        heading: 'CRM Access',
        items: [
          ['Platform', crmDisplay],
          ['Admin account confirmed', fd.get('crm_account_confirmed') === 'on' ? 'Yes' : 'No']
        ]
      },
      {
        heading: 'Business Hours',
        items: [
          ['Schedule', hoursDisplay],
          ['Confirmed accurate', fd.get('hours_confirmed') === 'on' ? 'Yes' : 'No']
        ]
      },
      {
        heading: 'Social Media',
        items: [
          ['Instagram', dash(fd.get('instagram_handle'))],
          ['Facebook', dash(fd.get('facebook_page_url'))],
          ['TikTok', dash(fd.get('tiktok_handle'))]
        ]
      },
      {
        heading: 'Your AI Team Member',
        items: [
          ['Name', dash(fd.get('assistant_name'))],
          ['Booking link', dash(fd.get('trial_booking_url'))],
          ['Main CTA', ctaDisplay],
          ['Main CTA details', dash(fd.get('intro_offer'))],
          ['Words / taglines to use', dash(fd.get('preferred_words'))],
          ['Words / claims to avoid', dash(fd.get('avoid_words'))]
        ]
      },
      {
        heading: 'Services & Pricing',
        items: [
          ['Service description', dash(fd.get('bk_service_description'))],
          ['Single session / drop-in rate', dash(fd.get('bk_single_session_rate'))],
          ['Membership pricing', dash(fd.get('bk_membership_pricing'))],
          ['Package pricing', dash(fd.get('bk_package_pricing'))],
          ['Promotions / discounts', dash(fd.get('bk_promotions'))],
          ['Cancellation / refund policy', dash(fd.get('bk_cancellation_policy'))],
          ['Age / eligibility', dash(fd.get('bk_eligibility'))],
          ['Accepts insurance', yn(fd.get('bk_accepts_insurance'))],
          ['Accepts HSA / FSA', yn(fd.get('bk_accepts_hsa_fsa'))],
          ['Other payment types', dash(fd.get('bk_insurance_notes'))]
        ]
      },
      {
        heading: 'Business & Audience',
        items: [
          ['Ideal client', dash(fd.get('bk_ideal_client'))],
          ['Pain points', dash(fd.get('bk_pain_points'))],
          ['Unique value', dash(fd.get('bk_unique_value'))],
          ['First visit', dash(fd.get('bk_first_visit'))],
          ['FAQ', dash(fd.get('bk_faq'))]
        ]
      },
      {
        heading: 'Campaigns',
        items: [
          [`Switched on (${campaigns.length})`, campaignsDisplay]
        ]
      },
      {
        heading: 'Notifications',
        items: [
          ['How', channelsDisplay],
          ['Where', notifyTargetDisplay]
        ]
      },
      {
        heading: 'Anything Else?',
        items: [
          ['Notes', dash(fd.get('notes'))]
        ]
      }
    ];

    container.innerHTML = groups.map(g => `
      <div class="summary-group">
        <h3>${esc(g.heading)}</h3>
        <dl>
          ${g.items.map(([k, v]) => `<div class="summary-item"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
      </div>
    `).join('');
  }

  let modalLastFocused = null;

  function getModalFocusables() {
    const modal = document.getElementById('submit-confirm-modal');
    if (!modal) return [];
    return Array.from(modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function openSubmitConfirm() {
    renderSubmitSummary();
    const modal = document.getElementById('submit-confirm-modal');
    if (!modal) return;
    modalLastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const cancel = document.getElementById('modal-cancel');
    if (cancel) cancel.focus();
  }

  function closeSubmitConfirm() {
    const modal = document.getElementById('submit-confirm-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
    if (modalLastFocused && typeof modalLastFocused.focus === 'function') {
      modalLastFocused.focus();
    }
    modalLastFocused = null;
  }

  function handleModalKeydown(e) {
    const modal = document.getElementById('submit-confirm-modal');
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSubmitConfirm();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = getModalFocusables();
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hideError();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      const form = document.getElementById('intake-form');
      const fd = new FormData(form);

      if ((fd.get('honeypot') || '').trim() !== '') {
        await new Promise(r => setTimeout(r, 1200));
        document.getElementById('intake-form').hidden = true;
        document.getElementById('success-screen').hidden = false;
        return;
      }

      const launch = (fd.get('target_launch_date') || '').trim();
      const today = new Date().toISOString().split('T')[0];
      const launchInvalid = launch && launch < today;

      clearAllErrors();
      const problems = findAllProblems();
      if (launchInvalid) {
        const el = document.querySelector('[name="target_launch_date"]');
        if (el) problems.push(el);
      }
      if (problems.length) {
        problems.forEach(markInvalid);
        showError('Please fix the highlighted fields.');
        const first = problems[0];
        if (first) {
          first.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try { first.focus({ preventScroll: true }); } catch (e) {}
        }
        btn.disabled = false;
        btn.textContent = 'Review & Submit';
        return;
      }

      openSubmitConfirm();
      btn.disabled = false;
      btn.textContent = 'Review & Submit';
    } catch (err) {
      console.error(err);
      showError(`Something went wrong: ${err.message}. Try again, or email admin@velocityaipartners.ai.`);
      btn.disabled = false;
      btn.textContent = 'Review & Submit';
    }
  }

  async function doFinalSubmit() {
    hideError();
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Submitting...';
    try {

      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        payload.id = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        await insertRow(payload);
      }

      // Fire-and-forget confirmation email via the n8n "Intake Confirmation Email"
      // workflow — it re-reads the row by id and emails contact_email (only when status='pending').
      if (!PREVIEW) fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_id: draftId || payload.id }),
      }).catch(() => {}); // best-effort; must never block or break the success screen

      closeSubmitConfirm();
      document.getElementById('intake-form').hidden = true;
      document.getElementById('draft-banner').hidden = true;
      disableStickyDraftBar();
      document.getElementById('success-screen').hidden = false;
      document.getElementById('success-screen').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      closeSubmitConfirm();
      showError(`Something went wrong: ${err.message}. Try again, or email admin@velocityaipartners.ai.`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & submit';
    }
  }

  async function initDraftFromUrl() {
    const id = getDraftIdFromUrl();
    if (!id) return false;
    try {
      const row = await fetchDraft(id);
      if (!row) {
        showError('This draft link could not be loaded. It may have already been submitted.');
        return false;
      }
      if (row.status && row.status !== 'draft') {
        document.getElementById('intake-form').hidden = true;
        document.getElementById('already-submitted').hidden = false;
        disableStickyDraftBar();
        return false;
      }
      draftId = id;
      applyServerRowToForm(row);
      showDraftLink();
      return true;
    } catch (err) {
      console.error(err);
      showError(`Could not load draft: ${err.message}`);
      return false;
    }
  }

  const PROGRESS_FIELDS = [
    'business_name', 'business_email', 'business_phone', 'city', 'address', 'timezone',
    'contact_name', 'contact_email', 'contact_phone', 'crm_platform',
    'bk_service_description', 'bk_cancellation_policy', 'bk_eligibility',
    'bk_ideal_client', 'bk_pain_points', 'bk_unique_value', 'bk_first_visit', 'bk_faq',
    'assistant_name', 'trial_booking_url',
    'main_cta', 'intro_offer'
  ];

  function computeProgress() {
    const form = document.getElementById('intake-form');
    if (!form) return { filled: 0, total: 1 };
    const fd = new FormData(form);
    const checks = [];

    PROGRESS_FIELDS.forEach(n => {
      const v = (fd.get(n) || '').trim();
      let ok = !!v;
      if (ok && (n === 'business_email' || n === 'contact_email')) ok = EMAIL_RX.test(v);
      if (ok && (n === 'business_phone' || n === 'contact_phone')) ok = PHONE_RX.test(v);
      checks.push(ok);
    });
    checks.push(!!((fd.get('bk_single_session_rate') || '').trim() || (fd.get('bk_membership_pricing') || '').trim()));
    checks.push(fd.get('crm_account_confirmed') === 'on');
    checks.push(fd.get('hours_confirmed') === 'on');
    checks.push(collectUsers().some(u => u.name && u.email && EMAIL_RX.test(u.email)));

    if (fd.get('crm_platform') === 'other') checks.push(!!(fd.get('crm_platform_other') || '').trim());
    if (fd.get('main_cta') === 'other') checks.push(!!(fd.get('main_cta_other') || '').trim());
    checks.push(collectCampaigns(fd).length > 0);
    checks.push(collectNotificationChannels(fd).length > 0);

    const filled = checks.filter(Boolean).length;
    return { filled, total: checks.length };
  }

  function updateProgressBar() {
    const fill = document.getElementById('progress-fill');
    if (!fill) return;
    const { filled, total } = computeProgress();
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    fill.style.width = pct + '%';
    const bar = document.querySelector('.progress-bar');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
    const text = document.getElementById('progress-text');
    if (text) text.textContent = `${pct}% complete`;
    const stickyText = document.getElementById('sticky-progress-text');
    if (stickyText) stickyText.textContent = `${pct}% complete`;
    const stickyFill = document.getElementById('sticky-progress-fill');
    if (stickyFill) stickyFill.style.width = pct + '%';
  }

  function initProgressBar() {
    updateProgressBar();
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', updateProgressBar);
    form.addEventListener('change', updateProgressBar);
  }

  // ---- AI prefill: scrape the location page and fill what we can find ------
  // Same engine as the redesign/franchisor forms: POST the pasted URL to the
  // scrape-location-page edge function, then apply the returned
  // (form-field-keyed) subset to ONLY the fields present in the response. It
  // deliberately never touches automation/handoff/users/notify sections, and
  // nothing is auto-submitted: the hours and CRM attestations stay unchecked so
  // the client is forced to review. Every filled field gets an "AI suggested"
  // chip that clears on their first edit.

  function formatPhoneValue(raw) {
    let d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1); // drop a leading US country code
    d = d.slice(0, 10);
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  function setPrefillStatus(msg, kind) {
    const el = document.getElementById('prefill-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('is-error', 'is-success', 'is-loading');
    if (kind) el.classList.add('is-' + kind); // is-error | is-success | is-loading
  }

  function applyScrapedSuggestions(s) {
    const form = document.getElementById('intake-form');
    if (!form || !s || typeof s !== 'object') return [];
    const filled = [];
    const setField = (name, value) => {
      if (value == null || value === '') return false;
      const el = form.elements[name];
      if (!el) return false;
      if (el.type === 'checkbox') { el.checked = !!value; return true; }
      if (el.tagName === 'SELECT') {
        // Only set if the scraped value matches an option (by value or label);
        // otherwise leave the default so we never show an invalid selection.
        const want = String(value).trim().toLowerCase();
        const opt = [].slice.call(el.options).find((o) =>
          (o.value && o.value.toLowerCase() === want) || (o.text && o.text.trim().toLowerCase() === want));
        if (!opt) return false;
        el.value = opt.value;
        return true;
      }
      try { el.value = value; } catch (_) { return false; } // RadioNodeList.value = x checks that radio
      return true;
    };
    Object.keys(s).forEach((key) => {
      if (key === 'hours' || key === 'address' || key === 'state' || key === 'zip') return; // handled below
      if (setField(key, s[key])) filled.push(key);
    });
    // This form has a single street-address line and no state/zip fields, so
    // fold any scraped state/zip into it ("123 Main St" -> "123 Main St, OH 43215").
    if (s.address) {
      let line = String(s.address).trim();
      const tail = [s.state, s.zip].filter(Boolean).join(' ').trim();
      if (tail && !(s.zip && line.indexOf(s.zip) >= 0)) line += ', ' + tail;
      if (setField('address', line)) filled.push('address');
    }
    // Format any scraped phone to the form's (555) 123-4567 style.
    ['business_phone', 'contact_phone'].forEach((n) => {
      const el = form.elements[n];
      if (el && el.value) el.value = formatPhoneValue(el.value);
    });
    // Hours grid (the edge function already snapped times to 15-min increments).
    // Mirrors applyServerRowToForm: keep the open/close inputs' disabled state
    // in sync with the closed checkbox.
    if (s.hours && typeof s.hours === 'object') {
      let any = false;
      DAYS.forEach((d) => {
        const h = s.hours[d];
        if (!h) return;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        const isClosed = !!h.closed;
        if (closedEl) closedEl.checked = isClosed;
        if (openEl) openEl.disabled = isClosed;
        if (closeEl) closeEl.disabled = isClosed;
        if (!isClosed) {
          if (openEl && h.open) openEl.value = h.open;
          if (closeEl && h.close) closeEl.value = h.close;
        }
        any = true;
      });
      if (any) filled.push('hours');
    }
    // Main CTA: a call-to-action phrase that isn't one of the options -> "Other"
    // + free text (the matching case is handled by setField in the loop above).
    if (s.main_cta) {
      const sel = form.elements['main_cta'];
      if (sel && sel.tagName === 'SELECT' && !sel.value) {
        const hasOther = [].slice.call(sel.options).some((o) => o.value === 'other');
        if (hasOther) {
          sel.value = 'other';
          const otherEl = form.elements['main_cta_other'];
          if (otherEl) { otherEl.value = s.main_cta; if (filled.indexOf('main_cta_other') < 0) filled.push('main_cta_other'); }
          if (filled.indexOf('main_cta') < 0) filled.push('main_cta');
        }
      }
    }
    return filled;
  }

  function markAiSuggested(names) {
    const form = document.getElementById('intake-form');
    if (!form) return;
    const makeChip = (cls) => {
      const c = document.createElement('span');
      c.className = cls;
      c.textContent = 'AI suggested';
      return c;
    };
    (names || []).forEach((name) => {
      // The hours grid has no per-field labels: badge the section heading.
      if (name === 'hours') {
        const ref = form.elements['hours_mon_closed'];
        const section = ref && ref.closest ? ref.closest('section') : null;
        const h2 = section ? section.querySelector('h2') : null;
        if (h2 && !h2.querySelector('.ai-suggested-badge')) h2.appendChild(makeChip('ai-suggested-badge'));
        return;
      }
      const el = form.elements[name];
      if (!el) return;
      const isGroup = (typeof el.length === 'number' && el.tagName === undefined);
      const node = isGroup ? el[0] : el;
      if (!node || !node.closest) return;
      // Radio group: chip after the fieldset legend.
      if (isGroup) {
        const fs = node.closest('fieldset');
        const legend = fs ? fs.querySelector('legend') : null;
        if (legend && !legend.querySelector('.ai-suggested-chip')) {
          legend.appendChild(makeChip('ai-suggested-chip'));
          const clearG = () => { const c = legend.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
          [].slice.call(el).forEach((t) => t.addEventListener('change', clearG, { once: true }));
        }
        return;
      }
      // Single control: inline chip right before the control inside its label.
      const label = node.closest('label');
      if (label && !label.querySelector('.ai-suggested-chip')) {
        let anchor = null;
        for (const child of label.children) {
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(child.tagName)) { anchor = child; break; }
        }
        label.insertBefore(makeChip('ai-suggested-chip'), anchor);
        const clear = () => { const c = label.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
        node.addEventListener('input', clear, { once: true });
        node.addEventListener('change', clear, { once: true });
      }
    });
  }

  async function runPrefill(url, btn) {
    const cleanUrl = (url || '').trim();
    if (!/^https?:\/\/.+\..+/i.test(cleanUrl)) {
      setPrefillStatus('Add your location page URL (starting with https://) first.', 'error');
      const input = document.getElementById('location-page-url');
      if (input) input.focus();
      return;
    }
    const original = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = 'Reading your page...';
    setPrefillStatus('Scanning your page and pulling in everything we can find. This takes a few seconds...', 'loading');
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/scrape-location-page`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: cleanUrl })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const suggested = (data && data.suggested && typeof data.suggested === 'object') ? data.suggested : {};
      const filled = applyScrapedSuggestions(suggested);
      // Refresh dependent UI the same way the draft-restore path does.
      applyConditionals();
      updateProgressBar();
      markAiSuggested(filled);
      const n = filled.length;
      setPrefillStatus(
        n
          ? `✓ Done. Filled in ${n} field${n === 1 ? '' : 's'} from your page, each marked "AI suggested." Review and confirm them before you submit.`
          : 'We could not pull much from that page. Please fill the form in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
      console.error(e);
      setPrefillStatus('We could not read that page right now. Please fill the form in yourself, or try again in a moment.', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.textContent = original;
    }
  }

  function initPrefillButton() {
    const btn = document.getElementById('prefill-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const input = document.getElementById('location-page-url');
      runPrefill(input ? input.value : '', btn);
    });
  }

  function initMinLaunchDate() {
    const el = document.querySelector('[name="target_launch_date"]');
    if (!el) return;
    const today = new Date().toISOString().split('T')[0];
    el.min = today;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    clearStaleLocalStorage();
    renderHours();
    if (PREVIEW) {
      const b = document.getElementById('preview-banner');
      if (b) b.hidden = false;
    }
    renderUsers();
    initMinLaunchDate();
    initProgressBar();
    initPrefillButton();

    await initDraftFromUrl();
    updateProgressBar();

    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'crm_platform') toggleCrmOther();
      if (e.target.name === 'main_cta') toggleMainCtaOther();
      if (e.target.name === 'notify_target') toggleNotifyTarget();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
    document.getElementById('save-draft-btn').addEventListener('click', () => handleSaveDraft('footer'));
    initStickyDraftBar();

    document.getElementById('modal-cancel').addEventListener('click', closeSubmitConfirm);
    document.getElementById('modal-close').addEventListener('click', closeSubmitConfirm);
    document.getElementById('modal-confirm').addEventListener('click', doFinalSubmit);
    document.getElementById('submit-confirm-modal').addEventListener('click', (e) => {
      if (e.target.id === 'submit-confirm-modal') closeSubmitConfirm();
    });
    document.addEventListener('keydown', handleModalKeydown);

    document.getElementById('copy-link-btn').addEventListener('click', async () => {
      const linkEl = document.getElementById('draft-link');
      try {
        await navigator.clipboard.writeText(linkEl.value);
        const btn = document.getElementById('copy-link-btn');
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      } catch (e) {
        linkEl.select();
      }
    });
  });
})();
