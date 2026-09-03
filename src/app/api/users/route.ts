import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { accountErrors, actionsForMenus } from '@/lib/userForm';

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

    if (profileError || !profile || (profile.role !== 'Admin' && profile.role !== 'SuperAdmin')) {
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

    const fields = accountErrors({ username, fullname, password }, true);
    if (Object.keys(fields).length) return NextResponse.json({ error: 'Hubi meelaha calaamadaysan.', fields }, { status: 400 });

    if (!username || !fullname || !role || !password) {
      return NextResponse.json({ error: 'Fadlan buuxi dhamaan meelaha loo baahan yahay.' }, { status: 400 });
    }
    if (!['User', 'Admin'].includes(role)) {
      return NextResponse.json({ error: 'Role-ka cusub waa inuu noqdaa User ama Admin.' }, { status: 400 });
    }

    const email = `${username.trim().toLowerCase()}@geosurvey.com`;
    const supabaseAdmin = getAdminClient();

    const isDbAdmin = role === 'Admin' || role === 'SuperAdmin';
    const finalMenus = isDbAdmin ? null : (Array.isArray(permitted_menus) ? permitted_menus : []);
    const finalActions = isDbAdmin ? [] : actionsForMenus(Array.isArray(permitted_actions) ? permitted_actions : [], finalMenus || []);

    // Create user in Supabase Auth using admin client
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: username.trim().toLowerCase(),
        fullname,
        role,
        permitted_menus: finalMenus,
        permitted_actions: finalActions,
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Keep authorization data in the server-controlled profile row.
    const profilePayload: any = {
      fullname,
      role,
      permitted_menus: finalMenus,
      permitted_actions: finalActions,
    };

    let { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profilePayload)
      .eq('id', data.user.id);

    if (profileError && (profileError.code === '42703' || profileError.message?.includes('permitted_actions') || profileError.message?.includes('schema cache'))) {
      delete profilePayload.permitted_actions;
      const { error: fallbackError } = await supabaseAdmin
        .from('profiles')
        .update(profilePayload)
        .eq('id', data.user.id);
      if (fallbackError) {
        throw new Error('Account-ka waa la abuuray, laakiin oggolaanshaha lama keydin. Edit ku sax; ha abuurin account kale.');
      }
    } else if (profileError) {
      throw new Error('Account-ka waa la abuuray, laakiin oggolaanshaha lama keydin. Edit ku sax; ha abuurin account kale.');
    }

    const { data: savedProfile, error: readError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', data.user.id).single();
    if (readError) throw readError;
    return NextResponse.json({ result: 'success', profile: savedProfile });
  } catch (err: any) {
    console.error('API User Create Exception:', err);
    return NextResponse.json({ error: err.message || 'Cillad ayaa dhacday.' }, { status: 500 });
  }
}

// PUT: Update existing user (Admin only)
export async function PUT(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.authenticated) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.error?.includes('Forbidden') ? 403 : 401 });
    }

    const { username, fullname, role, password, permitted_menus, permitted_actions } = await req.json();

    const fields = accountErrors({ username, fullname, password }, false);
    if (Object.keys(fields).length) return NextResponse.json({ error: 'Hubi meelaha calaamadaysan.', fields }, { status: 400 });

    if (!username || !fullname || !role) {
      return NextResponse.json({ error: 'Fadlan buuxi dhamaan meelaha loo baahan yahay.' }, { status: 400 });
    }
    if (!['User', 'Admin', 'SuperAdmin'].includes(role)) {
      return NextResponse.json({ error: 'Role aan sax ahayn.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();
    const cleanUsername = username.trim().toLowerCase();

    // Find profile by username
    const { data: targetProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('username', cleanUsername)
      .single();

    if (profileFetchError || !targetProfile) {
      return NextResponse.json({ error: 'User-ka lama helin profiles table-ka.' }, { status: 404 });
    }
    if ((targetProfile.role === 'SuperAdmin' && role !== 'SuperAdmin') ||
        (targetProfile.role !== 'SuperAdmin' && role === 'SuperAdmin')) {
      return NextResponse.json({ error: 'Role-ka SuperAdmin lagama beddeli karo foomkan.' }, { status: 403 });
    }

    const isDbAdmin = role === 'Admin' || role === 'SuperAdmin';
    const finalMenus = isDbAdmin ? null : (Array.isArray(permitted_menus) ? permitted_menus : []);
    const finalActions = isDbAdmin ? [] : actionsForMenus(Array.isArray(permitted_actions) ? permitted_actions : [], finalMenus || []);

    // Update profile with fallback if permitted_actions column doesn't exist yet
    const profileUpdatePayload: any = {
      fullname,
      role,
      permitted_menus: finalMenus,
      permitted_actions: finalActions,
    };

    let { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdatePayload)
      .eq('id', targetProfile.id);

    if (profileUpdateError && (profileUpdateError.code === '42703' || profileUpdateError.message?.includes('permitted_actions') || profileUpdateError.message?.includes('schema cache'))) {
      delete profileUpdatePayload.permitted_actions;
      const { error: fallbackError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdatePayload)
        .eq('id', targetProfile.id);
      profileUpdateError = fallbackError;
    }

    if (profileUpdateError) {
      console.error('Error updating user profile:', profileUpdateError);
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    // Update user auth metadata and optionally password
    const authUpdateData: any = {
      user_metadata: {
        username: cleanUsername,
        fullname,
        role,
        permitted_menus: finalMenus,
        permitted_actions: finalActions,
      }
    };

    if (password && password.trim() !== '') {
      authUpdateData.password = password;
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetProfile.id,
      authUpdateData
    );

    if (authUpdateError) {
      console.error('Error updating auth metadata:', authUpdateError);
      return NextResponse.json({
        error: `Xogta profile-ka waa la keydiyey, laakiin password-ka ama Auth update-ku wuu fashilmay: ${authUpdateError.message}`,
      }, { status: 400 });
    }

    const { data: savedProfile, error: readError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', targetProfile.id).single();
    if (readError) throw readError;
    return NextResponse.json({ result: 'success', profile: savedProfile });
  } catch (err: any) {
    console.error('API User Update Exception:', err);
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

    if (username.trim().toLowerCase() === 'admin') {
      return NextResponse.json({ error: 'User-ka admin-ka ah lama tirtiri karo.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Get profile to retrieve the UUID of the user
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User-ka lama helin profiles table-ka.' }, { status: 404 });
    }
    if (profile.id === adminCheck.userId || profile.role === 'SuperAdmin') {
      return NextResponse.json({ error: 'Ma tirtiri kartid account-ka aad ku jirto ama SuperAdmin.' }, { status: 403 });
    }

    // 2. Delete user from Supabase Auth (cascades to profiles table via foreign key)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(profile.id);

    if (deleteError) {
      if (deleteError.code === 'unexpected_failure' || /database|foreign key/i.test(deleteError.message)) {
        return NextResponse.json({ error: 'Database-ku wuu diiday tirtiridda user-ka. Waxaa jiri kara records ama dukumentiyo ku xiran; xogtaas lama tirtirin. Hubi xiriirrada user-ka ka hor tirtiridda.' }, { status: 409 });
      }
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ result: 'success' });
  } catch (err: any) {
    console.error('API User Delete Exception:', err);
    return NextResponse.json({ error: err.message || 'Cillad ayaa dhacday.' }, { status: 500 });
  }
}
