'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Clock3,
  Files,
  Layers3,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Expense, Receipt, Reference, Survey, Transfer } from '@/types';

type SurveyRow = Pick<
  Survey,
  'id' | 'serial_no' | 'survey_no' | 'owner_name' | 'neighborhood' | 'land_type' | 'status' | 'created_at'
>;
type ReferenceRow = Pick<
  Reference,
  'id' | 'ref_number' | 'subject' | 'status' | 'created_at'
>;
type TransferRow = Pick<
  Transfer,
  'id' | 'serial_no' | 'seller_name' | 'buyer_name' | 'price' | 'created_at' | 'transfer_date'
>;
type ReceiptRow = Pick<
  Receipt,
  'id' | 'receipt_no' | 'amount' | 'status' | 'payment_date' | 'created_at'
>;
type ExpenseRow = Pick<Expense, 'id' | 'description' | 'total' | 'expense_date' | 'created_at'>;
type TeamMemberRow = { id: string; fullname: string; role: string; created_at?: string };

type ActivityItem = {
  id: string;
  kind: 'survey' | 'reference' | 'transfer' | 'payment' | 'expense';
  title: string;
  detail: string;
  date?: string;
  href: string;
  amount?: number;
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [references, setReferences] = useState<ReferenceRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'Admin';
  const permittedMenus = profile?.permitted_menus;
  const hasAccess = (path: string) =>
    isAdmin || (Array.isArray(permittedMenus) && permittedMenus.includes(path));

  const canViewSurveys = hasAccess('/records') || hasAccess('/explorer');
  const canViewReferences = hasAccess('/references');
  const canViewTransfers = hasAccess('/transfers');
  const canViewFinancials = hasAccess('/financials');

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const emptyResult = Promise.resolve({ data: [], error: null });
        const governanceSchemaKnown = Array.isArray(profile?.permitted_actions);
        const surveyRequest = canViewSurveys && governanceSchemaKnown
          ? (async () => {
              const enhanced = await supabase
                .from('surveys')
                .select('id, serial_no, survey_no, owner_name, neighborhood, land_type, status, created_at')
                .order('created_at', { ascending: false });
              if (enhanced.error?.code !== '42703') return { ...enhanced, schemaMissing: false };
              const legacy = await supabase
                .from('surveys')
                .select('id, serial_no, owner_name, neighborhood, land_type, created_at')
                .order('created_at', { ascending: false });
              return { ...legacy, schemaMissing: true };
            })()
          : canViewSurveys
            ? supabase.from('surveys').select('id, serial_no, owner_name, neighborhood, land_type, created_at').order('created_at', { ascending: false }).then((legacy) => ({ ...legacy, schemaMissing: true }))
            : Promise.resolve({ data: [], error: null, schemaMissing: false });
        const [
          surveyResult,
          referenceResult,
          transferResult,
          receiptResult,
          expenseResult,
          teamResult,
          sheetSurveysRes,
          sheetRefsRes,
        ] = await Promise.all([
          surveyRequest,
          canViewReferences
            ? supabase
                .from('references')
                .select('id, ref_number, subject, status, created_at')
                .order('created_at', { ascending: false })
            : emptyResult,
          canViewTransfers
            ? supabase
                .from('transfers')
                .select('id, serial_no, seller_name, buyer_name, price, transfer_date, created_at')
                .order('created_at', { ascending: false })
            : emptyResult,
          canViewFinancials
            ? supabase
                .from('receipts')
                .select('id, receipt_no, amount, status, payment_date, created_at')
                .order('created_at', { ascending: false })
            : emptyResult,
          canViewFinancials
            ? supabase
                .from('expenses')
                .select('id, description, total, expense_date, created_at')
                .order('created_at', { ascending: false })
            : emptyResult,
          isAdmin
            ? supabase
                .from('profiles')
                .select('id, fullname, role, created_at')
                .order('created_at', { ascending: false })
            : emptyResult,
          canViewSurveys
            ? fetch('/api/surveys/sheet').then((r) => r.json()).catch(() => ({ surveys: [] }))
            : Promise.resolve({ surveys: [] }),
          canViewReferences
            ? fetch('/api/references/sheet').then((r) => r.json()).catch(() => ({ references: [] }))
            : Promise.resolve({ references: [] }),
        ]);

        const requestError = [
          surveyResult.error,
          referenceResult.error,
          transferResult.error,
          receiptResult.error,
          expenseResult.error,
          teamResult.error,
        ].find(Boolean);

        if (requestError) throw requestError;
        if (cancelled) return;

        const dbSurveys = (surveyResult.data ?? []) as SurveyRow[];
        const sheetSurveys = ((sheetSurveysRes as any)?.surveys ?? []) as SurveyRow[];
        const existingDbSurveyIds = new Set(dbSurveys.map((s) => String(s.id)));
        const mergedSurveys = [
          ...dbSurveys,
          ...sheetSurveys.filter((s) => !existingDbSurveyIds.has(String(s.id))),
        ];

        const dbRefs = (referenceResult.data ?? []) as ReferenceRow[];
        const sheetRefs = ((sheetRefsRes as any)?.references ?? []) as ReferenceRow[];
        const existingRefIds = new Set(dbRefs.map((r) => String(r.id)));
        const mergedRefs = [
          ...dbRefs,
          ...sheetRefs.filter((r) => !existingRefIds.has(String(r.id))),
        ];

        setSurveys(mergedSurveys);
        setReferences(mergedRefs);
        setTransfers((transferResult.data ?? []) as TransferRow[]);
        setReceipts((receiptResult.data ?? []) as ReceiptRow[]);
        setExpenses((expenseResult.data ?? []) as ExpenseRow[]);
        setTeamMembers((teamResult.data ?? []) as TeamMemberRow[]);
      } catch (loadError) {
        console.error('Dashboard data error:', loadError);
        if (!cancelled) setError('Dashboard data could not be loaded. Please refresh and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [canViewFinancials, canViewReferences, canViewSurveys, canViewTransfers, isAdmin, profile?.permitted_actions]);

  const financials = useMemo(() => {
    const revenue = receipts
      .filter((receipt) => receipt.status === 'Paid')
      .reduce((sum, receipt) => sum + toNumber(receipt.amount), 0);
    const credit = receipts
      .filter((receipt) => receipt.status === 'Credit')
      .reduce((sum, receipt) => sum + toNumber(receipt.amount), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + toNumber(expense.total), 0);

    return { revenue, credit, expenses: totalExpenses, net: revenue - totalExpenses };
  }, [expenses, receipts]);

  const surveyTypes = useMemo(() => {
    const counts = surveys.reduce<Record<string, number>>((result, survey) => {
      const label = survey.land_type?.trim() || 'Other';
      result[label] = (result[label] ?? 0) + 1;
      return result;
    }, {});

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [surveys]);

  const activity = useMemo<ActivityItem[]>(() => {
    const surveyActivity: ActivityItem[] = surveys.slice(0, 6).map((survey) => ({
      id: `survey-${survey.id}`,
      kind: 'survey',
      title: `Survey ${survey.survey_no || survey.serial_no}`,
      detail: `${survey.owner_name} · ${survey.neighborhood}`,
      date: survey.created_at,
      href: '/records',
    }));
    const referenceActivity: ActivityItem[] = references.slice(0, 6).map((reference) => ({
      id: `reference-${reference.id}`,
      kind: 'reference',
      title: reference.ref_number,
      detail: `${reference.subject} · ${reference.status}`,
      date: reference.created_at,
      href: '/references',
    }));
    const transferActivity: ActivityItem[] = transfers.slice(0, 6).map((transfer) => ({
      id: `transfer-${transfer.id}`,
      kind: 'transfer',
      title: `Transfer ${transfer.serial_no}`,
      detail: `${transfer.seller_name} → ${transfer.buyer_name}`,
      date: transfer.created_at ?? transfer.transfer_date,
      href: '/transfers',
      amount: toNumber(transfer.price),
    }));
    const paymentActivity: ActivityItem[] = receipts.slice(0, 6).map((receipt) => ({
      id: `payment-${receipt.id}`,
      kind: 'payment',
      title: receipt.receipt_no,
      detail: receipt.status === 'Paid' ? 'Payment received' : 'Credit payment',
      date: receipt.created_at ?? receipt.payment_date,
      href: '/financials',
      amount: toNumber(receipt.amount),
    }));
    const expenseActivity: ActivityItem[] = expenses.slice(0, 6).map((expense) => ({
      id: `expense-${expense.id}`,
      kind: 'expense',
      title: expense.description,
      detail: 'Office expense',
      date: expense.created_at ?? expense.expense_date,
      href: '/financials',
      amount: -toNumber(expense.total),
    }));

    return [
      ...surveyActivity,
      ...referenceActivity,
      ...transferActivity,
      ...paymentActivity,
      ...expenseActivity,
    ]
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .slice(0, 7);
  }, [expenses, receipts, references, surveys, transfers]);

  const openReferences = references.filter((reference) => reference.status === 'In Progress').length;
  const completedReferences = references.filter((reference) => reference.status !== 'In Progress').length;
  const transferValue = transfers.reduce((sum, transfer) => sum + toNumber(transfer.price), 0);
  const pendingSurveys = surveys.filter((survey) => survey.status === 'Pending Review').length;
  const approvedSurveys = surveys.filter((survey) => survey.status === 'Approved').length;

  const statCards = [
    canViewSurveys && {
      label: 'Registered plots',
      value: numberFormatter.format(surveys.length),
      detail: `${pendingSurveys} pending · ${approvedSurveys} approved`,
      icon: Layers3,
      iconClass: 'bg-blue-50 text-blue-600',
      href: '/records',
    },
    canViewReferences && {
      label: 'Open references',
      value: numberFormatter.format(openReferences),
      detail: `${completedReferences} resolved`,
      icon: Files,
      iconClass: 'bg-violet-50 text-violet-600',
      href: '/references',
    },
    canViewTransfers && {
      label: 'Land transfers',
      value: numberFormatter.format(transfers.length),
      detail: `${moneyFormatter.format(transferValue)} total value`,
      icon: ArrowLeftRight,
      iconClass: 'bg-amber-50 text-amber-600',
      href: '/transfers',
    },
    canViewFinancials && {
      label: 'Net balance',
      value: moneyFormatter.format(financials.net),
      detail: `${moneyFormatter.format(financials.credit)} outstanding`,
      icon: WalletCards,
      iconClass: financials.net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
      href: '/financials',
    },
    isAdmin && {
      label: 'Team members',
      value: numberFormatter.format(teamMembers.length),
      detail: `${teamMembers.filter((member) => member.role === 'Admin').length} administrators`,
      icon: Users,
      iconClass: 'bg-cyan-50 text-cyan-600',
      href: '/users',
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    detail: string;
    icon: typeof Layers3;
    iconClass: string;
    href: string;
  }>;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
                Live overview
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
              Welcome, {profile?.fullname?.split(' ')[0] || 'User'}
            </h1>
            <p className="mt-1.5 text-xs font-medium text-slate-500 sm:text-sm">
              All important land operations in one clear view.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        <section className={`grid grid-cols-2 gap-3 ${statCards.length > 4 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[132px] animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="h-9 w-9 rounded-xl bg-slate-100" />
                  <div className="mt-4 h-5 w-24 rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-32 rounded bg-slate-100" />
                </div>
              ))
            : statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link
                    key={card.label}
                    href={card.href}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.035)] transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_10px_30px_rgba(15,23,42,0.07)]"
                  >
                    <div className="flex items-start justify-between">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.iconClass}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-600" />
                    </div>
                    <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-1 truncate text-xl font-black tracking-[-0.03em] text-slate-900">{card.value}</p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{card.detail}</p>
                  </Link>
                );
              })}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-black text-slate-900">Recent activity</h2>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500">Latest updates across your workspace</p>
              </div>
              <Clock3 className="h-5 w-5 text-slate-300" />
            </div>

            <div className="divide-y divide-slate-200/80">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex animate-pulse items-center gap-3 px-4 py-3.5 sm:px-5">
                    <div className="h-9 w-9 rounded-xl bg-slate-100" />
                    <div className="flex-1">
                      <div className="h-3 w-36 rounded bg-slate-100" />
                      <div className="mt-2 h-2.5 w-52 rounded bg-slate-100" />
                    </div>
                  </div>
                ))
              ) : activity.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <ReceiptText className="h-10 w-10 text-slate-200" />
                  <p className="mt-3 text-sm font-bold text-slate-700">No activity yet</p>
                  <p className="mt-1 text-xs text-slate-400">New records will appear here.</p>
                </div>
              ) : (
                activity.map((item) => {
                  const activityStyles = {
                    survey: { icon: Layers3, className: 'bg-blue-50 text-blue-600' },
                    reference: { icon: Files, className: 'bg-violet-50 text-violet-600' },
                    transfer: { icon: ArrowLeftRight, className: 'bg-amber-50 text-amber-600' },
                    payment: { icon: TrendingUp, className: 'bg-emerald-50 text-emerald-600' },
                    expense: { icon: TrendingDown, className: 'bg-rose-50 text-rose-600' },
                  }[item.kind];
                  const Icon = activityStyles.icon;

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80 sm:px-5"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activityStyles.className}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-extrabold text-slate-800">{item.title}</p>
                          {item.amount !== undefined && (
                            <span className={`ml-auto shrink-0 text-[11px] font-black ${item.amount < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                              {item.amount < 0 ? '−' : ''}{moneyFormatter.format(Math.abs(item.amount))}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="truncate text-[10px] font-medium text-slate-500">{item.detail}</p>
                          <span className="shrink-0 text-[9px] font-bold text-slate-400">{formatDate(item.date)}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <div className="space-y-5">
            {canViewFinancials && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.035)] sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Financial health</p>
                    <h2 className="mt-1 text-sm font-black text-slate-900">Cash overview</h2>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <CircleDollarSign className="h-[18px] w-[18px]" />
                  </span>
                </div>
                <div className="mt-5 rounded-2xl bg-gradient-to-br from-teal-600 to-blue-700 p-4 text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)]">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-blue-100">Available balance</p>
                  <p className="mt-1 text-2xl font-black tracking-[-0.035em]">{moneyFormatter.format(financials.net)}</p>
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-blue-100">
                    {financials.net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    Revenue minus recorded expenses
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 p-2.5">
                    <p className="text-[8px] font-extrabold uppercase tracking-wider text-emerald-600">Income</p>
                    <p className="mt-1 truncate text-xs font-black text-slate-800">{moneyFormatter.format(financials.revenue)}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-2.5">
                    <p className="text-[8px] font-extrabold uppercase tracking-wider text-rose-600">Expenses</p>
                    <p className="mt-1 truncate text-xs font-black text-slate-800">{moneyFormatter.format(financials.expenses)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-2.5">
                    <p className="text-[8px] font-extrabold uppercase tracking-wider text-amber-600">Credit</p>
                    <p className="mt-1 truncate text-xs font-black text-slate-800">{moneyFormatter.format(financials.credit)}</p>
                  </div>
                </div>
              </section>
            )}

            {canViewSurveys && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.035)] sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Land portfolio</p>
                    <h2 className="mt-1 text-sm font-black text-slate-900">Survey categories</h2>
                  </div>
                  <Building2 className="h-5 w-5 text-slate-300" />
                </div>
                <div className="mt-4 space-y-3">
                  {surveyTypes.length === 0 ? (
                    <p className="py-5 text-center text-xs font-medium text-slate-400">No survey categories yet.</p>
                  ) : (
                    surveyTypes.map(([label, count], index) => {
                      const percentage = surveys.length ? Math.round((count / surveys.length) * 100) : 0;
                      const colors = ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500'];
                      return (
                        <div key={label}>
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className="truncate text-[10px] font-bold text-slate-600">{label}</span>
                            <span className="text-[10px] font-black text-slate-800">{count} · {percentage}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${colors[index]}`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="h-24 md:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
