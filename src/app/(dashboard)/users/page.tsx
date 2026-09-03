'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useDataAutoRefresh } from '@/lib/useDataAutoRefresh';
import { Profile } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { useRouter } from 'next/navigation';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import { ACTION_MENUS, accountErrors, actionsForMenus } from '@/lib/userForm';
import { ACTIONS, canAction } from '@/lib/permissions';
import {
  UserPlus,
  Eye, EyeOff,
  Trash2, 
  Pencil,
  X, 
  Loader2, 
  UserX,
  KeyRound,
  UserCheck2,
  Files,
  Compass,
  Layers,
  ArrowLeftRight,
  Wallet,
  Shield,
  FolderSearch,
  Users,
  Archive
} from 'lucide-react';

export default function UsersPage() {
  const { profile } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const router = useRouter();

  const [users, setUsers] = useState<Profile[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsUser = users.find(user => user.id === detailsId);
  const detailsRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!detailsUser) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    detailsRef.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [detailsUser?.id]);
  const usersRevision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'User' | 'Admin' | 'SuperAdmin'>('User');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const dirty = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const closeForm = async () => {
    if (saving || confirmingClose) return;
    if (dirty.current) {
      setConfirmingClose(true);
      const discard = await showConfirm('Xog aan la keydin', 'Ma rabtaa inaad ka baxdo adigoon keydin isbeddellada?', 'Ka bax', 'Sii wad');
      setConfirmingClose(false);
      if (!discard) { dialogRef.current?.querySelector<HTMLElement>('input')?.focus(); return; }
    }
    setShowAddModal(false);
    setEditingUser(null);
  };

  useEffect(() => {
    if (!showAddModal) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [showAddModal]);

  // Permitted menus selection
  const AVAILABLE_MENUS = [
    { href: '/references', label: 'References (Tixraac)' },
    { href: '/explorer', label: 'Map Explorer (Maabka)' },
    { href: '/records', label: 'Survey Records (Sahanka)' },
    { href: '/transfers', label: 'Wareejin Dhul (Wareejinta)' },
    { href: '/financials', label: 'Financials (Xisaabta)' },
    { href: '/reports', label: 'Reports & Export (Warbixin)' },
    { href: '/drive-files', label: 'Diiwaanka Drive (Drive Files)' },
    { href: '/customers', label: 'Macmiisha (Customers)' },
    { href: '/document-archive', label: 'Document Archive' }
  ];
  const AVAILABLE_ACTIONS = ACTIONS;
  
  const [permittedMenus, setPermittedMenus] = useState<string[]>([
    '/references',
    '/explorer',
    '/records',
    '/transfers',
    '/financials',
    '/reports',
    '/drive-files',
    '/customers',
    '/document-archive'
  ]);
  const [permittedActions, setPermittedActions] = useState<string[]>([
    'survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view'
  ]);

  const handleMenuToggle = (href: string) => {
    dirty.current = true;
    if (permittedMenus.includes(href)) {
      setPermittedMenus(permittedMenus.filter(m => m !== href));
      setPermittedActions(current => current.filter(action => ACTION_MENUS[action] !== href));
    } else {
      setPermittedMenus([...permittedMenus, href]);
    }
  };
  const handleActionToggle = (action: string) => {
    dirty.current = true;
    if (!permittedMenus.includes(ACTION_MENUS[action])) return;
    setPermittedActions((current) => current.includes(action)
      ? current.filter((item) => item !== action)
      : [...current, action]);
  };

  const isUserAdmin = (u?: Profile | null) => {
    if (!u) return false;
    return u.role === 'Admin' || u.role === 'SuperAdmin' || String(u.role).toLowerCase().includes('admin');
  };

  // Guard: Make sure only Admins can access
  useEffect(() => {
    if (profile && !isUserAdmin(profile)) {
      router.push('/explorer');
    }
  }, [profile, router]);

  const fetchUsers = async () => {
    const revision = usersRevision.current;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (revision !== usersRevision.current) return;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);
  useDataAutoRefresh(fetchUsers);

  const handleOpenAddModal = () => {
    dirty.current = false;
    setFields({});
    setShowPassword(false);
    setEditingUser(null);
    setFullname('');
    setUsername('');
    setPassword('');
    setRole('User');
    setPermittedMenus([
      '/references',
      '/explorer',
      '/records',
      '/transfers',
      '/financials',
      '/reports',
      '/drive-files',
      '/customers',
      '/document-archive'
    ]);
    setPermittedActions(['survey.create', 'survey.edit', 'survey.submit', 'reference.create', 'reference.edit', 'transfer.create', 'payment.create', 'expense.create', 'report.view']);
    setError(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (u: Profile) => {
    dirty.current = false;
    setFields({});
    setShowPassword(false);
    setEditingUser(u);
    setFullname(u.fullname || '');
    setUsername(u.username || '');
    setPassword('');
    setRole(u.role === 'SuperAdmin' ? 'SuperAdmin' : isUserAdmin(u) ? 'Admin' : 'User');

    const userMenus = Array.isArray(u.permitted_menus)
      ? u.permitted_menus
      : ['/references', '/explorer', '/records', '/transfers', '/financials', '/reports', '/drive-files', '/customers', '/document-archive'];
    setPermittedMenus(userMenus);

    const userActions = Array.isArray(u.permitted_actions)
      ? u.permitted_actions
      : ['survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view'];
    setPermittedActions(actionsForMenus(userActions, userMenus));

    setError(null);
    setShowAddModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = accountErrors({ fullname, username, password }, !editingUser);
    setFields(validation);
    if (Object.keys(validation).length) {
      dialogRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(validation)[0]}"]`)?.focus();
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Authentication token is missing. Please log in again.');

      const isEdit = Boolean(editingUser);
      const payload = {
        fullname: fullname.trim(),
        username: username.trim().toLowerCase(),
        password: password ? password : undefined,
        role,
        permitted_menus: role !== 'User' ? null : permittedMenus,
        permitted_actions: role !== 'User' ? [] : actionsForMenus(permittedActions, permittedMenus),
      };

      const res = await fetch('/api/users', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.fields) setFields(result.fields);
        throw new Error(result.error || (isEdit ? 'Failed to update user' : 'Failed to create user'));
      }

      showAlert('Guul', isEdit ? 'User-ka si guul leh ayaa loo cusboonaysiiyay!' : 'User-ka si guul leh ayaa loo daray!', 'success');
      if (result.profile) {
        usersRevision.current += 1;
        setUsers(current => [result.profile, ...current.filter(item => item.id !== result.profile.id)]);
      } else {
        void fetchUsers();
      }
      setShowAddModal(false);
      setEditingUser(null);
    } catch (err: any) {
      console.error('Save user error:', err);
      setError(err.message || 'Cillad ayaa dhacday.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userToDelete: string) => {
    if (userToDelete.toLowerCase() === 'admin') {
      showAlert('Cillad', 'User-ka admin-ka ah lama tirtiri karo.', 'error');
      return;
    }

    const isConfirmed = await showConfirm(
      'Xaqiiji Tirtiridda',
      `Ma hubaal ayaad tahay inaad tirtirto user-ka: @${userToDelete}?`,
      'Haa',
      'Maya'
    );
    if (!isConfirmed) return;

    setDeletingUser(userToDelete);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Authentication token is missing.');

      const res = await fetch(`/api/users?username=${encodeURIComponent(userToDelete)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to delete user');
      }

      showAlert('Guul', 'User-ka si guul leh ayaa loo tirtiray!', 'success');
      usersRevision.current += 1;
      setUsers(current => current.filter(item => item.username !== userToDelete));
    } catch (err: any) {
      console.error('Delete user error:', err);
      showAlert('Cillad', err.message || 'Ma suuragalin in user-ka la tirtiro.', 'error');
    } finally {
      setDeletingUser(null);
    }
  };

  if (!profile || !isUserAdmin(profile)) {
    return null;
  }

  return (
    <div className="p-4 md:p-8 w-full space-y-5 text-slate-800 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-teal-500">
      
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600"><Users className="h-5 w-5" /></div>
          <div><h1 className="text-lg font-extrabold">User Management</h1><p className="mt-1 text-xs text-slate-500">Maamul accounts-ka iyo oggolaanshahooda · {loading ? '…' : users.length} users</p></div>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          <span>Add New User</span>
        </button>
      </div>

      {/* User Profiles Table */}
      {loading ? (
        <ListLoadingSkeleton />
      ) : (
        <>
        <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Fasaxan (Menus)</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {users.map(u => {
                  const admin = isUserAdmin(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="px-6 py-4 font-semibold text-teal-600">
                        @{u.username}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">
                        {u.fullname}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                          admin 
                            ? 'bg-rose-50 text-rose-600 border-rose-100' 
                            : 'bg-teal-50 text-teal-600 border-teal-100'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {admin ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Shield className="h-3.5 w-3.5" />Dhammaan (All)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(!u.permitted_menus || u.permitted_menus.length === 0) ? (
                              <span className="text-xs text-slate-500">Ma jiraan (None)</span>
                            ) : (
                              u.permitted_menus.map(menu => {
                                const label = menu === '/references' ? 'References' :
                                              menu === '/explorer' ? 'Explorer' :
                                              menu === '/records' ? 'Records' :
                                              menu === '/transfers' ? 'Transfers' :
                                              menu === '/financials' ? 'Financials' :
                                              menu === '/reports' ? 'Reports' :
                                              menu === '/drive-files' ? 'Drive Files' :
                                              menu === '/customers' ? 'Customers' :
                                              menu === '/document-archive' ? 'Document Archive' : menu;
                                return (
                                  <span key={menu} className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
                                    {label}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setDetailsId(u.id)} aria-label={`Show Details for ${u.fullname}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-teal-600 hover:bg-teal-50">
                            <Eye className="h-4 w-4" /> Show Details
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="text-teal-600 hover:bg-teal-50 p-3 rounded-xl border border-slate-200 cursor-pointer transition-all"
                            aria-label={`Edit ${u.fullname}`}
                            title="Edit user & permissions"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.username)}
                            disabled={u.username.toLowerCase() === 'admin' || u.role === 'SuperAdmin' || u.id === profile.id || deletingUser === u.username}
                            aria-label={`Delete ${u.fullname}`}
                            className="text-rose-600 hover:text-rose-700 disabled:text-slate-350 hover:bg-rose-50 p-2 rounded-xl border border-transparent hover:border-rose-100 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all"
                            title={u.username.toLowerCase() === 'admin' ? "Admin user cannot be deleted" : "Delete user"}
                          >
                            {deletingUser === u.username ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile List */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm md:hidden">
          <div className="grid grid-cols-[1fr_auto_70px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>User</span>
            <span>Role</span>
            <span className="text-center">Action</span>
          </div>
          <div className="divide-y divide-slate-200/80">
            {users.map(u => {
              const admin = isUserAdmin(u);
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
                  <div className="min-w-0 flex-1 basis-32">
                    <h4 className="break-words text-sm font-bold text-slate-800">{u.fullname}</h4>
                    <p className="mt-1 break-all text-xs font-medium text-teal-600">@{u.username}</p>
                  </div>
                  <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold border ${
                    admin
                      ? 'bg-rose-50 text-rose-600 border-rose-100'
                      : 'bg-teal-50 text-teal-600 border-teal-100'
                  }`}>
                    {u.role}
                  </span>
                  <div className="flex items-center justify-center gap-1 justify-self-center">
                    <button onClick={() => setDetailsId(u.id)} aria-label={`Show Details for ${u.fullname}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-teal-600 hover:bg-teal-50"><Eye className="h-4 w-4" />Show Details</button>
                    <button
                      onClick={() => handleOpenEditModal(u)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-teal-600 hover:bg-teal-50 transition-colors"
                      aria-label="Edit user"
                      title="Edit user"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.username)}
                      disabled={u.username.toLowerCase() === 'admin' || u.role === 'SuperAdmin' || u.id === profile.id || deletingUser === u.username}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                      aria-label="Delete user"
                      title={u.username.toLowerCase() === 'admin' ? 'Admin user cannot be deleted' : 'Delete user'}
                    >
                      {deletingUser === u.username ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}
      {!loading && users.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-slate-400" /><p className="font-bold">Weli users ma jiraan</p><p className="mt-2 text-sm text-slate-500">Guji Add New User si aad account cusub ugu darto.</p></div>}

      {detailsUser && createPortal(
        <dialog ref={detailsRef} onCancel={() => setDetailsId(null)} onClose={() => setDetailsId(null)} aria-labelledby="user-details-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
            <div className="flex items-center gap-3"><span className="rounded-xl border border-teal-100 bg-teal-50 p-2 text-teal-600"><Eye className="h-5 w-5" /></span><h2 id="user-details-title" className="text-lg font-bold">User Details</h2></div>
            <button autoFocus onClick={() => setDetailsId(null)} aria-label="Close user details" className="rounded-xl p-2 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-teal-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="max-h-[65dvh] space-y-6 overflow-y-auto p-6">
            <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 sm:grid-cols-2">
              {[
                ['Full Name', detailsUser.fullname], ['Username', `@${detailsUser.username}`], ['Role', detailsUser.role],
                ['Created', detailsUser.created_at && !Number.isNaN(Date.parse(detailsUser.created_at)) ? new Date(detailsUser.created_at).toLocaleDateString('en-GB') : 'Not available'],
              ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1.5 break-words text-sm font-semibold">{value}</dd></div>)}
            </dl>
            <section className="space-y-3"><h3 className="text-sm font-bold">Access & Permissions</h3>
              {isUserAdmin(detailsUser) && <p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-700">Administrator: all menus and actions are permitted.</p>}
              {AVAILABLE_MENUS.filter(menu => isUserAdmin(detailsUser) || detailsUser.permitted_menus?.includes(menu.href)).map(menu => {
                const actions = AVAILABLE_ACTIONS.filter(action => action.menu === menu.href && canAction(detailsUser, action.id));
                return <div key={menu.href} className="rounded-xl border border-slate-200 p-4"><h4 className="text-sm font-semibold">{menu.label.split('(')[0].trim()}</h4><div className="mt-3 flex flex-wrap gap-2">{actions.length ? actions.map(action => <span key={action.id} className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">{action.label.split(': ').slice(1).join(': ') || action.label}</span>) : <span className="text-xs text-slate-500">Menu access only</span>}</div></div>;
              })}
              {!isUserAdmin(detailsUser) && !detailsUser.permitted_menus?.length && <p className="text-sm text-slate-500">No menu access assigned.</p>}
            </section>
          </div>
          <div className="flex justify-end border-t border-slate-200 px-6 py-4"><button onClick={() => setDetailsId(null)} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-500">Close</button></div>
        </dialog>, document.body
      )}

      {/* Add / Edit User Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="user-dialog-title"
            onKeyDown={event => {
              if (confirmingClose) return;
              if (event.key === 'Escape') { event.preventDefault(); void closeForm(); }
              if (event.key !== 'Tab') return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
            className="w-full max-w-4xl max-h-[90dvh] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-200 [&_input:focus]:ring-2 [&_input:focus]:ring-teal-300 [&_select:focus]:ring-2 [&_select:focus]:ring-teal-300 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-teal-500">
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 id="user-dialog-title" className="min-w-0 text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-5 w-5 shrink-0 text-teal-600" />
                <span className="truncate">{editingUser ? `Edit User Account (@${editingUser.username})` : 'Add New User Account'}</span>
              </h3>
              <button
                type="button"
                aria-label="Close user form"
                disabled={saving}
                onClick={() => void closeForm()}
                className="shrink-0 text-slate-450 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form id="user-account-form" noValidate onChange={() => { dirty.current = true; }} onSubmit={handleSaveUser} className="min-h-0 overflow-y-auto p-4 sm:p-6">
              {error && (
                <div role="alert" className="mb-4 flex items-center gap-2.5 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-600 border border-rose-100">
                  <UserX className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-6">
                {/* Left column: account basics */}
                <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2">
                  <h4 className="text-sm font-bold sm:col-span-2">Account Details</h4>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Full Name</label>
                    <input
                      type="text"
                      aria-label="Full name"
                      name="fullname" aria-invalid={Boolean(fields.fullname)} aria-describedby="fullname-error"
                      autoFocus
                      required
                      value={fullname}
                      onChange={(e) => setFullname(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                      placeholder="Maxamed Cali"
                    />
                    <p id="fullname-error" className="mt-1 text-xs text-rose-600" role="alert">{fields.fullname}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Username</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingUser)}
                      aria-label="Username"
                      name="username" aria-invalid={Boolean(fields.username)} aria-describedby="username-error"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      placeholder="e.g. maxamed"
                    />
                    <p id="username-error" className="mt-1 text-xs text-rose-600" role="alert">{fields.username}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
                      Password {editingUser ? '(Ikhtiyaari / Leave empty to keep unchanged)' : ''}
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password" aria-invalid={Boolean(fields.password)} aria-describedby="password-help password-error"
                        aria-label="Password"
                        autoComplete="new-password"
                        required={!editingUser}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-12 pr-12 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                        placeholder={editingUser ? 'Kutag furaha intiisii (Leave blank)' : '••••••••'}
                      />
                      <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </div>
                    <p id="password-help" className="mt-2 text-xs text-slate-500">8–128 xaraf. {editingUser ? 'Bannaan ku dhaaf si kii hore loo ilaaliyo.' : 'Dooro password adag oo gaar ah.'}</p>
                    <p id="password-error" className="mt-1 text-xs text-rose-600" role="alert">{fields.password}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Role</label>
                    <select
                      value={role}
                      aria-label="Role"
                      disabled={editingUser?.role === 'SuperAdmin'}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="User">User (Surveyor / Staff)</option>
                      <option value="Admin">Admin (Administrator)</option>
                      {editingUser?.role === 'SuperAdmin' && <option value="SuperAdmin">SuperAdmin</option>}
                    </select>
                  </div>
                </div>

                {/* Keep each menu and its actions together. */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold">Access & Permissions</h4>
                      <p className="mt-1 text-xs text-slate-500">{permittedMenus.length} menus · {permittedActions.length} actions selected</p>
                    </div>
                    {role === 'User' && <div className="flex gap-2">
                      <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-teal-600" onClick={() => { dirty.current = true; setPermittedMenus(AVAILABLE_MENUS.map(menu => menu.href)); setPermittedActions(AVAILABLE_ACTIONS.map(action => action.id)); }}>Select all</button>
                      <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" onClick={() => { dirty.current = true; setPermittedMenus([]); setPermittedActions([]); }}>Clear all</button>
                    </div>}
                  </div>
                  {role === 'User' ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      {AVAILABLE_MENUS.map(menu => {
                        const enabled = permittedMenus.includes(menu.href);
                        const actions = AVAILABLE_ACTIONS.filter(action => action.menu === menu.href);
                        return <div key={menu.href} className={`grid gap-3 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-start sm:p-5 ${enabled ? 'bg-white' : 'bg-slate-50/60'}`}>
                          <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                            <input type="checkbox" checked={enabled} onChange={() => handleMenuToggle(menu.href)} className="h-4 w-4 shrink-0 rounded accent-teal-600" />
                            <span>{menu.label.split('(')[0].trim()}</span>
                          </label>
                          <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">
                            {actions.length ? actions.map(action => (
                              <label key={action.id} className={`inline-flex min-h-9 items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${!enabled ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400' : permittedActions.includes(action.id) ? 'cursor-pointer border-teal-200 bg-teal-50 text-teal-700' : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={permittedActions.includes(action.id)} disabled={!enabled} onChange={() => handleActionToggle(action.id)} className="h-4 w-4 shrink-0 accent-teal-600 disabled:opacity-40" />
                                <span>{action.label.split(': ').slice(1).join(': ') || action.label}</span>
                              </label>
                            )) : <span className="text-xs text-slate-500">Menu access only</span>}
                          </div>
                        </div>;
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-5 text-sm text-teal-800"><Shield className="h-5 w-5 shrink-0" />{role} wuxuu heli karaa dhammaan menus-ka iyo actions-ka.</div>
                  )}
                </section>
              </div>

            </form>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              <button type="button" disabled={saving} onClick={() => void closeForm()} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-50">Cancel</button>
              <button
                type="submit"
                form="user-account-form"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-100 disabled:text-slate-400 px-5 py-3 font-bold text-white shadow-sm cursor-pointer transition-all active:scale-95 text-sm"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /><span>Waa la keydinayaa…</span></>
                ) : (
                  <>
                    <UserCheck2 className="h-4 w-4" />
                    <span>{editingUser ? 'Save Changes' : 'Save User Account'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

    </div>
  );
}
