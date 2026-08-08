import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type RequestViewer = {
  userId: string;
  role: 'Admin' | 'User';
  permittedActions: string[];
  permittedMenus: string[] | null;
  admin: SupabaseClient;
};

export const getAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export async function requireViewer(req: NextRequest, action?: string): Promise<RequestViewer> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });

  const admin = getAdminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Invalid or expired session.'), { status: 401 });

  let { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, permitted_actions, permitted_menus')
    .eq('id', user.id)
    .single();

  // Keep authentication usable while the governance migration is pending.
  if (profileError?.code === '42703') {
    const legacyResult = await admin
      .from('profiles')
      .select('role, permitted_menus')
      .eq('id', user.id)
      .single();
    profile = legacyResult.data ? { ...legacyResult.data, permitted_actions: null } : null;
    profileError = legacyResult.error;
  }

  if (profileError || !profile) throw Object.assign(new Error('User profile was not found.'), { status: 403 });

  const role = (profile.role === 'Admin' || profile.role === 'SuperAdmin') ? 'Admin' : 'User';
  const legacyActions = ['survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view'];
  const permittedActions = Array.isArray(profile.permitted_actions) ? profile.permitted_actions : legacyActions;
  const permittedMenus = Array.isArray(profile.permitted_menus) ? profile.permitted_menus : null;
  if (action && role !== 'Admin' && !permittedActions.includes(action)) {
    throw Object.assign(new Error(`Permission required: ${action}`), { status: 403 });
  }

  return { userId: user.id, role, permittedActions, permittedMenus, admin };
}

export function apiError(error: unknown) {
  const databaseCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (['42703', '42P01', '42883', 'PGRST202', 'PGRST205'].includes(databaseCode)) {
    return { status: 503, message: 'Database upgrade required. Run the Supabase migrations listed in README.md.' };
  }
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status: number }).status)
    : 500;
  const resolvedStatus = Number.isFinite(status) ? status : 500;
  if (resolvedStatus >= 500) console.error('[API]', error);
  const message = resolvedStatus >= 500
    ? 'Unexpected server error.'
    : error instanceof Error ? error.message : 'Request failed.';
  return { status: resolvedStatus, message };
}
