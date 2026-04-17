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
        <input type="text" name="user_${i}_name" placeholder="Name">
        <input type="email" name="user_${i}_email" placeholder="Email">
        <select name="user_${i}_role">
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button type="button" class="remove-user" aria-label="Remove user">&times;</button>
      </div>
    `;
  }

  function renderUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = userRowHTML(0);
    document.getElementById('add-user').addEventListener('click', addUser);
    list.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-user')) {
        const row = e.target.closest('.user-row');
        if (document.querySelectorAll('#users-list .user-row').length > 1) {
          row.remove();
        }
      }
    });
  }

  function addUser() {
    const list = document.getElementById('users-list');
    const i = list.children.length;
    list.insertAdjacentHTML('beforeend', userRowHTML(i));
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

  function collectBusinessKnowledge(fd) {
    const currentMembers = fd.get('bk_current_members');
    return {
      service_description: fd.get('bk_service_description') || null,
      single_session_rate: fd.get('bk_single_session_rate') || null,
      membership_pricing: fd.get('bk_membership_pricing') || null,
      package_pricing: fd.get('bk_package_pricing') || null,
      cancellation_policy: fd.get('bk_cancellation_policy') || null,
      eligibility: fd.get('bk_eligibility') || null,
      ideal_client: fd.get('bk_ideal_client') || null,
      unique_value: fd.get('bk_unique_value') || null,
      current_members: currentMembers ? parseInt(currentMembers, 10) : null,
      approved_phrases: fd.get('bk_approved_phrases') || null,
      forbidden_claims: fd.get('bk_forbidden_claims') || null,
      first_visit: fd.get('bk_first_visit') || null,
      faq: fd.get('bk_faq') || null
    };
  }

  function collectUsers() {
    const users = [];
    document.querySelectorAll('#users-list .user-row').forEach(row => {
      const name = row.querySelector('[name$="_name"]').value.trim();
      const email = row.querySelector('[name$="_email"]').value.trim();
      const role = row.querySelector('[name$="_role"]').value;
      if (name || email) users.push({ name, email, role });
    });
    return users;
  }

  function clearStaleLocalStorage() {
    // Older versions used localStorage for autosave. Remove any leftover state
    // so the bare URL is always a fresh blank form.
    try { localStorage.removeItem('velocity-intake-draft-v1'); } catch (e) {}
  }

  function toggleTrialURL() {
    const yes = document.querySelector('[name="has_free_trial"][value="yes"]').checked;
    document.getElementById('trial-url-wrap').hidden = !yes;
  }

  function toggleParentBrand() {
    const yes = document.querySelector('[name="is_multi_location"][value="yes"]').checked;
    document.getElementById('parent-brand-wrap').hidden = !yes;
  }

  function toggleExistingTwilio() {
    const yes = document.querySelector('[name="existing_twilio"][value="yes"]').checked;
    document.getElementById('twilio-existing-wrap').hidden = !yes;
  }

  function applyConditionals() {
    toggleTrialURL();
    toggleParentBrand();
    toggleExistingTwilio();
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
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  }

  function buildPayload(status) {
    const form = document.getElementById('intake-form');
    const fd = new FormData(form);
    return {
      status,
      business_name: fd.get('business_name') || null,
      city: fd.get('city') || null,
      address: fd.get('address') || null,
      timezone: fd.get('timezone') || null,
      contact_email: fd.get('contact_email') || null,
      contact_phone: fd.get('contact_phone') || null,
      hours: collectHours(fd),
      crm_platform: fd.get('crm_platform') || null,
      crm_username: fd.get('crm_username') || null,
      crm_password: fd.get('crm_password') || null,
      crm_store_id: fd.get('crm_store_id') || null,
      studio_phone_display: fd.get('studio_phone_display') || null,
      assistant_name: fd.get('assistant_name') || null,
      sign_off_name: fd.get('sign_off_name') || null,
      intro_offer: fd.get('intro_offer') || null,
      has_free_trial: fd.get('has_free_trial') === 'yes',
      trial_booking_url: fd.get('trial_booking_url') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      dashboard_users: collectUsers(),
      business_knowledge: collectBusinessKnowledge(fd),
      website_url: fd.get('website_url') || null,
      google_business_profile_url: fd.get('google_business_profile_url') || null,
      is_multi_location: fd.get('is_multi_location') === 'yes',
      parent_brand_name: fd.get('parent_brand_name') || null,
      instagram_handle: fd.get('instagram_handle') || null,
      facebook_page_url: fd.get('facebook_page_url') || null,
      tiktok_handle: fd.get('tiktok_handle') || null,
      preferred_subdomain: fd.get('preferred_subdomain') || null,
      existing_twilio: fd.get('existing_twilio') === 'yes',
      existing_twilio_account_sid: fd.get('existing_twilio_account_sid') || null,
      existing_twilio_auth_token: fd.get('existing_twilio_auth_token') || null,
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

    set('business_name', row.business_name);
    set('city', row.city);
    set('address', row.address);
    set('timezone', row.timezone);
    set('contact_email', row.contact_email);
    set('contact_phone', row.contact_phone);
    set('website_url', row.website_url);
    set('google_business_profile_url', row.google_business_profile_url);
    setRadio('is_multi_location', row.is_multi_location);
    set('parent_brand_name', row.parent_brand_name);

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
    set('crm_username', row.crm_username);
    set('crm_password', row.crm_password);
    set('crm_store_id', row.crm_store_id);
    setRadio('existing_twilio', row.existing_twilio);
    set('existing_twilio_account_sid', row.existing_twilio_account_sid);
    set('existing_twilio_auth_token', row.existing_twilio_auth_token);

    set('studio_phone_display', row.studio_phone_display);
    set('assistant_name', row.assistant_name);
    set('sign_off_name', row.sign_off_name);
    set('intro_offer', row.intro_offer);
    setRadio('has_free_trial', row.has_free_trial);
    set('trial_booking_url', row.trial_booking_url);
    set('preferred_words', row.preferred_words);
    set('avoid_words', row.avoid_words);
    set('instagram_handle', row.instagram_handle);
    set('facebook_page_url', row.facebook_page_url);
    set('tiktok_handle', row.tiktok_handle);
    set('preferred_subdomain', row.preferred_subdomain);

    const bk = row.business_knowledge || {};
    set('bk_service_description', bk.service_description);
    set('bk_single_session_rate', bk.single_session_rate);
    set('bk_membership_pricing', bk.membership_pricing);
    set('bk_package_pricing', bk.package_pricing);
    set('bk_cancellation_policy', bk.cancellation_policy);
    set('bk_eligibility', bk.eligibility);
    set('bk_ideal_client', bk.ideal_client);
    set('bk_unique_value', bk.unique_value);
    set('bk_current_members', bk.current_members);
    set('bk_approved_phrases', bk.approved_phrases);
    set('bk_forbidden_claims', bk.forbidden_claims);
    set('bk_first_visit', bk.first_visit);
    set('bk_faq', bk.faq);

    const users = Array.isArray(row.dashboard_users) ? row.dashboard_users : [];
    const list = document.getElementById('users-list');
    if (users.length > 0) {
      list.innerHTML = '';
      users.forEach((u, i) => {
        list.insertAdjacentHTML('beforeend', userRowHTML(i));
        const row = list.lastElementChild;
        row.querySelector('[name$="_name"]').value = u.name || '';
        row.querySelector('[name$="_email"]').value = u.email || '';
        row.querySelector('[name$="_role"]').value = u.role || 'manager';
      });
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
        draftId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        payload.id = draftId;
        await insertRow(payload);
        setDraftIdInUrl(draftId);
      }
      showDraftLink(true);
      btn.textContent = 'Saved \u2713';
      setTimeout(() => { btn.textContent = 'Save draft'; btn.disabled = false; }, 1500);
    } catch (err) {
      console.error(err);
      showError(`Draft save failed: ${err.message}`);
      btn.textContent = 'Save draft';
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

      if (!fd.get('business_name') || !fd.get('contact_email') || !fd.get('timezone')) {
        showError('Please fill in business name, email, and timezone.');
        btn.disabled = false;
        btn.textContent = 'Submit intake form';
        return;
      }

      const logoFile = document.getElementById('logo-input').files[0];
      const payload = buildPayload('pending');
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          showError('Logo is over 2MB. Please use a smaller image.');
          btn.disabled = false;
          btn.textContent = 'Submit intake form';
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

      document.getElementById('intake-form').hidden = true;
      document.getElementById('draft-banner').hidden = true;
      document.getElementById('success-screen').hidden = false;
      document.getElementById('success-screen').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      showError(`Something went wrong: ${err.message}. Try again, or email sirtobiaswade@gmail.com.`);
      btn.disabled = false;
      btn.textContent = 'Submit intake form';
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

  document.addEventListener('DOMContentLoaded', async () => {
    clearStaleLocalStorage();
    renderHours();
    renderUsers();

    await initDraftFromUrl();

    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'has_free_trial') toggleTrialURL();
      if (e.target.name === 'is_multi_location') toggleParentBrand();
      if (e.target.name === 'existing_twilio') toggleExistingTwilio();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
    document.getElementById('save-draft-btn').addEventListener('click', handleSaveDraft);

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
