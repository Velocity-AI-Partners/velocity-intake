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
      title: '1. Your franchise information',
      // Contact + socials defaults verified 2026-07-06: contacts provided by
      // George; socials read from beemlightsauna.com's own footer. No TikTok
      // link exists on their site, so that field stays empty.
      fields: [
        { name: 'brand_name', col: 'brand_name', label: 'Brand name', type: 'text', required: true, value: 'beem Light Sauna' },
        { name: 'contact_first_name', virtual: true, label: 'Primary contact first name', type: 'text', required: true, value: 'Veronica' },
        { name: 'contact_last_name', virtual: true, label: 'Primary contact last name', type: 'text', required: true, value: 'Stranc' },
        { name: 'contact_email', col: 'contact_email', label: 'Primary contact email', type: 'email', required: true, value: 'vstranc@beemlightsauna.com' },
        { name: 'additional_contacts', col: 'additional_contacts', label: 'Additional contacts: who at corporate needs dashboard access?', type: 'users', help: 'Email is required for each person. These become your corporate logins with the franchise-wide view.' },
        { name: 'website_url', col: 'website_url', label: 'Franchise website', type: 'url', value: 'https://www.beemlightsauna.com/', placeholder: 'https://' },
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
      id: 'goals',
      title: '2. What are your goals',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'pilot_success', label: 'What needs to happen in this pilot for it to be successful for you?', type: 'textarea', rows: 4 },
      ],
    },
    {
      id: 'knowledge',
      title: '3. Brand-wide knowledge base',
      lead: 'We filled this out ourselves. Please confirm information is accurate.',
      // Pre-filled 2026-07-06 from beemlightsauna.com research (FAQ, therapy
      // pages, terms & conditions, sampled location pages). Every value below
      // is sourced from their own published content — nothing invented. Blank
      // fields are things their site does not answer.
      bucket: 'brand_knowledge',
      fields: [
        { name: 'ideal_client', label: 'Who is your ideal client?', type: 'textarea', rows: 3, value: 'Self care seekers who want private, zero intimidation wellness time; stressed professionals; gym averse wellness consumers; athletes using light therapy for recovery; people seeking temporary relief for aches, pains, skin, and sleep.' },
        { name: 'pain_points', label: 'Their pain points and motivations', type: 'textarea', rows: 3, value: 'Stress and burnout; wanting private self care time without gym intimidation; muscle and joint aches seeking temporary relief; athletic recovery; skin health; better sleep.' },
        { name: 'service_description', label: 'Describe your services as you’d explain them to a brand-new customer', type: 'textarea', rows: 5, required: true, value: 'beem offers private light therapy sessions in your own suite: a 40 minute full spectrum infrared sauna session (near, mid, and far infrared) with complimentary chromotherapy, a 15 minute red light therapy session, or both back to back. Suites are Solo (1 person) or Social (up to 2 people), with built in entertainment and fresh towels provided. Blue and green light therapy round out the menu, plus a corporate wellness program. Maximum 1 session per day. HSA and FSA accepted.' },
        { name: 'first_visit', label: 'What should someone expect on their first visit?', type: 'textarea', rows: 4, value: 'A private suite (Solo, or Social for up to 2 people). Choose a 40 minute infrared sauna session, a 15 minute red light therapy session, or both. Towels and water are provided; wear loose breathable clothing and remove oils and lotions before the session. Built in entertainment in every suite. Maximum 1 session per day.' },
        { name: 'promotions', label: 'Brand-wide promotions and discounts', type: 'textarea', rows: 3, value: 'Live now: $25 infrared or red light sessions (limited time anniversary promo); promo code comeback50 for $50 off the first 3 months of Unlimited; intro offers vary by studio (BOGO or 50% off first session); founding member discounts at presale studios.' },
        { name: 'cancellation_policy', label: 'Cancellation, freeze & refund policy', type: 'textarea', rows: 4, value: 'Cancel or reschedule with at least 4 hours notice for a full refund. Under 4 hours: $25 fee per person. More than 10 minutes late or a no show: session canceled plus a $25 fee per person. These apply to memberships and packages too. Memberships can be canceled anytime but fees are non refundable; access continues through the end of the paid period; membership auto renews monthly until canceled. No freeze or hold policy is published on your site; if one exists, add it here.' },
        { name: 'age_policy', label: 'Age eligibility or restrictions', type: 'text', value: 'Ages 16 and up; under 18 requires a parent or guardian signed consent form.' },
        { name: 'accepts_insurance', label: 'Do you accept health insurance?', type: 'yesno' },
        { name: 'accepts_hsa_fsa', label: 'Do you accept HSA / FSA?', type: 'yesno', value: 'yes' },
        { name: 'testimonials', label: 'Testimonials or reviews to highlight', type: 'textarea', rows: 3, value: 'From your homepage: "If you\'ve ever thought, I wish I could just relax by myself, then you need to try beem." Nashville Green Hills holds a 5.0 rating across roughly 98 Google reviews. Add any favorites you want highlighted when we speak to people.' },
        { name: 'faq', label: 'Top questions customers ask, and your answers', type: 'textarea', rows: 7, value: 'From your site FAQ: what to expect (private suite, 40 min sauna or 15 min red light, built in entertainment); what to wear (towels provided, or loose breathable clothing; remove oils and lotions first); how infrared differs from a traditional sauna (heats the body, not the air); surgical implants (consult your physician); HSA and FSA (yes); late and cancel policy (4 hours notice, $25 fee); payment (all major cards); what you can bring (electronics are fine, books welcome); how often (max 1 session per day); sanitized between every session; Social Sauna fits 2 people; towels and water provided; ages 16 and up, under 18 needs a parent or guardian consent form.' },
      ],
    },
    {
      id: 'selling',
      title: '4. Customizing your AI team',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'channels', label: 'Which channels may the AI use?', type: 'checkboxes', options: [
          { value: 'text', label: 'Text messages' },
          { value: 'email', label: 'Email' },
          { value: 'calls', label: 'Phone calls' },
        ]},
        { name: 'ai_voice', label: 'AI Team Member voice', type: 'radiocards', value: 'brand_persona', options: [
          { value: 'brand_persona', title: 'Brand persona', desc: 'A friendly named character we create for your brand, not a real person.', example: 'Hi! I\'m Max from (your studio) \u{1F44B} Let\'s get you booked for a free demo. What day works best?' },
          { value: 'team', title: 'Team', desc: 'Speaks as your whole team, "we" and "us."', example: 'Hey! Thanks for reaching out to (your studio). We\'d love to have you in for a free demo. What day works best?' },
          { value: 'owner', title: 'Owner', desc: 'Speaks as a real person, you or a named owner.', example: 'Hi, this is [your name] from (your studio)! I\'d personally love to get you in for a free demo. What day works?' },
          { value: 'unsure', title: 'Unsure, recommend what works', desc: 'We\'ll pick the best-performing voice for a studio like yours.', example: 'We\'ll recommend the best fit for (your studio). Team and Brand persona usually perform best.' },
        ]},
        { name: 'ai_name', label: 'What should the name be?', type: 'text', showIf: { field: 'ai_voice', values: ['brand_persona', 'owner'] }, help: 'You already have luumi in your studios. The assistant can use the luumi name, a human first name, or something else. Want a different name per studio? Set it in the personalization block on that location card in section 9.' },
        { name: 'quiet_hours', label: 'Any quiet hours or contact time rules, outside of following applicable laws?', type: 'text', placeholder: 'e.g. no texts before 9am or after 8pm local time' },
        { name: 'tone_style', label: 'Tone & style', type: 'checkboxes', boxed: true, help: 'Default is friendly & professional. Click any that fit — we pre-checked what matches the beem voice.', value: ['warm', 'calm_reassuring'], options: [
          { value: 'friendly', label: 'Friendly' },
          { value: 'professional', label: 'Professional' },
          { value: 'warm', label: 'Warm' },
          { value: 'upbeat', label: 'Upbeat' },
          { value: 'motivational', label: 'Motivational' },
          { value: 'calm_reassuring', label: 'Calm & reassuring' },
          { value: 'concise_direct', label: 'Concise & direct' },
          { value: 'premium_upscale', label: 'Premium / upscale' },
        ]},
        { name: 'approved_phrases', label: 'Words, phrases, or taglines to use', type: 'tags', value: ['restore, reset, and recharge', 'This time is for YOU', 'light session', 'private suite', 'make space for yourself', 'a 15 minute glow that works at the cellular level', 'walk out renewed, not just restored', 'detox from the inside out', 'zero gym intimidation'] },
        { name: 'avoid_words', label: 'Words, phrases, or claims to avoid', type: 'tags', help: 'Anything medical, legal, or brand-sensitive we should never say.', value: ['cure', 'heal a condition', 'diagnose', 'prevent disease', 'naming diseases as treatment targets', 'unhedged pain or inflammation claims', 'unhedged 600-calorie claim'] },
        { name: 'unique_value', label: 'What makes beem different?', type: 'textarea', rows: 4, value: 'Full spectrum infrared (near, mid, and far) combined with targeted LED chromotherapy in one private session; private Solo and Social suites instead of communal saunas; dedicated red light therapy alongside sauna; evidence led positioning, never hype; HSA and FSA eligible.' },
        { name: 'nurture_head', label: 'Lead nurturing and reactivation', type: 'subheading' },
        { name: 'sales_style', label: 'How assertive should follow-up be?', type: 'select', options: [
          { value: '', label: 'Choose a style' },
          { value: 'gentle', label: 'Gentle and consultative: educate first, invite softly' },
          { value: 'balanced', label: 'Balanced: helpful, with clear nudges toward booking' },
          { value: 'persistent', label: 'Persistent: keep following up until we get an answer' },
        ]},
        { name: 'who_books', label: 'When a lead is ready, should the AI book them directly?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'ai_books', label: 'Yes, book straight into the calendar' },
          { value: 'handoff', label: 'No, hand off to studio staff to close' },
          { value: 'per_location', label: 'Depends on the location' },
        ]},
        { name: 'price_disclosure', label: 'Can AI quote pricing?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'freely', label: 'Yes, quote prices freely' },
          { value: 'intro_only', label: 'Only the intro offer, memberships in person' },
          { value: 'never', label: 'No, invite them in instead' },
        ]},
        { name: 'objections_top', label: 'What are the top objections you hear, and how do you best answer them?', type: 'textarea', rows: 4 },
      ],
    },
    {
      id: 'escalations',
      title: '5. Escalations & exceptions',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'escalation_triggers', label: 'When must the AI stop and hand off to a person?', type: 'checkboxes', options: [
          { value: 'asks_human', label: 'The customer directly asks for a human' },
          { value: 'medical', label: 'Medical questions (pregnancy, implants, medications)' },
          { value: 'refund_billing', label: 'Refund or billing disputes' },
          { value: 'cancellation_request', label: 'Membership cancellation requests' },
          { value: 'upset_customer', label: 'Angry or upset customers' },
          { value: 'safety_incident', label: 'Injury or safety incidents' },
        ]},
        { name: 'escalation_triggers_other', label: 'Any other specific handoffs you would like?', type: 'textarea', rows: 2 },
        { name: 'escalation_routing', label: 'Where do escalations go?', type: 'select', help: 'If the studio GM, escalations go to each studio\'s general manager from its location card in section 9.', options: [
          { value: '', label: 'Choose one' },
          { value: 'studio', label: 'The studio GM' },
          { value: 'corporate', label: 'Corporate' },
        ]},
        { name: 'corporate_escalation_person', label: 'Who at corporate should receive escalations?', type: 'person', showIf: { field: 'escalation_routing', values: ['corporate'] } },
      ],
    },
    {
      id: 'rules',
      title: '6. Franchisee permissions, brand rules, and consistency',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'offer_authority', label: 'Who can create & edit campaigns?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'corporate_only', label: 'Corporate only' },
          { value: 'propose_approve', label: 'Studio teams propose, corporate approves' },
          { value: 'guardrails', label: 'Studio teams run their own within guardrails' },
        ]},
        { name: 'kb_authority', label: 'Who can create & edit the knowledge base?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'corporate_only', label: 'Corporate only' },
          { value: 'propose_approve', label: 'Studio teams propose, corporate approves' },
          { value: 'guardrails', label: 'Studio teams edit their own within guardrails' },
        ]},
        { name: 'template_approval', label: 'Message templates: who approves what the AI sends?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'corporate_once', label: 'Corporate approves once, for everyone' },
          { value: 'per_location', label: 'Each studio GM reviews their own' },
          { value: 'corporate_plus_tweaks', label: 'Corporate sets them, studios may request tweaks' },
        ]},
      ],
    },
    {
      id: 'systems',
      title: '7. Systems & access',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'mindbody_access', label: 'Mindbody access: one corporate login, or separate per studio?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'corporate', label: 'One corporate login covers all studios' },
          { value: 'per_studio', label: 'Each studio has its own login' },
          { value: 'not_sure', label: 'Not sure, our team will check' },
        ], help: 'You can enter per-studio credentials on each location card in section 9, or share them with us separately if you prefer.' },
        { name: 'lead_sources', label: 'Where do new leads come from today?', type: 'checkboxes', options: [
          { value: 'website', label: 'Website forms (beemlightsauna.com)' },
          { value: 'mindbody', label: 'Mindbody / the member app' },
          { value: 'paid_ads', label: 'Paid ads (Meta, Google)' },
          { value: 'classpass', label: 'ClassPass' },
          { value: 'walkins_calls', label: 'Walk-ins and phone calls' },
        ], help: 'Check everything that applies. We noticed website forms, Mindbody, and ClassPass.' },
        { name: 'lead_sources_other', label: 'Other lead sources, and who manages your website and ad accounts?', type: 'textarea', rows: 2 },
        { name: 'call_center', label: 'Do these studios use the corporate call center for lead intake today?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'yes_all', label: 'Yes, all of them' },
          { value: 'some', label: 'Some of them' },
          { value: 'no', label: 'No' },
          { value: 'not_sure', label: 'Not sure' },
        ]},
        { name: 'call_center_notes', label: 'How should the AI work alongside the call center?', type: 'textarea', rows: 2, placeholder: 'e.g. AI handles texts and email, call center keeps phones; or AI takes over fully', showIf: { field: 'call_center', values: ['yes_all', 'some'] } },
        { name: 'texting_today', label: 'Are studios texting leads today? From what number or system?', type: 'textarea', rows: 2, placeholder: 'e.g. Mindbody Messenger, a personal cell, not texting at all' },
      ],
    },
    {
      id: 'oversight',
      title: '8. Oversight & reporting',
      bucket: 'franchise_rollout',
      fields: [
        { name: 'studio_visibility', label: 'Can studio teams see each other\'s statistics?', type: 'select', options: [
          { value: '', label: 'Choose one' },
          { value: 'leaderboard', label: 'Yes, a friendly leaderboard' },
          { value: 'own_only', label: 'No, each studio sees only itself' },
        ]},
        { name: 'weekly_numbers', label: 'Which numbers do you want to see in your analytics review?', type: 'textarea', rows: 3, value: 'New leads; response time; response rate; sessions booked; sessions showed; memberships sold.', help: 'This is our standard set. Add or remove anything.' },
      ],
    },
    {
      id: 'locations',
      title: '9. Your locations',
      bucket: 'locations',
      fields: [
        { name: 'locations', label: '', type: 'locations' },
      ],
    },
  ];

  const LOCATION_FIELDS = [
    { name: 'page_url', label: 'Your studio’s web page. Paste it and hit Pre-fill to go faster.', type: 'prefill-url', placeholder: 'https://.../locations/your-city' },
    { name: 'name', label: 'Location name', type: 'text', placeholder: 'e.g. beem Scottsdale', required: true },
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
    { name: 'crm_platform', label: 'Booking / CRM platform', type: 'select', options: [
      { value: 'Mindbody', label: 'Mindbody' },
      { value: 'ClubReady', label: 'ClubReady' },
    ]},
    { name: 'crm_store_id', label: 'CRM store / location ID (if known)', type: 'text' },
    { name: 'crm_username', label: 'CRM username (optional here)', type: 'text', help: 'Enter here, or share credentials with us separately if you prefer.' },
    { name: 'crm_password', label: 'CRM password (optional here)', type: 'text' },
    { name: 'booking_link', label: 'If someone asks for a link, where should we send people to book?', type: 'url', placeholder: 'https://' },
    { name: 'studio_email', label: 'Studio email', type: 'email', placeholder: 'e.g. yourcity@beemlightsauna.com' },
    { name: 'intro_offer', label: 'What is your intro / first-visit offer?', type: 'text', placeholder: 'e.g. BOGO first experience, 50% off first session' },
    { name: 'membership_pricing', label: 'What is your membership pricing (per month)?', type: 'textarea', rows: 2, placeholder: 'e.g. 4 sessions $109 / 8 sessions $149 / Unlimited $179' },
    { name: 'pack_pricing', label: 'What is your session pack pricing?', type: 'textarea', rows: 2, placeholder: 'e.g. 6 pack $209 / 10 pack $369 / 20 pack $609' },
    { name: 'dropin_price', label: 'What is your drop-in / single session price?', type: 'text', placeholder: 'Not published online anywhere, please fill in' },
    { name: 'gm', label: 'General manager', type: 'person' },
    { name: 'location_users', label: 'Who else at this location needs access?', type: 'people', help: 'Email required for each person.' },
    { name: 'personalization_head', label: 'Personalization for this studio', type: 'subheading', help: 'All optional. Leave anything blank to use the brand-wide answer from sections 4 and 5.' },
    { name: 'ai_name_override', label: 'AI team member name for this studio', type: 'text' },
    { name: 'ai_signoff_override', label: 'Email sign-off for this studio', type: 'text' },
    { name: 'voice_override', label: 'Anything different from corporate with: voice or tone', type: 'textarea', rows: 2 },
    { name: 'phrases_override', label: 'Anything different from corporate with: phrases to use', type: 'textarea', rows: 2 },
    { name: 'avoid_override', label: 'Anything different from corporate with: words or claims to avoid', type: 'textarea', rows: 2 },
    { name: 'assertiveness_override', label: 'Follow-up style for this studio', type: 'select', options: [
      { value: '', label: 'Use the brand-wide setting' },
      { value: 'gentle', label: 'Gentle and consultative' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'persistent', label: 'Persistent' },
    ]},
    { name: 'followup_override', label: 'Follow-up touches before backing off, for this studio', type: 'select', options: [
      { value: '', label: 'Use the brand-wide setting' },
      { value: '3-4', label: '3 to 4 touches' },
      { value: '6-8', label: '6 to 8 touches' },
      { value: '10+', label: '10 or more' },
    ]},
    { name: 'notes', label: 'Notes for this location', type: 'textarea', rows: 2 },
  ];

  // --- Preset data (applied on a fresh form; skipped when resuming a draft) ---
  // Location details verified from each studio's own page on beemlightsauna.com
  // (2026-07-06). Glenwood's hours are not published on its page, so its grid
  // keeps the neutral form defaults — never guessed. Timezones follow the
  // studio's state. Booking platform is Mindbody across all four (George).
  // Mindbody location IDs read from each studio's own checkout links
  // (members.beemlightsauna.com ?location-id=...); Glenwood's page has no
  // checkout links, so its ID stays blank. Studio emails from each page's
  // mailto links.
  const PRESET_LOCATIONS = [
    {
      page_url: 'https://www.beemlightsauna.com/location/nashville-green-hills',
      name: 'beem Nashville - Green Hills',
      address: '3760 Hillsboro Pike',
      city_state: 'Nashville, TN',
      zip: '37215',
      timezone: 'America/Chicago',
      studio_phone: '(615) 600-4044',
      crm_platform: 'Mindbody',
      crm_store_id: '5739370',
      booking_link: 'https://www.mindbodyonline.com/explore/locations/beem-nashville-green-hills',
      studio_email: 'nashville-greenhills@beemlightsauna.com',
      intro_offer: 'Buy one get one free light sessions, first-time clients only',
      membership_pricing: '4 sessions $129 / 8 sessions $169 / Unlimited $199 per month',
      pack_pricing: 'Summer 6 pack $229 (buy 5 get 1 free) / 10 pack $389 / 20 pack $629',
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
      crm_store_id: '5738030',
      booking_link: 'https://www.mindbodyonline.com/explore/locations/beem-summerville',
      studio_email: 'summerville@beemlightsauna.com',
      intro_offer: '50% off your first infrared sauna session',
      membership_pricing: '4 sessions $109 / 8 sessions $149 / Unlimited $179 per month',
      pack_pricing: 'Summer 6 pack $209 (buy 5 get 1 free) / 10 pack $369 / 20 pack $609',
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
      crm_store_id: '5738705',
      booking_link: 'https://www.mindbodyonline.com/explore/locations/beem-west-mckinney',
      studio_email: 'westmckinney@beemlightsauna.com',
      intro_offer: '50% off your first infrared sauna session',
      membership_pricing: '4 sessions $109 / 8 sessions $149 / Unlimited $179 per month',
      pack_pricing: 'Summer 6 pack $209 (buy 5 get 1 free) / 10 pack $369 / 20 pack $609',
      hours: {
        mon: { open: '08:00', close: '20:00' }, tue: { open: '08:00', close: '20:00' },
        wed: { open: '08:00', close: '20:00' }, thu: { open: '08:00', close: '20:00' },
        fri: { open: '08:00', close: '17:00' }, sat: { open: '09:00', close: '15:00' },
        sun: { open: '11:00', close: '16:00' },
      },
    },
    {
      page_url: 'https://www.beemlightsauna.com/location/glenwood',
      name: 'beem Atlanta Glenwood',
      address: '475 Bill Kennedy Wy Sta A',
      city_state: 'Atlanta, GA',
      zip: '30316',
      timezone: 'America/New_York',
      studio_phone: '(404) 973-2288',
      crm_platform: 'Mindbody',
      booking_link: 'https://www.mindbodyonline.com/explore/locations/beem-atlanta-glenwood',
      studio_email: 'atlanta-glenwood@beemlightsauna.com',
      notes: 'Hours are not published on your website and directory listings disagree (one shows Tuesday closed). Please set the correct hours above. We also could not find this studio\'s booking links, pricing, or intro offer on beemlightsauna.com. A separate site, beematlanta.com, advertises a $20 first session (valued at $118). Is that current?',
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
      control = `<select name="${name}">${(f.options || []).map(o => `<option value="${esc(o.value)}"${f.value === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'checkboxes') {
      const pre = Array.isArray(f.value) ? f.value : [];
      control = `<div class="checkbox-group${f.boxed ? ' checkbox-group--boxed' : ''}">${(f.options || []).map(o => `
        <label class="checkbox-row"><input type="checkbox" name="${name}" value="${esc(o.value)}"${pre.includes(o.value) ? ' checked' : ''}> <span>${esc(o.label)}</span></label>`).join('')}</div>`;
    } else if (f.type === 'tags') {
      const chips = (Array.isArray(f.value) ? f.value : []).map(t => `<span class="tag-chip" data-value="${esc(t)}">${esc(t)}<button type="button" class="tag-remove" aria-label="Remove ${esc(t)}">&times;</button></span>`).join('');
      control = `<div class="tags-input" data-name="${name}">${chips}<input type="text" class="tags-entry" placeholder="${esc(f.placeholder || 'Type a phrase, then press comma...')}"></div>`;
    } else if (f.type === 'yesno') {
      control = `<div class="yesno-group">
        <label class="yesno-option"><input type="radio" name="${name}" value="yes"${f.value === 'yes' ? ' checked' : ''}><span>Yes</span></label>
        <label class="yesno-option"><input type="radio" name="${name}" value="no"${f.value === 'no' ? ' checked' : ''}><span>No</span></label>
      </div>`;
    } else if (f.type === 'radiocards') {
      control = `<div class="radio-cards">${(f.options || []).map(o => `
        <label class="radio-card">
          <input type="radio" name="${name}" value="${esc(o.value)}"${f.value === o.value ? ' checked' : ''}>
          <span class="radio-card__body">
            <span class="radio-card__title">${esc(o.title)}</span>
            <span class="radio-card__desc">${esc(o.desc)}</span>
          </span>
          <span class="radio-card__example">${esc(o.example)}</span>
        </label>`).join('')}</div>`;
    } else if (f.type === 'subheading') {
      // Visual divider inside a card; renders no input and saves nothing.
      return `<div class="loc-subhead"><h4>${esc(f.label)}</h4>${f.help ? `<p class="field-help">${esc(f.help)}</p>` : ''}</div>`;
    } else if (f.type === 'finding') {
      // One-off "confirm our homework" card: quotes a policy found on the
      // client's own site and asks them to confirm or correct it. Saved as
      // { quote, source, verdict, correction } in the section's bucket.
      control = `
        <div class="finding-card">
          <blockquote class="finding-quote">${esc(f.quote)}</blockquote>
          ${f.source ? `<div class="finding-source">Found on ${esc(f.source)}</div>` : ''}
          <div class="finding-controls">
            <select name="${name}_verdict">
              <option value="">Is this correct?</option>
              <option value="confirmed">Yes, correct for all locations</option>
              <option value="needs_correction">Not quite, see my note</option>
              <option value="discuss">Not sure, let's discuss</option>
            </select>
            <textarea name="${name}_correction" rows="2" placeholder="Correction or notes (optional)"></textarea>
          </div>
        </div>`;
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

  // --- Tag inputs ---------------------------------------------------------
  function tagsWrap(name) { return document.querySelector(`.tags-input[data-name="${name}"]`); }

  function addTagChip(name, value) {
    const wrap = tagsWrap(name);
    const entry = wrap && wrap.querySelector('.tags-entry');
    if (!wrap || !entry) return;
    const span = document.createElement('span');
    span.className = 'tag-chip';
    span.dataset.value = value;
    span.textContent = value;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-remove';
    btn.setAttribute('aria-label', `Remove ${value}`);
    btn.innerHTML = '&times;';
    span.appendChild(btn);
    wrap.insertBefore(span, entry);
  }

  function clearTags(name) {
    const wrap = tagsWrap(name);
    if (wrap) wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
  }

  function collectTags(name) {
    const wrap = tagsWrap(name);
    if (!wrap) return [];
    const vals = Array.from(wrap.querySelectorAll('.tag-chip')).map(c => c.dataset.value);
    // Text typed but not yet committed with a comma still counts.
    const entry = wrap.querySelector('.tags-entry');
    const pending = entry ? entry.value.trim() : '';
    if (pending) vals.push(pending);
    return vals;
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
      throw new Error('Logo file is over 2MB. Please compress it and try again.');
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
        if (f.type === 'tags') {
          bucketObj[f.name] = collectTags(f.name);
          return;
        }
        if (f.type === 'yesno' || f.type === 'radiocards') {
          const sel = document.querySelector(`[name="${f.name}"]:checked`);
          bucketObj[f.name] = sel ? sel.value : '';
          return;
        }
        if (f.type === 'person') {
          const p = collectPerson(f.name);
          if (personHasData(p)) bucketObj[f.name] = p;
          return;
        }
        if (f.type === 'people') {
          const people = collectPeople(f.name);
          if (people.length) bucketObj[f.name] = people;
          return;
        }
        if (f.type === 'finding') {
          const verdict = (document.querySelector(`[name="${f.name}_verdict"]`) || {}).value || '';
          const correction = ((document.querySelector(`[name="${f.name}_correction"]`) || {}).value || '').trim();
          bucketObj[f.name] = { quote: f.quote, source: f.source || '', verdict, correction };
          return;
        }
        const el = document.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        const v = el.value.trim();
        if (f.col) payload[f.col] = v || null;
        else if (!s.bucketFields || s.bucketFields.includes(f.name)) bucketObj[f.name] = v;
      });
      // Multiple sections may share one jsonb bucket (field names stay unique
      // across them) — merge instead of first-section-wins. The locations
      // bucket is an array, never merged into.
      if (s.bucket && Object.keys(bucketObj).length) {
        if (payload[s.bucket] === undefined) payload[s.bucket] = bucketObj;
        else if (!Array.isArray(payload[s.bucket])) Object.assign(payload[s.bucket], bucketObj);
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
          // A draft's saved set replaces any preset-checked defaults entirely.
          if (!Array.isArray(bucketObj[f.name])) return;
          document.querySelectorAll(`[name="${f.name}"]`).forEach(el => { el.checked = false; });
          bucketObj[f.name].forEach(v => {
            const el = document.querySelector(`[name="${f.name}"][value="${v}"]`);
            if (el) el.checked = true;
          });
          return;
        }
        if (f.type === 'tags') {
          let vals = bucketObj[f.name];
          if (vals === undefined) return; // draft predates this field: keep preset chips
          // Old drafts saved these as textarea prose: '·'-separated phrase
          // lists split cleanly; otherwise fall back to commas.
          if (typeof vals === 'string') vals = vals.includes('·') ? vals.split('·') : vals.split(',');
          clearTags(f.name);
          (Array.isArray(vals) ? vals : []).map(v => String(v).trim()).filter(Boolean).forEach(v => addTagChip(f.name, v));
          return;
        }
        if (f.type === 'yesno' || f.type === 'radiocards') {
          const v = bucketObj[f.name];
          if (v) {
            const el = document.querySelector(`[name="${f.name}"][value="${v}"]`);
            if (el) el.checked = true;
          }
          return;
        }
        if (f.type === 'person') { applyPerson(f.name, bucketObj[f.name]); return; }
        if (f.type === 'people') {
          const people = Array.isArray(bucketObj[f.name]) ? bucketObj[f.name] : [];
          people.forEach(p => {
            const prefix = addPersonRow(f.name);
            if (prefix) applyPerson(prefix, p);
          });
          return;
        }
        if (f.type === 'finding') {
          const saved = bucketObj[f.name];
          if (!saved || typeof saved !== 'object') return;
          const sel = document.querySelector(`[name="${f.name}_verdict"]`);
          const txt = document.querySelector(`[name="${f.name}_correction"]`);
          if (sel && saved.verdict) sel.value = saved.verdict;
          if (txt && saved.correction) txt.value = saved.correction;
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
    // Two save buttons (form footer + sticky top toolbar) stay in lockstep.
    const btns = [$('#save-draft'), $('#save-draft-top')].filter(Boolean);
    const setAll = (text, disabled) => btns.forEach(b => { b.textContent = text; b.disabled = disabled; });
    setAll('Saving…', true);
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
      setAll('Draft saved ✓', true);
      setTimeout(() => setAll('Save draft', false), 1500);
    } catch (err) {
      setAll('Save draft', false);
      showError(err.message || 'Could not save draft. Please try again.');
    }
  }

  // --- Autosave ------------------------------------------------------------
  // Active only once a draft row exists (first "Save draft" click, or opening
  // a ?draft= link). A fresh anonymous visit never writes a row on its own.
  let autosaveTimer = null;
  let autosaveBusy = false;
  let autosaveQueued = false;

  function setAutosaveStatus(text) {
    const el = $('#autosave-status');
    if (el) el.textContent = text;
  }

  function queueAutosave() {
    if (!draftId) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(runAutosave, 2500);
  }

  async function runAutosave() {
    if (!draftId) return;
    if (autosaveBusy) { autosaveQueued = true; return; }
    autosaveBusy = true;
    try {
      await updateRow(draftId, buildPayload('draft'));
      const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setAutosaveStatus(`Saved automatically at ${t}`);
    } catch (err) {
      setAutosaveStatus('Auto-save failed — click Save draft');
    }
    autosaveBusy = false;
    if (autosaveQueued) { autosaveQueued = false; queueAutosave(); }
  }

  // --- Submit ------------------------------------------------------------------
  function renderSubmitSummary() {
    const payload = buildPayload('pending');
    const locs = Array.isArray(payload.locations) ? payload.locations : [];
    const extra = Array.isArray(payload.additional_contacts) ? payload.additional_contacts : [];
    $('#submit-summary').innerHTML = `
      <ul class="summary-list">
        <li><strong>Brand:</strong> ${esc(payload.brand_name || 'none')}</li>
        <li><strong>Primary contact:</strong> ${esc(payload.contact_name || 'none')} (${esc(payload.contact_email || 'none')})</li>
        <li><strong>Additional contacts:</strong> ${extra.length ? esc(extra.map(u => `${u.first_name} ${u.last_name}`.trim()).filter(Boolean).join(', ')) : 'none'}</li>
        <li><strong>Locations:</strong> ${locs.length}${locs.length ? ' (' + esc(locs.map(l => l.name).filter(Boolean).join(', ')) + ')' : ''}</li>
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
    if (ok !== true) throw new Error('Submit failed. This draft may already have been submitted.');
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
      showError(err.message || 'Submit failed. Please try again. Your draft is still saved.');
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
          : 'We could not pull much from that page. Please fill the form in yourself.',
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
          ? `✓ Filled in ${n} field${n === 1 ? '' : 's'}. Review and confirm.`
          : 'Could not pull much from that page. Please fill this location in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
      setPrefillStatus(status, 'Pre-fill is not available right now. Please fill this location in yourself.', 'error');
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
      if (e.target.classList.contains('tag-remove')) {
        e.target.closest('.tag-chip').remove();
        queueAutosave();
      }
      if (e.target.classList.contains('tags-input')) {
        const entry = e.target.querySelector('.tags-entry');
        if (entry) entry.focus();
      }
      updateProgressBar(); // add/remove rows changes the field count
    });
    // Tag inputs: comma or Enter commits a chip; Backspace on empty removes the last.
    document.addEventListener('keydown', (e) => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('tags-entry')) return;
      const wrap = el.closest('.tags-input');
      if (e.key === ',' || e.key === 'Enter') {
        e.preventDefault(); // Enter must not submit the form
        const v = el.value.trim();
        if (v) { addTagChip(wrap.dataset.name, v); el.value = ''; queueAutosave(); updateProgressBar(); }
      } else if (e.key === 'Backspace' && !el.value) {
        const chips = wrap.querySelectorAll('.tag-chip');
        if (chips.length) { chips[chips.length - 1].remove(); queueAutosave(); updateProgressBar(); }
      }
    });
    // Live phone mask on every tel field (existing and future rows).
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches && el.matches('input[type="tel"]')) {
        const formatted = formatPhoneValue(el.value);
        if (formatted !== el.value) el.value = formatted;
      }
      // Pasting comma-separated text into a tag input commits every segment.
      if (el.classList && el.classList.contains('tags-entry') && el.value.includes(',')) {
        const wrap = el.closest('.tags-input');
        el.value.split(',').map(v => v.trim()).filter(Boolean).forEach(v => addTagChip(wrap.dataset.name, v));
        el.value = '';
      }
      // Keep the nav's location sub-links in sync with the name fields.
      if (el.name && /^loc_\d+_name$/.test(el.name)) refreshLocationSubnav();
      updateProgressBar();
      queueAutosave();
    });
    // Hours grids: the "closed" toggle disables that day's time inputs.
    document.addEventListener('change', (e) => {
      queueAutosave(); // selects/checkboxes don't fire 'input' in all browsers
      const m = e.target.name && e.target.name.match(/^(.*_hours)_([a-z]{3})_closed$/);
      if (!m) return;
      const open = document.querySelector(`[name="${m[1]}_${m[2]}_open"]`);
      const close = document.querySelector(`[name="${m[1]}_${m[2]}_close"]`);
      if (open) open.disabled = e.target.checked;
      if (close) close.disabled = e.target.checked;
    });
    $('#save-draft').addEventListener('click', handleSaveDraft);
    $('#save-draft-top').addEventListener('click', handleSaveDraft);
    $('#franchisor-form').addEventListener('submit', handleSubmit);
    $('#brand-prefill-btn').addEventListener('click', handleBrandPrefill);
    initSectionNav();
    initScrollProgress();
    initThemeToggle();
    initConditionalFields();
    Promise.resolve(initDraftFromUrl()).then(() => { updateProgressBar(); refreshConditionalFields(); });
  }

  // --- Conditional fields --------------------------------------------------------
  // A field with showIf: { field, values } is only visible while the named
  // control's current value is in the list. Hidden fields still keep whatever
  // was typed, so toggling back does not lose work.
  function refreshConditionalFields() {
    FORM_SECTIONS.forEach(s => {
      s.fields.forEach(f => {
        if (!f.showIf) return;
        const wrap = document.querySelector(`.field[data-field="${f.name}"]`);
        if (!wrap) return;
        const conds = Array.isArray(f.showIf) ? f.showIf : [f.showIf];
        wrap.hidden = !conds.some(c => {
          const ctrl = document.querySelector(`[name="${c.field}"]`);
          if (!ctrl) return false;
          // Radio groups: the group's value is the checked member's, not the first's.
          const v = ctrl.type === 'radio'
            ? ((document.querySelector(`[name="${c.field}"]:checked`) || {}).value || '')
            : ctrl.value;
          return c.values.includes(v);
        });
      });
    });
  }

  function initConditionalFields() {
    FORM_SECTIONS.forEach(s => {
      s.fields.forEach(f => {
        if (!f.showIf) return;
        (Array.isArray(f.showIf) ? f.showIf : [f.showIf]).forEach(c => {
          document.querySelectorAll(`[name="${c.field}"]`).forEach(ctrl => ctrl.addEventListener('change', refreshConditionalFields));
        });
      });
    });
    refreshConditionalFields();
  }

  // --- Light / dark mode toggle (bottom-left) -----------------------------------
  function initThemeToggle() {
    const btn = $('#theme-toggle');
    if (!btn) return;
    const KEY = 'beem-franchisor-theme';
    function apply(dark) {
      document.documentElement.classList.toggle('dark', dark);
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
    let dark = false;
    try { dark = localStorage.getItem(KEY) === 'dark'; } catch (e) { /* private mode */ }
    apply(dark);
    btn.addEventListener('click', () => {
      dark = !dark;
      try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* private mode */ }
      apply(dark);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
