(() => {
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const BUCKET = 'intake-logos';

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // Draft state: if the URL has ?draft=<uuid>, we are editing a server-side
  // draft. Save Draft writes back to the same row; Submit flips status to
  // 'pending'. If no draft param, we're on a blank form and the first Save
  // Draft creates a new row + puts its id in the URL.
  let draftId = null;
  let existingLogoUrl = null;
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

  const TONES = ['friendly', 'professional', 'motivational', 'humorous', 'upbeat'];
  const AUTOMATION_GOALS = ['book_demos', 'answer_faqs', 'followup_leads', 'reactivate_old', 'upsell', 'provide_directions', 'other'];
  const NOTIFICATION_CHANNELS = ['email', 'sms'];
  const LEAD_SOURCES = ['website', 'paid_ads', 'phone', 'walkin', 'referrals', 'events', 'gbp', 'social_dms', 'other'];
  const REACTIVATION_SEGMENTS = ['no_shows', 'cooled_leads', 'expired_members', 'paused', 'lost_sheep', 'other'];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RX = /(?:\d[^\d]*){7,}/;

  const LABELS = {
    // Automation goals
    book_demos: 'Book demos / trials',
    answer_faqs: 'Answer FAQs',
    followup_leads: 'Follow up with new leads',
    reactivate_old: 'Reactivate old members',
    upsell: 'Upsell memberships',
    provide_directions: 'Provide directions',
    // Reactivation segments
    no_shows: 'Demo / trial no-shows',
    cooled_leads: 'Cooled leads',
    expired_members: 'Expired memberships',
    paused: 'Paused / frozen accounts',
    lost_sheep: 'Long-term inactive',
    // Lead sources
    website: 'Website form',
    paid_ads: 'Paid ads',
    phone: 'Phone calls',
    walkin: 'Walk-ins',
    referrals: 'Referrals',
    events: 'Local events',
    gbp: 'Google Business Profile',
    social_dms: 'Social media DMs',
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

  function collectTones(fd) {
    return TONES.filter(t => fd.get(`tone_${t}`) === 'on');
  }

  function collectAutomationGoals(fd) {
    return AUTOMATION_GOALS.filter(g => fd.get(`goal_${g}`) === 'on');
  }

  function collectNotificationChannels(fd) {
    return NOTIFICATION_CHANNELS.filter(c => fd.get(`notify_${c}`) === 'on');
  }

  function collectLeadSources(fd) {
    return LEAD_SOURCES.filter(s => fd.get(`lead_source_${s}`) === 'on');
  }

  function collectReactivationSegments(fd) {
    return REACTIVATION_SEGMENTS.filter(s => fd.get(`react_${s}`) === 'on');
  }

  function collectBusinessKnowledge(fd) {
    const yesNoToBool = (v) => v === 'yes' ? true : v === 'no' ? false : null;
    return {
      service_description: fd.get('bk_service_description') || null,
      single_session_rate: fd.get('bk_single_session_rate') || null,
      membership_pricing: fd.get('bk_membership_pricing') || null,
      package_pricing: fd.get('bk_package_pricing') || null,
      promotions: fd.get('bk_promotions') || null,
      cancellation_policy: fd.get('bk_cancellation_policy') || null,
      eligibility: fd.get('bk_eligibility') || null,
      ideal_client: fd.get('bk_ideal_client') || null,
      pain_points: fd.get('bk_pain_points') || null,
      lead_sources: collectLeadSources(fd),
      lead_sources_other: fd.get('lead_source_other_text') || null,
      unique_value: fd.get('bk_unique_value') || null,
      first_visit: fd.get('bk_first_visit') || null,
      faq: fd.get('bk_faq') || null,
      testimonials: fd.get('bk_testimonials') || null,
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

  function toggleParentBrand() {
    const yes = document.querySelector('[name="is_multi_location"][value="yes"]').checked;
    const wrap = document.getElementById('parent-brand-wrap');
    revealToggle(wrap, yes);
    if (!yes) {
      const select = wrap.querySelector('[name="parent_brand_name"]');
      if (select) select.value = '';
    }
    toggleBrandSpecificFields();
  }

  function toggleBrandSpecificFields() {
    const isYes = document.querySelector('[name="is_multi_location"][value="yes"]').checked;
    const select = document.querySelector('[name="parent_brand_name"]');
    const brand = isYes && select ? select.value : '';

    const conditionals = [
      { wrap: 'parent-brand-other-wrap', input: 'parent_brand_other', show: brand === 'other' },
      { wrap: 'booking-payment-link-wrap', input: 'booking_payment_link', show: brand === 'StretchLab' },
      { wrap: 'store-id-wrap', input: 'crm_store_id', show: brand === 'Stretch Zone' }
    ];

    for (const c of conditionals) {
      const wrap = document.getElementById(c.wrap);
      revealToggle(wrap, c.show);
      if (!c.show && wrap) {
        const input = wrap.querySelector(`[name="${c.input}"]`);
        if (input) input.value = '';
      }
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

  function toggleGoalOther() {
    const cb = document.querySelector('[name="goal_other"]');
    const isOther = cb && cb.checked;
    const wrap = document.getElementById('goal-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="goal_other_text"]');
      if (input) input.value = '';
    }
  }

  function toggleHandoffRuleOther() {
    const radio = document.querySelector('[name="handoff_rule"][value="other"]');
    const isOther = radio && radio.checked;
    const wrap = document.getElementById('handoff-rule-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="handoff_rule_other"]');
      if (input) input.value = '';
    }
  }

  function toggleReactOther() {
    const cb = document.querySelector('[name="react_other"]');
    const isOther = cb && cb.checked;
    const wrap = document.getElementById('react-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="react_other_text"]');
      if (input) input.value = '';
    }
  }

  function toggleLeadSourceOther() {
    const cb = document.querySelector('[name="lead_source_other"]');
    const isOther = cb && cb.checked;
    const wrap = document.getElementById('lead-source-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="lead_source_other_text"]');
      if (input) input.value = '';
    }
  }

  function applyConditionals() {
    toggleParentBrand();
    toggleCrmOther();
    toggleMainCtaOther();
    toggleGoalOther();
    toggleHandoffRuleOther();
    toggleReactOther();
    toggleLeadSourceOther();
  }

  async function uploadLogo(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const safeBase = (file.name || 'logo').replace(/[^a-z0-9]/gi, '-').slice(0, 40);
    const path = `${Date.now()}-${safeBase}.${ext}`;
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': file.type,
        'x-upsert': 'false'
      },
      body: file
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Logo upload failed: ${resp.status} ${body}`);
    }
    const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    if (existingLogoUrl && existingLogoUrl !== newUrl) {
      deleteLogoSilent(existingLogoUrl);
    }
    existingLogoUrl = newUrl;
    return newUrl;
  }

  async function deleteLogoSilent(publicUrl) {
    try {
      const prefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
      if (!publicUrl || !publicUrl.startsWith(prefix)) return;
      const path = publicUrl.slice(prefix.length);
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
    } catch (e) {
      // Silently ignore — stale logos in the bucket are low-harm.
    }
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
      hours: collectHours(fd),
      hours_confirmed: fd.get('hours_confirmed') === 'on',
      crm_platform: fd.get('crm_platform') || null,
      crm_platform_other: fd.get('crm_platform_other') || null,
      crm_store_id: fd.get('crm_store_id') || null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      chatbot_voice: fd.get('chatbot_voice') || null,
      chatbot_voice_notes: fd.get('chatbot_voice_notes') || null,
      chatbot_tone: collectTones(fd),
      chatbot_tone_notes: fd.get('chatbot_tone_notes') || null,
      main_cta: fd.get('main_cta') || null,
      main_cta_other: fd.get('main_cta_other') || null,
      intro_offer: fd.get('intro_offer') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      dashboard_users: collectUsers(),
      business_knowledge: collectBusinessKnowledge(fd),
      automation_goals: {
        goals: collectAutomationGoals(fd),
        other_text: fd.get('goal_other_text') || null,
        reactivation_segments: collectReactivationSegments(fd),
        reactivation_segments_other: fd.get('react_other_text') || null,
        reactivation_offer: fd.get('reactivation_offer') || null
      },
      handoff_config: {
        rule: fd.get('handoff_rule') || null,
        rule_other: fd.get('handoff_rule_other') || null
      },
      notification_config: {
        channels: collectNotificationChannels(fd)
      },
      sms_cadence: {
        initial_delay: fd.get('sms_initial_delay') || null,
        followup_cadence: fd.get('sms_followup_cadence') || null
      },
      kpi_targets: fd.get('kpi_targets') || null,
      website_url: fd.get('website_url') || null,
      google_business_profile_url: fd.get('google_business_profile_url') || null,
      is_multi_location: fd.get('is_multi_location') === 'yes',
      parent_brand_name: fd.get('parent_brand_name') || null,
      parent_brand_other: fd.get('parent_brand_other') || null,
      booking_payment_link: fd.get('booking_payment_link') || null,
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
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
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
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
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

    existingLogoUrl = row.logo_url || null;

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
    setRadio('is_multi_location', row.is_multi_location);
    set('parent_brand_name', row.parent_brand_name);
    set('parent_brand_other', row.parent_brand_other);
    set('booking_payment_link', row.booking_payment_link);

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
    set('crm_store_id', row.crm_store_id);
    set('crm_account_confirmed', row.crm_account_confirmed);

    setRadio('chatbot_voice', row.chatbot_voice);
    set('chatbot_voice_notes', row.chatbot_voice_notes);
    if (Array.isArray(row.chatbot_tone)) {
      TONES.forEach(t => {
        const cb = form.elements[`tone_${t}`];
        if (cb) cb.checked = row.chatbot_tone.includes(t);
      });
    }
    set('chatbot_tone_notes', row.chatbot_tone_notes);
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
    if (Array.isArray(bk.lead_sources)) {
      LEAD_SOURCES.forEach(s => {
        const cb = form.elements[`lead_source_${s}`];
        if (cb) cb.checked = bk.lead_sources.includes(s);
      });
    }
    set('lead_source_other_text', bk.lead_sources_other);
    set('bk_unique_value', bk.unique_value);
    set('bk_first_visit', bk.first_visit);
    set('bk_faq', bk.faq);
    set('bk_testimonials', bk.testimonials);
    setRadio('bk_accepts_insurance', bk.accepts_insurance);
    setRadio('bk_accepts_hsa_fsa', bk.accepts_hsa_fsa);
    set('bk_insurance_notes', bk.insurance_notes);

    const ag = row.automation_goals;
    let goalsArr = [];
    let goalsOther = null;
    let reactSegs = [];
    let reactOther = null;
    let reactOffer = null;
    if (Array.isArray(ag)) {
      goalsArr = ag;
    } else if (ag && typeof ag === 'object') {
      goalsArr = Array.isArray(ag.goals) ? ag.goals : [];
      goalsOther = ag.other_text || null;
      reactSegs = Array.isArray(ag.reactivation_segments) ? ag.reactivation_segments : [];
      reactOther = ag.reactivation_segments_other || null;
      reactOffer = ag.reactivation_offer || null;
    }
    AUTOMATION_GOALS.forEach(g => {
      const cb = form.elements[`goal_${g}`];
      if (cb) cb.checked = goalsArr.includes(g);
    });
    set('goal_other_text', goalsOther);
    REACTIVATION_SEGMENTS.forEach(s => {
      const cb = form.elements[`react_${s}`];
      if (cb) cb.checked = reactSegs.includes(s);
    });
    set('react_other_text', reactOther);
    set('reactivation_offer', reactOffer);
    const hc = row.handoff_config || {};
    setRadio('handoff_rule', hc.rule);
    set('handoff_rule_other', hc.rule_other);
    const nc = row.notification_config || {};
    if (Array.isArray(nc.channels)) {
      NOTIFICATION_CHANNELS.forEach(c => {
        const cb = form.elements[`notify_${c}`];
        if (cb) cb.checked = nc.channels.includes(c);
      });
    }

    const sc = row.sms_cadence || {};
    setRadio('sms_initial_delay', sc.initial_delay);
    set('sms_followup_cadence', sc.followup_cadence);

    set('kpi_targets', row.kpi_targets);

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

    if (fd.get('is_multi_location') === 'yes' && !(fd.get('parent_brand_name') || '').trim()) {
      problems.push(form.querySelector('[name="parent_brand_name"]'));
    }
    if (fd.get('parent_brand_name') === 'other' && !(fd.get('parent_brand_other') || '').trim()) {
      problems.push(form.querySelector('[name="parent_brand_other"]'));
    }
    if (fd.get('crm_platform') === 'other' && !(fd.get('crm_platform_other') || '').trim()) {
      problems.push(form.querySelector('[name="crm_platform_other"]'));
    }
    if (!fd.get('chatbot_voice')) problems.push(form.querySelector('[name="chatbot_voice"]'));
    if (collectTones(fd).length === 0) problems.push(form.querySelector('[name="tone_friendly"]'));
    if (fd.get('main_cta') === 'other' && !(fd.get('main_cta_other') || '').trim()) {
      problems.push(form.querySelector('[name="main_cta_other"]'));
    }
    if (!(fd.get('bk_single_session_rate') || '').trim() && !(fd.get('bk_membership_pricing') || '').trim()) {
      problems.push(form.querySelector('[name="bk_single_session_rate"]'));
      problems.push(form.querySelector('[name="bk_membership_pricing"]'));
    }
    if (!fd.get('handoff_rule')) problems.push(form.querySelector('[name="handoff_rule"]'));
    if (fd.get('handoff_rule') === 'other' && !(fd.get('handoff_rule_other') || '').trim()) {
      problems.push(form.querySelector('[name="handoff_rule_other"]'));
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

  function showDraftLink(scroll) {
    if (!draftId) return;
    const banner = document.getElementById('draft-banner');
    const linkEl = document.getElementById('draft-link');
    const url = `${window.location.origin}${window.location.pathname}?draft=${draftId}`;
    linkEl.value = url;
    banner.hidden = false;
    if (scroll) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSaveDraft() {
    hideError();
    const btn = document.getElementById('save-draft-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const logoFile = document.getElementById('logo-input').files[0];
      const payload = buildPayload('draft');
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          showError('Logo is over 2MB. Please use a smaller image.');
          return;
        }
        payload.logo_url = await uploadLogo(logoFile);
      }
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        const newId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        payload.id = newId;
        await insertRow(payload);
        draftId = newId;
        setDraftIdInUrl(newId);
      }
      showDraftLink(true);
      btn.textContent = 'Saved \u2713';
      setTimeout(() => { btn.textContent = 'Save as draft'; btn.disabled = false; }, 1500);
    } catch (err) {
      console.error(err);
      showError(`Draft save failed: ${err.message}`);
      btn.textContent = 'Save as draft';
      btn.disabled = false;
    }
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

    const tones = collectTones(fd);
    const users = collectUsers();
    const goals = collectAutomationGoals(fd);
    const reactSegs = collectReactivationSegments(fd);
    const leadSrcs = collectLeadSources(fd);
    const channels = collectNotificationChannels(fd);

    const multi = fd.get('is_multi_location') === 'yes';
    const brand = multi ? (fd.get('parent_brand_name') === 'other' ? dash(fd.get('parent_brand_other')) + ' (other)' : dash(fd.get('parent_brand_name'))) : 'Standalone';
    const crmDisplay = fd.get('crm_platform') === 'other' ? dash(fd.get('crm_platform_other')) + ' (other)' : label(fd.get('crm_platform')) || '—';
    const ctaDisplay = fd.get('main_cta') === 'other' ? dash(fd.get('main_cta_other')) + ' (other)' : label(fd.get('main_cta')) || '—';
    const handoffDisplay = fd.get('handoff_rule') === 'other' ? dash(fd.get('handoff_rule_other')) + ' (other)' : label(fd.get('handoff_rule')) || '—';
    const tonesDisplay = tones.length ? tones.map(label).join(', ') : '—';
    const goalsDisplay = goals.length ? goals.map(label).join(', ') : '—';
    const reactDisplay = reactSegs.length ? reactSegs.map(label).join(', ') : '—';
    const leadsDisplay = leadSrcs.length ? leadSrcs.map(label).join(', ') : '—';
    const channelsDisplay = channels.length ? channels.map(label).join(', ') : '—';
    const voiceDisplay = label(fd.get('chatbot_voice')) || '—';
    const delayMap = { immediate: 'Immediately', '15_30s': '15–30 seconds', '1_2min': '1–2 minutes', '5_plus_min': '5+ minutes', unsure: 'Unsure — advise' };
    const initialDelayDisplay = delayMap[fd.get('sms_initial_delay')] || '—';

    const hours = collectHours(fd);
    const hoursLines = DAYS.map(d => {
      const h = hours[d];
      const dl = DAY_LABELS[d];
      return h.closed ? `${dl}: closed` : `${dl}: ${h.open || '—'}–${h.close || '—'}`;
    });
    const hoursDisplay = hoursLines.join('\n');

    const logoFile = document.getElementById('logo-input').files[0];
    const logoDisplay = logoFile
      ? `${logoFile.name} (${(logoFile.size / 1024).toFixed(0)} KB)`
      : existingLogoUrl
        ? 'Previously uploaded'
        : '—';

    const usersDisplay = users.length
      ? users.map(u => `${u.name || '(no name)'} — ${u.email || '(no email)'}`).join('\n')
      : '—';

    const groups = [
      {
        heading: 'Business Information',
        items: [
          ['Name', dash(fd.get('business_name'))],
          ['Business email', dash(fd.get('business_email'))],
          ['Business phone', dash(fd.get('business_phone'))],
          ['City', dash(fd.get('city'))],
          ['Address', dash(fd.get('address'))],
          ['Timezone', dash(fd.get('timezone'))],
          ['Primary contact email', dash(fd.get('contact_email'))],
          ['Primary contact phone', dash(fd.get('contact_phone'))],
          ['Website', dash(fd.get('website_url'))],
          ['Google Business Profile', dash(fd.get('google_business_profile_url'))],
          ['Brand', brand],
          ...(fd.get('parent_brand_name') === 'StretchLab' ? [['Booking payment link', dash(fd.get('booking_payment_link'))]] : []),
          ...(fd.get('parent_brand_name') === 'Stretch Zone' ? [['Store ID', dash(fd.get('crm_store_id'))]] : []),
          ['Studio logo', logoDisplay]
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
        heading: 'Branding & Messaging',
        items: [
          ['AI Agent voice', voiceDisplay],
          ['Voice specifics', dash(fd.get('chatbot_voice_notes'))],
          ['AI Agent tone', tonesDisplay],
          ['Tone specifics', dash(fd.get('chatbot_tone_notes'))],
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
          ['Lead sources', leadsDisplay],
          ...(fd.get('lead_source_other') === 'on' ? [['Other lead source', dash(fd.get('lead_source_other_text'))]] : []),
          ['Ideal client', dash(fd.get('bk_ideal_client'))],
          ['Pain points', dash(fd.get('bk_pain_points'))],
          ['Unique value', dash(fd.get('bk_unique_value'))],
          ['First visit', dash(fd.get('bk_first_visit'))],
          ['Testimonials', dash(fd.get('bk_testimonials'))],
          ['FAQ', dash(fd.get('bk_faq'))]
        ]
      },
      {
        heading: 'Automation & Follow-up',
        items: [
          ['AI goals', goalsDisplay],
          ...(fd.get('goal_other') === 'on' ? [['Other goal', dash(fd.get('goal_other_text'))]] : []),
          ['Reactivation segments', reactDisplay],
          ...(fd.get('react_other') === 'on' ? [['Other segment', dash(fd.get('react_other_text'))]] : []),
          ['Reactivation offer', dash(fd.get('reactivation_offer'))],
          ['Initial reply delay', initialDelayDisplay],
          ['Follow-up cadence', dash(fd.get('sms_followup_cadence'))]
        ]
      },
      {
        heading: 'Handoff & Notifications',
        items: [
          ['Handoff rule', handoffDisplay],
          ['Notification channels', channelsDisplay]
        ]
      },
      {
        heading: 'Anything Else?',
        items: [
          ['KPI targets', dash(fd.get('kpi_targets'))],
          ['Target launch date', dash(fd.get('target_launch_date'))],
          ['Notes', dash(fd.get('notes'))]
        ]
      },
      {
        heading: 'Dashboard Users',
        items: [
          ['Users (Manager role)', usersDisplay]
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
      const logoFile = document.getElementById('logo-input').files[0];
      const payload = buildPayload('pending');
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          closeSubmitConfirm();
          showError('Logo is over 2MB. Please use a smaller image.');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm & submit';
          return;
        }
        payload.logo_url = await uploadLogo(logoFile);
      }

      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        payload.id = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        await insertRow(payload);
      }

      closeSubmitConfirm();
      document.getElementById('intake-form').hidden = true;
      document.getElementById('draft-banner').hidden = true;
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
    'contact_email', 'contact_phone', 'crm_platform',
    'bk_service_description', 'bk_cancellation_policy', 'bk_eligibility',
    'bk_ideal_client', 'bk_pain_points', 'bk_unique_value', 'bk_first_visit', 'bk_faq',
    'chatbot_voice', 'main_cta', 'intro_offer', 'handoff_rule'
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
    checks.push(collectTones(fd).length > 0);
    checks.push(!!((fd.get('bk_single_session_rate') || '').trim() || (fd.get('bk_membership_pricing') || '').trim()));
    checks.push(fd.get('crm_account_confirmed') === 'on');
    checks.push(fd.get('hours_confirmed') === 'on');
    checks.push(collectUsers().some(u => u.name && u.email && EMAIL_RX.test(u.email)));

    if (fd.get('is_multi_location') === 'yes') {
      checks.push(!!(fd.get('parent_brand_name') || '').trim());
      if (fd.get('parent_brand_name') === 'other') {
        checks.push(!!(fd.get('parent_brand_other') || '').trim());
      }
    }
    if (fd.get('crm_platform') === 'other') checks.push(!!(fd.get('crm_platform_other') || '').trim());
    if (fd.get('main_cta') === 'other') checks.push(!!(fd.get('main_cta_other') || '').trim());
    if (fd.get('handoff_rule') === 'other') checks.push(!!(fd.get('handoff_rule_other') || '').trim());

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
  }

  function initProgressBar() {
    updateProgressBar();
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', updateProgressBar);
    form.addEventListener('change', updateProgressBar);
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
    renderUsers();
    initMinLaunchDate();
    initProgressBar();

    await initDraftFromUrl();
    updateProgressBar();

    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'is_multi_location') toggleParentBrand();
      if (e.target.name === 'parent_brand_name') toggleBrandSpecificFields();
      if (e.target.name === 'crm_platform') toggleCrmOther();
      if (e.target.name === 'main_cta') toggleMainCtaOther();
      if (e.target.name === 'goal_other') toggleGoalOther();
      if (e.target.name === 'handoff_rule') toggleHandoffRuleOther();
      if (e.target.name === 'react_other') toggleReactOther();
      if (e.target.name === 'lead_source_other') toggleLeadSourceOther();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
    document.getElementById('save-draft-btn').addEventListener('click', handleSaveDraft);

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
