'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
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
  Shield
} from 'lucide-react';

export default function UsersPage() {
  const { profile } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const router = useRouter();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'User' | 'Admin'>('User');
  const [error, setError] = useState<string | null>(null);

  // Permitted menus selection
  const AVAILABLE_MENUS = [
    { href: '/references', label: 'References (Tixraac)' },
    { href: '/explorer', label: 'Map Explorer (Maabka)' },
    { href: '/records', label: 'Survey Records (Sahanka)' },
    { href: '/transfers', label: 'Wareejin Dhul (Wareejinta)' },
    { href: '/financials', label: 'Financials (Xisaabta)' },
    { href: '/reports', label: 'Reports & Export (Warbixin)' }
  ];
  const AVAILABLE_ACTIONS = [
    { id: 'survey.create', label: 'Abuur survey' },
    { id: 'survey.edit', label: 'Wax ka beddel + dukumenti' },
    { id: 'survey.submit', label: 'U dir ansixin' },
    { id: 'survey.approve', label: 'Ansixi ama diid' },
    { id: 'survey.archive', label: 'Archive geli' },
    { id: 'reference.manage', label: 'Maamul references' },
    { id: 'transfer.create', label: 'Samee wareejin' },
    { id: 'finance.manage', label: 'Maamul xisaabta' },
    { id: 'report.view', label: 'Arag reports + exports' },
  ];
  
  const [permittedMenus, setPermittedMenus] = useState<string[]>([
    '/references',
    '/explorer',
    '/records',
    '/transfers',
    '/financials',
    '/reports'
  ]);
  const [permittedActions, setPermittedActions] = useState<string[]>([
    'survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view'
  ]);

  const handleMenuToggle = (href: string) => {
    if (permittedMenus.includes(href)) {
      setPermittedMenus(permittedMenus.filter(m => m !== href));
    } else {
      setPermittedMenus([...permittedMenus, href]);
    }
  };
  const handleActionToggle = (action: string) => {
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
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
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

  const handleOpenAddModal = () => {
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
      '/reports'
    ]);
    setPermittedActions(['survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view']);
    setError(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (u: Profile) => {
    setEditingUser(u);
    setFullname(u.fullname || '');
    setUsername(u.username || '');
    setPassword('');
    setRole(isUserAdmin(u) ? 'Admin' : 'User');

    const userMenus = Array.isArray(u.permitted_menus) && u.permitted_menus.length > 0
      ? u.permitted_menus
      : ['/references', '/explorer', '/records', '/transfers', '/financials', '/reports'];
    setPermittedMenus(userMenus);

    const userActions = Array.isArray(u.permitted_actions) && u.permitted_actions.length > 0
      ? u.permitted_actions
      : ['survey.create', 'survey.edit', 'survey.submit', 'reference.manage', 'transfer.create', 'finance.manage', 'report.view'];
    setPermittedActions(userActions);

    setError(null);
    setShowAddModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Authentication token is missing. Please log in again.');

      const isEdit = Boolean(editingUser);
      const payload = {
        fullname,
        username: username.trim().toLowerCase(),
        password: password ? password : undefined,
        role,
        permitted_menus: role === 'Admin' ? null : permittedMenus,
        permitted_actions: role === 'Admin' ? [] : permittedActions,
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
        throw new Error(result.error || (isEdit ? 'Failed to update user' : 'Failed to create user'));
      }

      showAlert('Guul', isEdit ? 'User-ka si guul leh ayaa loo cusboonaysiiyay!' : 'User-ka si guul leh ayaa loo daray!', 'success');
      setShowAddModal(false);
      setEditingUser(null);
      fetchUsers();
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

      const res = await fetch(`/api/users?username=${userToDelete}`, {
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
      fetchUsers();
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
    <div className="p-4 md:p-8 w-full space-y-3.5 md:space-y-6 text-slate-800">
      
      <div className="hidden md:flex justify-end">
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
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
        <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Fasaxan (Menus)</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 bg-white">
                {users.map(u => {
                  const admin = isUserAdmin(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="px-6 py-4 font-black text-teal-600">
                        @{u.username}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">
                        {u.fullname}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold border ${
                          admin 
                            ? 'bg-rose-50 text-rose-600 border-rose-100' 
                            : 'bg-teal-50 text-teal-600 border-teal-100'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {admin ? (
                          <span className="text-[10px] font-bold text-slate-450 italic">Dhammaan (All)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(!u.permitted_menus || u.permitted_menus.length === 0) ? (
                              <span className="text-[10px] font-bold text-rose-500 italic">Ma jiraan (None)</span>
                            ) : (
                              u.permitted_menus.map(menu => {
                                const label = menu === '/references' ? 'References' :
                                              menu === '/explorer' ? 'Explorer' :
                                              menu === '/records' ? 'Records' :
                                              menu === '/transfers' ? 'Transfers' :
                                              menu === '/financials' ? 'Financials' :
                                              menu === '/reports' ? 'Reports' : menu;
                                return (
                                  <span key={menu} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] font-bold text-slate-600">
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
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 p-2 rounded-xl border border-transparent hover:border-teal-100 cursor-pointer transition-all"
                            title="Edit user & permissions"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.username)}
                            disabled={u.username.toLowerCase() === 'admin' || deletingUser === u.username}
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
          <div className="divide-y divide-slate-100/60">
            {users.map(u => {
              const admin = isUserAdmin(u);
              return (
                <div key={u.id} className="grid grid-cols-[1fr_auto_70px] items-center gap-2 px-4 py-3.5">
                  <div className="min-w-0">
                    <h4 className="truncate text-xs font-extrabold text-slate-800">{u.fullname}</h4>
                    <p className="mt-0.5 truncate text-[9px] font-bold text-teal-600">@{u.username}</p>
                  </div>
                  <span className={`inline-flex items-center justify-self-end whitespace-nowrap px-2 py-0.5 rounded-full text-[8px] font-extrabold border ${
                    admin
                      ? 'bg-rose-50 text-rose-600 border-rose-100'
                      : 'bg-teal-50 text-teal-600 border-teal-100'
                  }`}>
                    {u.role}
                  </span>
                  <div className="flex items-center justify-center gap-1 justify-self-center">
                    <button
                      onClick={() => handleOpenEditModal(u)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                      aria-label="Edit user"
                      title="Edit user"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.username)}
                      disabled={u.username.toLowerCase() === 'admin' || deletingUser === u.username}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent transition-colors"
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

      {/* Add / Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md md:max-w-3xl bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-teal-600" />
                {editingUser ? `Edit User Account (@${editingUser.username})` : 'Add New User Account'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingUser(null);
                }}
                className="text-slate-450 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6">
              {error && (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-600 border border-rose-100">
                  <UserX className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column: account basics */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullname}
                      onChange={(e) => setFullname(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                      placeholder="Maxamed Cali"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Username</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingUser)}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      placeholder="e.g. maxamed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
                      Password {editingUser ? '(Ikhtiyaari / Leave empty to keep unchanged)' : ''}
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="password"
                        required={!editingUser}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                        placeholder={editingUser ? 'Kutag furaha intiisii (Leave blank)' : '••••••••'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="User">User (Surveyor / Staff)</option>
                      <option value="Admin">Admin (Administrator)</option>
                    </select>
                  </div>
                </div>

                {/* Right column: permissions */}
                <div>
                  {role === 'User' ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        Menus Loo Fasaxayo (Permitted Menus)
                      </label>
                      <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-4 rounded-3xl border border-slate-200/60 max-h-72 overflow-y-auto">
                        {AVAILABLE_MENUS.map((menu) => {
                          const isChecked = permittedMenus.includes(menu.href);
                          const Icon =
                            menu.href === '/references' ? Files :
                            menu.href === '/explorer' ? Compass :
                            menu.href === '/records' ? Layers :
                            menu.href === '/transfers' ? ArrowLeftRight :
                            menu.href === '/financials' ? Wallet : Shield;

                          return (
                            <button
                              key={menu.href}
                              type="button"
                              onClick={() => handleMenuToggle(menu.href)}
                              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer select-none active:scale-[0.97] duration-150 ${
                                isChecked
                                  ? 'border-teal-500 bg-teal-50/60 text-teal-700 shadow-sm shadow-teal-500/5'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              <div className={`flex h-8 w-8 items-center justify-center rounded-xl border shrink-0 transition-colors duration-150 ${
                                isChecked
                                  ? 'bg-teal-600 border-teal-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-[11px] font-black truncate leading-tight ${isChecked ? 'text-teal-850' : 'text-slate-700'}`}>
                                  {menu.label.split('(')[0].trim()}
                                </div>
                                <div className="text-[9px] text-slate-450 font-bold mt-0.5 truncate leading-tight">
                                  {menu.label.match(/\(([^)]+)\)/)?.[1] || ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <label className="block pt-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Actions Loo Fasaxayo
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-slate-200/60 bg-slate-50/50 p-4">
                        {AVAILABLE_ACTIONS.map((action) => {
                          const checked = permittedActions.includes(action.id);
                          return (
                            <button key={action.id} type="button" onClick={() => handleActionToggle(action.id)} className={`rounded-xl border px-3 py-2.5 text-left text-[10px] font-black transition-colors ${checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                              <span className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] ${checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{checked ? '✓' : '–'}</span>{action.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[160px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs font-semibold text-slate-400">
                      Admin accounts automatically get full access to every menu and action.
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-100 disabled:text-slate-400 px-5 py-4 font-bold text-white shadow-md cursor-pointer transition-all active:scale-95 text-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserCheck2 className="h-4 w-4" />
                    <span>{editingUser ? 'Save Changes' : 'Save User Account'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Floating Action Button (FAB) */}
      <button
        onClick={handleOpenAddModal}
        className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-xl hover:bg-teal-700 cursor-pointer active:scale-95 transition-all select-none"
      >
        <UserPlus className="h-6 w-6" />
      </button>
    </div>
  );
}
