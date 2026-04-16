(() => {
  const SUPABASE_URL = 'https://kxkchytrjhgsndnvvxhc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_FsTW9ztAX9XgyspAV9s38w_torjlK-B';
  const TABLE = 'location_intake_submissions';
  const BUCKET = 'intake-logos';
  const AUTOSAVE_KEY = 'velocity-intake-draft-v1';

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

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

  function saveDraft() {
    const form = document.getElementById('intake-form');
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) continue;
      obj[k] = v;
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(obj));
    } catch (e) { /* storage full or disabled */ }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      const form = document.getElementById('intake-form');
      for (const [k, v] of Object.entries(obj)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.type === 'radio') {
          const radio = form.querySelector(`[name="${k}"][value="${v}"]`);
          if (radio) radio.checked = true;
        } else if (el.type === 'checkbox') {
          el.checked = v === 'on' || v === true;
        } else {
          el.value = v;
        }
      }
      applyConditionals();
    } catch (e) { /* invalid json, ignore */ }
  }

  function clearDraft() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
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

  async function submitSubmission(payload) {
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
      throw new Error(`Submission failed: ${resp.status} ${body}`);
    }
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

      let logoUrl = null;
      const logoFile = document.getElementById('logo-input').files[0];
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          showError('Logo is over 2MB. Please use a smaller image.');
          btn.disabled = false;
          btn.textContent = 'Submit intake form';
          return;
        }
        logoUrl = await uploadLogo(logoFile);
      }

      const payload = {
        business_name: fd.get('business_name'),
        city: fd.get('city') || null,
        address: fd.get('address') || null,
        timezone: fd.get('timezone'),
        contact_email: fd.get('contact_email'),
        contact_phone: fd.get('contact_phone') || null,
        logo_url: logoUrl,
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

      await submitSubmission(payload);
      clearDraft();
      document.getElementById('intake-form').hidden = true;
      document.getElementById('success-screen').hidden = false;
      document.getElementById('success-screen').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      showError(`Something went wrong: ${err.message}. Try again, or email sirtobiaswade@gmail.com.`);
      btn.disabled = false;
      btn.textContent = 'Submit intake form';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHours();
    renderUsers();
    restoreDraft();
    document.getElementById('intake-form').addEventListener('input', saveDraft);
    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'has_free_trial') toggleTrialURL();
      if (e.target.name === 'is_multi_location') toggleParentBrand();
      if (e.target.name === 'existing_twilio') toggleExistingTwilio();
      saveDraft();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
  });
})();
