# Intake Confirmation Email — n8n workflow

Reference / source-of-truth mirror of the n8n **Intake Confirmation Email** workflow
(`v3ajDIEDjDmCwMvi`), which emails a client a receipt when they submit the intake form.
The live logic is maintained in n8n; this file is generated from it for version control and review.

## Flow

`form.js` (`doFinalSubmit()`) fires `POST { intake_id }` -> this workflow reads the row ->
renders an HTML receipt -> emails `contact_email`. Only sends when `status = 'pending'`
(drafts and later admin states are skipped). Credentials (CRM / Twilio) are never included.

### Form trigger (in `form.js`)

```js
fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
  method: 'POST', keepalive: true,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ intake_id: draftId || payload.id }),
}).catch(() => {}); // best-effort; never blocks the success screen
```

## Nodes

1. **Webhook** — `POST` path `intake-confirmation`; responds on-received (200 immediately).
2. **GET Intake Info** (HTTP Request)
   - URL: `=https://jjckotsrhuxxftwmdlwc.supabase.co/rest/v1/location_intake_submissions?id=eq.{{ $json.body.intake_id }}&select=*`
   - Headers: `apikey` + `Authorization: Bearer` = **service_role** key (n8n var `apikeyREST`); `Accept: application/vnd.pgrst.object+json`
   - Options: `{"response":{"response":{"responseFormat":"json"}}}`
3. **Code** — builds `{ to, subject, html }` (below). Guards on `status='pending'`; excludes credential fields.
4. **Send a message** (Gmail) — `To={{ $json.to }}`, `Subject={{ $json.subject }}`, HTML body `{{ $json.html }}`.
   - Params: `{"sendTo":"={{ $json.to }}","subject":"={{ $json.subject }}","message":"={{ $json.html }}","options":{"appendAttribution":false}}`

## Code node

```js
// Input: the intake row from the HTTP Request (PostgREST) node.
// Output: { to, subject, html } for the email node.
const raw = $input.first().json;
let src = (raw && raw.contact_email === undefined && raw.data !== undefined) ? raw.data : raw;  // unwrap HTTP wrapper
if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) {} }                    // body came back as text
const r = Array.isArray(src) ? (src[0] || {}) : src;   // wrapped / string / object / array — all handled
if (!r || r.status !== 'pending') { return []; }       // ONLY email a completed submission (skip draft/reviewed/provisioned/rejected)

const ACR = { sms:'SMS', faq:'FAQ', faqs:'FAQs', hsa:'HSA', fsa:'FSA', cta:'CTA', url:'URL', crm:'CRM' };
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const has = v => v != null && String(v).trim() !== '';
const yn  = v => v === true ? 'Yes' : v === false ? 'No' : '';
const cap = w => !w ? w : (ACR[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)));
const pretty = c => has(c) ? String(c).split(/[_\s]+/).map(cap).join(' ') : '';
const prettyList = a => Array.isArray(a) ? a.map(pretty).filter(Boolean).join(', ') : '';
const pickOther = (code, other) => code === 'other' ? (has(other) ? other : 'Other') : pretty(code);
const s2 = v => Array.isArray(v) ? prettyList(v) : (v && typeof v === 'object') ? '' : v;

const tr = (label, val) => {
  const v = s2(val);
  return has(v)
    ? `<tr><td style="padding:5px 12px;color:#666;vertical-align:top;white-space:nowrap">${esc(label)}</td>` +
      `<td style="padding:5px 12px;color:#111">${esc(v).replace(/\n/g,'<br>')}</td></tr>` : '';
};
const sect = (title, rows) => {
  const body = rows.filter(Boolean).join('');
  return body ? `<h3 style="margin:22px 0 4px;font:600 15px Arial;color:#111">${esc(title)}</h3>` +
    `<table style="border-collapse:collapse;width:100%;font:14px Arial">${body}</table>` : '';
};

const bk = r.business_knowledge || {};
const ag = Array.isArray(r.automation_goals) ? { goals: r.automation_goals } : (r.automation_goals || {});
const hc = r.handoff_config || {};
const nc = r.notification_config || {};
const sc = r.sms_cadence || {};

const h = r.hours || {};
const hours = [['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun']]
  .map(([k,l]) => { const d = h[k]; if (!d) return '';
    return tr(l, d.closed ? 'Closed' : (has(d.open)||has(d.close) ? `${d.open||''} – ${d.close||''}` : '')); });
hours.push(tr('Confirmed accurate', yn(r.hours_confirmed)));

const users = Array.isArray(r.dashboard_users) ? r.dashboard_users : [];
const usersHtml = users.length ? sect('Dashboard users', [
  `<tr><td colspan="2" style="padding:5px 12px"><ul style="margin:0;padding-left:18p
  users.map(u => `<li>${esc(u.name||'')}${has(u.email)?` — ${esc(u.email)}`:''}${has(u.role)?` (${esc(pretty(u.role))})`:''}</li>`).join('') +
  `</ul></td></tr>`]) : '';

