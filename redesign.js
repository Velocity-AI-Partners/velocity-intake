(() => {
  // === REDESIGN PREVIEW BUILD (unwired) ===
  // Visual-only preview of the redesigned full form. Intentionally NOT connected
  // to any backend: no Supabase credentials, and every network write
  // (insert / update / draft-load / logo upload / AI prefill / confirmation
  // email) is short-circuited by the PREVIEW_MODE guards below. Nothing the user
  // does here is saved or sent anywhere.
  const PREVIEW_MODE = true;
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';
  const TABLE = 'location_intake_submissions';
  const BUCKET = 'intake-logos';
  const FUNCTIONS_BASE = '';

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

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Options for a single combined time <select>: every 15 min, value "HH:MM" (24h),
  // label "h:mm AM/PM" (12h) so the whole time reads as one unit, e.g. "9:00 AM".
  function timeOptionsHTML(selectedHHMM) {
    let opts = '';
    for (let mins = 0; mins < 24 * 60; mins += 15) {
      const h24 = Math.floor(mins / 60);
      const m = mins % 60;
      const val = `${pad2(h24)}:${pad2(m)}`;
      const ap = h24 >= 12 ? 'PM' : 'AM';
      let h12 = h24 % 12; if (h12 === 0) h12 = 12;
      const label = `${h12}:${pad2(m)} ${ap}`;
      opts += `<option value="${val}"${val === selectedHHMM ? ' selected' : ''}>${label}</option>`;
    }
    return opts;
  }

  function timePickerHTML(name, defaultHHMM) {
    return `<select class="time-select" name="${name}" aria-label="Time">${timeOptionsHTML(defaultHHMM)}</select>`;
  }

  function setDayDisabled(grid, day, disabled) {
    const o = grid.querySelector(`[name="hours_${day}_open"]`);
    const c = grid.querySelector(`[name="hours_${day}_close"]`);
    if (o) o.disabled = disabled;
    if (c) c.disabled = disabled;
  }

  function renderHours() {
    const grid = document.getElementById('hours-grid');
    grid.innerHTML = DAYS.map(d => `
      <div class="day-label">${DAY_LABELS[d]}</div>
      ${timePickerHTML(`hours_${d}_open`, '09:00')}
      ${timePickerHTML(`hours_${d}_close`, '17:00')}
      <label class="closed-wrap"><input type="checkbox" name="hours_${d}_closed"> closed</label>
    `).join('');

    grid.addEventListener('change', (e) => {
      if (e.target.name && e.target.name.endsWith('_closed')) {
        const day = e.target.name.split('_')[1];
        setDayDisabled(grid, day, e.target.checked);
      }
    });
  }

  function userRowHTML(i) {
    return `
      <div class="user-row" data-i="${i}">
        <div class="input-with-req urow-name">
          <input type="text" name="user_${i}_name" placeholder="Name">
          <span class="req" aria-hidden="true">*</span>
        </div>
        <div class="input-with-req urow-email">
          <input type="email" name="user_${i}_email" placeholder="Email">
          <span class="req" aria-hidden="true">*</span>
        </div>
        <input class="urow-phone" type="tel" name="user_${i}_phone" placeholder="Phone" aria-label="Phone (optional, for SMS alerts)">
        <select class="urow-role" name="user_${i}_role" aria-label="Role">
          <option value="">Role…</option>
          <option value="staff">Staff</option>
          <option value="general_manager">General Manager</option>
        </select>
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
          renderNotifyList();
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

  const TONES = ['friendly', 'professional', 'warm', 'upbeat', 'motivational', 'calm', 'direct', 'conversational', 'playful', 'premium'];
  const AUTOMATION_GOALS = ['new_leads', 'old_leads', 'current_members', 'current_phones', 'other'];
  const NOTIFICATION_CHANNELS = ['email', 'sms'];
  const ESCALATION_TRIGGERS = ['asks_human', 'upset', 'cancel', 'billing', 'injury', 'pricing', 'urgent', 'cant_answer'];
  const HANDOFF_RULES = ['never', 'on_request', 'business_hours_request', 'complex', 'other'];
  const LEAD_SOURCES = ['website', 'paid_ads', 'phone', 'walkin', 'referrals', 'events', 'gbp', 'social_dms', 'other'];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RX = /(?:\d[^\d]*){7,}/;

  const LABELS = {
    // Automation goals (who the AI Team Members interact with)
    new_leads: 'New leads',
    old_leads: 'Old leads',
    current_members: 'Current members',
    current_phones: 'Current phone numbers',
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
    warm: 'Warm',
    calm: 'Calm & reassuring',
    direct: 'Concise & direct',
    conversational: 'Conversational',
    playful: 'Playful / humorous',
    premium: 'Premium / upscale',
    team: 'Team',
    owner: 'Owner',
    brand: 'Brand persona',
    unsure: 'Unsure, advise',
    // Main CTA
    book_demo: 'Book a free demo',
    schedule_call: 'Schedule a call',
    start_trial: 'Start a free trial',
    start_paid_trial: 'Start a paid trial',
    buy_membership: 'Buy a membership',
    // Handoff
    never: 'Never (AI handles everything)',
    on_request: 'Only on request',
    business_hours_request: 'During studio hours, on request',
    complex: 'When conversation gets complex',
    // Escalation triggers
    asks_human: 'Asks for a human / manager / owner',
    upset: 'Upset or complaining',
    cancel: 'Wants to cancel or freeze',
    billing: 'Billing, payment, or refund issue',
    injury: 'Injury, pain, or medical concern',
    pricing: 'Price negotiation / special deal',
    urgent: 'Urgent or time-sensitive',
    cant_answer: "Something the AI can't answer",
    // Team roles
    staff: 'Staff',
    general_manager: 'General Manager',
    // Call-transfer targets
    studio: 'Studio phone',
    contact: 'My direct phone',
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

  function collectEscalationTriggers(fd) {
    return ESCALATION_TRIGGERS.filter(t => fd.get(`esc_${t}`) === 'on');
  }

  function collectHandoffRules(fd) {
    return HANDOFF_RULES.filter(r => fd.get(`handoff_${r}`) === 'on');
  }

  function parseJsonField(v) {
    if (!v) return [];
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Progressive US phone mask: digits in -> "(555) 123-4567" out.
  function formatPhoneValue(raw) {
    let d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1); // drop a leading US country code
    d = d.slice(0, 10);
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  function collectLeadSources(fd) {
    return LEAD_SOURCES.filter(s => fd.get(`lead_source_${s}`) === 'on');
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
      const phoneEl = row.querySelector('[name$="_phone"]');
      const phone = phoneEl ? phoneEl.value.trim() : '';
      const roleEl = row.querySelector('[name$="_role"]');
      const role = (roleEl && roleEl.value) || 'staff';
      if (name || email || phone) users.push({ name, email, phone, role });
    });
    return users;
  }

  // ---- Per-person notify list (booking confirmations + escalations) ---------
  // Live-rendered from the primary contact ("You") + each Team access teammate.
  // Each recipient gets a notify toggle + Email / SMS channels (SMS needs a
  // phone on file). Selections persist in `notifyState` across re-renders and
  // serialize into the hidden `notify_recipients` input (JSON) for the payload.
  const notifyState = {}; // id -> { notify, email, sms }

  function getNotifyRecipientsModel() {
    const form = document.getElementById('intake-form');
    if (!form) return [];
    const val = (n) => ((form.elements[n] || {}).value || '').trim();
    const recipients = [];
    const pName = `${val('contact_first_name')} ${val('contact_last_name')}`.trim();
    recipients.push({
      id: 'primary',
      name: pName,
      label: pName ? `${pName} (you)` : 'You',
      email: val('contact_email'),
      phone: val('contact_phone'),
      role: 'Primary contact'
    });
    document.querySelectorAll('#users-list .user-row').forEach(row => {
      const q = (sel) => ((row.querySelector(sel) || {}).value || '').trim();
      const name = q('[name$="_name"]');
      const email = q('[name$="_email"]');
      const phone = q('[name$="_phone"]');
      const roleEl = row.querySelector('[name$="_role"]');
      const role = roleEl && roleEl.value ? (LABELS[roleEl.value] || roleEl.value) : 'Teammate';
      if (!name && !email) return; // skip empty rows
      recipients.push({ id: 'user_' + row.getAttribute('data-i'), name, label: name || email, email, phone, role });
    });
    return recipients;
  }

  function syncNotifyHidden() {
    const hidden = document.querySelector('[name="notify_recipients"]');
    if (!hidden) return;
    const out = getNotifyRecipientsModel()
      .filter(r => notifyState[r.id] && notifyState[r.id].notify)
      .map(r => {
        const st = notifyState[r.id];
        const channels = [];
        if (st.email) channels.push('email');
        if (st.sms && r.phone) channels.push('sms');
        return { id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role, channels };
      });
    hidden.value = JSON.stringify(out);
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderNotifyList() {
    const listEl = document.getElementById('notify-list');
    if (!listEl) return;
    const recipients = getNotifyRecipientsModel();
    recipients.forEach(r => {
      if (!notifyState[r.id]) {
        notifyState[r.id] = r.id === 'primary'
          ? { notify: true, email: true, sms: !!r.phone }
          : { notify: false, email: false, sms: false };
      }
      if (!r.phone) notifyState[r.id].sms = false; // can't SMS without a number
    });
    const ids = new Set(recipients.map(r => r.id));
    Object.keys(notifyState).forEach(id => { if (!ids.has(id)) delete notifyState[id]; });

    if (!recipients.length) {
      listEl.innerHTML = '<p class="section-hint" style="margin:0;">Add your details and teammates above, then choose who to notify.</p>';
      syncNotifyHidden();
      return;
    }
    listEl.innerHTML = recipients.map(r => {
      const st = notifyState[r.id];
      const noPhone = !r.phone;
      const phoneFmt = r.phone ? (formatPhoneValue(r.phone) || r.phone) : '';
      const contactBits = [r.email, phoneFmt].filter(Boolean).map(escapeHtml).join(' · ');
      const contactLine = contactBits
        ? `<span class="notify-contact">${contactBits}</span>`
        : '<span class="notify-contact notify-contact--empty">No email or phone added</span>';
      return `
        <div class="notify-row${st.notify ? ' is-on' : ''}" data-id="${escapeHtml(r.id)}">
          <label class="notify-who">
            <input type="checkbox" class="notify-on"${st.notify ? ' checked' : ''}>
            <span class="notify-who__text">
              <span class="notify-who__top">
                <span class="notify-name">${escapeHtml(r.label)}</span>
                <span class="notify-role">${escapeHtml(r.role)}</span>
              </span>
              ${contactLine}
            </span>
          </label>
          <div class="notify-channels">
            <label class="notify-chan"><input type="checkbox" class="notify-email"${st.email ? ' checked' : ''}${st.notify ? '' : ' disabled'}> Email</label>
            <label class="notify-chan${noPhone ? ' is-disabled' : ''}"${noPhone ? ' title="Add a phone number for this person to enable SMS"' : ''}><input type="checkbox" class="notify-sms"${st.sms ? ' checked' : ''}${(st.notify && !noPhone) ? '' : ' disabled'}> SMS</label>
          </div>
        </div>`;
    }).join('');
    syncNotifyHidden();
  }

  function restoreNotifyState(saved) {
    // A saved draft is authoritative: reset everyone off, then apply saved picks.
    getNotifyRecipientsModel().forEach(r => { notifyState[r.id] = { notify: false, email: false, sms: false }; });
    const model = getNotifyRecipientsModel();
    (Array.isArray(saved) ? saved : []).forEach(sr => {
      let m = model.find(r => r.id === sr.id);
      if (!m && sr.email) m = model.find(r => r.email && r.email.toLowerCase() === String(sr.email).toLowerCase());
      if (!m) return;
      const ch = Array.isArray(sr.channels) ? sr.channels : [];
      notifyState[m.id] = { notify: true, email: ch.includes('email'), sms: ch.includes('sms') && !!m.phone };
    });
    renderNotifyList();
  }

  function initNotifyList() {
    const listEl = document.getElementById('notify-list');
    if (!listEl) return;
    listEl.addEventListener('change', (e) => {
      const row = e.target.closest('.notify-row');
      if (!row) return;
      const st = notifyState[row.getAttribute('data-id')];
      if (!st) return;
      if (e.target.classList.contains('notify-on')) {
        st.notify = e.target.checked;
        if (st.notify && !st.email && !st.sms) st.email = true; // sensible default when turned on
        renderNotifyList(); // re-render to enable/disable the channel checkboxes
      } else if (e.target.classList.contains('notify-email')) {
        st.email = e.target.checked;
        syncNotifyHidden();
      } else if (e.target.classList.contains('notify-sms')) {
        st.sms = e.target.checked;
        syncNotifyHidden();
      }
    });
    renderNotifyList();
  }

  // Live-format every phone field to "(555) 123-4567" as the user types.
  // Delegated on the form so teammate rows added later are covered too.
  function initPhoneFormatting() {
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || el.type !== 'tel') return;
      const formatted = formatPhoneValue(el.value);
      if (formatted !== el.value) {
        el.value = formatted;
        try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
      }
    });
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

  // AI Team Member texts/emails from the studio's own number/email (reveal a
  // capture field) or a new dedicated one we provision (hide it).
  function toggleAiPhone() {
    const sel = document.querySelector('[name="ai_phone_mode"]:checked');
    const isOwn = sel && sel.value === 'own';
    const wrap = document.getElementById('ai-phone-number-wrap');
    revealToggle(wrap, isOwn);
    if (!isOwn && wrap) {
      const input = wrap.querySelector('[name="ai_phone_number"]');
      if (input) input.value = '';
    }
  }
  function toggleAiEmail() {
    const sel = document.querySelector('[name="ai_email_mode"]:checked');
    const isOwn = sel && sel.value === 'own';
    const wrap = document.getElementById('ai-email-address-wrap');
    revealToggle(wrap, isOwn);
    if (!isOwn && wrap) {
      const input = wrap.querySelector('[name="ai_email_address"]');
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
    const cb = document.querySelector('[name="handoff_other"]');
    const isOther = cb && cb.checked;
    const wrap = document.getElementById('handoff-rule-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="handoff_rule_other"]');
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

  function toggleCallTransferOther() {
    const radio = document.querySelector('[name="call_transfer_primary"][value="other"]');
    const isOther = radio && radio.checked;
    const wrap = document.getElementById('call-transfer-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="call_transfer_primary_other"]');
      if (input) input.value = '';
    }
  }

  function toggleSalesHandlerOther() {
    const cb = document.querySelector('[name="sales_handler_other"]');
    const isOther = cb && cb.checked;
    const wrap = document.getElementById('sales-handler-other-wrap');
    revealToggle(wrap, isOther);
    if (!isOther && wrap) {
      const input = wrap.querySelector('[name="sales_handler_other_text"]');
      if (input) input.value = '';
    }
  }

  function toggleSalesDiscountNotes() {
    const checked = document.querySelector('[name="sales_discount_policy"]:checked');
    const show = !!checked && checked.value !== 'none';
    const wrap = document.getElementById('sales-discount-notes-wrap');
    revealToggle(wrap, show);
    if (!show && wrap) {
      const input = wrap.querySelector('[name="sales_discount_notes"]');
      if (input) input.value = '';
    }
  }

  function applyConditionals() {
    toggleParentBrand();
    toggleCrmOther();
    toggleAiPhone();
    toggleAiEmail();
    toggleMainCtaOther();
    toggleGoalOther();
    toggleHandoffRuleOther();
    toggleLeadSourceOther();
    toggleCallTransferOther();
    toggleSalesHandlerOther();
    toggleSalesDiscountNotes();
  }

  async function uploadLogo(file) {
    if (PREVIEW_MODE) return null; // unwired preview — no upload
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
    if (PREVIEW_MODE) return; // unwired preview — no network
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
      // TODO(defer-data): contact_first_name / contact_last_name are collected in the
      // UI ("Your details") but NOT sent yet — the location_intake_submissions table has
      // no columns for them. Add a migration (contact_first_name, contact_last_name text)
      // then wire: fd.get('contact_first_name') / fd.get('contact_last_name') here +
      // prefill in applyServerRowToForm + consume in provision-from-intake.
      hours: collectHours(fd),
      hours_confirmed: fd.get('hours_confirmed') === 'on',
      crm_platform: fd.get('crm_platform') || null,
      crm_platform_other: fd.get('crm_platform_other') || null,
      crm_store_id: fd.get('crm_store_id') || null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      crm_password: fd.get('crm_password') || null, // stored as plain text per George (crm_password column; revisit encryption pre-launch)
      ai_phone_mode: fd.get('ai_phone_mode') || null,
      ai_phone_number: fd.get('ai_phone_number') || null,
      ai_email_mode: fd.get('ai_email_mode') || null,
      ai_email_address: fd.get('ai_email_address') || null,
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
      // TODO(defer-data): goal keys are now new_leads/old_leads/current_members/current_phones
      // (current_former removed) and the reactivation_* fields were dropped; the follow-up
      // cadence field was removed (sms_cadence.followup_cadence no longer sent). provision-from-intake
      // + ClientOnboarding.tsx INTAKE_LABELS should be updated to the new automation_goals.goals vocabulary.
      automation_goals: {
        goals: collectAutomationGoals(fd),
        other_text: fd.get('goal_other_text') || null
      },
      // TODO(defer-data): escalation_triggers / escalation_triggers_other / call_transfer
      // and notification_config.recipients are new shapes. handoff_config &
      // notification_config are jsonb, so no migration is needed to STORE them, but
      // provision-from-intake + ClientOnboarding.tsx must be taught to read them
      // (route escalations to the chosen recipients/channels; ring call_transfer).
      handoff_config: {
        rules: collectHandoffRules(fd), // multi-select (was single `rule`) — defer-data: update provision/main app
        rule_other: fd.get('handoff_rule_other') || null,
        escalation_triggers: collectEscalationTriggers(fd),
        escalation_triggers_other: fd.get('esc_other') || null,
        call_transfer: {
          primary: fd.get('call_transfer_primary') || null,
          primary_other: fd.get('call_transfer_primary_other') || null
        }
      },
      notification_config: {
        recipients: parseJsonField(fd.get('notify_recipients'))
      },
      location_page_url: fd.get('location_page_url') || null,
      website_url: fd.get('website_url') || null,
      google_business_profile_url: fd.get('google_business_profile_url') || null,
      is_multi_location: fd.get('is_multi_location') === 'yes',
      parent_brand_name: fd.get('parent_brand_name') || null,
      parent_brand_other: fd.get('parent_brand_other') || null,
      booking_payment_link: fd.get('booking_payment_link') || null,
      instagram_handle: fd.get('instagram_handle') || null,
      facebook_page_url: fd.get('facebook_page_url') || null,
      tiktok_handle: fd.get('tiktok_handle') || null,
      notes: fd.get('notes') || null,
      honeypot: fd.get('honeypot') || null,
      user_agent: navigator.userAgent
    };
  }

  async function insertRow(payload) {
    if (PREVIEW_MODE) return; // unwired preview — no write
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
    if (PREVIEW_MODE) return; // unwired preview — no write
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
    if (PREVIEW_MODE) return null; // unwired preview — no draft load
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
    set('location_page_url', row.location_page_url);
    set('website_url', row.website_url);
    set('google_business_profile_url', row.google_business_profile_url);
    setRadio('is_multi_location', row.is_multi_location);
    set('parent_brand_name', row.parent_brand_name);
    set('parent_brand_other', row.parent_brand_other);
    set('booking_payment_link', row.booking_payment_link);

    const hoursConfirmedEl = form.elements['hours_confirmed'];
    if (hoursConfirmedEl) hoursConfirmedEl.checked = !!row.hours_confirmed;

    if (row.hours && typeof row.hours === 'object') {
      const grid = document.getElementById('hours-grid');
      for (const d of DAYS) {
        const h = row.hours[d];
        if (!h) continue;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        const isClosed = !!h.closed;
        if (closedEl) closedEl.checked = isClosed;
        if (!isClosed) {
          if (openEl && h.open) openEl.value = h.open;
          if (closeEl && h.close) closeEl.value = h.close;
        }
        if (grid) setDayDisabled(grid, d, isClosed);
      }
    }

    set('crm_platform', row.crm_platform);
    set('crm_platform_other', row.crm_platform_other);
    set('crm_store_id', row.crm_store_id);
    set('crm_account_confirmed', row.crm_account_confirmed);
    setRadio('ai_phone_mode', row.ai_phone_mode);
    set('ai_phone_number', row.ai_phone_number);
    setRadio('ai_email_mode', row.ai_email_mode);
    set('ai_email_address', row.ai_email_address);

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
    if (Array.isArray(ag)) {
      goalsArr = ag;
    } else if (ag && typeof ag === 'object') {
      goalsArr = Array.isArray(ag.goals) ? ag.goals : [];
      goalsOther = ag.other_text || null;
    }
    AUTOMATION_GOALS.forEach(g => {
      const cb = form.elements[`goal_${g}`];
      if (cb) cb.checked = goalsArr.includes(g);
    });
    set('goal_other_text', goalsOther);
    const hc = row.handoff_config || {};
    const handoffRules = Array.isArray(hc.rules) ? hc.rules : (hc.rule ? [hc.rule] : []); // back-compat: old drafts had a single `rule`
    HANDOFF_RULES.forEach(r => {
      const cb = form.elements[`handoff_${r}`];
      if (cb) cb.checked = handoffRules.includes(r);
    });
    set('handoff_rule_other', hc.rule_other);
    if (Array.isArray(hc.escalation_triggers)) {
      ESCALATION_TRIGGERS.forEach(t => {
        const cb = form.elements[`esc_${t}`];
        if (cb) cb.checked = hc.escalation_triggers.includes(t);
      });
    }
    set('esc_other', hc.escalation_triggers_other); // free-text textarea
    const ct = hc.call_transfer || {};
    setRadio('call_transfer_primary', ct.primary);
    set('call_transfer_primary_other', ct.primary_other);
    // notify_recipients restored after the user rows are rebuilt (see below).
    const nc = row.notification_config || {};

    const users = Array.isArray(row.dashboard_users) ? row.dashboard_users : [];
    const list = document.getElementById('users-list');
    if (users.length > 0) {
      list.innerHTML = '';
      users.forEach((u, i) => {
        list.insertAdjacentHTML('beforeend', userRowHTML(i));
        const row = list.lastElementChild;
        row.querySelector('[name$="_name"]').value = u.name || '';
        row.querySelector('[name$="_email"]').value = u.email || '';
        const phoneEl = row.querySelector('[name$="_phone"]');
        if (phoneEl) phoneEl.value = u.phone || '';
        const roleEl = row.querySelector('[name$="_role"]');
        if (roleEl) roleEl.value = u.role || '';
      });
      userCounter = users.length;
    }

    set('notes', row.notes);

    // Now that the Team access rows exist, restore the per-person notify picks
    // (or render fresh defaults from the prefilled contact + teammates).
    if (Array.isArray(nc.recipients)) restoreNotifyState(nc.recipients);
    else renderNotifyList();

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

    // Required chip/token fields: a hidden value-holder can't be browser-required,
    // so enforce "at least one pill" here. Push the focusable entry so focus lands.
    form.querySelectorAll('.chips-input[data-required]').forEach((box) => {
      if (box.offsetParent === null) return;
      const hidden = box.querySelector('input[type="hidden"]');
      if (!hidden || !(hidden.value || '').trim()) {
        problems.push(box.querySelector('.chips-entry'));
      }
    });

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
    if (collectHandoffRules(fd).length === 0) problems.push(form.querySelector('[name="handoff_never"]'));
    if (fd.get('handoff_other') === 'on' && !(fd.get('handoff_rule_other') || '').trim()) {
      problems.push(form.querySelector('[name="handoff_rule_other"]'));
    }
    if (fd.get('call_transfer_primary') === 'other' && !(fd.get('call_transfer_primary_other') || '').trim()) {
      problems.push(form.querySelector('[name="call_transfer_primary_other"]'));
    }
    if (!parseJsonField(fd.get('notify_recipients')).some(r => Array.isArray(r.channels) && r.channels.length)) {
      problems.push(form.querySelector('#notify-list .notify-on') || form.querySelector('#notify-list'));
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
    const chipsBox = el.closest('.chips-input');
    if (chipsBox) target = chipsBox; // highlight the whole token box, not the borderless entry
    else if (attestation) target = attestation;
    else if (fieldset) target = fieldset;
    target.classList.add('field-error');
    const clearHandler = () => target.classList.remove('field-error');
    target.addEventListener('input', clearHandler, { once: true });
    target.addEventListener('change', clearHandler, { once: true });
  }

  function hideError() {
    document.getElementById('error-box').hidden = true;
  }

  // ---- AI prefill: scrape the location page and fill what we can find ------
  // POSTs the URL to the scrape-location-page edge function, then applies the
  // returned (form-field-keyed) subset to ONLY the fields present in the
  // response. It deliberately never touches automation/handoff/users/notify,
  // so a client who already filled some fields can't lose them. Every filled
  // field is flagged "AI suggested" (cleared on first edit) and nothing is
  // auto-submitted (hours stay unconfirmed so the attestation forces review).
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
      if (key === 'hours' || key === 'is_multi_location') return; // handled below
      if (setField(key, s[key])) filled.push(key);
    });
    if (s.is_multi_location != null) {
      if (setField('is_multi_location', s.is_multi_location ? 'yes' : 'no')) filled.push('is_multi_location');
    }
    // Format any scraped phone to the form's (555) 123-4567 mask.
    ['business_phone', 'contact_phone'].forEach((n) => {
      const el = form.elements[n];
      if (el && el.value) el.value = formatPhoneValue(el.value);
    });
    // Hours grid (the edge function already snapped times to the 15-min options).
    if (s.hours && typeof s.hours === 'object') {
      const grid = document.getElementById('hours-grid');
      let any = false;
      DAYS.forEach((d) => {
        const h = s.hours[d];
        if (!h) return;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        const isClosed = !!h.closed;
        if (closedEl) closedEl.checked = isClosed;
        if (!isClosed) {
          if (openEl && h.open) openEl.value = h.open;
          if (closeEl && h.close) closeEl.value = h.close;
        }
        if (grid) setDayDisabled(grid, d, isClosed);
        any = true;
      });
      if (any) filled.push('hours');
    }
    // Parent brand: a recognized franchise that isn't in the dropdown (e.g. a
    // brand we don't serve yet) -> pick "Other" and drop the name in free text.
    // Independent businesses return no brand, so they stay blank.
    if (s.parent_brand_name) {
      const sel = form.elements['parent_brand_name'];
      if (sel && sel.tagName === 'SELECT' && !sel.value) {
        const hasOther = [].slice.call(sel.options).some((o) => o.value === 'other');
        if (hasOther) {
          sel.value = 'other';
          const otherEl = form.elements['parent_brand_other'];
          if (otherEl) { otherEl.value = s.parent_brand_name; if (filled.indexOf('parent_brand_other') < 0) filled.push('parent_brand_other'); }
          if (filled.indexOf('parent_brand_name') < 0) filled.push('parent_brand_name');
        }
      }
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
    // Fields shown with a section-level badge (no useful per-field label):
    // the hours grid and the social handles.
    const SECTION_FIELDS = {
      hours: 'hours_mon_closed',
      instagram_handle: 'instagram_handle',
      facebook_page_url: 'facebook_page_url',
      tiktok_handle: 'tiktok_handle',
    };
    const makeChip = (cls) => {
      const c = document.createElement('span');
      c.className = cls;
      c.textContent = 'AI suggested';
      return c;
    };
    const badgeSection = (sectionEl) => {
      if (!sectionEl) return;
      const h2 = sectionEl.querySelector('h2');
      if (h2 && !h2.querySelector('.ai-suggested-badge')) h2.appendChild(makeChip('ai-suggested-badge'));
    };
    (names || []).forEach((name) => {
      // Section badge: hours grid + social handles.
      if (SECTION_FIELDS[name]) {
        const ref = form.elements[SECTION_FIELDS[name]];
        if (ref && ref.closest) badgeSection(ref.closest('section'));
        return;
      }
      const el = form.elements[name];
      if (!el) return;
      const isGroup = (typeof el.length === 'number' && el.tagName === undefined);
      const node = isGroup ? el[0] : el;
      if (!node || !node.closest) return;
      // Radio/checkbox group: chip after the fieldset legend.
      if (isGroup) {
        const fs = node.closest('fieldset');
        const legend = fs ? fs.querySelector('legend') : null;
        if (legend && !legend.querySelector('.ai-suggested-chip')) legend.appendChild(makeChip('ai-suggested-chip'));
        if (legend) {
          const clearG = () => { const c = legend.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
          [].slice.call(el).forEach((t) => t.addEventListener('change', clearG, { once: true }));
        }
        return;
      }
      // Single control: inline chip right after the label text + required marker
      // (inserted before the field's control, a direct child of the label).
      const label = node.closest('label');
      if (label && !label.querySelector('.ai-suggested-chip')) {
        let anchor = null;
        for (const child of label.children) {
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(child.tagName) ||
              (child.classList && child.classList.contains('chips-input'))) { anchor = child; break; }
        }
        label.insertBefore(makeChip('ai-suggested-chip'), anchor);
        const clear = () => { const c = label.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
        node.addEventListener('input', clear, { once: true });
        node.addEventListener('change', clear, { once: true });
      }
    });
  }

  async function runPrefill(url, btn) {
    if (PREVIEW_MODE) { setPrefillStatus('Preview only — AI pre-fill runs on the live form.', 'success'); return; }
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
      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/scrape-location-page`, {
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
      syncChipsFromValues();
      renderNotifyList();
      updateProgressBar();
      markAiSuggested(filled);
      const n = filled.length;
      if (n) scheduleAutoSave(); // persist the prefilled data right away
      setPrefillStatus(
        n
          ? `✓ Done. Filled in ${n} field${n === 1 ? '' : 's'} from your page, each marked "AI suggested." Review and confirm them before you submit.`
          : 'We could not pull much from that page. Please fill the form in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
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
    if (PREVIEW_MODE) { showError('Preview only — this is an unwired design preview, so drafts are not saved.'); return; }
    hideError();
    // Drive every Save-as-draft button (top + bottom) together.
    const btns = Array.from(document.querySelectorAll('.js-save-draft'));
    const setBtns = (text, disabled) => btns.forEach(b => { b.textContent = text; b.disabled = disabled; });
    setBtns('Saving...', true);
    try {
      const logoFile = document.getElementById('logo-input').files[0];
      const payload = buildPayload('draft');
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          showError('Logo is over 2MB. Please use a smaller image.');
          setBtns('Save as draft', false);
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
      setBtns('Saved \u2713', true);
      setAutoSaveStatus('All changes saved');
      setTimeout(() => setBtns('Save as draft', false), 1500);
    } catch (err) {
      console.error(err);
      showError(`Draft save failed: ${err.message}`);
      setBtns('Save as draft', false);
    }
  }

  // ---- Auto-save: once a draft exists, debounce-save every edit to it ----
  let autoSaveTimer = null;
  function setAutoSaveStatus(text) {
    const el = document.getElementById('autosave-status');
    if (el) el.textContent = text || '';
  }
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    setAutoSaveStatus('Saving…');
    autoSaveTimer = setTimeout(autoSaveDraft, 1200);
  }
  // Auto-create the draft row on first real interaction, so an abandoned form is
  // still captured (we store the whole time, not just after a manual save).
  // Honeypot-guarded + requires some real content so we never store empty/bot rows.
  let draftCreating = null;
  function hasMeaningfulContent() {
    const form = document.getElementById('intake-form');
    if (!form) return false;
    const keys = ['location_page_url', 'business_name', 'contact_first_name', 'contact_last_name',
      'contact_email', 'contact_phone', 'business_email'];
    return keys.some((k) => form.elements[k] && String(form.elements[k].value || '').trim());
  }
  async function ensureDraft() {
    if (PREVIEW_MODE) return null; // unwired preview — no draft autosave
    if (draftId) return draftId;
    if (draftCreating) return draftCreating;
    const form = document.getElementById('intake-form');
    if (form && form.elements['honeypot'] && String(form.elements['honeypot'].value || '').trim()) return null;
    if (!hasMeaningfulContent()) return null;
    draftCreating = (async () => {
      const payload = buildPayload('draft');
      const newId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
      payload.id = newId;
      await insertRow(payload);
      draftId = newId;
      setDraftIdInUrl(newId); // lets them resume on refresh; no visible panel (silent)
      return newId;
    })();
    try { return await draftCreating; }
    finally { draftCreating = null; }
  }
  async function autoSaveDraft() {
    try {
      if (!draftId) {
        const id = await ensureDraft(); // first save creates the row with current data
        if (!id) { setAutoSaveStatus(''); return; }
        setAutoSaveStatus('All changes saved');
        return;
      }
      await updateRow(draftId, buildPayload('draft'));
      setAutoSaveStatus('All changes saved');
    } catch (err) {
      console.error('Auto-save failed', err);
      setAutoSaveStatus('Not saved, we’ll try again on your next change');
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
    const leadSrcs = collectLeadSources(fd);
    const escTriggers = collectEscalationTriggers(fd);
    const notifyRecips = parseJsonField(fd.get('notify_recipients'));

    const multi = fd.get('is_multi_location') === 'yes';
    const brand = multi ? (fd.get('parent_brand_name') === 'other' ? dash(fd.get('parent_brand_other')) + ' (other)' : dash(fd.get('parent_brand_name'))) : 'Standalone';
    const crmDisplay = fd.get('crm_platform') === 'other' ? dash(fd.get('crm_platform_other')) + ' (other)' : label(fd.get('crm_platform')) || '—';
    const ctaDisplay = fd.get('main_cta') === 'other' ? dash(fd.get('main_cta_other')) + ' (other)' : label(fd.get('main_cta')) || '—';
    const handoffRulesArr = collectHandoffRules(fd);
    const handoffDisplay = handoffRulesArr.length
      ? handoffRulesArr.map(r => r === 'other' ? dash(fd.get('handoff_rule_other')) + ' (other)' : label(r)).join(', ')
      : '—';
    const tonesDisplay = tones.length ? tones.map(label).join(', ') : '—';
    const goalsDisplay = goals.length ? goals.map(label).join(', ') : '—';
    const leadsDisplay = leadSrcs.length ? leadSrcs.map(label).join(', ') : '—';
    const escDisplay = escTriggers.length ? escTriggers.map(label).join(', ') : '—';
    const ctPrimary = fd.get('call_transfer_primary');
    const callTransferDisplay = ctPrimary === 'other' ? dash(fd.get('call_transfer_primary_other')) : (label(ctPrimary) || '—');
    const notifyDisplay = notifyRecips.length
      ? notifyRecips.map(r => `${r.name || r.email || '(unnamed)'} — ${(r.channels || []).map(c => label(c)).join(' & ') || 'no channel'}`).join('\n')
      : '—';
    const voiceDisplay = label(fd.get('chatbot_voice')) || '—';

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
        heading: 'CRM/API Access',
        items: [
          ['Platform', crmDisplay],
          ['Admin account confirmed', fd.get('crm_account_confirmed') === 'on' ? 'Yes' : 'No'],
          ['API key provided', fd.get('crm_api_key') ? 'Yes' : 'No'],
          ['AI texts from', fd.get('ai_phone_mode') === 'dedicated' ? 'New dedicated number' : (dash(fd.get('ai_phone_number')) !== '—' ? dash(fd.get('ai_phone_number')) + ' (existing)' : 'Existing number')],
          ['AI emails from', fd.get('ai_email_mode') === 'dedicated' ? 'New dedicated email' : (dash(fd.get('ai_email_address')) !== '—' ? dash(fd.get('ai_email_address')) + ' (existing)' : 'Existing email')]
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
          ['AI Team Member voice', voiceDisplay],
          ['Voice specifics', dash(fd.get('chatbot_voice_notes'))],
          ['AI Team Member tone', tonesDisplay],
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
        heading: 'Interactions & Follow-ups',
        items: [
          ['Interacts with', goalsDisplay],
          ...(fd.get('goal_other') === 'on' ? [['Other', dash(fd.get('goal_other_text'))]] : [])
        ]
      },
      {
        heading: 'Handoff & Notifications',
        items: [
          ['Handoff rule', handoffDisplay],
          ['Text escalation triggers', escDisplay],
          ...(dash(fd.get('esc_other')) !== '—' ? [['Other triggers', dash(fd.get('esc_other'))]] : []),
          ['Live call transfer', callTransferDisplay],
          ['Notify', notifyDisplay]
        ]
      },
      {
        heading: 'Anything Else?',
        items: [
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

      clearAllErrors();
      const problems = findAllProblems();
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
    if (PREVIEW_MODE) { closeSubmitConfirm(); showError('Preview only — this is an unwired design preview, so nothing was submitted.'); return; }
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

      // (Preview build: the confirmation-email call has been removed. This code
      // path is unreachable anyway — doFinalSubmit() returns early in PREVIEW_MODE.)

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

  // Info-entry box types that count toward progress (checkboxes/radios/toggles
  // are choices, not "filling out information into a box", so they're excluded).
  // NOTE: 'time' is intentionally excluded — the hours grid pre-fills 09:00/17:00
  // defaults, which would otherwise count as "filled" and start the bar above 0%.
  const PROGRESS_INPUT_TYPES = ['text', 'email', 'tel', 'url', 'date', 'number', 'search', 'password', ''];

  function computeProgress() {
    // Count every visible, enabled info box in the form (text inputs, selects,
    // textareas) so the bar advances each time the user fills any field.
    // (The old curated PROGRESS_FIELDS list is kept above for easy revert.)
    const form = document.getElementById('intake-form');
    if (!form) return { filled: 0, total: 1 };
    const controls = Array.from(form.querySelectorAll('input, select, textarea'));
    let total = 0;
    let filled = 0;
    controls.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.classList.contains('chips-entry')) return; // chip text box is the editor, not a field — counted via its container below
      if (tag === 'input' && !PROGRESS_INPUT_TYPES.includes(type)) return; // skip checkbox/radio/file/hidden/etc.
      if (el.name === 'honeypot') return;
      if (el.name && el.name.startsWith('hours_')) return; // hours picker selects carry defaults; don't inflate progress
      if (el.disabled || el.readOnly) return; // not user-fillable (e.g. the readonly admin-email display field)
      if (el.offsetParent === null) return; // hidden: display:none, collapsed conditional, or repeater template row
      total++;
      if ((el.value || '').trim() !== '') filled++;
    });
    // Chip/token fields: each visible box is one info box, filled when it holds ≥1 chip.
    // (Its hidden value-holder is type=hidden, so the loop above already skips it.)
    form.querySelectorAll('.chips-input').forEach((box) => {
      if (box.offsetParent === null) return;
      total++;
      const hidden = box.querySelector('input[type="hidden"]');
      if (hidden && (hidden.value || '').trim() !== '') filled++;
    });
    return { filled, total: total || 1 };
  }

  function updateProgressBar() {
    const { filled, total } = computeProgress();
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

    // Thin top-edge bar
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = pct + '%';
    const bar = document.querySelector('.progress-bar');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
    const text = document.getElementById('progress-text');
    if (text) text.textContent = `${pct}% complete`;

    // Sticky scroll toolbar (appears once the header scrolls away)
    const sFill = document.getElementById('scroll-progress-fill');
    if (sFill) sFill.style.width = pct + '%';
    const sText = document.getElementById('scroll-progress-text');
    if (sText) sText.textContent = `${pct}%`;
    const sBar = document.getElementById('scroll-progress');
    if (sBar) sBar.setAttribute('aria-valuenow', String(pct));
  }

  function initProgressBar() {
    updateProgressBar();
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', updateProgressBar);
    form.addEventListener('change', updateProgressBar);
    form.addEventListener('input', scheduleAutoSave);
    form.addEventListener('change', scheduleAutoSave);
  }

  // Show the compact progress toolbar only after the navy header is scrolled out of view.
  function initScrollProgress() {
    const toolbar = document.getElementById('scroll-progress');
    const header = document.querySelector('.site-header');
    if (!toolbar || !header) return;
    function onScroll() {
      const trigger = header.offsetTop + header.offsetHeight - 8;
      toolbar.classList.toggle('is-visible', window.scrollY > trigger);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  // Sticky left-gutter "quick view" navigator. Built from the live form so it
  // never drifts: each .part-divider becomes a group label, each <section>
  // becomes a jump link. Smooth-scrolls with a top offset, highlights the
  // current section (scrollspy), and fades in once the header scrolls away.
  function initSectionNav() {
    const form = document.getElementById('intake-form');
    const nav = document.getElementById('section-nav');
    if (!form || !nav) return;

    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const sectionEls = [];
    let html = '<div class="section-nav__title">Quick view</div>';

    Array.from(form.children).forEach((el) => {
      if (el.classList && el.classList.contains('part-divider')) {
        const t = el.querySelector('.part-title');
        if (t) html += `<div class="section-nav__group">${t.textContent.trim()}</div>`;
      } else if (el.tagName === 'SECTION') {
        const h2 = el.querySelector('h2');
        if (!h2) return;
        const clone = h2.cloneNode(true);
        clone.querySelectorAll('.optional-tag').forEach((o) => o.remove());
        const label = clone.textContent.trim();
        if (!el.id) el.id = 'sec-' + slug(label);
        sectionEls.push(el);
        html += `<a class="section-nav__link" href="#${el.id}" data-target="${el.id}">${label}</a>`;
      }
    });
    nav.innerHTML = html;

    const linkFor = (id) => nav.querySelector(`.section-nav__link[data-target="${id}"]`);

    nav.addEventListener('click', (e) => {
      const a = e.target.closest('.section-nav__link');
      if (!a) return;
      e.preventDefault();
      const target = document.getElementById(a.dataset.target);
      if (!target) return;
      const y = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });

    // Scrollspy: highlight the topmost section currently in the upper band.
    if ('IntersectionObserver' in window) {
      const visible = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) visible.add(en.target.id);
          else visible.delete(en.target.id);
        });
        const activeId = sectionEls.map((s) => s.id).find((id) => visible.has(id));
        nav.querySelectorAll('.section-nav__link.is-active').forEach((l) => l.classList.remove('is-active'));
        if (activeId) {
          const l = linkFor(activeId);
          if (l) l.classList.add('is-active');
        }
      }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
      sectionEls.forEach((s) => io.observe(s));
    }

    // Show only after the header has scrolled away (mirrors the scroll-progress bar).
    const header = document.querySelector('.site-header');
    function onScroll() {
      const trigger = header ? header.offsetTop + header.offsetHeight - 8 : 200;
      nav.classList.toggle('is-visible', window.scrollY > trigger);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  // Dark / light theme toggle. The saved theme is also applied pre-paint by an
  // inline <head> script (no flash); this wires the button + persistence.
  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    const root = document.documentElement;
    if (!btn) return;
    btn.addEventListener('click', () => {
      const goingDark = root.getAttribute('data-theme') !== 'dark';
      if (goingDark) root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      try { localStorage.setItem('velocity-intake-theme', goingDark ? 'dark' : 'light'); } catch (e) {}
    });
  }

  // Fill the AI-voice examples with the entered studio name (live).
  function updateStudioExamples() {
    const nameEl = document.querySelector('[name="business_name"]');
    const studio = (nameEl && nameEl.value.trim()) || 'your studio';
    document.querySelectorAll('.voice-option__example').forEach(el => {
      const tpl = el.getAttribute('data-example') || '';
      el.textContent = tpl.replace(/\{studio\}/g, studio);
    });
  }
  function initStudioExamples() {
    const nameEl = document.querySelector('[name="business_name"]');
    if (nameEl) nameEl.addEventListener('input', updateStudioExamples);
    updateStudioExamples();
  }

  function initMinLaunchDate() {
    const el = document.querySelector('[name="target_launch_date"]');
    if (!el) return;
    const today = new Date().toISOString().split('T')[0];
    el.min = today;
  }

  // ---- Tokenized chip inputs (Voice & tone: words to use / words to avoid) ----
  // Each committed phrase renders as a removable pill; the canonical value lives
  // in a sibling hidden <input> as a newline-joined string — identical to what
  // the old textareas produced, so buildPayload(), prefill, and the main app are
  // unchanged. Comma / Enter / blur commit; Backspace on an empty entry re-edits
  // the last chip; pasting a comma/newline list splits into multiple chips.
  function setupChipBox(box) {
    if (box.dataset.chipsReady === '1') return;
    box.dataset.chipsReady = '1';
    const entry = box.querySelector('.chips-entry');
    const hidden = box.querySelector('input[type="hidden"]');
    if (!entry || !hidden) return;

    const getValues = () => (hidden.value ? hidden.value.split('\n') : [])
      .map(s => s.trim()).filter(Boolean);

    function render(values) {
      box.querySelectorAll('.chip').forEach(c => c.remove());
      values.forEach((val, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const lbl = document.createElement('span');
        lbl.className = 'chip__label';
        lbl.textContent = val;
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'chip__remove';
        rm.setAttribute('aria-label', `Remove ${val}`);
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          const next = getValues();
          next.splice(i, 1);
          commit(next);
          entry.focus();
        });
        chip.appendChild(lbl);
        chip.appendChild(rm);
        box.insertBefore(chip, entry);
      });
    }

    function commit(values) {
      const seen = new Set();
      const clean = [];
      values.forEach(v => {
        const t = String(v).trim();
        if (!t) return;
        const k = t.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        clean.push(t);
      });
      hidden.value = clean.join('\n');
      render(clean);
      // Fire input so the form-level listeners (progress bar + auto-save) react.
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function addFromText(text) {
      commit(getValues().concat(String(text).split(/[,\n]/)));
      entry.value = '';
    }

    // Expose a re-render so a draft prefill (which sets hidden.value directly)
    // can rebuild the chips after the fact.
    box._renderChips = () => render(getValues());

    entry.addEventListener('keydown', (e) => {
      if (e.key === ',' || e.key === 'Enter') {
        e.preventDefault();
        if (entry.value.trim()) addFromText(entry.value);
      } else if (e.key === 'Backspace' && entry.value === '') {
        const vals = getValues();
        if (vals.length) {
          e.preventDefault();
          const last = vals.pop();
          commit(vals);
          entry.value = last;
        }
      }
    });
    // Catch a comma typed via mobile keyboards / IME (no keydown ',' event).
    entry.addEventListener('input', () => {
      if (entry.value.includes(',')) addFromText(entry.value);
    });
    entry.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (text && /[,\n]/.test(text)) {
        e.preventDefault();
        addFromText(entry.value + text);
      }
    });
    entry.addEventListener('blur', () => {
      box.classList.remove('is-focused');
      if (entry.value.trim()) addFromText(entry.value); // don't lose a half-typed phrase
    });
    entry.addEventListener('focus', () => box.classList.add('is-focused'));
    // Clicking blank space in the box focuses the entry.
    box.addEventListener('mousedown', (e) => {
      if (e.target === box) { e.preventDefault(); entry.focus(); }
    });

    render(getValues());
  }

  function initChips() {
    document.querySelectorAll('.chips-input').forEach(setupChipBox);
  }

  function syncChipsFromValues() {
    document.querySelectorAll('.chips-input').forEach((box) => {
      if (typeof box._renderChips === 'function') box._renderChips();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    clearStaleLocalStorage();
    renderHours();
    renderUsers();
    initMinLaunchDate();
    initProgressBar();
    initScrollProgress();
    initSectionNav();
    initThemeToggle();
    initStudioExamples();
    initChips();
    initNotifyList();
    initPhoneFormatting();
    initPrefillButton();

    await initDraftFromUrl();
    syncChipsFromValues();
    renderNotifyList();
    updateProgressBar();

    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'is_multi_location') toggleParentBrand();
      if (e.target.name === 'parent_brand_name') toggleBrandSpecificFields();
      if (e.target.name === 'crm_platform') toggleCrmOther();
      if (e.target.name === 'ai_phone_mode') toggleAiPhone();
      if (e.target.name === 'ai_email_mode') toggleAiEmail();
      if (e.target.name === 'main_cta') toggleMainCtaOther();
      if (e.target.name === 'goal_other') toggleGoalOther();
      if (e.target.name === 'handoff_other') toggleHandoffRuleOther();
      if (e.target.name === 'lead_source_other') toggleLeadSourceOther();
      if (e.target.name === 'call_transfer_primary') toggleCallTransferOther();
      if (e.target.name === 'sales_handler_other') toggleSalesHandlerOther();
      if (e.target.name === 'sales_discount_policy') toggleSalesDiscountNotes();
      if (/^(contact_first_name|contact_last_name|contact_email|contact_phone)$/.test(e.target.name) ||
          /^user_\d+_(name|email|phone|role)$/.test(e.target.name)) renderNotifyList();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
    document.querySelectorAll('.js-save-draft').forEach(b => b.addEventListener('click', handleSaveDraft));

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
