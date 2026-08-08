(() => {
  const SUPABASE_URL = 'https://jjckotsrhuxxftwmdlwc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vJre2v0OdqOGfrNBHAJE0g_L3FaG1RA';
  const TABLE = 'location_intake_submissions';
  const BUCKET = 'intake-logos';

  // Local preview never writes to prod. The main form.js has no such guard, so
  // v2 adds the one the per-client variants already use. ?live=1 overrides for
  // a deliberate end-to-end test.
  const PREVIEW = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && !/[?&]live=1\b/.test(location.search);

  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // ------------------------------------------------------------ client prefill
  //
  // A pre-filled link for a specific client WITHOUT forking the form.
  //
  // The six variant forks (song-koh, magretti, gorman, pelaez-spata,
  // western-springs, willowbrook) each copied form.js at a point in time and
  // then stopped receiving fixes. None of them got the 2026-08-02 data-loss
  // fixes, and they still write `automation_goals.goals` instead of the
  // Campaign Map's `.campaigns`. A config entry here cannot drift: the client
  // gets whatever the live form is, plus their known values on top.
  //
  // Only put facts here that came from a signed agreement, the brand's own
  // location page, or a real conversation. Never invent an email, a phone or a
  // price to fill a field -- every value below is chipped "Pre-filled" in the
  // UI and the client is explicitly asked to correct anything wrong.
  const CLIENT_PREFILLS = {
    // Stretch Zone Reston VA -- Patrick Song and Rob Koh (AlphaFlex LLC).
    // Closed Won 2026-08-05. $799/mo + $500 setup, 60-day initial term then
    // month to month. Reston is the pilot of 6 studios (3 VA, 3 MD).
    // Sources: address/phone/hours from stretchzone.com/locations/reston-va,
    // verified 2026-07-30 against Yelp. Contact emails from George's "Welcome
    // to Velocity AI Partners - Next Steps" thread (Rob is CC'd on it).
    // ClubReady confirmed by George twice, incl. in that welcome email.
    // contact_phone carries over from the 2026-07-30 /reston page, which
    // Patrick received and did not correct.
    reston: {
      heading: 'Welcome, Patrick and Rob',
      subheading: 'We filled in what we already know about Stretch Zone Reston. Please correct anything that looks wrong.',
      fields: {
        business_name: 'Stretch Zone Reston',
        city: 'Reston',
        address: '1468 North Point Village Drive, Reston, VA 20194',
        business_phone: '(703) 822-5296',
        timezone: 'America/New_York',
        website_url: 'https://www.stretchzone.com/locations/reston-va',
        location_page_url: 'https://www.stretchzone.com/locations/reston-va',
        google_business_profile_url: 'https://www.google.com/maps/search/?api=1&query=Stretch%20Zone%201468%20North%20Point%20Village%20Drive%20Reston%20VA%2020194',
        contact_name: 'Patrick Song',
        contact_email: 'patrick@alphaflexllc.com',
        contact_phone: '(917) 642-8030',
        crm_platform: 'clubready'
      },
      hours: {
        mon: ['08:00', '19:00'], tue: ['08:00', '19:00'], wed: ['08:00', '19:00'],
        thu: ['08:00', '19:00'], fri: ['08:00', '19:00'],
        sat: ['10:00', '16:00'], sun: ['10:00', '16:00']
      },
      users: [
        { name: 'Patrick Song', email: 'patrick@alphaflexllc.com', role: 'admin' },
        { name: 'Rob Koh', email: 'rob@alphaflexllc.com', role: 'admin' }
      ]
    },

    // Chris Morrison -- Stretch Zone Cool Springs, TN.
    // Signed 2026-08-07 (Docusign "Velocity AI Partners x Chris Morrison
    // (Stretch Zone) Service Agreement"). $849/mo + $500 setup, 3-month commit.
    // Sales Spark deal 0dc2d376, owner Paul Houle.
    //
    // COOL SPRINGS ONLY. Chris owns a second studio in Thompson's Station and
    // the deal record says 2 locations, but George confirmed 2026-08-07 that
    // Cool Springs is the one going live. If Thompson's Station follows, it
    // needs its OWN entry and its own link -- one submission provisions exactly
    // one location, so a second studio can never ride along on this form.
    //
    // SOURCES for the verified `fields` block:
    //   address / business_phone / hours -- the brand's own location page,
    //     stretchzone.com/locations/cool-springs-tn. /franklin-tn serves the
    //     same studio; the canonical one is used here because it names it.
    //     Read 2026-08-07.
    //   business_email / instagram_handle -- the studio's own Instagram
    //     (@stretchzone_coolsprings), whose bio carries coolspringstn@
    //     stretchzone.com AND the same (615) 721-5190 as the brand page, which
    //     is what ties the account to this studio rather than a nearby one.
    //   contact_email / contact_phone -- Sales Spark lead 8f5302d1; Chris
    //     confirmed the phone himself in his 2026-07-30 reply to Paul.
    //   main_cta / intro_offer -- "First Stretch is FREE" on that same bio.
    //   timezone -- middle TN is Central; the deal record also says Central.
    //   crm_platform -- all 15 Stretch Zone locations we already run are on
    //     ClubReady, so this is the brand default rather than a guess about
    //     Chris specifically, and he can change it.
    //
    // NOT seeded, deliberately: facebook_page_url (a "Stretch Zone Franklin"
    // page exists but Facebook blocks reads, so we cannot confirm it is his)
    // and trial_booking_url (the studio's public links all point back at the
    // brand location page, never at a real booking URL -- only Chris has it).
    //
    // 🔴 The `draftFields` block below is NOT verified for Cool Springs. It is
    // how the Stretch Zones we already run answer these questions, seeded so
    // Chris edits rather than types. PRICING IN PARTICULAR VARIES BY STUDIO:
    // our own knowledge base has Baton Rouge at $139/$240/$440/$600 with a $95
    // drop-in, the FL/MA studios at $119/$200/$360/$480 with $85, and Fair Oaks
    // and Napa quoting "$45-$90 per 30-minute session". The ladder below is the
    // most common one (6 of 14 studios) and the drop-in is the modal $85, but
    // neither is a fact about Chris. Two things contain that risk: every value
    // here is chipped "Draft" rather than "Pre-filled" and the subheading says
    // what that means, and the pricing field itself leads with the brand's own
    // do-not-quote-before-the-demo rule, which is what 7 of our studios tell
    // their AI. Even unedited, the AI defers instead of quoting a wrong price.
    'cool-springs': {
      heading: 'Welcome, Chris',
      subheading: 'Everything marked Pre-filled is what we already know about your Cool Springs studio, so please correct anything that looks wrong. Everything marked Draft is our starting point from running other Stretch Zones: edit it to match how you actually run Cool Springs, especially the pricing.',
      fields: {
        business_name: 'Stretch Zone Cool Springs',
        city: 'Franklin',
        address: '330 Mayfield Drive, Suite C9, Franklin, TN 37067',
        business_phone: '(615) 721-5190',
        business_email: 'coolspringstn@stretchzone.com',
        timezone: 'America/Chicago',
        website_url: 'https://www.stretchzone.com/locations/cool-springs-tn',
        location_page_url: 'https://www.stretchzone.com/locations/cool-springs-tn',
        google_business_profile_url: 'https://www.google.com/maps/search/?api=1&query=Stretch%20Zone%20330%20Mayfield%20Drive%20Franklin%20TN%2037067',
        instagram_handle: '@stretchzone_coolsprings',
        contact_name: 'Chris Morrison',
        contact_email: 'morrison_chris@yahoo.com',
        contact_phone: '(615) 525-7470',
        crm_platform: 'clubready',
        main_cta: 'book_demo'
      },
      draftFields: {
        intro_offer:
          'The first stretch is free. New leads book a complimentary practitioner-assisted session, which doubles as the assessment we use to recommend a frequency.',

        bk_service_description:
          'One-on-one practitioner-assisted stretching. A trained practitioner stretches the client on a patented Stretch Zone table, using a strap system to position, stabilize and isolate each muscle so it can be taken further and more safely than someone can stretch on their own. Sessions are by appointment, never self-guided and never a group class.',

        // Leads with the do-not-quote rule on purpose. 7 of our Stretch Zones
        // instruct their AI this way, and it is what keeps a wrong number from
        // reaching a lead if Chris never edits the tiers below.
        bk_membership_pricing:
          'IMPORTANT: do not quote full membership pricing before the first stretch. If a lead asks directly, say options run roughly $40 to $55 per stretch depending on frequency, and that we review the exact plan in studio after the free session.\n\nMembership options:\nBasic Bi-Weekly (2 sessions/month): $119/month\n1x per week (4 sessions/month): $200/month ($50 per session)\n2x per week (8 sessions/month): $360/month ($45 per session)\n3x per week (12 sessions/month): $480/month ($40 per session)',

        bk_single_session_rate: '$85 per session, pay as you go, no membership required.',

        bk_eligibility:
          'Open to adults of all fitness levels, including people who are not currently exercising. Clients with a recent injury, surgery or an acute medical condition should clear practitioner-assisted stretching with their doctor first.',

        bk_first_visit:
          'The first stretch is free and runs as a full session. The practitioner assesses range of motion, works through the areas the client cares about, and then talks through what frequency would help most. Wear comfortable clothes you can move in.',

        bk_ideal_client:
          'Active adults who want to keep moving well: desk workers who have tightened up, weekend athletes, runners and golfers, people training regularly who need recovery, and older adults working on mobility and balance.',

        bk_unique_value:
          'The table and strap system. Stabilizing and isolating a muscle is what lets a practitioner take a stretch further than a client can reach on their own, in a group class, or with a foam roller. Every session is one-on-one with a trained practitioner who tracks progress over time.',

        // George's word for this: the concerns. These are the objections and
        // motivations that actually come up, so the AI can meet them instead of
        // reciting features.
        bk_pain_points:
          'What brings people in: stiffness and lost range of motion, back and hip tightness from sitting all day, nagging aches that limit what they can do, slow recovery between workouts, and wanting to stay mobile and steady with age.\n\nWhat holds them back: not knowing what assisted stretching actually is, assuming it is massage or physical therapy, worrying it will hurt, not being sure it is worth the money, thinking they are too out of shape or too inflexible to start, and not being able to find the time.',

        bk_faq:
          'Is this massage? No. Nothing is rubbed or manipulated; the practitioner moves the client through stretches on a table using a strap system.\n\nIs this physical therapy? No, and we do not treat, diagnose or rehabilitate injuries. Clients working through an injury should talk to their doctor or PT first.\n\nDoes it hurt? It should not. Stretches are taken to the edge of comfortable range, never past it, and the client tells the practitioner when to stop.\n\nWhat do I wear? Comfortable clothes you can move in.\n\nHow often should I come? That is exactly what the free first stretch is for.\n\nDo I have to buy a membership? No, single sessions are available, though most clients see more change with a regular frequency.',

        // Compliance guardrails. Stretching studios are not medical providers
        // and the AI must never imply otherwise.
        avoid_words:
          'Never claim we treat, cure, heal, fix or rehabilitate any injury or medical condition.\nNever diagnose, and never interpret a client\'s symptoms.\nDo not promise a specific medical or weight-loss outcome.\nDo not call the service massage, physical therapy or chiropractic.\nDo not quote full membership pricing before the first stretch.\nNo pushy or high-pressure closing language.',

        preferred_words:
          'Practitioner-assisted stretching, or assisted stretching.\nSession or stretch, rather than class or appointment slot.\nPractitioner, rather than therapist or masseuse.\nRange of motion, mobility, flexibility.\nFirst stretch is free.'
      },
      // Ticked to match the scope George quantified for Chris in the 2026-07-31
      // ROI email: new leads (top of funnel), contacting 2,208 old leads, and
      // retention/churn. Badged "Draft" as a section, so Chris can add or
      // remove any of the 15 without hunting for what we changed.
      campaigns: [
        'camp_contacting_new_leads',
        'camp_lead_reactivation_warm',
        'camp_lead_reactivation_cold',
        'camp_client_retention_high',
        'camp_client_retention_medium'
      ],
      hours: {
        mon: ['06:30', '20:00'], tue: ['06:30', '20:00'], wed: ['06:30', '20:00'],
        thu: ['06:30', '20:00'], fri: ['06:30', '19:00'],
        sat: ['07:00', '16:00'], sun: ['08:00', '14:00']
      },
      users: [
        { name: 'Chris Morrison', email: 'morrison_chris@yahoo.com', role: 'admin' }
      ]
    },

    // Stretch Zone Gaithersburg MD -- Patrick Song and Rob Koh (AlphaFlex LLC),
    // the SAME owners as `reston` above. Their second studio with us.
    // Signed 2026-08-07 20:47 UTC (Docusign "Velocity AI Partners x Patrick Song
    // (Stretch Zone) Location Addition"). $749/mo + $500 setup, 60 days up front
    // then month to month -- terms confirmed by George 2026-08-08. The 60-day
    // term is the same one George quoted Patrick by email on 2026-07-31 ("We do
    // 60 days, then month to month after, cancel anytime") and had written into
    // the contract on 2026-08-03, replacing the 90-day language.
    // Sales Spark deal aa4a0982, owner Paul Houle.
    //
    // GAITHERSBURG ONLY. The group runs 6 Stretch Zones (3 VA, 3 MD) and the
    // master agreement lets them add the rest at the same rates, but one
    // submission provisions exactly one location. Ashburn and Potomac each need
    // their OWN entry and their own link; they can never ride along on this form.
    //
    // SOURCES for the verified `fields` block:
    //   address / business_phone / hours / intro_offer -- the brand's own
    //     location page, stretchzone.com/locations/gaithersburg-md, read
    //     2026-08-08 and cross-checked against the studio's Fresha listing,
    //     which returns the same phone and the same 7 days of hours. Both give
    //     the address with NO unit number; a search engine volunteered
    //     "Unit 13", nothing we could read confirmed it, so it is not here.
    //   business_email -- decoded from that page's own Cloudflare-obfuscated
    //     mailto link (data-cfemail is XOR'd against its first byte), which
    //     yields gaithersburg@stretchzone.com alongside the corporate
    //     info@stretchzone.com. Independently corroborated by Sales Spark lead
    //     3996e589, the Gaithersburg row owned by Rob Koh. NOTE: a second lead
    //     row (3b0b8e2d) carries sz.gaithersburg.md@stretchzone.com for the same
    //     studio -- same phone, so it is a duplicate. That address is the
    //     import script's generated pattern and is NOT the studio's; the deal
    //     notes flag the duplicate pair for deduping.
    //   instagram_handle -- @stretchzone_gaithersburg, tied to THIS studio in
    //     both directions: the brand's own location page lists it as the
    //     studio's Instagram, and the account's bio links back to
    //     stretchzone.com/locations/gaithersburg. The usual phone match was not
    //     available (this bio publishes neither a phone nor an email), so the
    //     two-way link is what does the disambiguating here.
    //   contact_name / contact_email / contact_phone -- Patrick, from the
    //     `reston` entry above. His phone independently matches +19176428030 on
    //     Sales Spark lead 36dad8c2, the lead this deal hangs off.
    //   timezone -- Maryland is Eastern.
    //   crm_platform -- all 15 Stretch Zone locations we already run are on
    //     ClubReady, and Reston is theirs and is on ClubReady, so this is the
    //     brand default rather than a guess. They can change it.
    //
    // NOT seeded, deliberately: facebook_page_url (the location page names a
    // Facebook account but Facebook blocks reads, so we cannot confirm it),
    // trial_booking_url (only they have it), bk_package_pricing, bk_promotions
    // and bk_cancellation_policy (studio-specific, and we have no source).
    //
    // 🔴 The `draftFields` block below is NOT verified for Gaithersburg. It is
    // how the Stretch Zones we already run answer these questions, carried over
    // wholesale from `cool-springs` because it is brand-level, and seeded so
    // they edit rather than type. PRICING IN PARTICULAR VARIES BY STUDIO: our
    // knowledge base has ladders from $119/$200/$360/$480 to $139/$240/$440/$600
    // and drop-ins at $85, $90 and $95. Nothing here is a fact about this
    // studio. Two things contain that risk: every value is chipped "Draft"
    // rather than "Pre-filled" and the subheading says what that means, and the
    // pricing field leads with the brand's do-not-quote-before-the-demo rule, so
    // even unedited the AI defers instead of quoting another studio's rate card.
    gaithersburg: {
      heading: 'Welcome back, Patrick and Rob',
      subheading: 'This form is for your Gaithersburg studio. Everything marked Pre-filled is what we already know about that location, so please correct anything that looks wrong. Everything marked Draft is our starting point from the other Stretch Zones we run: edit it to match how you actually run Gaithersburg, especially the pricing.',
      fields: {
        business_name: 'Stretch Zone Gaithersburg',
        city: 'Gaithersburg',
        address: '251 Kentlands Boulevard, Gaithersburg, MD 20878',
        business_phone: '(301) 798-7376',
        business_email: 'gaithersburg@stretchzone.com',
        timezone: 'America/New_York',
        website_url: 'https://www.stretchzone.com/locations/gaithersburg-md',
        location_page_url: 'https://www.stretchzone.com/locations/gaithersburg-md',
        google_business_profile_url: 'https://www.google.com/maps/search/?api=1&query=Stretch%20Zone%20251%20Kentlands%20Boulevard%20Gaithersburg%20MD%2020878',
        instagram_handle: '@stretchzone_gaithersburg',
        contact_name: 'Patrick Song',
        contact_email: 'patrick@alphaflexllc.com',
        contact_phone: '(917) 642-8030',
        crm_platform: 'clubready',
        main_cta: 'book_demo',
        // Verified for THIS studio rather than carried over: the Gaithersburg
        // page runs "A FREE 30min. STRETCH IS WAITING FOR YOU" and "Your first
        // stretch with us is on the house". Stated plainly, with none of the
        // operational elaboration that keeps the Cool Springs version a draft.
        intro_offer: 'The first 30-minute stretch is free.'
      },
      draftFields: {
        bk_service_description:
          'One-on-one practitioner-assisted stretching. A trained practitioner stretches the client on a patented Stretch Zone table, using a strap system to position, stabilize and isolate each muscle so it can be taken further and more safely than someone can stretch on their own. Sessions are by appointment, never self-guided and never a group class.',

        // Leads with the do-not-quote rule on purpose. 7 of our Stretch Zones
        // instruct their AI this way, and it is what keeps a wrong number from
        // reaching a lead if these tiers are never edited.
        bk_membership_pricing:
          'IMPORTANT: do not quote full membership pricing before the first stretch. If a lead asks directly, say options run roughly $40 to $55 per stretch depending on frequency, and that we review the exact plan in studio after the free session.\n\nMembership options:\nBasic Bi-Weekly (2 sessions/month): $119/month\n1x per week (4 sessions/month): $200/month ($50 per session)\n2x per week (8 sessions/month): $360/month ($45 per session)\n3x per week (12 sessions/month): $480/month ($40 per session)',

        bk_single_session_rate: '$85 per session, pay as you go, no membership required.',

        bk_eligibility:
          'Open to adults of all fitness levels, including people who are not currently exercising. Clients with a recent injury, surgery or an acute medical condition should clear practitioner-assisted stretching with their doctor first.',

        // Carried over from cool-springs, with one edit: the free session is
        // described as 30 minutes, because that is what this studio's own page
        // advertises. Leaving the generic "a full session" would have put the
        // draft in conflict with the verified intro_offer on the same page.
        bk_first_visit:
          'The first stretch is free and runs as a full 30-minute session. The practitioner assesses range of motion, works through the areas the client cares about, and then talks through what frequency would help most. Wear comfortable clothes you can move in.',

        bk_ideal_client:
          'Active adults who want to keep moving well: desk workers who have tightened up, weekend athletes, runners and golfers, people training regularly who need recovery, and older adults working on mobility and balance.',

        bk_unique_value:
          'The table and strap system. Stabilizing and isolating a muscle is what lets a practitioner take a stretch further than a client can reach on their own, in a group class, or with a foam roller. Every session is one-on-one with a trained practitioner who tracks progress over time.',

        bk_pain_points:
          'What brings people in: stiffness and lost range of motion, back and hip tightness from sitting all day, nagging aches that limit what they can do, slow recovery between workouts, and wanting to stay mobile and steady with age.\n\nWhat holds them back: not knowing what assisted stretching actually is, assuming it is massage or physical therapy, worrying it will hurt, not being sure it is worth the money, thinking they are too out of shape or too inflexible to start, and not being able to find the time.',

        bk_faq:
          'Is this massage? No. Nothing is rubbed or manipulated; the practitioner moves the client through stretches on a table using a strap system.\n\nIs this physical therapy? No, and we do not treat, diagnose or rehabilitate injuries. Clients working through an injury should talk to their doctor or PT first.\n\nDoes it hurt? It should not. Stretches are taken to the edge of comfortable range, never past it, and the client tells the practitioner when to stop.\n\nWhat do I wear? Comfortable clothes you can move in.\n\nHow often should I come? That is exactly what the free first stretch is for.\n\nDo I have to buy a membership? No, single sessions are available, though most clients see more change with a regular frequency.',

        // Compliance guardrails. Stretching studios are not medical providers
        // and the AI must never imply otherwise.
        avoid_words:
          'Never claim we treat, cure, heal, fix or rehabilitate any injury or medical condition.\nNever diagnose, and never interpret a client\'s symptoms.\nDo not promise a specific medical or weight-loss outcome.\nDo not call the service massage, physical therapy or chiropractic.\nDo not quote full membership pricing before the first stretch.\nNo pushy or high-pressure closing language.',

        preferred_words:
          'Practitioner-assisted stretching, or assisted stretching.\nSession or stretch, rather than class or appointment slot.\nPractitioner, rather than therapist or masseuse.\nRange of motion, mobility, flexibility.\nFirst stretch is free.'
      },
      // Nothing ticked, on purpose. Ticking a Campaign Map box is a claim about
      // what was sold, and nothing was quantified for Gaithersburg: the deal
      // (aa4a0982) was opened by the expansion-flow agent with no proposal link,
      // no call recordings and no scope notes, and the only mail to Patrick that
      // mentions leads at all is the generic 2026-07-22 AI-audit nurture. Cool
      // Springs got 5 ticks because George's 2026-07-31 ROI email counted 2,208
      // old leads for that studio; there is no equivalent here, and Reston, the
      // same owners' first location, ships with none ticked either. They pick on
      // the onboarding call rather than confirm a scope we invented for them.
      campaigns: [],
      hours: {
        mon: ['07:00', '19:00'], tue: ['07:00', '19:00'], wed: ['07:00', '19:00'],
        thu: ['07:00', '19:00'], fri: ['07:00', '19:00'],
        sat: ['08:00', '16:00'], sun: ['08:00', '16:00']
      },
      users: [
        { name: 'Patrick Song', email: 'patrick@alphaflexllc.com', role: 'admin' },
        { name: 'Rob Koh', email: 'rob@alphaflexllc.com', role: 'admin' }
      ]
    }
  };

  // Short alias so a texted link stays short and unambiguous.
  CLIENT_PREFILLS['coolsprings'] = CLIENT_PREFILLS['cool-springs'];

  // `/song-koh` and `?form=song-koh` were the original 2026-07-30 routes and are
  // in George's sent mail, so they have to keep resolving to the same client.
  CLIENT_PREFILLS['song-koh'] = CLIENT_PREFILLS.reston;

  // Which prefill applies. `?client=reston` is the explicit form (the main app
  // builds admin links this way). The path form covers the clean vanity URL:
  // `/reston` is a vercel.json REWRITE, so the browser URL stays `/reston` and
  // location.search is empty -- a destination query string never reaches the
  // client. Read the path, not the query, or the vanity link silently no-ops.
  function clientSlug() {
    try {
      const q = new URLSearchParams(location.search).get('client');
      if (q && CLIENT_PREFILLS[q.toLowerCase()]) return q.toLowerCase();
      const p = location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '').toLowerCase();
      if (p && CLIENT_PREFILLS[p]) return p;
    } catch (e) {}
    return null;
  }

  // Draft state: if the URL has ?draft=<uuid>, we are editing a server-side
  // draft. Save Draft writes back to the same row; Submit flips status to
  // 'pending'. If no draft param, we're on a blank form and the first Save
  // Draft creates a new row + puts its id in the URL.
  let draftId = null;
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
        <select name="user_${i}_role" aria-label="Access level">
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
      // Read the times from the DOM, not FormData: a closed day disables its
      // open/close inputs and FormData omits disabled fields. Keeping the times
      // means un-ticking "closed" after a save restores what the client
      // originally entered instead of snapping back to the 09:00-17:00 default.
      const openEl = document.querySelector(`[name="hours_${d}_open"]`);
      const closeEl = document.querySelector(`[name="hours_${d}_close"]`);
      hours[d] = {
        open: (openEl && openEl.value) || null,
        close: (closeEl && closeEl.value) || null,
        closed
      };
    }
    return hours;
  }

  const NOTIFICATION_CHANNELS = ['email', 'sms'];

  // The campaign lifecycle from the Campaign Map, in map order. These replace
  // the old abstract goal_* checkboxes: the client now picks real campaigns,
  // which map 1:1 onto campaign_toggles.campaign_type at provisioning time.
  const CAMPAIGNS = [
    'contacting_new_leads', 'lead_reactivation_warm', 'lead_reactivation_cold',
    'booking_reminder', 'no_show_recovery', 'cancel_recovery',
    'post_visit_followup', 'complete_your_intro',
    'missed_sale',
    'birthday_milestones', 'milestone_reminders', 'member_rebooking',
    'client_retention_medium', 'client_retention_high',
    'ex_member_winback'
  ];
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RX = /(?:\d[^\d]*){7,}/;

  const LABELS = {
    // Campaigns, in Campaign Map order
    contacting_new_leads: 'Contacting New Leads',
    lead_reactivation_warm: 'Lead Reactivation · Warm',
    lead_reactivation_cold: 'Lead Reactivation · Cold',
    booking_reminder: 'Booking Reminder',
    no_show_recovery: 'No-Show Recovery',
    cancel_recovery: 'Cancel Recovery',
    post_visit_followup: 'Post-Visit Follow-Up',
    complete_your_intro: 'Complete Your Intro',
    missed_sale: 'Missed Sale',
    birthday_milestones: 'Birthday & Milestones',
    milestone_reminders: 'Milestone Reminders',
    member_rebooking: 'Member Rebooking',
    client_retention_medium: 'Client Retention · Medium',
    client_retention_high: 'Client Retention · High',
    ex_member_winback: 'Ex-Member Winback',
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

  function collectCampaigns(fd) {
    return CAMPAIGNS.filter(c => fd.get(`camp_${c}`) === 'on');
  }

  function collectNotificationChannels(fd) {
    return NOTIFICATION_CHANNELS.filter(c => fd.get(`notify_${c}`) === 'on');
  }

  function collectBusinessKnowledge(fd) {
    const yesNoToBool = (v) => v === 'yes' ? true : v === 'no' ? false : null;
    return {
      // TODO(migration 018): promote to a real contact_name column.
      contact_name: fd.get('contact_name') || null,
      service_description: fd.get('bk_service_description') || null,
      single_session_rate: fd.get('bk_single_session_rate') || null,
      membership_pricing: fd.get('bk_membership_pricing') || null,
      package_pricing: fd.get('bk_package_pricing') || null,
      promotions: fd.get('bk_promotions') || null,
      cancellation_policy: fd.get('bk_cancellation_policy') || null,
      eligibility: fd.get('bk_eligibility') || null,
      ideal_client: fd.get('bk_ideal_client') || null,
      pain_points: fd.get('bk_pain_points') || null,
      unique_value: fd.get('bk_unique_value') || null,
      first_visit: fd.get('bk_first_visit') || null,
      faq: fd.get('bk_faq') || null,
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
      const roleEl = row.querySelector('[name$="_role"]');
      const role = (roleEl && roleEl.value) || 'manager';
      if (name || email) users.push({ name, email, role });
    });
    return users;
  }

  function clearStaleLocalStorage() {
    // Older versions used a different localStorage key. Remove any leftover
    // state so it can never bleed into the current autosave backup.
    try { localStorage.removeItem('velocity-intake-draft-v1'); } catch (e) {}
  }

  // Snapshot / restore of the raw form controls, used by the local backup.
  // Distinct from buildPayload(), which shapes answers for the database: this
  // is a literal picture of the page so a client gets back exactly what they
  // typed, including fields the payload folds into jsonb.
  function formState() {
    const form = document.getElementById('intake-form');
    const state = { fields: {}, userCount: 1 };
    if (!form) return state;
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      const n = el.name;
      if (!n || n === 'honeypot' || el.type === 'file') return;
      if (el.type === 'checkbox') state.fields[n] = el.checked;
      else if (el.type === 'radio') { if (el.checked) state.fields[n] = el.value; }
      else state.fields[n] = el.value;
    });
    state.userCount = document.querySelectorAll('#users-list .user-row').length || 1;
    return state;
  }

  function applyFormState(state) {
    const form = document.getElementById('intake-form');
    if (!form || !state || !state.fields) return;

    // Rebuild the repeater first, or the user_N_* inputs would not exist yet.
    const list = document.getElementById('users-list');
    const want = Math.max(1, state.userCount || 1);
    if (list) {
      list.innerHTML = '';
      for (let i = 0; i < want; i++) list.insertAdjacentHTML('beforeend', userRowHTML(i));
      userCounter = want;
    }

    Object.keys(state.fields).forEach((n) => {
      let els;
      try { els = form.querySelectorAll(`[name="${CSS.escape(n)}"]`); } catch (e) { return; }
      if (!els.length) return;
      const v = state.fields[n];
      els.forEach((el) => {
        // Checkboxes are stored as true/false, never omitted. Restoring only the
        // ticked ones is what made a de-selected "closed" day silently re-check
        // itself in the per-client forks.
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'radio') el.checked = (el.value === v);
        else el.value = v == null ? '' : v;
      });
    });

    DAYS.forEach((d) => {
      const c = form.elements[`hours_${d}_closed`];
      const o = form.elements[`hours_${d}_open`];
      const cl = form.elements[`hours_${d}_close`];
      if (c && o && cl) { o.disabled = !!c.checked; cl.disabled = !!c.checked; }
    });

    applyConditionals();
    updateProgressBar();
  }

  // ---------------------------------------------------------------- autosave
  // Until 2026-08-02 the ONLY writes were the two button clicks, so a client who
  // typed for twenty minutes and closed the tab lost everything, left no row,
  // and we never knew they had started. Autosave makes their answers durable
  // without them having to know to press anything.
  const AUTOSAVE_DEBOUNCE_MS = 4000;   // quiet period after the last keystroke
  const AUTOSAVE_MIN_GAP_MS = 20000;   // floor between server writes
  const AUTOSAVE_MIN_FIELDS = 3;       // before creating a row from a cold start
  const LOCAL_BACKUP_KEY = 'velocity-intake-backup-v2';

  let autosaveTimer = null;
  let autosaveLastAt = 0;
  let autosaveInFlight = false;
  let autosaveStopped = false;         // set on submit / lock: never write again

  function setSaveStatus(text, tone) {
    const el = document.getElementById('autosave-status');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone || '';
  }

  // How many fields the client has actually CHANGED. Counting non-empty fields
  // does not work: the form ships with the hours grid pre-filled at 09:00-17:00,
  // so fourteen inputs are already populated before anyone types. Diffing
  // against the state captured at load is the only honest measure, and it also
  // handles a pre-filled draft correctly (an untouched draft counts as zero).
  let autosaveBaseline = null;

  function captureAutosaveBaseline() {
    autosaveBaseline = JSON.stringify(formState().fields);
  }

  function changedFieldCount() {
    if (!autosaveBaseline) return 0;
    let base;
    try { base = JSON.parse(autosaveBaseline); } catch (e) { return 0; }
    const now = formState().fields;
    const keys = new Set(Object.keys(base).concat(Object.keys(now)));
    let n = 0;
    keys.forEach((k) => {
      if (k === 'location_page_url') return;
      const a = base[k] === undefined ? '' : base[k];
      const b = now[k] === undefined ? '' : now[k];
      if (a !== b) n++;
    });
    return n;
  }

  function writeLocalBackup() {
    // Covers the window autosave cannot: before the row exists, and any moment
    // the network is down. Keyed by draft id so two clients on a shared device
    // can never see each other's answers.
    try {
      if (changedFieldCount() < 1) return;
      localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify({
        draftId: draftId || null,
        savedAt: Date.now(),
        state: formState()
      }));
    } catch (e) { /* private mode / quota: the server autosave still applies */ }
  }

  function clearLocalBackup() {
    try { localStorage.removeItem(LOCAL_BACKUP_KEY); } catch (e) {}
  }

  async function autosaveNow(reason) {
    if (autosaveStopped || autosaveInFlight) return;
    const form = document.getElementById('intake-form');
    if (!form || form.hidden) return;
    // A filled honeypot cannot be written anyway: the RLS INSERT policy requires
    // it to be empty. Bail quietly rather than surfacing a failure to a bot.
    const fd = new FormData(form);
    if ((fd.get('honeypot') || '').toString().trim() !== '') return;
    // Cold start: only mint a row once there is real content to protect.
    if (!draftId && changedFieldCount() < AUTOSAVE_MIN_FIELDS) return;

    autosaveInFlight = true;
    setSaveStatus('Saving...', 'busy');
    try {
      const payload = buildPayload('draft');
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        const newId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        payload.id = newId;
        await insertRow(payload);
        draftId = newId;
        setDraftIdInUrl(newId);
        showDraftLink(false);
      }
      autosaveLastAt = Date.now();
      clearLocalBackup();
      setSaveStatus('All changes saved', 'ok');
    } catch (err) {
      console.error('[autosave] failed:', reason, err);
      // Keep the local copy as the fallback and stay quiet in the UI: the client
      // has done nothing wrong and the next attempt usually succeeds.
      writeLocalBackup();
      setSaveStatus('Saved on this device', 'warn');
    } finally {
      autosaveInFlight = false;
    }
  }

  function scheduleAutosave() {
    if (autosaveStopped) return;
    writeLocalBackup();
    setSaveStatus('Unsaved changes', '');
    if (autosaveTimer) clearTimeout(autosaveTimer);
    const sinceLast = Date.now() - autosaveLastAt;
    const wait = Math.max(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MIN_GAP_MS - sinceLast);
    autosaveTimer = setTimeout(() => autosaveNow('debounce'), wait);
  }

  function stopAutosave() {
    autosaveStopped = true;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    setSaveStatus('', '');
  }

  function initAutosave() {
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', scheduleAutosave);
    form.addEventListener('change', scheduleAutosave);
    // Closing the tab or switching away is the exact moment work gets lost.
    // keepalive lets the request outlive the page; sendBeacon cannot be used
    // because PostgREST needs the apikey and x-draft-id headers.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        writeLocalBackup();
        autosaveNow('hidden');
      }
    });
    window.addEventListener('pagehide', () => { writeLocalBackup(); });
  }

  // Restore a local backup only when the server had nothing for us, so a stale
  // copy can never overwrite answers that did reach the database.
  function maybeRestoreLocalBackup() {
    let backup = null;
    try {
      const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
      if (raw) backup = JSON.parse(raw);
    } catch (e) { return; }
    if (!backup || !backup.state) return;
    if (backup.draftId && backup.draftId !== draftId) { clearLocalBackup(); return; }
    if (draftId) return;                       // the server row already won
    if (changedFieldCount() > 0) return;       // never overwrite a populated form
    applyFormState(backup.state);
    setSaveStatus('Restored your unsaved answers from this device', 'warn');
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

  function toggleNotifyTarget() {
    const radio = document.querySelector('[name="notify_target"][value="different"]');
    const isDifferent = radio && radio.checked;
    const wrap = document.getElementById('notify-different-wrap');
    revealToggle(wrap, isDifferent);
    if (!isDifferent && wrap) {
      wrap.querySelectorAll('input').forEach(i => { i.value = ''; });
    }
  }

  function applyConditionals() {
    toggleCrmOther();
    toggleMainCtaOther();
    toggleNotifyTarget();
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
      // TODO(migration 018): contact_name has no column yet. Parked in the
      // business_knowledge bundle so the answer is not lost; move it to a real
      // column before this ships. See collectBusinessKnowledge().
      hours: collectHours(fd),
      hours_confirmed: fd.get('hours_confirmed') === 'on',
      crm_platform: fd.get('crm_platform') || null,
      crm_platform_other: fd.get('crm_platform_other') || null,
      crm_account_confirmed: fd.get('crm_account_confirmed') === 'on',
      // Read by provision-from-intake but never collected until now: every
      // location provisioned with assistant_name NULL and booking_link NULL,
      // then got patched by hand. These close that gap.
      assistant_name: fd.get('assistant_name') || null,
      trial_booking_url: fd.get('trial_booking_url') || null,
      // Derived, not asked: a free demo or free trial CTA means the first visit
      // is free. Any other CTA (schedule a call, buy a membership) does not.
      has_free_trial: ['book_demo', 'start_trial'].includes(fd.get('main_cta')),
      main_cta: fd.get('main_cta') || null,
      main_cta_other: fd.get('main_cta_other') || null,
      intro_offer: fd.get('intro_offer') || null,
      preferred_words: fd.get('preferred_words') || null,
      avoid_words: fd.get('avoid_words') || null,
      dashboard_users: collectUsers(),
      business_knowledge: collectBusinessKnowledge(fd),
      // Campaign map. `campaigns` are Campaign Map keys, which map 1:1 onto
      // campaign_toggles.campaign_type. TODO: provision-from-intake still reads
      // automation_goals.goals for its "AI Employee Goals" KB row and must be
      // updated to read `campaigns` and write campaign_toggles from it.
      automation_goals: {
        campaigns: collectCampaigns(fd)
      },
      notification_config: {
        channels: collectNotificationChannels(fd),
        target: fd.get('notify_target') || 'primary',
        email: fd.get('notify_email_address') || null,
        phone: fd.get('notify_phone_number') || null
      },
      website_url: fd.get('website_url') || null,
      // The specific location page the client pasted for AI prefill. Distinct
      // from website_url (the business homepage) and worth keeping: it is the
      // only record of which page we extracted from, so a reviewer can check
      // an AI-suggested value against its source.
      location_page_url: fd.get('location_page_url') || null,
      google_business_profile_url: fd.get('google_business_profile_url') || null,
      instagram_handle: fd.get('instagram_handle') || null,
      facebook_page_url: fd.get('facebook_page_url') || null,
      tiktok_handle: fd.get('tiktok_handle') || null,
      notes: fd.get('notes') || null,
      honeypot: fd.get('honeypot') || null,
      user_agent: navigator.userAgent
    };
  }

  async function insertRow(payload) {
    if (PREVIEW) { console.log('[preview] INSERT suppressed. Payload:', payload); return; }
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
    if (PREVIEW) { console.log('[preview] PATCH suppressed for', id, 'Payload:', payload); return; }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // Required by migration 016: anon may only touch the row whose id it
        // presents here. Note this also needs SELECT, because
        // return=representation reads the row back.
        'x-draft-id': id,
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
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          // Required by migration 016: without this the request succeeds but
          // matches zero rows, and the draft link looks broken to the client.
          'x-draft-id': id
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
    set('business_email', row.business_email);
    set('business_phone', row.business_phone);
    set('city', row.city);
    set('address', row.address);
    set('timezone', row.timezone);
    set('contact_email', row.contact_email);
    set('contact_phone', row.contact_phone);
    set('website_url', row.website_url);
    set('location_page_url', row.location_page_url);
    set('google_business_profile_url', row.google_business_profile_url);

    const hoursConfirmedEl = form.elements['hours_confirmed'];
    if (hoursConfirmedEl) hoursConfirmedEl.checked = !!row.hours_confirmed;

    if (row.hours && typeof row.hours === 'object') {
      for (const d of DAYS) {
        const h = row.hours[d];
        if (!h) continue;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        // Always restore the stored times, then set disabled from `closed`.
        // Older rows saved before this fix have no times on a closed day, so
        // the 09:00-17:00 default stands in and nothing is lost either way.
        if (openEl && h.open) openEl.value = h.open;
        if (closeEl && h.close) closeEl.value = h.close;
        if (closedEl) closedEl.checked = !!h.closed;
        if (openEl) openEl.disabled = !!h.closed;
        if (closeEl) closeEl.disabled = !!h.closed;
      }
    }

    set('crm_platform', row.crm_platform);
    set('crm_platform_other', row.crm_platform_other);
    set('crm_account_confirmed', row.crm_account_confirmed);

    set('assistant_name', row.assistant_name);
    set('trial_booking_url', row.trial_booking_url);
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
    set('contact_name', bk.contact_name);
    set('bk_unique_value', bk.unique_value);
    set('bk_first_visit', bk.first_visit);
    set('bk_faq', bk.faq);
    setRadio('bk_accepts_insurance', bk.accepts_insurance);
    setRadio('bk_accepts_hsa_fsa', bk.accepts_hsa_fsa);
    set('bk_insurance_notes', bk.insurance_notes);

    const ag = row.automation_goals;
    const campaigns = (ag && typeof ag === 'object' && Array.isArray(ag.campaigns))
      ? ag.campaigns : [];
    CAMPAIGNS.forEach(c => {
      const cb = form.elements[`camp_${c}`];
      if (cb) cb.checked = campaigns.includes(c);
    });

    const nc = row.notification_config || {};
    if (Array.isArray(nc.channels)) {
      NOTIFICATION_CHANNELS.forEach(c => {
        const cb = form.elements[`notify_${c}`];
        if (cb) cb.checked = nc.channels.includes(c);
      });
    }
    setRadio('notify_target', nc.target || 'primary');
    set('notify_email_address', nc.email);
    set('notify_phone_number', nc.phone);

    const users = Array.isArray(row.dashboard_users) ? row.dashboard_users : [];
    const list = document.getElementById('users-list');
    if (users.length > 0) {
      list.innerHTML = '';
      users.forEach((u, i) => {
        list.insertAdjacentHTML('beforeend', userRowHTML(i));
        const row = list.lastElementChild;
        row.querySelector('[name$="_name"]').value = u.name || '';
        row.querySelector('[name$="_email"]').value = u.email || '';
        const roleEl = row.querySelector('[name$="_role"]');
        if (roleEl && u.role) roleEl.value = u.role;
      });
      userCounter = users.length;
    }

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

    if (fd.get('crm_platform') === 'other' && !(fd.get('crm_platform_other') || '').trim()) {
      problems.push(form.querySelector('[name="crm_platform_other"]'));
    }
    if (fd.get('main_cta') === 'other' && !(fd.get('main_cta_other') || '').trim()) {
      problems.push(form.querySelector('[name="main_cta_other"]'));
    }
    if (!(fd.get('bk_single_session_rate') || '').trim() && !(fd.get('bk_membership_pricing') || '').trim()) {
      problems.push(form.querySelector('[name="bk_single_session_rate"]'));
      problems.push(form.querySelector('[name="bk_membership_pricing"]'));
    }
    if (collectCampaigns(fd).length === 0) {
      problems.push(form.querySelector('[name="camp_contacting_new_leads"]'));
    }
    if (collectNotificationChannels(fd).length === 0) {
      problems.push(form.querySelector('[name="notify_email"]'));
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

  // Two buttons now trigger the same save -- the one at the foot of the form and
  // the one in the sticky bar -- so their label and disabled state move together.
  function draftButtons() {
    return [
      document.getElementById('save-draft-btn'),
      document.getElementById('sticky-save-draft-btn'),
    ].filter(Boolean);
  }

  function setDraftButtonState(label, disabled) {
    draftButtons().forEach((btn) => {
      btn.textContent = label;
      btn.disabled = disabled;
    });
  }

  function setStickyPanelOpen(open) {
    const panel = document.getElementById('sticky-draft-panel');
    const toggle = document.getElementById('sticky-link-toggle');
    if (!panel || !toggle) return;
    panel.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = open ? 'Hide draft link' : 'Show draft link';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  function isStickyPanelOpen() {
    const panel = document.getElementById('sticky-draft-panel');
    return !!panel && panel.classList.contains('is-open');
  }

  function showDraftLink(scroll) {
    if (!draftId) return;
    const banner = document.getElementById('draft-banner');
    const linkEl = document.getElementById('draft-link');
    const url = `${window.location.origin}${window.location.pathname}?draft=${draftId}`;
    linkEl.value = url;
    banner.hidden = false;
    const stickyLink = document.getElementById('sticky-draft-link');
    if (stickyLink) stickyLink.value = url;
    // There is a link to show now, so the chevron becomes available.
    const toggle = document.getElementById('sticky-link-toggle');
    if (toggle) toggle.hidden = false;
    if (scroll) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSaveDraft(source) {
    hideError();
    const fromSticky = source === 'sticky';
    setDraftButtonState('Saving...', true);
    try {
      const payload = buildPayload('draft');
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        const newId = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        payload.id = newId;
        await insertRow(payload);
        draftId = newId;
        setDraftIdInUrl(newId);
      }
      // Reveal the link where the click came from: the sticky panel drops down in
      // place, while the footer button scrolls to the banner as it always has.
      showDraftLink(!fromSticky);
      if (fromSticky) setStickyPanelOpen(true);
      setDraftButtonState('Saved \u2713', true);
      setTimeout(() => setDraftButtonState('Save as draft', false), 1500);
    } catch (err) {
      console.error(err);
      showError(`Draft save failed: ${err.message}`);
      setDraftButtonState('Save as draft', false);
    }
  }

  // The bar is fixed to the top and always on screen, so the body needs padding
  // equal to its height or the bar would sit over the header. Measured rather
  // than hard-coded, so it stays correct if the bar's contents ever change.
  // Only the bar itself counts -- the drop-down panel is an overlay.
  function syncStickyOffset() {
    const bar = document.querySelector('.sticky-draft__bar');
    const track = document.querySelector('.sticky-draft__track');
    if (!bar) return;
    const h = bar.offsetHeight + (track ? track.offsetHeight : 0);
    document.body.style.paddingTop = h + 'px';
  }

  function initStickyDraftBar() {
    const bar = document.getElementById('sticky-draft');
    const form = document.getElementById('intake-form');
    if (!bar || !form) return;
    // initDraftFromUrl() runs before this and hides the form on an
    // already-submitted link. Bail out rather than float a Save draft button
    // over a form nobody can edit.
    if (form.hidden) {
      bar.hidden = true;
      return;
    }

    syncStickyOffset();
    window.addEventListener('resize', syncStickyOffset);

    document.getElementById('sticky-save-draft-btn')
      .addEventListener('click', () => handleSaveDraft('sticky'));

    document.getElementById('sticky-link-toggle')
      .addEventListener('click', () => setStickyPanelOpen(!isStickyPanelOpen()));

    document.getElementById('sticky-copy-link-btn').addEventListener('click', async () => {
      const linkEl = document.getElementById('sticky-draft-link');
      const btn = document.getElementById('sticky-copy-link-btn');
      try {
        await navigator.clipboard.writeText(linkEl.value);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      } catch (e) {
        // clipboard API needs a secure context / permission; fall back to select
        linkEl.select();
      }
    });
  }

  // Called once the form is gone (submitted, or already-submitted link) -- at
  // that point there is nothing left to save, so the bar comes off entirely and
  // the body padding it reserved is released.
  function disableStickyDraftBar() {
    const bar = document.getElementById('sticky-draft');
    if (!bar) return;
    setStickyPanelOpen(false);
    bar.hidden = true;
    document.body.style.paddingTop = '';
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

    const users = collectUsers();
    const campaigns = collectCampaigns(fd);
    const channels = collectNotificationChannels(fd);

    const crmDisplay = fd.get('crm_platform') === 'other' ? dash(fd.get('crm_platform_other')) + ' (other)' : label(fd.get('crm_platform')) || '—';
    const ctaDisplay = fd.get('main_cta') === 'other' ? dash(fd.get('main_cta_other')) + ' (other)' : label(fd.get('main_cta')) || '—';
    const campaignsDisplay = campaigns.length ? campaigns.map(label).join('\n') : '—';
    const channelsDisplay = channels.length ? channels.map(label).join(', ') : '—';
    const notifyTargetDisplay = fd.get('notify_target') === 'different'
      ? `${dash(fd.get('notify_email_address'))} / ${dash(fd.get('notify_phone_number'))}`
      : 'Same as primary contact';

    const hours = collectHours(fd);
    const hoursLines = DAYS.map(d => {
      const h = hours[d];
      const dl = DAY_LABELS[d];
      return h.closed ? `${dl}: closed` : `${dl}: ${h.open || '—'}–${h.close || '—'}`;
    });
    const hoursDisplay = hoursLines.join('\n');


    const usersDisplay = users.length
      ? users.map(u => `${u.name || '(no name)'} — ${u.email || '(no email)'}`).join('\n')
      : '—';

    const groups = [
      {
        heading: 'Your Team',
        items: [
          ['Primary contact', dash(fd.get('contact_name'))],
          ['Primary contact email', dash(fd.get('contact_email'))],
          ['Primary contact phone', dash(fd.get('contact_phone'))],
          ['Dashboard users', usersDisplay]
        ]
      },
      {
        heading: 'Studio Information',
        items: [
          ['Name', dash(fd.get('business_name'))],
          ['Business email', dash(fd.get('business_email'))],
          ['Business phone', dash(fd.get('business_phone'))],
          ['City', dash(fd.get('city'))],
          ['Address', dash(fd.get('address'))],
          ['Timezone', dash(fd.get('timezone'))],
          ['Website', dash(fd.get('website_url'))],
          ['Google Business Profile', dash(fd.get('google_business_profile_url'))]
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
        heading: 'Your AI Team Member',
        items: [
          ['Name', dash(fd.get('assistant_name'))],
          ['Booking link', dash(fd.get('trial_booking_url'))],
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
          ['Ideal client', dash(fd.get('bk_ideal_client'))],
          ['Pain points', dash(fd.get('bk_pain_points'))],
          ['Unique value', dash(fd.get('bk_unique_value'))],
          ['First visit', dash(fd.get('bk_first_visit'))],
          ['FAQ', dash(fd.get('bk_faq'))]
        ]
      },
      {
        heading: 'Campaigns',
        items: [
          [`Switched on (${campaigns.length})`, campaignsDisplay]
        ]
      },
      {
        heading: 'Notifications',
        items: [
          ['How', channelsDisplay],
          ['Where', notifyTargetDisplay]
        ]
      },
      {
        heading: 'Anything Else?',
        items: [
          ['Notes', dash(fd.get('notes'))]
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
    hideError();
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Submitting...';
    try {
      const payload = buildPayload('pending');
      if (draftId) {
        await updateRow(draftId, payload);
      } else {
        payload.id = (crypto.randomUUID && crypto.randomUUID()) || generateUuid();
        await insertRow(payload);
      }

      // Fire-and-forget confirmation email via the n8n "Intake Confirmation Email"
      // workflow — it re-reads the row by id and emails contact_email (only when status='pending').
      if (!PREVIEW) fetch('https://velocityaipartners.app.n8n.cloud/webhook/intake-confirmation', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_id: draftId || payload.id }),
      }).catch(() => {}); // best-effort; must never block or break the success screen

      stopAutosave();
      clearLocalBackup();
      closeSubmitConfirm();
      document.getElementById('intake-form').hidden = true;
      document.getElementById('draft-banner').hidden = true;
      disableStickyDraftBar();
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

  // A bad draft link must never present a blank, editable form. If it did, the
  // client would fill the whole thing in, hit Save, and silently create a second
  // row while the pre-filled one they were sent sat untouched.
  function lockFormWithError(message) {
    const form = document.getElementById('intake-form');
    if (form) form.hidden = true;
    stopAutosave();
    disableStickyDraftBar();
    showError(message);
  }

  async function initDraftFromUrl() {
    const id = getDraftIdFromUrl();
    if (!id) {
      // A draft param is present but not a valid uuid: truncated on paste, or
      // mangled by an email client. Previously this fell through to a pristine
      // blank form with no warning at all.
      if (/[?&]draft=/.test(window.location.search)) {
        lockFormWithError('This link looks incomplete. Please use the full link from your email, or reply to us and we will resend it.');
        return false;
      }
      return false;
    }
    try {
      const row = await fetchDraft(id);
      if (!row) {
        lockFormWithError('We could not find your onboarding form from this link. Please reply to the email we sent, or contact admin@velocityaipartners.ai and we will send you a new one.');
        return false;
      }
      if (row.status && row.status !== 'draft') {
        document.getElementById('intake-form').hidden = true;
        document.getElementById('already-submitted').hidden = false;
        disableStickyDraftBar();
        return false;
      }
      draftId = id;
      applyServerRowToForm(row);
      showDraftLink();
      return true;
    } catch (err) {
      console.error(err);
      // Network or RLS failure. Locking is deliberate: letting them type into a
      // form we could not load means their answers go somewhere we cannot join
      // back to their record.
      lockFormWithError(`We could not load your onboarding form (${err.message}). Please refresh, or contact admin@velocityaipartners.ai.`);
      return false;
    }
  }

  const PROGRESS_FIELDS = [
    'business_name', 'business_email', 'business_phone', 'city', 'address', 'timezone',
    'contact_name', 'contact_email', 'contact_phone', 'crm_platform',
    'bk_service_description', 'bk_cancellation_policy', 'bk_eligibility',
    'bk_ideal_client', 'bk_pain_points', 'bk_unique_value', 'bk_first_visit', 'bk_faq',
    'assistant_name', 'trial_booking_url',
    'main_cta', 'intro_offer'
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
    checks.push(!!((fd.get('bk_single_session_rate') || '').trim() || (fd.get('bk_membership_pricing') || '').trim()));
    checks.push(fd.get('crm_account_confirmed') === 'on');
    checks.push(fd.get('hours_confirmed') === 'on');
    checks.push(collectUsers().some(u => u.name && u.email && EMAIL_RX.test(u.email)));

    if (fd.get('crm_platform') === 'other') checks.push(!!(fd.get('crm_platform_other') || '').trim());
    if (fd.get('main_cta') === 'other') checks.push(!!(fd.get('main_cta_other') || '').trim());
    checks.push(collectCampaigns(fd).length > 0);
    checks.push(collectNotificationChannels(fd).length > 0);

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
    const stickyText = document.getElementById('sticky-progress-text');
    if (stickyText) stickyText.textContent = `${pct}% complete`;
    const stickyFill = document.getElementById('sticky-progress-fill');
    if (stickyFill) stickyFill.style.width = pct + '%';
  }

  function initProgressBar() {
    updateProgressBar();
    const form = document.getElementById('intake-form');
    if (!form) return;
    form.addEventListener('input', updateProgressBar);
    form.addEventListener('change', updateProgressBar);
  }

  // ---- AI prefill: scrape the location page and fill what we can find ------
  // Same engine as the redesign/franchisor forms: POST the pasted URL to the
  // scrape-location-page edge function, then apply the returned
  // (form-field-keyed) subset to ONLY the fields present in the response. It
  // deliberately never touches automation/handoff/users/notify sections, and
  // nothing is auto-submitted: the hours and CRM attestations stay unchecked so
  // the client is forced to review. Every filled field gets an "AI suggested"
  // chip that clears on their first edit.

  function formatPhoneValue(raw) {
    let d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1); // drop a leading US country code
    d = d.slice(0, 10);
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

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
      if (key === 'hours' || key === 'address' || key === 'state' || key === 'zip') return; // handled below
      if (setField(key, s[key])) filled.push(key);
    });
    // This form has a single street-address line and no state/zip fields, so
    // fold any scraped state/zip into it ("123 Main St" -> "123 Main St, OH 43215").
    if (s.address) {
      let line = String(s.address).trim();
      const tail = [s.state, s.zip].filter(Boolean).join(' ').trim();
      if (tail && !(s.zip && line.indexOf(s.zip) >= 0)) line += ', ' + tail;
      if (setField('address', line)) filled.push('address');
    }
    // Format any scraped phone to the form's (555) 123-4567 style.
    ['business_phone', 'contact_phone'].forEach((n) => {
      const el = form.elements[n];
      if (el && el.value) el.value = formatPhoneValue(el.value);
    });
    // Hours grid (the edge function already snapped times to 15-min increments).
    // Mirrors applyServerRowToForm: keep the open/close inputs' disabled state
    // in sync with the closed checkbox.
    if (s.hours && typeof s.hours === 'object') {
      let any = false;
      DAYS.forEach((d) => {
        const h = s.hours[d];
        if (!h) return;
        const closedEl = form.elements[`hours_${d}_closed`];
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        const isClosed = !!h.closed;
        if (closedEl) closedEl.checked = isClosed;
        if (openEl) openEl.disabled = isClosed;
        if (closeEl) closeEl.disabled = isClosed;
        if (!isClosed) {
          if (openEl && h.open) openEl.value = h.open;
          if (closeEl && h.close) closeEl.value = h.close;
        }
        any = true;
      });
      if (any) filled.push('hours');
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

  // chipText defaults to 'AI suggested' so every existing caller is unchanged.
  // The client-prefill path passes 'Pre-filled': same chip, same clear-on-edit
  // behaviour, honest about where the value actually came from.
  function markAiSuggested(names, chipText) {
    const form = document.getElementById('intake-form');
    if (!form) return;
    const text = chipText || 'AI suggested';
    const makeChip = (cls) => {
      const c = document.createElement('span');
      c.className = cls;
      c.textContent = text;
      return c;
    };
    // Groups with no per-field label of their own: badge the section heading
    // instead, keyed by a field we can use to find the right <section>.
    const SECTION_BADGE_REF = {
      hours: 'hours_mon_closed',
      campaigns: 'camp_contacting_new_leads'
    };
    (names || []).forEach((name) => {
      if (SECTION_BADGE_REF[name]) {
        const ref = form.elements[SECTION_BADGE_REF[name]];
        const section = ref && ref.closest ? ref.closest('section') : null;
        const h2 = section ? section.querySelector('h2') : null;
        if (h2 && !h2.querySelector('.ai-suggested-badge')) h2.appendChild(makeChip('ai-suggested-badge'));
        return;
      }
      const el = form.elements[name];
      if (!el) return;
      const isGroup = (typeof el.length === 'number' && el.tagName === undefined);
      const node = isGroup ? el[0] : el;
      if (!node || !node.closest) return;
      // Radio group: chip after the fieldset legend.
      if (isGroup) {
        const fs = node.closest('fieldset');
        const legend = fs ? fs.querySelector('legend') : null;
        if (legend && !legend.querySelector('.ai-suggested-chip')) {
          legend.appendChild(makeChip('ai-suggested-chip'));
          const clearG = () => { const c = legend.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
          [].slice.call(el).forEach((t) => t.addEventListener('change', clearG, { once: true }));
        }
        return;
      }
      // Single control: inline chip right before the control inside its label.
      const label = node.closest('label');
      if (label && !label.querySelector('.ai-suggested-chip')) {
        let anchor = null;
        for (const child of label.children) {
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(child.tagName)) { anchor = child; break; }
        }
        label.insertBefore(makeChip('ai-suggested-chip'), anchor);
        const clear = () => { const c = label.querySelector('.ai-suggested-chip'); if (c) c.remove(); };
        node.addEventListener('input', clear, { once: true });
        node.addEventListener('change', clear, { once: true });
      }
    });
  }

  // Seed the form from CLIENT_PREFILLS for a pre-filled client link.
  //
  // Ordering is load-bearing. This runs AFTER initDraftFromUrl() so a returning
  // client's saved answers always beat the static config, and BEFORE
  // captureAutosaveBaseline() so the seeded values become the baseline. Run it
  // after the baseline instead and changedFieldCount() reads ~20 on a form
  // nobody has touched, autosave fires the 3-changed-field cold start, and the
  // slack-intake-submission trigger pings #client-onboarding with <!channel>
  // for a client who never typed a character.
  function applyClientPrefill() {
    const slug = clientSlug();
    if (!slug) return null;
    const cfg = CLIENT_PREFILLS[slug];
    const form = document.getElementById('intake-form');
    if (!cfg || !form) return null;

    // A loaded draft is the client's own work. Never overwrite it.
    if (draftId) return null;

    // Two tiers of seeded value, chipped differently on purpose.
    //   fields      -- verified for THIS studio (signed agreement, the brand's
    //                  own location page, the studio's own channels, our CRM).
    //                  Chipped "Pre-filled".
    //   draftFields -- our starting draft, carried over from how the Stretch
    //                  Zones we already run answer the same question. True of
    //                  the brand, NOT verified for this studio. Chipped
    //                  "Draft" so the client can see at a glance which values
    //                  are ours to correct rather than ours to confirm.
    // Keeping these apart is the difference between "we looked this up" and
    // "we guessed" -- pricing especially varies studio to studio.
    const filled = [];
    const drafted = [];

    const seed = (map, bucket) => {
      Object.keys(map || {}).forEach((name) => {
        const el = form.elements[name];
        if (!el || typeof el.length === 'number' && el.tagName === undefined) return;
        el.value = map[name];
        bucket.push(name);
      });
    };

    seed(cfg.fields, filled);
    seed(cfg.draftFields, drafted);

    if (cfg.hours) {
      DAYS.forEach((d) => {
        const h = cfg.hours[d];
        if (!h) return;
        const openEl = form.elements[`hours_${d}_open`];
        const closeEl = form.elements[`hours_${d}_close`];
        if (openEl) openEl.value = h[0];
        if (closeEl) closeEl.value = h[1];
      });
      filled.push('hours');
    }

    // renderUsers() has already seeded row 0; addUser() appends the rest.
    (cfg.users || []).forEach((u, i) => {
      if (i > 0) addUser();
      const nameEl = form.elements[`user_${i}_name`];
      const emailEl = form.elements[`user_${i}_email`];
      const roleEl = form.elements[`user_${i}_role`];
      if (nameEl) nameEl.value = u.name;
      if (emailEl) emailEl.value = u.email;
      if (roleEl && u.role) roleEl.value = u.role;
    });

    // Campaign Map checkboxes. Ticking a box is a claim about what the client
    // wants their AI Team Member to do, so only seed campaigns that match the
    // scope we actually sold and quantified for them, and badge the whole
    // section once rather than chipping 15 boxes individually.
    (cfg.campaigns || []).forEach((name) => {
      const el = form.elements[name];
      if (!el || el.type !== 'checkbox') return;
      el.checked = true;
    });
    if ((cfg.campaigns || []).length) drafted.push('campaigns');

    // crm_platform is a select whose "other" text box is toggled by a change
    // listener. Setting .value in code fires no event, so call the toggle.
    if (cfg.fields && cfg.fields.crm_platform) toggleCrmOther();

    const h1 = document.querySelector('header h1');
    if (h1 && cfg.heading) h1.textContent = cfg.heading;
    const lead = document.querySelector('header p.lead');
    if (lead && cfg.subheading) lead.textContent = cfg.subheading;

    markAiSuggested(filled, 'Pre-filled');
    markAiSuggested(drafted, 'Draft');
    return { slug, count: filled.length + drafted.length };
  }

  async function runPrefill(url, btn) {
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
    // Be honest about the wait. This reads the location page plus up to two
    // About/Story pages and then runs extraction, which measures 12-19s on real
    // brand sites. "A few seconds" made people think it had failed and click away.
    setPrefillStatus('Reading your page and pulling in everything we can find. This usually takes 10 to 20 seconds — hang tight, we will fill in what we find.', 'loading');
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/scrape-location-page`, {
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
      updateProgressBar();
      markAiSuggested(filled);
      const n = filled.length;
      setPrefillStatus(
        n
          ? `✓ Done. Filled in ${n} field${n === 1 ? '' : 's'} from your page, each marked "AI suggested." Review and confirm them before you submit.`
          : 'We could not pull much from that page. Please fill the form in yourself.',
        n ? 'success' : 'error'
      );
    } catch (e) {
      console.error(e);
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

  document.addEventListener('DOMContentLoaded', async () => {
    clearStaleLocalStorage();
    renderHours();
    if (PREVIEW) {
      const b = document.getElementById('preview-banner');
      if (b) b.hidden = false;
    }
    renderUsers();
    initProgressBar();
    initPrefillButton();

    await initDraftFromUrl();
    // Between the draft load and the baseline. See applyClientPrefill().
    applyClientPrefill();
    captureAutosaveBaseline();
    maybeRestoreLocalBackup();
    initAutosave();
    updateProgressBar();

    document.getElementById('intake-form').addEventListener('change', (e) => {
      if (e.target.name === 'crm_platform') toggleCrmOther();
      if (e.target.name === 'main_cta') toggleMainCtaOther();
      if (e.target.name === 'notify_target') toggleNotifyTarget();
    });
    document.getElementById('intake-form').addEventListener('submit', handleSubmit);
    document.getElementById('save-draft-btn').addEventListener('click', () => handleSaveDraft('footer'));
    initStickyDraftBar();

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