const html = `<div style="max-width:640px;margin:0 auto;font:14px Arial;color:#111;l
  ${has(r.logo_url) ? `<img src="${esc(r.logo_url)}" alt="" style="max-height:64px;margin-bottom:12px">` : ''}
  <h2 style="margin:0 0 6px">Thanks — we've got your onboarding form ✅</h2>
  <p style="color:#444">Hi${has(r.business_name) ? ` ${esc(r.business_name)} team` : ''}, we've received your Velocity AI onboarding submission. Our team will review your information and keep you
informed of next steps and progress along the way. Here's a copy of what you sent us
  ${sect('Business', [
    tr('Business name', r.business_name), tr('Business email', r.business_email), tr_phone),
    tr('Address', r.address), tr('City', r.city), tr('Timezone', r.timezone),
    tr('Primary contact email', r.contact_email), tr('Primary contact phone', r.cont
    tr('Studio phone (public)', r.studio_phone_display),
    tr('Multi-location', yn(r.is_multi_location)), tr('Parent brand', pickOther(r.pand_other)),
  ])}
  ${sect('Hours', hours)}
  ${sect('CRM', [
    tr('Platform', pickOther(r.crm_platform, r.crm_platform_other)), tr('Store ID',
    tr('Admin account confirmed', yn(r.crm_account_confirmed)),
    tr('Login details', (has(r.crm_username)||has(r.crm_password)) ? 'Received secur
    tr('Existing Twilio', yn(r.existing_twilio)),
  ])}
  ${sect('Branding & messaging', [
    tr('Assistant name', r.assistant_name), tr('Sign-off name', r.sign_off_name),
    tr('AI voice', pretty(r.chatbot_voice)), tr('Voice notes', r.chatbot_voice_notes),
    tr('AI tone', prettyList(r.chatbot_tone)), tr('Tone notes', r.chatbot_tone_notes
    tr('Primary call-to-action', pickOther(r.main_cta, r.main_cta_other)),
    tr('Intro offer', r.intro_offer), tr('Free trial', yn(r.has_free_trial)), tr('Trking_url),
    tr('Booking / payment link', r.booking_payment_link),
    tr('Preferred words', r.preferred_words), tr('Words to avoid', r.avoid_words),
  ])}
  ${sect('Services & pricing', [
    tr('Service', bk.service_description), tr('Single-session rate', bk.single_session_rate),
    tr('Membership pricing', bk.membership_pricing), tr('Package pricing', bk.packag
    tr('Promotions', bk.promotions), tr('Cancellation policy', bk.cancellation_policy), tr('Eligibility', bk.eligibility),
    tr('Accepts insurance', yn(bk.accepts_insurance)), tr('Accepts HSA/FSA', yn(bk.ace notes', bk.insurance_notes),
  ])}
  ${sect('About & voice', [
    tr('Ideal client', bk.ideal_client), tr('Pain points', bk.pain_points), tr('Unique value', bk.unique_value),
    tr('First visit', bk.first_visit), tr('FAQ', bk.faq), tr('Testimonials', bk.test
  ])}
  ${sect('Leads & automation', [
    tr('Automation goals', prettyList(ag.goals)), tr('Goals — other', ag.other_text),
    tr('Lead sources', prettyList(bk.lead_sources)), tr('Lead sources — other', bk.l
    tr('Reactivation segments', prettyList(ag.reactivation_segments)), tr('Reactivation — other', ag.reactivation_segments_other),
    tr('Reactivation offer', ag.reactivation_offer),
  ])}
  ${sect('Messaging & handoff', [
    tr('Handoff rule', pickOther(hc.rule, hc.rule_other)), tr('Notify channels', prettyList(nc.channels)),
    tr('SMS initial delay', sc.initial_delay), tr('SMS follow-up cadence', sc.follow, r.kpi_targets),
  ])}
  ${sect('Online presence', [
    tr('Website', r.website_url), tr('Google Business', r.google_business_profile_url),
    tr('Instagram', r.instagram_handle), tr('Facebook', r.facebook_page_url), tr('Ti
  ])}
  ${sect('Launch & notes', [ tr('Target launch', r.target_launch_date), tr('Notes',
  ${usersHtml}
  <p style="color:#888;font-size:12px;margin-top:22px">Need to change something? Jusnce: ${esc(r.id)}</p>
</div>`;

return [{ json: { to: r.contact_email, subject: "We've received your onboarding form ✅", html } }];  
```
