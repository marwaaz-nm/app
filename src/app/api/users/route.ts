import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create a Supabase admin client (runs only on server)
const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// Helper to verify if the requester is an Admin
const verifyAdmin = async (req: NextRequest) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return { authenticated: false, userId: null, error: 'Unauthorized: Missing token' };

    const token = authHeader.replace('Bearer ', '');
    const supabaseAnon = createClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user) return { authenticated: false, userId: null, error: 'Unauthorized: Invalid token' };

    // Fetch profile role from database using the admin client to bypass RLS policies
    const supabaseAdmin = getAdminClient();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'Admin') {
      console.error('[verifyAdmin] Forbidden access attempt:', { profileError, profile, userId: user.id });
      return { authenticated: false, userId: user.id, error: 'Forbidden: Admin access required' };
    }

    return { authenticated: true, userId: user.id, error: null };
  } catch (err) {
    console.error('[verifyAdmin] Exception:', err);
    return { authenticated: false, userId: null, error: 'Verification failed' };
  }
};

// POST: Add new user (Admin only)
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.authenticated) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.error?.includes('Forbidden') ? 403 : 401 });
    }

    const { username, fullname, role, password, permitted_menus, permitted_actions } = await req.json();

    if (!username || !fullname || !role || !password) {
      return NextResponse.json({ error: 'Fadlan buuxi dhamaan meelaha loo baahan yahay.' }, { status: 450 });
    }

    const email = `${username.trim().toLowerCase()}@geosurvey.com`;
    const supabaseAdmin = getAdminClient();

    // Create user in Supabase Auth using admin client
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: username.trim().toLowerCase(),
        fullname,
        role,
        permitted_menus,
        permitted_actions,
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Keep authorization data in the server-controlled profile row.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        permitted_menus: role === 'Admin' ? null : permitted_menus,
        permitted_actions: role === 'Admin' ? [] : permitted_actions,
      })
      .eq('id', data.user.id);

    if (profileError) {
      console.error('Error updating profile permitted_menus:', profileError);
    }

    return NextResponse.json({ result: 'success', user: data.user });
  } catch (err: any) {
    console.error('API User Create Exception:', err);
    return NextResponse.json({ error: err.message || 'Cillad ayaa dhacday.' }, { status: 500 });
  }
}

// DELETE: Delete user by username (Admin only)
export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.authenticated) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.error?.includes('Forbidden') ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (username.toLowerCase() === 'admin') {
      return NextResponse.json({ error: 'User-ka admin-ka ah lama tirtiri karo.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Get profile to retrieve the UUID of the user
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User-ka lama helin profiles table-ka.' }, { status: 404 });
    }

    // 2. Delete user from Supabase Auth (cascades to profiles table via foreign key)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(profile.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ result: 'success' });
  } catch (err: any) {
    console.error('API User Delete Exception:', err);
    return NextResponse.json({ error: err.message || 'Cillad ayaa dhacday.' }, { status: 500 });
  }
}
