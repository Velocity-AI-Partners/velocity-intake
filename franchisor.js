// beem Light Sauna — Franchisor Onboarding (standalone one-off form).
// Collect-and-review only: rows land in franchisor_intake_submissions and are
// viewed on the main app's /client-onboarding page. Nothing here provisions
// anything.
(() => {
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'franchisor_intake_submissions';
  const BUCKET = 'intake-logos';
  const FORM_VARIANT = 'beem';
  // AI pre-fill calls the scrape-location-page edge function (shared with the
  // redesign form). If it isn't deployed yet, pre-fill degrades to a friendly
  // "fill it in manually" message — the rest of the form is unaffected.
  const FUNCTIONS_BASE = SUPABASE_URL;

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // ===========================================================================
  // FORM CONTENT CONFIG — edit the questions here.
  //
  // Each section: { id, title, lead, fields: [...] }
  // Each field:
  //   name        - key the answer is stored under
  //   label       - question text shown to the client
  //   type        - text | email | tel | url | date | textarea | select | checkboxes
  //                 | logo (brand logo upload) | users (people repeater w/ role)
  //                 | person (single first/last/email/phone row)
  //                 | people (first/last/email/phone repeater)
  //                 | hours (7-day open/close grid)
  //                 | locations (location repeater)
  //                 | prefill-url (page link + AI Pre-fill button)
  //   col         - store in this flat DB column (omit to store in the
  //                 section's jsonb bucket instead)
  //   virtual     - collected specially in buildPayload (not a direct column)
  //   required    - true to require before submit
  //   placeholder / help / options / rows / value - presentation + defaults
  //
  // Sections with `bucket` store their answers as one jsonb object in that
  // column, so adding/removing questions here needs NO database change.
  // ===========================================================================
  const FORM_SECTIONS = [
    {
      id: 'brand',
      title: '1. Your franchise',
      // Contact + socials defaults verified 2026-07-06: contacts provided by
      // George; socials read from beemlightsauna.com's own footer. No TikTok
      // link exists on their site, so that field stays empty.
      fields: [
        { name: 'brand_name', col: 'brand_name', label: 'Brand name', type: 'text', required: true, value: 'beem Light Sauna' },
        { name: 'contact_first_name', virtual: true, label: 'Primary contact — first name', type: 'text', required: true, value: 'Veronica' },
        { name: 'contact_last_name', virtual: true, label: 'Primary contact — last name', type: 'text', required: true, value: 'Stranc' },
        { name: 'contact_email', col: 'contact_email', label: 'Primary contact email', type: 'email', required: true, value: 'vstranc@beemlightsauna.com' },
        { name: 'additional_contacts', col: 'additional_contacts', label: 'Additional contacts — who at corporate needs dashboard access?', type: 'users', help: 'Email is required for each person. These become your corporate logins with the franchise-wide view.' },
        { name: 'website_url', col: 'website_url', label: 'Brand website', type: 'url', value: 'https://www.beemlightsauna.com/', placeholder: 'https://' },
        { name: 'instagram', label: 'Instagram', type: 'text', value: '@beemlightsauna', placeholder: '@handle' },
        { name: 'facebook', label: 'Facebook page', type: 'url', value: 'https://www.facebook.com/beemlightsauna/', placeholder: 'https://facebook.com/...' },
        { name: 'linkedin', label: 'LinkedIn', type: 'url', value: 'https://www.linkedin.com/company/beemlightsauna', placeholder: 'https://linkedin.com/company/...' },
        { name: 'youtube', label: 'YouTube', type: 'url', value: 'https://youtube.com/@beemlightsauna', placeholder: 'https://youtube.com/@...' },
        { name: 'tiktok', label: 'TikTok', type: 'text', placeholder: '@handle' },
      ],
      bucket: 'socials',
      bucketFields: ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'],
    },
    {
      id: 'locations',
      title: '2. Your locations',
      lead: 'Add every location you’re onboarding. Each becomes its own sub-account under your brand. You can start with a few and send us the rest later.',
      bucket: 'locations',
      fields: [
        { name: 'locations', label: '', type: 'locations' },
      ],
    },
    {
      id: 'knowledge',
      title: '3. Brand-wide knowledge base',
      lead: 'Answered once, applied across all locations. This is what your AI team members know about beem when they talk to your customers.',
      bucket: 'brand_knowledge',
      fields: [
        { name: 'service_description', label: 'Describe your services as you’d explain them to a brand-new customer', type: 'textarea', rows: 4, required: true },
        { name: 'pricing_structure', label: 'Membership & package pricing structure', type: 'textarea', rows: 4, placeholder: 'Brand-wide structure; note anything that varies by location.' },
        { name: 'intro_offer', label: 'Intro / first-visit offer', type: 'text' },
        { name: 'cancellation_policy', label: 'Cancellation & rescheduling policy', type: 'textarea', rows: 3 },
        { name: 'ideal_client', label: 'Who is your ideal client?', type: 'textarea', rows: 3 },
        { name: 'unique_value', label: 'What makes beem different?', type: 'textarea', rows: 3 },
        { name: 'voice_tone', label: 'How should the AI sound when it speaks for your brand?', type: 'textarea', rows: 3, placeholder: 'e.g. warm and knowledgeable, energetic, calm and spa-like...' },
        { name: 'approved_phrases', label: 'Phrases you love (use these)', type: 'textarea', rows: 3 },
        { name: 'avoid_words', label: 'Words or claims to avoid', type: 'textarea', rows: 3, placeholder: 'Compliance rules, health claims to avoid, banned wording...' },
        { name: 'faq', label: 'Top questions customers ask — and your answers', type: 'textarea', rows: 5 },
      ],
    },
    {
      id: 'rollout',
      title: '4. Rollout & anything else',
      lead: 'Targets and timing.',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'kpi_targets', label: 'Brand KPI targets', type: 'textarea', rows: 3, placeholder: 'e.g. show-rate goals, membership targets, reactivation goals...' },
        { name: 'launch_timeline', label: 'Target launch timeline', type: 'text', placeholder: 'e.g. first 3 locations by September' },
        { name: 'notes', col: 'notes', label: 'Anything else we should know?', type: 'textarea', rows: 4 },
      ],
    },
  ];

  const LOCATION_FIELDS = [
    { name: 'page_url', label: 'This location’s web page — paste it and hit Pre-fill to go faster', type: 'prefill-url', placeholder: 'https://.../locations/your-city' },
    { name: 'name', label: 'Location name', type: 'text', placeholder: 'e.g. beem Light Sauna — Scottsdale', required: true },
    { name: 'address', label: 'Street address', type: 'text' },
    { name: 'city_state', label: 'City & state', type: 'text' },
    { name: 'zip', label: 'Zip code', type: 'text' },
    { name: 'timezone', label: 'Timezone', type: 'select', options: [
      { value: '', label: 'Select timezone' },
      { value: 'America/New_York', label: 'Eastern' },
      { value: 'America/Chicago', label: 'Central' },
      { value: 'America/Denver', label: 'Mountain' },
      { value: 'America/Phoenix', label: 'Arizona (no DST)' },
      { value: 'America/Los_Angeles', label: 'Pacific' },
    ]},
    { name: 'hours', label: 'Operating hours', type: 'hours' },
    { name: 'studio_phone', label: 'Studio phone (public)', type: 'tel' },
    { name: 'crm_platform', label: 'Booking / CRM platform', type: 'text', placeholder: 'e.g. Mindbody, Zenoti, GoHighLevel' },
    { name: 'crm_store_id', label: 'CRM store / location ID (if known)', type: 'text' },
    { name: 'gm', label: 'General manager', type: 'person' },
    { name: 'location_users', label: 'Who else at this location needs access?', type: 'people', help: 'Email required for each person.' },
    { name: 'notes', label: 'Notes for this location', type: 'textarea', rows: 2 },
  ];

  // --- Preset data (applied on a fresh form; skipped when resuming a draft) ---
  // Location details verified from each studio's own page on beemlightsauna.com
  // (2026-07-06). Glenwood's hours are not published on its page, so its grid
  // keeps the neutral form defaults — never guessed. Timezones follow the
  // studio's state. Booking platform is Mindbody across all four (George).
  const PRESET_LOCATIONS = [
    {
      page_url: 'https://www.beemlightsauna.com/location/glenwood',
      name: 'beem Atlanta Glenwood',
      address: '475 Bill Kennedy Wy Sta A',
      city_state: 'Atlanta, GA',
      zip: '30316',
      timezone: 'America/New_York',
      studio_phone: '(404) 973-2288',
      crm_platform: 'Mindbody',
    },
    {
      page_url: 'https://www.beemlightsauna.com/location/nashville-green-hills',
      name: 'beem Nashville - Green Hills',
      address: '3760 Hillsboro Pike',
      city_state: 'Nashville, TN',
      zip: '37215',
      timezone: 'America/Chicago',
      studio_phone: '(615) 600-4044',
      crm_platform: 'Mindbody',
      hours: {
        mon: { open: '07:00', close: '19:00' }, tue: { open: '07:00', close: '19:00' },
        wed: { open: '07:00', close: '19:00' }, thu: { open: '07:00', close: '19:00' },
        fri: { open: '08:00', close: '17:00' }, sat: { open: '08:00', close: '16:00' },
        sun: { open: '10:00', close: '16:00' },
      },
    },
    {
      page_url: 'https://www.beemlightsauna.com/location/summerville',
      name: 'beem Summerville',
      address: '100 Gosling Way, Suite B',
      city_state: 'Summerville, SC',
      zip: '29486',
      timezone: 'America/New_York',
      studio_phone: '(843) 788-9288',
      crm_platform: 'Mindbody',
      hours: {
        mon: { open: '08:00', close: '20:00' }, tue: { open: '08:00', close: '20:00' },
        wed: { open: '08:00', close: '20:00' }, thu: { open: '08:00', close: '20:00' },
        fri: { open: '08:00', close: '20:00' }, sat: { open: '11:00', close: '15:00' },
        sun: { open: '11:00', close: '15:00' },
      },
    },
    {
      page_url: 'https://www.beemlightsauna.com/studio/west-mckinney',
      name: 'beem West McKinney',
      address: '4041 S Custer Rd, Unit 2150',
      city_state: 'McKinney, TX',
      zip: '75070',
      timezone: 'America/Chicago',
      studio_phone: '(469) 343-4991',
      crm_platform: 'Mindbody',
      hours: {
        mon: { open: '08:00', close: '20:00' }, tue: { open: '08:00', close: '20:00' },
        wed: { open: '08:00', close: '20:00' }, thu: { open: '08:00', close: '20:00' },
        fri: { open: '08:00', close: '17:00' }, sat: { open: '09:00', close: '15:00' },
        sun: { open: '11:00', close: '16:00' },
      },
    },
  ];

  // Additional corporate contacts preset (provided by George 2026-07-06).
  const PRESET_CONTACTS = [
    { first_name: 'Jesse', last_name: 'Kern', email: 'jkern@beemlightsauna.com' },
  ];
  // ========================= end of content config ===========================

  let draftId = null;
  let existingLogoUrl = null;
  let locationCounter = 0;
  let userCounter = 0;
  let peopleCounter = 0;

  // --- Small helpers ---------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function getDraftIdFromUrl() {
    const m = window.location.search.match(/[?&]draft=([0-9a-fA-F-]{36})\b/);
    return m ? m[1] : null;
  }

  function setDraftIdInUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('draft', id);
    window.history.replaceState({}, '', url.toString());
  }

  function generateUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Combined time <select> (ported from the redesign form): every 15 min,
  // value "HH:MM" (24h), label "h:mm AM/PM" so the time reads as one unit —
  // no native time-picker popup, no clock icon.
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

  // Scraped hours can land on any minute; snap to the picker's 15-min grid.
  function snapToQuarterHour(hhmm) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
    if (!m) return null;
    let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    min = Math.round(min / 15) * 15;
    if (min === 60) { min = 0; h = (h + 1) % 24; }
    return `${pad2(h)}:${pad2(min)}`;
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

  // --- Person rows -------------------------------------------------------------
  // Every person on this form is first name / last name / email — no phone, no
  // role, for anyone (George 2026-07-06). Location phone lives on the location
  // itself (studio_phone), not on people.
  function personInputsHTML(prefix) {
    return `
        <input type="text" name="${prefix}_first_name" placeholder="First name">
        <input type="text" name="${prefix}_last_name" placeholder="Last name">
        <input type="email" name="${prefix}_email" placeholder="Email *">`;
  }

  function collectPerson(prefix) {
    const val = (n) => {
      const el = document.querySelector(`[name="${prefix}_${n}"]`);
      return el ? el.value.trim() : '';
    };
    return { first_name: val('first_name'), last_name: val('last_name'), email: val('email') };
  }

  function personHasData(p) {
    return !!(p.first_name || p.last_name || p.email);
  }

  function applyPerson(prefix, p) {
    if (!p || typeof p !== 'object') return;
    ['first_name', 'last_name', 'email'].forEach(n => {
      const el = document.querySelector(`[name="${prefix}_${n}"]`);
      if (el && p[n] != null) el.value = p[n];
    });
  }

  // --- Render engine ---------------------------------------------------------
  function fieldHTML(f, namePrefix) {
    const name = namePrefix ? `${namePrefix}_${f.name}` : f.name;
    const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const help = f.help ? `<p class="field-help">${esc(f.help)}</p>` : '';
    let control = '';
    if (f.type === 'textarea') {
      control = `<textarea name="${name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
    } else if (f.type === 'select') {
      control = `<select name="${name}">${(f.options || []).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'checkboxes') {
      control = `<div class="checkbox-group">${(f.options || []).map(o => `
        <label class="checkbox-row"><input type="checkbox" name="${name}" value="${esc(o.value)}"> <span>${esc(o.label)}</span></label>`).join('')}</div>`;
    } else if (f.type === 'logo') {
      control = `
        <input type="file" name="${name}" id="logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp">
        <p class="field-help" id="logo-status" hidden></p>`;
    } else if (f.type === 'users') {
      control = `<div id="users-rows"></div><button type="button" class="btn-add" id="add-user">+ Add person</button>`;
    } else if (f.type === 'person') {
      control = `<div class="repeat-row repeat-row--person">${personInputsHTML(name)}</div>`;
    } else if (f.type === 'people') {
      control = `<div class="people-rows" data-prefix="${name}"></div><button type="button" class="btn-add add-person-row" data-prefix="${name}">+ Add person</button>`;
    } else if (f.type === 'hours') {
      control = `<div class="hours-grid" data-prefix="${name}">${DAYS.map(d => `
        <div class="day-label">${DAY_LABELS[d]}</div>
        ${timePickerHTML(`${name}_${d}_open`, '09:00')}
        <span class="hours-to">to</span>
        ${timePickerHTML(`${name}_${d}_close`, '17:00')}
        <label class="closed-wrap"><input type="checkbox" name="${name}_${d}_closed"> closed</label>`).join('')}</div>`;
    } else if (f.type === 'locations') {
      control = `<div id="locations-rows"></div><button type="button" class="btn-add" id="add-location">+ Add location</button>`;
    } else if (f.type === 'prefill-url') {
      control = `
        <div class="prefill-inline-row">
          <input type="url" name="${name}" placeholder="${esc(f.placeholder || '')}">
          <button type="button" class="btn-prefill btn-prefill--inline loc-prefill-btn" data-input="${name}">Pre-fill</button>
        </div>
        <span class="prefill-status loc-prefill-status" aria-live="polite"></span>`;
    } else {
      control = `<input type="${f.type}" name="${name}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}">`;
    }
    const labelHTML = f.label ? `<label>${esc(f.label)}${req}</label>` : '';
    return `<div class="field" data-field="${name}">${labelHTML}${help}${control}</div>`;
  }

  function renderSections() {
    const root = $('#sections-root');
    root.innerHTML = FORM_SECTIONS.map(s => `
      <section class="form-section" id="section-${s.id}">
        <h2>${esc(s.title)}</h2>
        ${s.lead ? `<p class="section-lead">${esc(s.lead)}</p>` : ''}
        <div class="section-fields">${s.fields.map(f => fieldHTML(f)).join('')}</div>
      </section>`).join('');
  }

  // --- Corporate additional-contacts repeater (with role) ----------------------
  function addUser() {
    const rows = $('#users-rows');
    const i = userCounter++;
    rows.insertAdjacentHTML('beforeend', `
      <div class="repeat-row repeat-row--contact" data-user="${i}">
        ${personInputsHTML(`corp_user_${i}`)}
        <button type="button" class="remove-row" aria-label="Remove person">&times;</button>
      </div>`);
  }

  function collectUsers() {
    return Array.from(document.querySelectorAll('#users-rows .repeat-row')).map(row =>
      collectPerson(`corp_user_${row.dataset.user}`)
    ).filter(personHasData);
  }

  // --- Per-location people repeater --------------------------------------------
  function addPersonRow(prefix) {
    const container = document.querySelector(`.people-rows[data-prefix="${prefix}"]`);
    if (!container) return null;
    const j = peopleCounter++;
    container.insertAdjacentHTML('beforeend', `
      <div class="repeat-row repeat-row--person" data-person="${prefix}_${j}">
        ${personInputsHTML(`${prefix}_${j}`)}
        <button type="button" class="remove-row" aria-label="Remove person">&times;</button>
      </div>`);
    return `${prefix}_${j}`;
  }

  function collectPeople(prefix) {
    const container = document.querySelector(`.people-rows[data-prefix="${prefix}"]`);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.repeat-row')).map(row =>
      collectPerson(row.dataset.person)
    ).filter(personHasData);
  }

  // --- Hours grid ----------------------------------------------------------------
  function collectHoursGrid(prefix) {
    const out = {};
    DAYS.forEach(d => {
      const open = document.querySelector(`[name="${prefix}_${d}_open"]`);
      const close = document.querySelector(`[name="${prefix}_${d}_close"]`);
      const closed = document.querySelector(`[name="${prefix}_${d}_closed"]`);
      if (!open || !close || !closed) return;
      out[d] = closed.checked ? { closed: true } : { open: open.value, close: close.value };
    });
    return out;
  }

  function applyHoursGrid(prefix, hours) {
    if (!hours || typeof hours !== 'object') return;
    DAYS.forEach(d => {
      const h = hours[d];
      if (!h) return;
      const open = document.querySelector(`[name="${prefix}_${d}_open"]`);
      const close = document.querySelector(`[name="${prefix}_${d}_close"]`);
      const closed = document.querySelector(`[name="${prefix}_${d}_closed"]`);
      if (!open || !close || !closed) return;
      if (h.closed) {
        closed.checked = true;
        open.disabled = true;
        close.disabled = true;
      } else {
        closed.checked = false;
        open.disabled = false;
        close.disabled = false;
        const o = snapToQuarterHour(h.open);
        const c = snapToQuarterHour(h.close);
        if (o) open.value = o;
        if (c) close.value = c;
      }
    });
  }

  // --- Locations repeater ------------------------------------------------------
  function locationCardHTML(i) {
    return `
      <div class="location-card" data-loc="${i}" id="loc-card-${i}">
        <div class="location-card-head">
          <h3>Location <span class="loc-num"></span></h3>
          <button type="button" class="remove-location" aria-label="Remove location">Remove</button>
        </div>
        <div class="section-fields">
          ${LOCATION_FIELDS.map(f => fieldHTML(f, `loc_${i}`)).join('')}
        </div>
      </div>`;
  }

  function renumberLocations() {
    document.querySelectorAll('#locations-rows .location-card').forEach((card, idx) => {
      card.querySelector('.loc-num').textContent = idx + 1;
    });
    refreshLocationSubnav();
  }

  function addLocation() {
    const rows = $('#locations-rows');
    rows.insertAdjacentHTML('beforeend', locationCardHTML(locationCounter++));
    renumberLocations();
  }

  function collectLocations() {
    return Array.from(document.querySelectorAll('#locations-rows .location-card')).map(card => {
      const i = card.dataset.loc;
      const out = {};
      LOCATION_FIELDS.forEach(f => {
        const key = `loc_${i}_${f.name}`;
        if (f.type === 'hours') { out[f.name] = collectHoursGrid(key); return; }
        if (f.type === 'person') {
          const p = collectPerson(key);
          if (personHasData(p)) out[f.name] = p;
          return;
        }
        if (f.type === 'people') {
          const people = collectPeople(key);
          if (people.length) out[f.name] = people;
          return;
        }
        const el = document.querySelector(`[name="${key}"]`);
        if (el) out[f.name] = el.value.trim();
      });
      return out;
    }).filter(loc => Object.entries(loc).some(([k, v]) => k !== 'hours' && v && (typeof v !== 'object' || Object.keys(v).length)));
  }

  function applyLocationData(i, loc) {
    LOCATION_FIELDS.forEach(f => {
      const key = `loc_${i}_${f.name}`;
      if (loc[f.name] == null) return;
      if (f.type === 'hours') { applyHoursGrid(key, loc[f.name]); return; }
      if (f.type === 'person') { applyPerson(key, loc[f.name]); return; }
      if (f.type === 'people') {
        const people = Array.isArray(loc[f.name]) ? loc[f.name] : [];
        people.forEach(p => {
          const prefix = addPersonRow(key);
          if (prefix) applyPerson(prefix, p);
        });
        return;
      }
      const el = document.querySelector(`[name="${key}"]`);
      if (el) el.value = loc[f.name];
    });
  }

  // --- Logo upload -------------------------------------------------------------
  async function uploadLogo(file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const safeBase = (file.name || 'logo').replace(/[^a-z0-9]/gi, '-').slice(0, 40);
    const path = `franchisor-${Date.now()}-${safeBase}.${ext}`;
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
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
    existingLogoUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return existingLogoUrl;
  }

  async function maybeUploadLogo() {
    const input = $('#logo-input');
    const status = $('#logo-status');
    if (!input || !input.files || !input.files[0]) return existingLogoUrl;
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Logo file is over 2MB — please compress it and try again.');
    }
    status.hidden = false;
    status.textContent = 'Uploading logo…';
    const url = await uploadLogo(file);
    status.textContent = 'Logo uploaded ✓';
    return url;
  }

  // --- Payload build / prefill --------------------------------------------------
  function buildPayload(status) {
    const payload = {
      status,
      form_variant: FORM_VARIANT,
      honeypot: (document.querySelector('[name="honeypot"]') || {}).value || '',
      user_agent: navigator.userAgent,
    };
    FORM_SECTIONS.forEach(s => {
      const bucketObj = {};
      s.fields.forEach(f => {
        if (f.type === 'logo' || f.virtual) return; // logo handled by maybeUploadLogo; virtual below
        if (f.type === 'users') { payload[f.col] = collectUsers(); return; }
        if (f.type === 'locations') { payload[s.bucket] = collectLocations(); return; }
        if (f.type === 'checkboxes') {
          const vals = Array.from(document.querySelectorAll(`[name="${f.name}"]:checked`)).map(el => el.value);
          bucketObj[f.name] = vals;
          return;
        }
        const el = document.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        const v = el.value.trim();
        if (f.col) payload[f.col] = v || null;
        else if (!s.bucketFields || s.bucketFields.includes(f.name)) bucketObj[f.name] = v;
      });
      if (s.bucket && payload[s.bucket] === undefined && Object.keys(bucketObj).length) {
        payload[s.bucket] = bucketObj;
      }
    });
    // Primary contact first + last combine into the flat contact_name column.
    const first = (document.querySelector('[name="contact_first_name"]') || {}).value || '';
    const last = (document.querySelector('[name="contact_last_name"]') || {}).value || '';
    payload.contact_name = `${first.trim()} ${last.trim()}`.trim() || null;
    return payload;
  }

  function applyServerRowToForm(row) {
    if (row.logo_url) {
      existingLogoUrl = row.logo_url;
      const status = $('#logo-status');
      if (status) { status.hidden = false; status.textContent = 'Logo already uploaded ✓ (choose a file to replace it)'; }
    }
    // Split the flat contact_name back into first / last inputs.
    if (row.contact_name) {
      const parts = String(row.contact_name).trim().split(/\s+/);
      const firstEl = document.querySelector('[name="contact_first_name"]');
      const lastEl = document.querySelector('[name="contact_last_name"]');
      if (firstEl) firstEl.value = parts[0] || '';
      if (lastEl) lastEl.value = parts.slice(1).join(' ');
    }
    FORM_SECTIONS.forEach(s => {
      const bucketObj = (s.bucket && row[s.bucket]) || {};
      s.fields.forEach(f => {
        if (f.type === 'logo' || f.virtual) return;
        if (f.type === 'users') {
          const users = Array.isArray(row[f.col]) ? row[f.col] : [];
          users.forEach(u => {
            addUser();
            applyPerson(`corp_user_${userCounter - 1}`, u);
          });
          return;
        }
        if (f.type === 'locations') {
          const locs = Array.isArray(row[s.bucket]) ? row[s.bucket] : [];
          locs.forEach(loc => {
            addLocation();
            applyLocationData(locationCounter - 1, loc);
          });
          refreshLocationSubnav();
          return;
        }
        if (f.type === 'checkboxes') {
          const vals = Array.isArray(bucketObj[f.name]) ? bucketObj[f.name] : [];
          vals.forEach(v => {
            const el = document.querySelector(`[name="${f.name}"][value="${v}"]`);
            if (el) el.checked = true;
          });
          return;
        }
        const el = document.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        const v = f.col ? row[f.col] : bucketObj[f.name];
        if (v != null && v !== '') el.value = v;
      });
    });
  }

  // --- Supabase REST -------------------------------------------------------------
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
      throw new Error(`Save failed: ${resp.status} ${body}`);
    }
  }

  async function updateRow(id, payload) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
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
      throw new Error(`Save failed: ${resp.status} ${body}`);
    }
  }

  async function fetchDraft(id) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Draft load failed: ${resp.status} ${body}`);
    }
    const rows = await resp.json();
    return rows[0] || null;
  }

  // --- Errors ----------------------------------------------------------------
  function showError(msg) {
    const b = $('#error-banner');
    b.textContent = msg;
    b.hidden = false;
    b.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    $('#error-banner').hidden = true;
  }

  function findAllProblems() {
    const problems = [];
    FORM_SECTIONS.forEach(s => {
      s.fields.forEach(f => {
        if (!f.required) return;
        if (['locations', 'users', 'people', 'person', 'hours', 'logo'].includes(f.type)) return;
        const el = document.querySelector(`[name="${f.name}"]`);
        if (el && !el.value.trim()) problems.push(f.label);
      });
    });
    const locs = collectLocations();
    if (!locs.length) problems.push('At least one location');
    else if (locs.some(l => !l.name)) problems.push('A name for every location');
    return problems;
  }

  // --- Draft save --------------------------------------------------------------
  function showDraftLink() {
    const bar = $('#draft-bar');
    const link = `${window.location.origin}${window.location.pathname}?draft=${draftId}`;
    $('#draft-link').value = link;
    bar.hidden = false;
  }

  async function handleSaveDraft() {
    hideError();
    const btn = $('#save-draft');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const logoUrl = await maybeUploadLogo();
      const payload = buildPayload('draft');
      if (logoUrl) payload.logo_url = logoUrl;
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        draftId = generateUuid();
        payload.id = draftId;
        await insertRow(payload);
        setDraftIdInUrl(draftId);
      }
      showDraftLink();
      btn.textContent = 'Draft saved ✓';
      setTimeout(() => { btn.textContent = 'Save draft'; btn.disabled = false; }, 1500);
    } catch (err) {
      btn.textContent = 'Save draft';
      btn.disabled = false;
      showError(err.message || 'Could not save draft. Please try again.');
    }
  }

  // --- Submit ------------------------------------------------------------------
  function renderSubmitSummary() {
    const payload = buildPayload('pending');
    const locs = Array.isArray(payload.locations) ? payload.locations : [];
    const extra = Array.isArray(payload.additional_contacts) ? payload.additional_contacts : [];
    $('#submit-summary').innerHTML = `
      <ul class="summary-list">
        <li><strong>Brand:</strong> ${esc(payload.brand_name || '—')}</li>
        <li><strong>Primary contact:</strong> ${esc(payload.contact_name || '—')} (${esc(payload.contact_email || '—')})</li>
        <li><strong>Additional contacts:</strong> ${extra.length ? esc(extra.map(u => `${u.first_name} ${u.last_name}`.trim()).filter(Boolean).join(', ')) : '—'}</li>
        <li><strong>Locations:</strong> ${locs.length}${locs.length ? ' — ' + esc(locs.map(l => l.name).filter(Boolean).join(', ')) : ''}</li>
      </ul>`;
  }

  function openSubmitConfirm() {
    renderSubmitSummary();
    $('#submit-modal').hidden = false;
  }

  function closeSubmitConfirm() {
    $('#submit-modal').hidden = true;
  }

  // Flip a draft to pending via the submit_franchisor_intake RPC. Submitted
  // rows are invisible to the anon key by design, so a direct PATCH to
  // status='pending' would fail RLS — the SECURITY DEFINER function is the
  // one sanctioned path, and it stamps submitted_at server-side.
  async function submitIntake(id) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_franchisor_intake`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_id: id })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Submit failed: ${resp.status} ${body}`);
    }
    const ok = await resp.json();
    if (ok !== true) throw new Error('Submit failed — this draft may already have been submitted.');
  }

  async function doFinalSubmit() {
    const btn = $('#modal-confirm');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const logoUrl = await maybeUploadLogo();
      // Final save lands as a draft, then the RPC flips it to pending.
      const payload = buildPayload('draft');
      if (logoUrl) payload.logo_url = logoUrl;
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        draftId = generateUuid();
        payload.id = draftId;
        await insertRow(payload);
      }
      await submitIntake(draftId);
      closeSubmitConfirm();
      $('#franchisor-form').hidden = true;
      $('#success-screen').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Submit onboarding';
      closeSubmitConfirm();
      showError(err.message || 'Submit failed. Please try again — your draft is still saved.');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    hideError();
    const problems = findAllProblems();
    if (problems.length) {
      showError('Please complete before submitting: ' + problems.join(' · '));
      return;
    }
    openSubmitConfirm();
  }

  // --- AI pre-fill -----------------------------------------------------------
  // Shared scrape-location-page edge function (same engine as the redesigned
  // location form). Fill-only-if-empty: pre-fill NEVER overwrites anything a
  // human already typed. Filled fields get an "AI suggested" tint until edited.
  async function runScrape(url) {
    const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/scrape-location-page`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data && data.suggested && typeof data.suggested === 'object') ? data.suggested : {};
  }

  function setPrefillStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = el.className.replace(/\bis-(loading|success|error)\b/g, '').trim();
    if (kind) el.classList.add(`is-${kind}`);
  }

  function fillIfEmpty(name, value) {
    if (value == null || String(value).trim() === '') return false;
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || el.value.trim()) return false;
    el.value = String(value).trim();
    el.classList.add('ai-suggested');
    el.addEventListener('input', () => el.classList.remove('ai-suggested'), { once: true });
    return true;
  }

  // Scraper key → brand-level form field. Brand identity fields (brand_name,
  // contacts) are deliberately NOT mapped — those stay human-entered.
  const BRAND_SUGGESTION_MAP = {
    website_url: 'website_url',
    instagram_handle: 'instagram',
    facebook_page_url: 'facebook',
    tiktok_handle: 'tiktok',
    bk_service_description: 'service_description',
    intro_offer: 'intro_offer',
    bk_unique_value: 'unique_value',
    bk_ideal_client: 'ideal_client',
    bk_faq: 'faq',
  };

  function isValidHttpUrl(u) {
    return /^https?:\/\/.+\..+/i.test((u || '').trim());
  }

  async function handleBrandPrefill() {
    const btn = $('#brand-prefill-btn');
    const status = $('#brand-prefill-status');
    const url = ($('#brand-page-url') || {}).value || '';
    if (!isValidHttpUrl(url)) {
      setPrefillStatus(status, 'Add your brand website URL (starting with https://) first.', 'error');
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Reading your site…';
    setPrefillStatus(status, 'Scanning your site and pulling in what we can find. This takes a few seconds…', 'loading');
    try {
      const suggested = await runScrape(url.trim());
      let n = 0;
      Object.entries(BRAND_SUGGESTION_MAP).forEach(([from, to]) => {
        if (fillIfEmpty(to, suggested[from])) n++;
      });
      setPrefillStatus(
        status,
        n
          ? `✓ Filled in ${n} field${n === 1 ? '' : 's'} from your site, each highlighted "AI suggested." Review and confirm them before you submit.`
          : 'We could not pull much from that page — please fill the form in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
      setPrefillStatus(status, 'Pre-fill is not available right now. Please fill the form in yourself, or try again later.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function handleLocationPrefill(btn) {
    const inputName = btn.dataset.input; // e.g. loc_3_page_url
    const prefix = inputName.replace(/_page_url$/, ''); // loc_3
    const card = btn.closest('.location-card');
    const status = card ? card.querySelector('.loc-prefill-status') : null;
    const url = (document.querySelector(`[name="${inputName}"]`) || {}).value || '';
    if (!isValidHttpUrl(url)) {
      setPrefillStatus(status, 'Paste this location’s page URL (starting with https://) first.', 'error');
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Reading…';
    setPrefillStatus(status, 'Scanning this location’s page…', 'loading');
    try {
      const s = await runScrape(url.trim());
      let n = 0;
      if (fillIfEmpty(`${prefix}_name`, s.business_name)) n++;
      if (fillIfEmpty(`${prefix}_address`, s.address)) n++;
      const cityState = [s.city, s.state].filter(Boolean).join(', ');
      if (fillIfEmpty(`${prefix}_city_state`, cityState)) n++;
      if (fillIfEmpty(`${prefix}_zip`, s.zip)) n++;
      if (fillIfEmpty(`${prefix}_studio_phone`, s.business_phone ? formatPhoneValue(s.business_phone) : '')) n++;
      if (s.hours && typeof s.hours === 'object' && Object.keys(s.hours).length) {
        applyHoursGrid(`${prefix}_hours`, s.hours);
        n++;
      }
      setPrefillStatus(
        status,
        n
          ? `✓ Filled in ${n} field${n === 1 ? '' : 's'} — review and confirm.`
          : 'Could not pull much from that page — please fill this location in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
      setPrefillStatus(status, 'Pre-fill is not available right now — please fill this location in yourself.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // --- Top completion progress bar --------------------------------------------
  // Fraction of visible free-text fields that are filled. Selects (times,
  // timezone, roles) always carry a value, so they're excluded — counting them
  // would inflate the number.
  function updateProgressBar() {
    const els = document.querySelectorAll(
      '#franchisor-form input[type="text"], #franchisor-form input[type="email"], ' +
      '#franchisor-form input[type="tel"], #franchisor-form input[type="url"], #franchisor-form textarea'
    );
    let total = 0, filled = 0;
    els.forEach(el => {
      if (el.classList.contains('honeypot')) return;
      if (el.disabled || el.offsetParent === null) return;
      total++;
      if ((el.value || '').trim() !== '') filled++;
    });
    const pct = total ? Math.round((filled / total) * 100) : 0;
    // Both surfaces: the in-flow bar in the header and the sticky navy toolbar.
    const fill = document.getElementById('progress-fill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.parentElement.setAttribute('aria-valuenow', String(pct));
    }
    const text = document.getElementById('progress-text');
    if (text) text.textContent = pct + '% complete';
    const sFill = document.getElementById('scroll-progress-fill');
    if (sFill) {
      sFill.style.width = pct + '%';
      sFill.parentElement.setAttribute('aria-valuenow', String(pct));
    }
    const sText = document.getElementById('scroll-progress-text');
    if (sText) sText.textContent = pct + '%';
  }

  // Slide the navy toolbar in once the page header has scrolled away.
  function initScrollProgress() {
    const bar = document.getElementById('scroll-progress');
    const header = document.querySelector('main.container header');
    if (!bar) return;
    function onScroll() {
      const trigger = header ? header.offsetTop + header.offsetHeight - 8 : 300;
      bar.classList.toggle('is-visible', window.scrollY > trigger);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  // --- Sticky left section navigator ------------------------------------------
  function refreshLocationSubnav() {
    const sub = document.getElementById('section-nav-locations-sub');
    if (!sub) return;
    const cards = Array.from(document.querySelectorAll('#locations-rows .location-card'));
    sub.innerHTML = cards.map((card, idx) => {
      const nameEl = card.querySelector(`[name="loc_${card.dataset.loc}_name"]`);
      const label = (nameEl && nameEl.value.trim()) || `Location ${idx + 1}`;
      return `<a class="section-nav__sublink" href="#${card.id}" data-target="${card.id}">${esc(label)}</a>`;
    }).join('');
  }

  function initSectionNav() {
    const nav = document.getElementById('section-nav');
    if (!nav) return;
    const sectionEls = Array.from(document.querySelectorAll('#sections-root .form-section'));
    if (!sectionEls.length) return;

    let html = '<div class="section-nav__title">Quick view</div>';
    sectionEls.forEach(el => {
      const h2 = el.querySelector('h2');
      const label = h2 ? h2.textContent.trim() : el.id;
      // The locations section gets an expandable sub-list of its location cards
      // (visible on hover or while you're inside that section).
      if (el.id === 'section-locations') {
        html += `
          <div class="section-nav__item" data-section="${el.id}">
            <a class="section-nav__link" href="#${el.id}" data-target="${el.id}">${esc(label)}</a>
            <div class="section-nav__sub" id="section-nav-locations-sub"></div>
          </div>`;
      } else {
        html += `<a class="section-nav__link" href="#${el.id}" data-target="${el.id}">${esc(label)}</a>`;
      }
    });
    nav.innerHTML = html;
    refreshLocationSubnav();

    nav.addEventListener('click', (e) => {
      const a = e.target.closest('.section-nav__link, .section-nav__sublink');
      if (!a) return;
      e.preventDefault();
      const target = document.getElementById(a.dataset.target);
      if (!target) return;
      const y = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });

    // Scrollspy: highlight the topmost section in the upper band of the viewport.
    if ('IntersectionObserver' in window) {
      const visible = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) visible.add(en.target.id);
          else visible.delete(en.target.id);
        });
        const activeId = sectionEls.map((s) => s.id).find((id) => visible.has(id));
        nav.querySelectorAll('.section-nav__link.is-active').forEach((l) => l.classList.remove('is-active'));
        nav.querySelectorAll('.section-nav__item.has-active').forEach((l) => l.classList.remove('has-active'));
        if (activeId) {
          const l = nav.querySelector(`.section-nav__link[data-target="${activeId}"]`);
          if (l) l.classList.add('is-active');
          const item = nav.querySelector(`.section-nav__item[data-section="${activeId}"]`);
          if (item) item.classList.add('has-active');
        }
      }, { rootMargin: '-60px 0px -70% 0px', threshold: 0 });
      sectionEls.forEach((s) => io.observe(s));
    }

    nav.classList.add('is-visible');
  }

  // --- Init ----------------------------------------------------------------------
  // Preset the fresh form with everything we already know (locations + corporate
  // contacts). Only runs when NOT resuming a draft — a draft carries its own data.
  function applyPresets() {
    PRESET_LOCATIONS.forEach(loc => {
      addLocation();
      applyLocationData(locationCounter - 1, loc);
    });
    if (!PRESET_LOCATIONS.length) addLocation();
    PRESET_CONTACTS.forEach(u => {
      addUser();
      applyPerson(`corp_user_${userCounter - 1}`, u);
    });
    refreshLocationSubnav();
  }

  async function initDraftFromUrl() {
    const id = getDraftIdFromUrl();
    if (!id) {
      applyPresets();
      return;
    }
    try {
      const row = await fetchDraft(id);
      if (!row) {
        showError('This draft link is no longer valid (it may have already been submitted). Starting a fresh form below.');
        applyPresets();
        return;
      }
      draftId = id;
      applyServerRowToForm(row);
      // A draft saved before any location was added still needs one card to edit.
      if (!document.querySelector('#locations-rows .location-card')) addLocation();
      showDraftLink();
    } catch (err) {
      showError('Could not load your draft. Check your connection and refresh.');
      applyPresets();
    }
  }

  function init() {
    renderSections();
    document.addEventListener('click', (e) => {
      if (e.target.id === 'add-user') addUser();
      if (e.target.id === 'add-location') addLocation();
      if (e.target.classList.contains('add-person-row')) addPersonRow(e.target.dataset.prefix);
      if (e.target.classList.contains('loc-prefill-btn')) handleLocationPrefill(e.target);
      if (e.target.classList.contains('remove-row')) e.target.closest('.repeat-row').remove();
      if (e.target.classList.contains('remove-location')) {
        e.target.closest('.location-card').remove();
        renumberLocations();
      }
      if (e.target.id === 'copy-draft-link') {
        navigator.clipboard.writeText($('#draft-link').value).catch(() => {});
        e.target.textContent = 'Copied ✓';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
      }
      if (e.target.id === 'modal-cancel') closeSubmitConfirm();
      if (e.target.id === 'modal-confirm') doFinalSubmit();
      updateProgressBar(); // add/remove rows changes the field count
    });
    // Live phone mask on every tel field (existing and future rows).
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches && el.matches('input[type="tel"]')) {
        const formatted = formatPhoneValue(el.value);
        if (formatted !== el.value) el.value = formatted;
      }
      // Keep the nav's location sub-links in sync with the name fields.
      if (el.name && /^loc_\d+_name$/.test(el.name)) refreshLocationSubnav();
      updateProgressBar();
    });
    // Hours grids: the "closed" toggle disables that day's time inputs.
    document.addEventListener('change', (e) => {
      const m = e.target.name && e.target.name.match(/^(.*_hours)_([a-z]{3})_closed$/);
      if (!m) return;
      const open = document.querySelector(`[name="${m[1]}_${m[2]}_open"]`);
      const close = document.querySelector(`[name="${m[1]}_${m[2]}_close"]`);
      if (open) open.disabled = e.target.checked;
      if (close) close.disabled = e.target.checked;
    });
    $('#save-draft').addEventListener('click', handleSaveDraft);
    $('#franchisor-form').addEventListener('submit', handleSubmit);
    $('#brand-prefill-btn').addEventListener('click', handleBrandPrefill);
    initSectionNav();
    initScrollProgress();
    Promise.resolve(initDraftFromUrl()).then(updateProgressBar);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
