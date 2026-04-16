import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CAMPAIGN_TYPES = [
  'lead_nurture',
  'lead_reactivation',
  'demo_reactivation',
  'ex_member',
  'demo_reminder',
  'client_retention',
  'post_appointment',
];

const DEFAULT_SETTINGS: Record<string, string> = {
  jitter_min_minutes: '1',
  jitter_max_minutes: '5',
  max_unanswered_followups: '3',
  morning_window_start_hour: '10',
  morning_window_start_minute: '0',
  morning_window_range_minutes: '60',
  quiet_hours_start: '20',
  quiet_hours_end: '8',
  quiet_hours_resume_hour: '10',
  quiet_hours_resume_minute: '0',
  revenue_per_conversion: '149',
};

const BK_FIELD_MAP: Record<string, { category: string; title: string }> = {
  service_description: { category: 'Services & Pricing', title: 'Service Description' },
  single_session_rate: { category: 'Services & Pricing', title: 'Single Session Pricing' },
  membership_pricing: { category: 'Services & Pricing', title: 'Membership Pricing' },
  package_pricing: { category: 'Services & Pricing', title: 'Package Pricing' },
  cancellation_policy: { category: 'Policies & Rules', title: 'Cancellation and Refund Policy' },
  eligibility: { category: 'Policies & Rules', title: 'Age or Eligibility Restrictions' },
  ideal_client: { category: 'General Information', title: 'Target Audience and Demographics' },
  unique_value: { category: 'General Information', title: 'What Makes Us Unique' },
  approved_phrases: { category: 'General Information', title: 'Approved Taglines and Phrases' },
  forbidden_claims: { category: 'Policies & Rules', title: 'Topics to Avoid' },
  first_visit: { category: 'General Information', title: 'What to Bring and First Visit' },
  faq: { category: 'FAQs', title: 'Frequently Asked Questions' },
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function formatHours(hours: any): string | null {
  if (!hours || typeof hours !== 'object') return null;
  const lines: string[] = [];
  for (const d of DAYS) {
    const h = hours[d];
    if (!h) continue;
    if (h.closed) lines.push(`${DAY_LABELS[d]}: closed`);
    else if (h.open && h.close) lines.push(`${DAY_LABELS[d]}: ${h.open} to ${h.close}`);
  }
  return lines.length ? lines.join('\n') : null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Admin gate: require JWT belonging to a user with user_roles.role = 'admin'
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonError('Not authenticated', 401);
  }
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow, error: roleErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleErr) return jsonError(`Role check failed: ${roleErr.message}`, 500);
  if (!roleRow) return jsonError('Admin role required', 403);

  let input: any;
  try {
    input = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const required = [
    'intake_id', 'location_slug', 'organization', 'brand',
    'short_slug', 'business_type', 'from_phone',
  ];
  for (const k of required) {
    if (!input[k]) return jsonError(`Missing required field: ${k}`, 400);
  }

  // Fetch intake
  const { data: intake, error: fetchErr } = await admin
    .from('location_intake_submissions')
    .select('*')
    .eq('id', input.intake_id)
    .maybeSingle();
  if (fetchErr) return jsonError(`Fetch intake failed: ${fetchErr.message}`, 500);
  if (!intake) return jsonError('Intake not found', 404);
  if (intake.status === 'provisioned') {
    return jsonError('Intake already provisioned', 409);
  }

  const slug = input.location_slug;

  // 1. Insert into locations (triggers auto_provision_new_location)
  const locationRow: any = {
    name: input.display_name || intake.business_name,
    slug,
    organization: input.organization,
    is_active: true,
    messaging_enabled: false,
    timezone: intake.timezone,
    sending_phone: input.from_phone,
    contact_email: intake.contact_email,
    contact_phone: intake.contact_phone,
    studio_name: input.assistant_name || intake.assistant_name,
    clubready_username: intake.crm_platform === 'clubready' ? intake.crm_username : null,
    clubready_password: intake.crm_platform === 'clubready' ? intake.crm_password : null,
    knetk_store_id: input.brand === 'stretch-zone' ? intake.crm_store_id : null,
    booking_link: intake.trial_booking_url,
    logo_url: intake.logo_url,
  };
  const { data: loc, error: locErr } = await admin
    .from('locations')
    .insert(locationRow)
    .select()
    .single();
  if (locErr) return jsonError(`Insert locations failed: ${locErr.message}`, 500);

  // 2. Insert workflow_location_config (workflows_enabled=false)
  const wlcRow: any = {
    location_slug: slug,
    brand: input.brand,
    short_slug: input.short_slug,
    display_name: input.display_name || intake.business_name,
    business_type: input.business_type,
    address: intake.address,
    crm_type: intake.crm_platform,
    crm_store_id: intake.crm_store_id,
    crm_username: intake.crm_username,
    crm_password: intake.crm_password,
    crm_auth_type: input.crm_auth_type ?? null,
    crm_login_domain: input.crm_login_domain ?? null,
    crm_chain_id: input.crm_chain_id ?? null,
    from_phone: input.from_phone,
    messaging_service_sid: input.messaging_service_sid ?? null,
    studio_phone_display: intake.studio_phone_display,
    timezone: intake.timezone,
    contact_email: intake.contact_email,
    assistant_name: input.assistant_name ?? intake.assistant_name ?? 'Assistant',
    sign_off_name: input.sign_off_name ?? intake.sign_off_name ?? 'The team',
    intro_offer: intake.intro_offer,
    has_free_trial: !!intake.has_free_trial,
    has_slots: intake.crm_platform === 'clubready',
    booking_link: intake.trial_booking_url,
    trial_links: null,
    member_info_shortcode: input.member_info_shortcode ?? null,
    workflows_enabled: false,
  };
  const { error: wlcErr } = await admin.from('workflow_location_config').insert(wlcRow);
  if (wlcErr) return jsonError(`Insert workflow_location_config failed: ${wlcErr.message}`, 500);

  // 3. Campaign toggles are auto-created by the auto_provision_new_location trigger
  //    when the locations row is inserted. No manual insert needed here. We record
  //    the count for the response payload only.

  // 4. Location settings defaults (11 rows)
  const settingsRows = Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({
    location_id: loc.id,
    setting_key: k,
    setting_value: v,
  }));
  const { error: settingsErr } = await admin.from('location_settings').insert(settingsRows);
  if (settingsErr) return jsonError(`Insert location_settings failed: ${settingsErr.message}`, 500);

  // 5. Business knowledge rows
  const bk: any[] = [];
  const bkJson = intake.business_knowledge || {};
  for (const [key, meta] of Object.entries(BK_FIELD_MAP)) {
    const content = bkJson[key];
    if (content && String(content).trim() !== '') {
      bk.push({
        location_slug: slug,
        location_id: loc.id,
        category: meta.category,
        title: meta.title,
        content: String(content),
        is_active: true,
      });
    }
  }
  // Hours
  const hoursFormatted = formatHours(intake.hours);
  if (hoursFormatted) {
    const contactBits = [
      intake.business_name,
      intake.address,
      intake.studio_phone_display ? `Phone: ${intake.studio_phone_display}` : null,
      hoursFormatted ? `Hours:\n${hoursFormatted}` : null,
    ].filter(Boolean).join('\n');
    bk.push({
      location_slug: slug,
      location_id: loc.id,
      category: 'Hours & Schedule',
      title: 'Business Hours and Contact Information',
      content: contactBits,
      is_active: true,
    });
  }
  // Social
  const socials: string[] = [];
  if (intake.instagram_handle) socials.push(`Instagram: ${intake.instagram_handle}`);
  if (intake.facebook_page_url) socials.push(`Facebook: ${intake.facebook_page_url}`);
  if (intake.tiktok_handle) socials.push(`TikTok: ${intake.tiktok_handle}`);
  if (socials.length) {
    bk.push({
      location_slug: slug,
      location_id: loc.id,
      category: 'Contact Information',
      title: 'Social Media Presence',
      content: socials.join('\n'),
      is_active: true,
    });
  }
  // Website + GBP
  const web: string[] = [];
  if (intake.website_url) web.push(`Website: ${intake.website_url}`);
  if (intake.google_business_profile_url) web.push(`Google Business Profile: ${intake.google_business_profile_url}`);
  if (web.length) {
    bk.push({
      location_slug: slug,
      location_id: loc.id,
      category: 'Contact Information',
      title: 'Website and Online Presence',
      content: web.join('\n'),
      is_active: true,
    });
  }
  // Communication preferences (from branding words)
  const commPrefs: string[] = [];
  if (intake.preferred_words) commPrefs.push(`Preferred: ${intake.preferred_words}`);
  if (intake.avoid_words) commPrefs.push(`Avoid: ${intake.avoid_words}`);
  if (commPrefs.length) {
    bk.push({
      location_slug: slug,
      location_id: loc.id,
      category: 'Policies & Rules',
      title: 'Communication Tone Guidelines',
      content: commPrefs.join('\n'),
      is_active: true,
    });
  }
  // Intro offer as Special Programs
  if (intake.intro_offer && String(intake.intro_offer).trim() !== '') {
    bk.push({
      location_slug: slug,
      location_id: loc.id,
      category: 'Special Programs',
      title: 'Introductory Offer',
      content: String(intake.intro_offer),
      is_active: true,
    });
  }

  if (bk.length) {
    const { error: bkErr } = await admin.from('business_knowledge').insert(bk);
    if (bkErr) return jsonError(`Insert business_knowledge failed: ${bkErr.message}`, 500);
  }

  // 6. Clone A/B tests + variants from canonical source (stretch-zone-westborough)
  // Templates use {locationName}/{senderName}/{slot1}/{slot2}/{bookingUrl}/{leadName} placeholders
  // which get replaced at send time from workflow_location_config + check-availability, so the
  // cloned templates work for any location without content edits. Admin reviews and tunes per
  // location via /ab-configuration before flipping workflows_enabled=true.
  const AB_SOURCE_SLUG = input.ab_source_slug || 'stretch-zone-westborough';
  let clonedTests = 0;
  let clonedVariants = 0;
  try {
    const { data: sourceTests, error: stErr } = await admin
      .from('ab_tests')
      .select('*')
      .eq('location_slug', AB_SOURCE_SLUG)
      .eq('status', 'active');
    if (stErr) throw stErr;

    for (const src of sourceTests || []) {
      const { data: newTest, error: ntErr } = await admin
        .from('ab_tests')
        .insert({
          name: src.name,
          module: src.module,
          touchpoint: src.touchpoint,
          location_slug: slug,
          location_slugs: [slug],
          status: 'active',
          started_at: new Date().toISOString(),
          created_by: userId,
        })
        .select('id')
        .single();
      if (ntErr) throw ntErr;

      const { data: srcVariants, error: svErr } = await admin
        .from('ab_test_variants')
        .select('variant_code,variant_label,prompt_instructions,weight,hidden_from_archive')
        .eq('ab_test_id', src.id);
      if (svErr) throw svErr;

      if (srcVariants && srcVariants.length) {
        const variantRows = srcVariants.map((v: any) => ({
          ab_test_id: newTest.id,
          variant_code: v.variant_code,
          variant_label: v.variant_label,
          prompt_instructions: v.prompt_instructions,
          weight: v.weight,
          hidden_from_archive: v.hidden_from_archive,
        }));
        const { error: insVarErr } = await admin
          .from('ab_test_variants')
          .insert(variantRows);
        if (insVarErr) throw insVarErr;
        clonedVariants += variantRows.length;
      }
      clonedTests += 1;
    }
  } catch (cloneErr: any) {
    // Don't fail the whole provision if A/B clone fails; log and continue
    console.error('A/B clone failed:', cloneErr.message);
  }

  // 7. Update intake status
  const { error: updateErr } = await admin
    .from('location_intake_submissions')
    .update({
      status: 'provisioned',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.intake_id);
  if (updateErr) return jsonError(`Update intake status failed: ${updateErr.message}`, 500);

  return new Response(JSON.stringify({
    success: true,
    location_slug: slug,
    location_id: loc.id,
    counts: {
      campaign_toggles: CAMPAIGN_TYPES.length,
      location_settings: Object.keys(DEFAULT_SETTINGS).length,
      business_knowledge: bk.length,
      ab_tests_cloned: clonedTests,
      ab_variants_cloned: clonedVariants,
    },
    ab_source_slug: AB_SOURCE_SLUG,
    notes: [
      'workflows_enabled is FALSE. Flip to true in workflow_location_config when Twilio and hardcoded surfaces are wired.',
      'All campaign_toggles are OFF. Enable per campaign in /campaigns page.',
      'Hardcoded edge fns and n8n workflows NOT updated. See newlocation skill section 3.',
      `A/B tests cloned from ${AB_SOURCE_SLUG}. Review + tune at /ab-configuration before go-live.`,
    ],
  }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
