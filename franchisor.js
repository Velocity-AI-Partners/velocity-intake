// Beem Light Sauna — Franchisor Onboarding (standalone one-off form).
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

  // ===========================================================================
  // FORM CONTENT CONFIG — edit the questions here.
  //
  // Each section: { id, title, lead, fields: [...] }
  // Each field:
  //   name        - key the answer is stored under
  //   label       - question text shown to the client
  //   type        - text | email | tel | url | date | textarea | select | checkboxes
  //                 | logo (brand logo upload) | users (people repeater)
  //                 | locations (location repeater)
  //   col         - store in this flat DB column (omit to store in the
  //                 section's jsonb bucket instead)
  //   required    - true to require before submit
  //   placeholder / help / options / rows - presentation details
  //
  // Sections with `bucket` store their answers as one jsonb object in that
  // column, so adding/removing questions here needs NO database change.
  // ===========================================================================
  const FORM_SECTIONS = [
    {
      id: 'brand',
      title: '1. Your brand',
      lead: 'Who you are and how we reach the corporate team.',
      // Contact + socials defaults verified 2026-07-06: contacts provided by
      // George; socials read from beemlightsauna.com's own footer. No TikTok
      // link exists on their site, so that field stays empty.
      fields: [
        { name: 'brand_name', col: 'brand_name', label: 'Brand name', type: 'text', required: true, value: 'beem Light Sauna' },
        { name: 'contact_name', col: 'contact_name', label: 'Primary contact name', type: 'text', required: true, value: 'Veronica Stranc' },
        { name: 'contact_email', col: 'contact_email', label: 'Primary contact email', type: 'email', required: true, value: 'vstranc@beemlightsauna.com' },
        { name: 'contact_phone', col: 'contact_phone', label: 'Primary contact phone', type: 'tel' },
        { name: 'corporate_address', col: 'corporate_address', label: 'Corporate / HQ address', type: 'text' },
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
      id: 'assets',
      title: '2. Brand assets',
      lead: 'The logo and colors we use to build your branded dashboard.',
      bucket: 'brand_colors',
      fields: [
        { name: 'logo', col: 'logo_url', label: 'Brand logo (PNG/JPG/SVG, up to 2MB — highest resolution you have)', type: 'logo' },
        { name: 'primary', label: 'Primary brand color', type: 'text', placeholder: 'Hex code (e.g. #E8442A) or a plain description' },
        { name: 'secondary', label: 'Secondary brand color', type: 'text' },
        { name: 'notes', label: 'Anything else about your brand look & feel', type: 'textarea', rows: 3, placeholder: 'Fonts, do/don’t rules, links to brand guidelines...' },
      ],
    },
    {
      id: 'dashboard',
      title: '3. Your dashboard',
      lead: 'What you want to see and who at corporate gets access.',
      bucket: 'dashboard_preferences',
      fields: [
        { name: 'modules', label: 'Which AI team members do you want running?', type: 'checkboxes', options: [
          { value: 'lead_nurturing', label: 'Lead Nurturing — responds to new leads in under 60 seconds' },
          { value: 'lead_reactivation', label: 'Lead Reactivation — re-engages old leads' },
          { value: 'customer_retention', label: 'Customer Retention — keeps current members engaged' },
        ]},
        { name: 'kpis', label: 'Which numbers matter most to you?', type: 'textarea', rows: 3, placeholder: 'e.g. leads contacted, bookings, show rate, reactivated members, retention...' },
        { name: 'experience_notes', label: 'Describe your ideal dashboard experience', type: 'textarea', rows: 4, placeholder: 'What do you want to see first when you log in? Brand-wide rollups? Per-location detail? Alerts?' },
        { name: 'corporate_users', label: 'Who at corporate needs dashboard access?', type: 'users', help: 'These become your corporate logins with the franchise-wide view.' },
      ],
    },
    {
      id: 'locations',
      title: '4. Your locations',
      lead: 'Add every location you’re onboarding. Each becomes its own sub-account under your brand. You can start with a few and send us the rest later.',
      bucket: 'locations',
      fields: [
        { name: 'locations', label: '', type: 'locations' },
      ],
    },
    {
      id: 'knowledge',
      title: '5. Brand-wide knowledge base',
      lead: 'Answered once, applied across all locations. This is what your AI team members know about Beem when they talk to your customers.',
      bucket: 'brand_knowledge',
      fields: [
        { name: 'service_description', label: 'Describe your services as you’d explain them to a brand-new customer', type: 'textarea', rows: 4, required: true },
        { name: 'pricing_structure', label: 'Membership & package pricing structure', type: 'textarea', rows: 4, placeholder: 'Brand-wide structure; note anything that varies by location.' },
        { name: 'intro_offer', label: 'Intro / first-visit offer', type: 'text' },
        { name: 'cancellation_policy', label: 'Cancellation & rescheduling policy', type: 'textarea', rows: 3 },
        { name: 'ideal_client', label: 'Who is your ideal client?', type: 'textarea', rows: 3 },
        { name: 'unique_value', label: 'What makes Beem different?', type: 'textarea', rows: 3 },
        { name: 'voice_tone', label: 'How should the AI sound when it speaks for your brand?', type: 'textarea', rows: 3, placeholder: 'e.g. warm and knowledgeable, energetic, calm and spa-like...' },
        { name: 'approved_phrases', label: 'Phrases you love (use these)', type: 'textarea', rows: 3 },
        { name: 'avoid_words', label: 'Words or claims to avoid', type: 'textarea', rows: 3, placeholder: 'Compliance rules, health claims to avoid, banned wording...' },
        { name: 'faq', label: 'Top questions customers ask — and your answers', type: 'textarea', rows: 5 },
      ],
    },
    {
      id: 'rollout',
      title: '6. Rollout & anything else',
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
    { name: 'name', label: 'Location name', type: 'text', placeholder: 'e.g. Beem Light Sauna — Scottsdale', required: true },
    { name: 'address', label: 'Street address', type: 'text' },
    { name: 'city_state', label: 'City & state', type: 'text' },
    { name: 'timezone', label: 'Timezone', type: 'select', options: [
      { value: '', label: 'Select timezone' },
      { value: 'America/New_York', label: 'Eastern' },
      { value: 'America/Chicago', label: 'Central' },
      { value: 'America/Denver', label: 'Mountain' },
      { value: 'America/Phoenix', label: 'Arizona (no DST)' },
      { value: 'America/Los_Angeles', label: 'Pacific' },
    ]},
    { name: 'hours_text', label: 'Operating hours', type: 'text', placeholder: 'e.g. Mon–Fri 9–7, Sat 9–5, Sun closed' },
    { name: 'studio_phone', label: 'Studio phone (public)', type: 'tel' },
    { name: 'crm_platform', label: 'Booking / CRM platform', type: 'text', placeholder: 'e.g. Zenoti, Mindbody, GoHighLevel' },
    { name: 'crm_store_id', label: 'CRM store / location ID (if known)', type: 'text' },
    { name: 'gm_name', label: 'GM / manager name', type: 'text' },
    { name: 'gm_email', label: 'GM / manager email', type: 'email' },
    { name: 'gm_phone', label: 'GM / manager phone', type: 'tel' },
    { name: 'location_users', label: 'Who at this location needs dashboard access?', type: 'textarea', rows: 2, placeholder: 'Names + emails' },
    { name: 'notes', label: 'Notes for this location', type: 'textarea', rows: 2 },
  ];
  // --- Preset data (applied on a fresh form; skipped when resuming a draft) ---
  // Location details verified from each studio's own page on beemlightsauna.com
  // (2026-07-06). Glenwood's hours are not published on its page, so that field
  // is left for Beem to fill — never guessed. Timezones follow the studio's state.
  const PRESET_LOCATIONS = [
    {
      page_url: 'https://www.beemlightsauna.com/location/glenwood',
      name: 'beem Atlanta Glenwood',
      address: '475 Bill Kennedy Wy Sta A',
      city_state: 'Atlanta, GA 30316',
      timezone: 'America/New_York',
      studio_phone: '(404) 973-2288',
    },
    {
      page_url: 'https://www.beemlightsauna.com/location/nashville-green-hills',
      name: 'beem Nashville - Green Hills',
      address: '3760 Hillsboro Pike',
      city_state: 'Nashville, TN 37215',
      timezone: 'America/Chicago',
      hours_text: 'Mon–Thu 7am–7pm, Fri 8am–5pm, Sat 8am–4pm, Sun 10am–4pm',
      studio_phone: '(615) 600-4044',
    },
    {
      page_url: 'https://www.beemlightsauna.com/location/summerville',
      name: 'beem Summerville',
      address: '100 Gosling Way, Suite B',
      city_state: 'Summerville, SC 29486',
      timezone: 'America/New_York',
      hours_text: 'Mon–Fri 8am–8pm, Sat–Sun 11am–3pm',
      studio_phone: '(843) 788-9288',
    },
    {
      page_url: 'https://www.beemlightsauna.com/studio/west-mckinney',
      name: 'beem West McKinney',
      address: '4041 S Custer Rd, Unit 2150',
      city_state: 'McKinney, TX 75070',
      timezone: 'America/Chicago',
      hours_text: 'Mon–Thu 8am–8pm, Fri 8am–5pm, Sat 9am–3pm, Sun 11am–4pm',
      studio_phone: '(469) 343-4991',
    },
  ];

  // Corporate dashboard users preset (provided by George 2026-07-06).
  const PRESET_USERS = [
    { name: 'Jesse Kern', email: 'jkern@beemlightsauna.com', role: 'corporate_admin' },
  ];
  // ========================= end of content config ===========================

  let draftId = null;
  let existingLogoUrl = null;
  let locationCounter = 0;
  let userCounter = 0;

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
    } else if (f.type === 'prefill-url') {
      control = `
        <div class="prefill-inline-row">
          <input type="url" name="${name}" placeholder="${esc(f.placeholder || '')}">
          <button type="button" class="btn-prefill btn-prefill--inline loc-prefill-btn" data-input="${name}">Pre-fill</button>
        </div>
        <span class="prefill-status loc-prefill-status" aria-live="polite"></span>`;
    } else if (f.type === 'users') {
      control = `<div id="users-rows"></div><button type="button" class="btn-add" id="add-user">+ Add person</button>`;
    } else if (f.type === 'locations') {
      control = `<div id="locations-rows"></div><button type="button" class="btn-add" id="add-location">+ Add location</button>`;
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

  // --- Corporate users repeater ----------------------------------------------
  function userRowHTML(i) {
    return `
      <div class="repeat-row" data-user="${i}">
        <input type="text" name="corp_user_${i}_name" placeholder="Name">
        <input type="email" name="corp_user_${i}_email" placeholder="Email">
        <select name="corp_user_${i}_role">
          <option value="corporate_admin">Corporate admin</option>
          <option value="regional_manager">Regional manager</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="button" class="remove-row" aria-label="Remove person">&times;</button>
      </div>`;
  }

  function addUser() {
    const rows = $('#users-rows');
    rows.insertAdjacentHTML('beforeend', userRowHTML(userCounter++));
  }

  function collectUsers() {
    return Array.from(document.querySelectorAll('#users-rows .repeat-row')).map(row => {
      const i = row.dataset.user;
      const val = (n) => (document.querySelector(`[name="corp_user_${i}_${n}"]`) || {}).value || '';
      return { name: val('name').trim(), email: val('email').trim(), role: val('role') };
    }).filter(u => u.name || u.email);
  }

  // --- Locations repeater ------------------------------------------------------
  function locationCardHTML(i) {
    return `
      <div class="location-card" data-loc="${i}">
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
        const el = document.querySelector(`[name="loc_${i}_${f.name}"]`);
        if (el) out[f.name] = el.value.trim();
      });
      return out;
    }).filter(loc => Object.values(loc).some(v => v));
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
        if (f.type === 'logo') return; // handled by maybeUploadLogo
        if (f.type === 'users') { bucketObj[f.name] = collectUsers(); return; }
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
    return payload;
  }

  function applyServerRowToForm(row) {
    if (row.logo_url) {
      existingLogoUrl = row.logo_url;
      const status = $('#logo-status');
      if (status) { status.hidden = false; status.textContent = 'Logo already uploaded ✓ (choose a file to replace it)'; }
    }
    FORM_SECTIONS.forEach(s => {
      const bucketObj = (s.bucket && row[s.bucket]) || {};
      s.fields.forEach(f => {
        if (f.type === 'logo') return;
        if (f.type === 'users') {
          const users = Array.isArray(bucketObj[f.name]) ? bucketObj[f.name] : [];
          users.forEach(u => {
            addUser();
            const i = userCounter - 1;
            document.querySelector(`[name="corp_user_${i}_name"]`).value = u.name || '';
            document.querySelector(`[name="corp_user_${i}_email"]`).value = u.email || '';
            if (u.role) document.querySelector(`[name="corp_user_${i}_role"]`).value = u.role;
          });
          return;
        }
        if (f.type === 'locations') {
          const locs = Array.isArray(row[s.bucket]) ? row[s.bucket] : [];
          locs.forEach(loc => {
            addLocation();
            const i = locationCounter - 1;
            LOCATION_FIELDS.forEach(lf => {
              const el = document.querySelector(`[name="loc_${i}_${lf.name}"]`);
              if (el && loc[lf.name] != null) el.value = loc[lf.name];
            });
          });
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
        if (!f.required || f.type === 'locations' || f.type === 'users' || f.type === 'logo') return;
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
    const modules = ((payload.dashboard_preferences || {}).modules || []);
    $('#submit-summary').innerHTML = `
      <ul class="summary-list">
        <li><strong>Brand:</strong> ${esc(payload.brand_name || '—')}</li>
        <li><strong>Contact:</strong> ${esc(payload.contact_name || '—')} (${esc(payload.contact_email || '—')})</li>
        <li><strong>Locations:</strong> ${locs.length}${locs.length ? ' — ' + esc(locs.map(l => l.name).filter(Boolean).join(', ')) : ''}</li>
        <li><strong>AI team members:</strong> ${modules.length ? esc(modules.join(', ').replace(/_/g, ' ')) : '—'}</li>
      </ul>`;
  }

  function openSubmitConfirm() {
    renderSubmitSummary();
    $('#submit-modal').hidden = false;
  }

  function closeSubmitConfirm() {
    $('#submit-modal').hidden = true;
  }

  async function doFinalSubmit() {
    const btn = $('#modal-confirm');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const logoUrl = await maybeUploadLogo();
      const payload = buildPayload('pending');
      if (logoUrl) payload.logo_url = logoUrl;
      payload.submitted_at = new Date().toISOString();
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        draftId = generateUuid();
        payload.id = draftId;
        await insertRow(payload);
      }
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

  const HOUR_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const HOUR_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  function hoursToText(hours) {
    if (!hours || typeof hours !== 'object') return '';
    const parts = [];
    HOUR_DAYS.forEach(d => {
      const h = hours[d];
      if (!h) return;
      if (h.closed) parts.push(`${HOUR_LABELS[d]} closed`);
      else if (h.open && h.close) parts.push(`${HOUR_LABELS[d]} ${h.open}–${h.close}`);
    });
    return parts.join(', ');
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
      if (fillIfEmpty(`${prefix}_hours_text`, hoursToText(s.hours))) n++;
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

  // --- Sticky left section navigator ------------------------------------------
  function initSectionNav() {
    const nav = document.getElementById('section-nav');
    if (!nav) return;
    const sectionEls = Array.from(document.querySelectorAll('#sections-root .form-section'));
    if (!sectionEls.length) return;

    let html = '<div class="section-nav__title">Quick view</div>';
    sectionEls.forEach(el => {
      const h2 = el.querySelector('h2');
      const label = h2 ? h2.textContent.trim() : el.id;
      html += `<a class="section-nav__link" href="#${el.id}" data-target="${el.id}">${esc(label)}</a>`;
    });
    nav.innerHTML = html;

    nav.addEventListener('click', (e) => {
      const a = e.target.closest('.section-nav__link');
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
        if (activeId) {
          const l = nav.querySelector(`.section-nav__link[data-target="${activeId}"]`);
          if (l) l.classList.add('is-active');
        }
      }, { rootMargin: '-60px 0px -70% 0px', threshold: 0 });
      sectionEls.forEach((s) => io.observe(s));
    }

    nav.classList.add('is-visible');
  }

  // --- Init ----------------------------------------------------------------------
  // Preset the fresh form with everything we already know (locations + corporate
  // users). Only runs when NOT resuming a draft — a draft carries its own data.
  function applyPresets() {
    PRESET_LOCATIONS.forEach(loc => {
      addLocation();
      const i = locationCounter - 1;
      LOCATION_FIELDS.forEach(lf => {
        const el = document.querySelector(`[name="loc_${i}_${lf.name}"]`);
        if (el && loc[lf.name] != null) el.value = loc[lf.name];
      });
    });
    if (!PRESET_LOCATIONS.length) addLocation();
    PRESET_USERS.forEach(u => {
      addUser();
      const i = userCounter - 1;
      document.querySelector(`[name="corp_user_${i}_name"]`).value = u.name || '';
      document.querySelector(`[name="corp_user_${i}_email"]`).value = u.email || '';
      if (u.role) document.querySelector(`[name="corp_user_${i}_role"]`).value = u.role;
    });
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
    });
    $('#save-draft').addEventListener('click', handleSaveDraft);
    $('#franchisor-form').addEventListener('submit', handleSubmit);
    $('#brand-prefill-btn').addEventListener('click', handleBrandPrefill);
    initSectionNav();
    initDraftFromUrl();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
