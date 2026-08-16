import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

// Public, unauthenticated — used by the login page, public /verify pages, and
// (via the shared SettingsContext) by every logged-in page that needs to
// preview or apply the numbering format, including the Settings page's own
// edit form. The numbering columns are just formatting metadata (prefix/
// pattern/digit-padding/next sequence), not sensitive, so they're included
// here too — leaving them out meant SettingsContext never saw the real saved
// values, and the Settings page's numbering section reset to defaults right
// after every save.
export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select(`
        org_name_so, org_name_en, logo_url, contact_email, contact_phone, contact_address, reference_subjects, land_types,
        ref_number_prefix, ref_number_next_seq, ref_number_format, ref_number_digits,
        survey_number_prefix, survey_number_next_seq, survey_number_format, survey_number_digits,
        receipt_number_prefix, receipt_number_next_seq, receipt_number_format, receipt_number_digits,
        expense_number_prefix, expense_number_next_seq, expense_number_format, expense_number_digits
      `)
      .eq('id', 1)
      .single();

    // Branding settings are optional. The client merges this object over its built-in
    // defaults, so a fresh database (or one without the migration yet) should not turn
    // a normal login-page request into a noisy 404.
    if (error?.code === 'PGRST116' || error?.code === '42P01' || error?.code === 'PGRST205' || (!error && !data)) {
      return NextResponse.json({ settings: {} }, { headers: NO_STORE_HEADERS });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ settings: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error('Error fetching public settings:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
