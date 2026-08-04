(function () {
  'use strict';

  // One-use credential handoff page. Everything server-side lives in the
  // `credential-handoff` edge function; this file only renders what that
  // function describes and posts the answers back.
  //
  // Unlike the intake forms in this repo there is NO localStorage draft and no
  // autosave. Credentials should not outlive the submit, and a saved draft
  // would leave them sitting in the recipient's browser.
  const FN = 'https://jjckotsrhuxxftwmdlwc.supabase.co/functions/v1/credential-handoff';
  const ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';

  const token = new URLSearchParams(location.search).get('t') || '';

  const el = (id) => document.getElementById(id);

  function show(section) {
    ['hd-loading', 'hd-form-wrap', 'hd-state'].forEach((id) => { el(id).hidden = id !== section; });
  }

  function terminal(title, body) {
    el('hd-state-title').textContent = title;
    el('hd-state-body').textContent = body;
    show('hd-state');
  }

  const STATES = {
    invalid: ['This link is not valid', 'It may have been mistyped or truncated by an email client. Ask your Velocity contact for a fresh link.'],
    used: ['This link has already been used', 'Credential links work exactly once. If you need to send something again, ask your Velocity contact for a new link.'],
    expired: ['This link has expired', 'Ask your Velocity contact for a fresh link and we will send one right over.'],
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Fields carry an optional `group` so one link can collect the same set of
  // values for several places (two studios, say) without a bespoke page.
  function renderFields(fields) {
    const wrap = el('hd-fields');
    let html = '';
    let openGroup = null;
    fields.forEach((f) => {
      const group = f.group || '';
      if (group !== openGroup) {
        if (openGroup !== null) html += '</fieldset>';
        html += group ? `<fieldset class="hd-group"><legend>${esc(group)}</legend>` : '<fieldset class="hd-group">';
        openGroup = group;
      }
      const id = 'f_' + esc(f.key);
      const req = f.required ? ' <span class="hd-req" aria-hidden="true">*</span>' : '';
      const help = f.help ? `<span class="hd-help">${esc(f.help)}</span>` : '';
      if (f.type === 'checkbox') {
        html += `<label class="hd-check"><input type="checkbox" id="${id}" data-key="${esc(f.key)}"> <span>${esc(f.label)}${req}</span></label>${help}`;
      } else if (f.type === 'textarea') {
        html += `<label for="${id}">${esc(f.label)}${req}</label>${help}<textarea id="${id}" data-key="${esc(f.key)}" rows="3" autocomplete="off" spellcheck="false"></textarea>`;
      } else {
        // Password fields render as text on purpose: the sender needs to see
        // that a pasted secret arrived intact, and masking here protects
        // nothing (there is no shoulder-surfing threat the sender cannot see).
        const type = f.type === 'email' ? 'email' : 'text';
        html += `<label for="${id}">${esc(f.label)}${req}</label>${help}<input type="${type}" id="${id}" data-key="${esc(f.key)}" autocomplete="off" spellcheck="false" autocapitalize="off">`;
      }
    });
    if (openGroup !== null) html += '</fieldset>';
    wrap.innerHTML = html;
  }

  function collect() {
    const values = {};
    document.querySelectorAll('#hd-fields [data-key]').forEach((node) => {
      values[node.dataset.key] = node.type === 'checkbox' ? node.checked : node.value.trim();
    });
    return values;
  }

  function showError(msg) {
    const e = el('hd-error');
    e.textContent = msg;
    e.hidden = false;
  }

  async function load() {
    if (!token) return terminal.apply(null, STATES.invalid);
    let res;
    try {
      res = await fetch(`${FN}?token=${encodeURIComponent(token)}`, {
        headers: { apikey: ANON_KEY },
      }).then((r) => r.json());
    } catch (e) {
      return terminal('We could not reach Velocity', 'Check your connection and reload. If it keeps failing, email tobias@velocityaipartners.ai.');
    }
    if (res.state !== 'open') {
      const s = STATES[res.state] || ['Something went wrong', 'Please email tobias@velocityaipartners.ai and we will sort it out.'];
      return terminal(s[0], s[1]);
    }
    el('hd-label').textContent = res.label || 'Credential handoff';
    el('hd-intro').textContent = res.intro || '';
    el('hd-intro').hidden = !res.intro;
    renderFields(res.fields || []);
    show('hd-form-wrap');
  }

  el('hd-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    el('hd-error').hidden = true;
    const btn = el('hd-submit');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    let res;
    try {
      res = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ token: token, values: collect() }),
      }).then((r) => r.json());
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Send securely';
      return showError('We could not reach Velocity. Check your connection and try again.');
    }
    if (res.state === 'done') {
      return terminal('Received, thank you', 'The credentials are with the Velocity team and this link is now closed. You do not need to do anything else.');
    }
    if (res.state === 'used' || res.state === 'expired') {
      const s = STATES[res.state];
      return terminal(s[0], s[1]);
    }
    btn.disabled = false;
    btn.textContent = 'Send securely';
    showError(res.message || 'Something went wrong. Please try again.');
  });

  load();
})();
