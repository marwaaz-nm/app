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

// Public, unauthenticated — used by the login page and public /verify pages,
// so this only ever selects branding/contact fields, never anything internal.
export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('org_name_so, org_name_en, logo_url, contact_email, contact_phone, contact_address, reference_subjects, land_types')
      .eq('id', 1)
      .single();

    // Branding settings are optional. The client merges this object over its built-in
    // defaults, so a fresh database (or one without the migration yet) should not turn
    // a normal login-page request into a noisy 404.
    if (error?.code === 'PGRST116' || error?.code === '42P01' || error?.code === 'PGRST205' || (!error && !data)) {
      return NextResponse.json({ settings: {} });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('Error fetching public settings:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
