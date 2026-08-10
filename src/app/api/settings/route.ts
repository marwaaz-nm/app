import { NextRequest, NextResponse } from 'next/server';
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

const verifyAdmin = async (req: NextRequest) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return { authenticated: false, userId: null, error: 'Unauthorized: Missing token' };

    const token = authHeader.replace('Bearer ', '');
    const supabaseAnon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user) return { authenticated: false, userId: null, error: 'Unauthorized: Invalid token' };

    const supabaseAdmin = getAdminClient();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'Admin') {
      return { authenticated: false, userId: user.id, error: 'Forbidden: Admin access required' };
    }

    return { authenticated: true, userId: user.id, error: null };
  } catch (err) {
    console.error('[verifyAdmin] Exception:', err);
    return { authenticated: false, userId: null, error: 'Verification failed' };
  }
};

const SETTINGS_FIELDS = 'org_name_so, org_name_en, logo_url, contact_email, contact_phone, contact_address, reference_subjects, land_types, ref_number_prefix, ref_number_next_seq, ref_number_format, ref_number_digits, survey_number_prefix, survey_number_next_seq, survey_number_format, survey_number_digits, receipt_number_prefix, receipt_number_next_seq, receipt_number_format, receipt_number_digits, expense_number_prefix, expense_number_next_seq, expense_number_format, expense_number_digits, updated_at';

// GET: any authenticated user can read settings (needed for dropdown options, sidebar branding, etc.)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select(SETTINGS_FIELDS)
      .eq('id', 1)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('Error fetching settings:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT: Admin-only settings update
export async function PUT(req: NextRequest) {
  const adminCheck = await verifyAdmin(req);
  if (!adminCheck.authenticated) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.error?.includes('Forbidden') ? 403 : 401 });
  }

  try {
    const body = await req.json();
    const allowedKeys = [
      'org_name_so', 'org_name_en', 'logo_url', 'contact_email', 'contact_phone', 'contact_address',
      'reference_subjects', 'land_types',
      'ref_number_prefix', 'ref_number_next_seq', 'ref_number_format', 'ref_number_digits',
      'survey_number_prefix', 'survey_number_next_seq', 'survey_number_format', 'survey_number_digits',
      'receipt_number_prefix', 'receipt_number_next_seq', 'receipt_number_format', 'receipt_number_digits',
      'expense_number_prefix', 'expense_number_next_seq', 'expense_number_format', 'expense_number_digits'
    ];
    const updatePayload: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in body) updatePayload[key] = body[key];
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updatePayload.updated_at = new Date().toISOString();
    updatePayload.updated_by = adminCheck.userId;

    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .update(updatePayload)
      .eq('id', 1)
      .select(SETTINGS_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('Error updating settings:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
