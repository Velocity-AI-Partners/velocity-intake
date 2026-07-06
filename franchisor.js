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
      fields: [
        { name: 'brand_name', col: 'brand_name', label: 'Brand name', type: 'text', required: true, value: 'Beem Light Sauna' },
        { name: 'contact_name', col: 'contact_name', label: 'Primary contact name', type: 'text', required: true, placeholder: 'Who owns this onboarding on your side?' },
        { name: 'contact_email', col: 'contact_email', label: 'Primary contact email', type: 'email', required: true },
        { name: 'contact_phone', col: 'contact_phone', label: 'Primary contact phone', type: 'tel' },
        { name: 'corporate_address', col: 'corporate_address', label: 'Corporate / HQ address', type: 'text' },
        { name: 'website_url', col: 'website_url', label: 'Brand website', type: 'url', placeholder: 'https://' },
        { name: 'instagram', label: 'Instagram', type: 'text', placeholder: '@handle' },
        { name: 'facebook', label: 'Facebook page', type: 'url', placeholder: 'https://facebook.com/...' },
        { name: 'tiktok', label: 'TikTok', type: 'text', placeholder: '@handle' },
        { name: 'linkedin', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/company/...' },
      ],
      bucket: 'socials',
      bucketFields: ['instagram', 'facebook', 'tiktok', 'linkedin'],
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
    { name: 'crm_platform', label: 'Booking / CRM platform', type: 'text', placeholder: 'e.g. Zenoti, Mindbody, GoHighLevel' },
    { name: 'crm_store_id', label: 'CRM store / location ID (if known)', type: 'text' },
    { name: 'gm_name', label: 'GM / manager name', type: 'text' },
    { name: 'gm_email', label: 'GM / manager email', type: 'email' },
    { name: 'gm_phone', label: 'GM / manager phone', type: 'tel' },
    { name: 'location_users', label: 'Who at this location needs dashboard access?', type: 'textarea', rows: 2, placeholder: 'Names + emails' },
    { name: 'notes', label: 'Notes for this location', type: 'textarea', rows: 2 },
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
      control = `<textarea name="${name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}"></textarea>`;
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

  // --- Init ----------------------------------------------------------------------
  async function initDraftFromUrl() {
    const id = getDraftIdFromUrl();
    if (!id) return;
    try {
      const row = await fetchDraft(id);
      if (!row) {
        showError('This draft link is no longer valid (it may have already been submitted).');
        return;
      }
      draftId = id;
      applyServerRowToForm(row);
      showDraftLink();
    } catch (err) {
      showError('Could not load your draft. Check your connection and refresh.');
    }
  }

  function init() {
    renderSections();
    addLocation(); // start with one empty location card
    document.addEventListener('click', (e) => {
      if (e.target.id === 'add-user') addUser();
      if (e.target.id === 'add-location') addLocation();
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
    initDraftFromUrl();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
