'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { Reference, Receipt, Expense } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { canAction } from '@/lib/permissions';
import { useModal } from '@/context/ModalContext';
import { useSettings } from '@/context/SettingsContext';
import { useMobileSearch } from '@/context/MobileSearchContext';
import { dateGroupKey, groupItems } from '@/lib/listGrouping';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import { useDataAutoRefresh } from '@/lib/useDataAutoRefresh';
import { resolveCreatorName, useProfileNames } from '@/lib/useProfileNames';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Printer,
  Search,
  X,
  CheckCircle2,
  Loader2,
  FileText,
  CreditCard,
  AlertCircle,
  Calendar,
  Pencil,
  Trash2,
  Download
} from 'lucide-react';

const RECEIPT_DETAILS_PREFIX = '__MARWAAZPN_RECEIPT__';

const parseReceiptDetails = (value: unknown) => {
  const raw = String(value || '');
  if (!raw.startsWith(RECEIPT_DETAILS_PREFIX)) return { payerName: '', details: raw, refNumbers: '' };
  try {
    const parsed = JSON.parse(raw.slice(RECEIPT_DETAILS_PREFIX.length));
    return { payerName: String(parsed.payerName || ''), details: String(parsed.details || ''), refNumbers: String(parsed.refNumbers || '') };
  } catch {
    return { payerName: '', details: raw, refNumbers: '' };
  }
};

const serializeReceiptDetails = (payerName: string, details: string, refNumbers = '') =>
  `${RECEIPT_DETAILS_PREFIX}${JSON.stringify({ payerName: payerName.trim(), details: details.trim(), refNumbers: refNumbers.trim() })}`;

export default function FinancialsPage() {
  const profileNames = useProfileNames();
  const { profile, user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const { settings, refetch: refetchSettings } = useSettings();
  const { isOpen: showMobileSearch, setAvailable: setSearchAvailable } = useMobileSearch();

  useEffect(() => {
    setSearchAvailable(true);
  }, [setSearchAvailable]);

  const [loading, setLoading] = useState(true);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  // Data states
  const [referencesWithReceipts, setReferencesWithReceipts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const dataRevision = useRef(0);

  // Totals
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  // Tabs
  const [activeTab, setActiveTab] = useState<'payments' | 'expenses'>('payments');

  // Search / sort / group controls
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<'' | 'Paid' | 'Credit' | 'Unpaid'>('');
  const [receiptCreatorFilter, setReceiptCreatorFilter] = useState('');
  const [receiptSortBy, setReceiptSortBy] = useState<'newest' | 'oldest'>('newest');
  const [receiptGroupBy, setReceiptGroupBy] = useState<'none' | 'date'>('none');
  const [receiptGroupAggregate, setReceiptGroupAggregate] = useState<'none' | 'count' | 'sum'>('count');

  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseCreatorFilter, setExpenseCreatorFilter] = useState('');
  const [expenseSortBy, setExpenseSortBy] = useState<'newest' | 'oldest' | 'amount_high'>('newest');
  const [expenseGroupBy, setExpenseGroupBy] = useState<'none' | 'date'>('none');
  const [expenseGroupAggregate, setExpenseGroupAggregate] = useState<'none' | 'count' | 'sum'>('count');

  // Pay Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payRefNumber, setPayRefNumber] = useState('');
  const [payReceiptNo, setPayReceiptNo] = useState('');
  const [payPayerName, setPayPayerName] = useState('');
  const [payDetails, setPayDetails] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payStatus, setPayStatus] = useState<'Paid' | 'Credit'>('Paid');
  const [payMode, setPayMode] = useState<'EVC Plus' | 'eDahab' | 'Jeeb' | 'Cash'>('EVC Plus');

  // View Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [updatingCredit, setUpdatingCredit] = useState(false);

  // Receipt Edit Mode (toggled within the same view-receipt modal)
  const [receiptEditMode, setReceiptEditMode] = useState(false);
  const [editReceiptNo, setEditReceiptNo] = useState('');
  const [editReceiptAmount, setEditReceiptAmount] = useState('');
  const [editReceiptStatus, setEditReceiptStatus] = useState<'Paid' | 'Credit'>('Paid');
  const [editReceiptMode, setEditReceiptMode] = useState<'EVC Plus' | 'eDahab' | 'Jeeb' | 'Cash'>('EVC Plus');
  const [editReceiptDate, setEditReceiptDate] = useState('');
  const [editReceiptDetails, setEditReceiptDetails] = useState('');
  const [savingReceiptEdit, setSavingReceiptEdit] = useState(false);
  const [deletingReceipt, setDeletingReceipt] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  // Pay Debt Modal State (Partial or Full Payment)
  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [payDebtRef, setPayDebtRef] = useState<any | null>(null);
  const [payDebtCreditReceipt, setPayDebtCreditReceipt] = useState<any | null>(null);
  const [payDebtTotalCredit, setPayDebtTotalCredit] = useState(0);
  const [payDebtPaidSoFar, setPayDebtPaidSoFar] = useState(0);
  const [payDebtAmount, setPayDebtAmount] = useState('');
  const [payDebtMode, setPayDebtMode] = useState<'EVC Plus' | 'eDahab' | 'Jeeb' | 'Cash'>('EVC Plus');
  const [payDebtDate, setPayDebtDate] = useState('');
  const [payDebtDetails, setPayDebtDetails] = useState('');
  const [savingDebtPayment, setSavingDebtPayment] = useState(false);

  // Bulk Payment Selection State
  const [selectedRefIds, setSelectedRefIds] = useState<number[]>([]);
  const [bulkAmounts, setBulkAmounts] = useState<Record<number, string>>({});

  // Add/Edit Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expDescription, setExpDescription] = useState('');
  const [expQty, setExpQty] = useState('1');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState('');
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

  // Fetch Financial Data
  const fetchData = async () => {
    const revision = dataRevision.current;
    try {
      // 1. Fetch references with nested receipts
      const { data: refsData, error: refsError } = await supabase
        .from('references')
        .select(`
          id,
          ref_number,
          subject,
          created_by,
          issue_date,
          surveys (
            serial_no,
            survey_no,
            owner_name,
            neighborhood,
            land_type,
            sketch_area
          ),
          receipts (
            id,
            reference_id,
            receipt_no,
            amount,
            status,
            payment_mode,
            payment_date,
            details,
            created_by
          )
        `)
        .order('created_at', { ascending: false });

      if (refsError) throw refsError;
      if (revision !== dataRevision.current) return;
      setReferencesWithReceipts(refsData || []);

      // 2. Fetch Expenses
      const { data: expData, error: expError } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (expError) throw expError;
      if (revision !== dataRevision.current) return;
      setExpenses(expData || []);

      // 3. Calculate Totals
      // Fetch all receipts to compute revenue and credit
      const { data: receiptsData } = await supabase
        .from('receipts')
        .select('amount, status');
      
      const revSum = receiptsData?.filter(r => r.status === 'Paid').reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0) || 0;
      if (revision !== dataRevision.current) return;
      const creditSum = receiptsData?.filter(r => r.status === 'Credit').reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0) || 0;
      setTotalRevenue(revSum);
      setTotalCredit(creditSum);

      const expSum = expData?.reduce((sum, e) => sum + parseFloat(e.total.toString()), 0) || 0;
      setTotalExpenses(expSum);

    } catch (err) {
      console.error('Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  useDataAutoRefresh(fetchData);

  const filteredReferencesWithReceipts = useMemo(() => {
    let result = [...referencesWithReceipts];

    if (receiptSearchQuery.trim() !== '') {
      const q = receiptSearchQuery.toLowerCase();
      result = result.filter((r) => r.ref_number.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q));
    }

    if (receiptStatusFilter) {
      result = result.filter((r) => {
        const receipts = r.receipts || [];
        const paidAmount = receipts.filter((x: any) => x.status === 'Paid').reduce((s: number, x: any) => s + parseFloat(x.amount.toString()), 0);
        const creditAmount = receipts.filter((x: any) => x.status === 'Credit').reduce((s: number, x: any) => s + parseFloat(x.amount.toString()), 0);
        const hasCredit = creditAmount > 0;
        const isPaid = !hasCredit && paidAmount > 0;
        if (receiptStatusFilter === 'Paid') return isPaid;
        if (receiptStatusFilter === 'Credit') return hasCredit;
        return !isPaid && !hasCredit;
      });
    }

    if (receiptCreatorFilter) {
      result = result.filter((reference) => reference.created_by === receiptCreatorFilter || (reference.receipts || []).some((receipt: { created_by?: string }) => receipt.created_by === receiptCreatorFilter));
    }

    return result;
  }, [referencesWithReceipts, receiptSearchQuery, receiptStatusFilter, receiptCreatorFilter]);

  const paymentCreators = useMemo(() => Array.from(new Set(referencesWithReceipts.flatMap((reference) => [reference.created_by, ...(reference.receipts || []).map((receipt: { created_by?: string }) => receipt.created_by)].filter((value): value is string => Boolean(value))))).sort((a, b) => (resolveCreatorName(a, profileNames) || a).localeCompare(resolveCreatorName(b, profileNames) || b)), [referencesWithReceipts, profileNames]);

  const sortedReferencesWithReceipts = useMemo(() => {
    const sorted = [...filteredReferencesWithReceipts];
    sorted.sort((a, b) => {
      const diff = new Date(b.issue_date || 0).getTime() - new Date(a.issue_date || 0).getTime();
      return receiptSortBy === 'oldest' ? -diff : diff;
    });
    return sorted;
  }, [filteredReferencesWithReceipts, receiptSortBy]);

  const groupedReferencesWithReceipts = useMemo(() => {
    if (receiptGroupBy === 'none') return null;
    return groupItems(sortedReferencesWithReceipts, (r) => dateGroupKey(r.issue_date).key).map((group) => {
      const baseLabel = dateGroupKey(group.items[0].issue_date).label;
      let label = baseLabel;
      if (receiptGroupAggregate === 'count') {
        label = `${baseLabel} · ${group.items.length}`;
      } else if (receiptGroupAggregate === 'sum') {
        const sum = group.items.reduce((total, r) => {
          const receipts = r.receipts || [];
          return total + receipts.reduce((s: number, x: any) => s + parseFloat(x.amount.toString()), 0);
        }, 0);
        label = `${baseLabel} · $${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
      return { ...group, label };
    });
  }, [sortedReferencesWithReceipts, receiptGroupBy, receiptGroupAggregate]);

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];
    if (expenseSearchQuery.trim() !== '') {
      const q = expenseSearchQuery.toLowerCase();
      result = result.filter((expense) => expense.description.toLowerCase().includes(q));
    }
    if (expenseCreatorFilter) result = result.filter((expense) => expense.created_by === expenseCreatorFilter);
    return result;
  }, [expenses, expenseSearchQuery, expenseCreatorFilter]);

  const expenseCreators = useMemo(() => Array.from(new Set(expenses.map((expense) => expense.created_by).filter((value): value is string => Boolean(value)))).sort((a, b) => (resolveCreatorName(a, profileNames) || a).localeCompare(resolveCreatorName(b, profileNames) || b)), [expenses, profileNames]);

  const sortedExpenses = useMemo(() => {
    const sorted = [...filteredExpenses];
    sorted.sort((a, b) => {
      if (expenseSortBy === 'amount_high') return parseFloat(b.total.toString()) - parseFloat(a.total.toString());
      const diff = new Date(b.expense_date || 0).getTime() - new Date(a.expense_date || 0).getTime();
      return expenseSortBy === 'oldest' ? -diff : diff;
    });
    return sorted;
  }, [filteredExpenses, expenseSortBy]);

  const groupedExpenses = useMemo(() => {
    if (expenseGroupBy === 'none') return null;
    return groupItems(sortedExpenses, (e) => dateGroupKey(e.expense_date).key).map((group) => {
      const baseLabel = dateGroupKey(group.items[0].expense_date).label;
      const sum = group.items.reduce((total, e) => total + parseFloat(e.total.toString()), 0);
      const label =
        expenseGroupAggregate === 'count' ? `${baseLabel} · ${group.items.length}` :
        expenseGroupAggregate === 'sum' ? `${baseLabel} · $${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}` :
        baseLabel;
      return { ...group, label };
    });
  }, [sortedExpenses, expenseGroupBy, expenseGroupAggregate]);

  // Stable row numbers independent of the current sort/group order (newest fetched = highest number).
  const expenseSerial = useMemo(
    () => new Map(expenses.map((e, idx) => [e.id, expenses.length - idx])),
    [expenses],
  );

  // Pay Dialog triggers
  const openPayDialog = (refId: number, refNum: string, subject: string) => {
    const selectedReference = referencesWithReceipts.find((item) => item.id === refId);
    const survey = Array.isArray(selectedReference?.surveys) ? selectedReference.surveys[0] : selectedReference?.surveys;
    setSelectedRefIds([refId]);
    setPayRefNumber(refNum);
    setPayPayerName(survey?.owner_name || '');
    setPayDetails(subject);

    // Receipt No is only assigned once the receipt is actually saved (see
    // handleSaveReceipt) — guessing it here from the cached next-seq showed a
    // number that could go stale (or repeat) across dialog opens without ever
    // matching what really got saved.
    setPayReceiptNo('');

    // Set date to today
    setPayDate(new Date().toISOString().split('T')[0]);
    
    const initialAmounts: Record<number, string> = { [refId]: '' };
    setBulkAmounts(initialAmounts);
    setPayStatus('Paid');
    setPayMode('EVC Plus');
    
    setShowPayModal(true);
  };

  const openBulkPayDialog = () => {
    if (selectedRefIds.length === 0) return;
    
    const selectedRefs = referencesWithReceipts.filter(r => selectedRefIds.includes(r.id));
    
    if (selectedRefs.length === 1) {
      openPayDialog(selectedRefs[0].id, selectedRefs[0].ref_number, selectedRefs[0].subject);
      return;
    }

    const refNumsString = selectedRefs.map(r => r.ref_number).join(', ');
    const subjectsString = `Wadajir u bixiyey: ${selectedRefs.map(r => r.ref_number).join(', ')}`;
    
    setPayRefNumber(refNumsString);
    const payerNames = selectedRefs
      .map((item) => Array.isArray(item.surveys) ? item.surveys[0]?.owner_name : item.surveys?.owner_name)
      .filter(Boolean);
    setPayPayerName(new Set(payerNames).size === 1 ? payerNames[0] : '');
    setPayDetails(subjectsString);

    setPayReceiptNo('');

    // Set date to today
    setPayDate(new Date().toISOString().split('T')[0]);
    
    const initialAmounts: Record<number, string> = {};
    selectedRefIds.forEach(id => {
      initialAmounts[id] = '';
    });
    setBulkAmounts(initialAmounts);
    setPayStatus('Paid');
    setPayMode('EVC Plus');
    
    setShowPayModal(true);
  };

  const closePayDialog = () => {
    setShowPayModal(false);
    setPayRefNumber('');
    setPayReceiptNo('');
    setPayPayerName('');
    setPayDetails('');
    setBulkAmounts({});
    setSelectedRefIds([]);
  };

  // Save Client Payment Receipt
  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAction(profile, 'payment.create')) return void showAlert('Oggolaansho', 'Ma lihid Payment Add permission.', 'warning');
    if (selectedRefIds.length === 0) return;
    setSavingReceipt(true);

    try {
      // Receipt No is assigned here, atomically, right before inserting — not
      // guessed ahead of time — so it always matches what's actually saved and
      // never collides with receipts.receipt_no's UNIQUE constraint.
      const { data: freshReceiptNo, error: rpcError } = await supabase.rpc('next_receipt_number');
      if (rpcError) throw rpcError;
      const baseRecNo = freshReceiptNo as string;

      const totalAmount = selectedRefIds.reduce(
        (sum, refId) => sum + (parseFloat(bulkAmounts[refId]) || 0),
        0,
      );
      const payload = {
        receipt_no: baseRecNo,
        reference_id: selectedRefIds[0],
        details: serializeReceiptDetails(payPayerName, payDetails, payRefNumber),
        amount: totalAmount,
        status: payStatus,
        payment_mode: payMode,
        payment_date: payDate,
        created_by: user?.id,
      };

      const { data: savedReceipt, error } = await supabase
        .from('receipts')
        .insert(payload).select('*').single();

      if (error) throw error;

      dataRevision.current += 1;
      setReferencesWithReceipts(current => current.map(reference => reference.id === savedReceipt.reference_id
        ? { ...reference, receipts: [savedReceipt, ...(reference.receipts || []).filter((receipt: Receipt) => receipt.id !== savedReceipt.id)] }
        : reference));
      if (savedReceipt.status === 'Paid') setTotalRevenue(value => value + Number(savedReceipt.amount));
      if (savedReceipt.status === 'Credit') setTotalCredit(value => value + Number(savedReceipt.amount));
      setReceiptSearchQuery('');
      setReceiptStatusFilter('');
      setReceiptCreatorFilter('');
      showAlert('Guul', `Resiidhka (${baseRecNo}) si guul leh ayaa loo keydiyey!`, 'success');
      closePayDialog();
      refetchSettings();
    } catch (err: any) {
      console.error('Error saving receipt:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingReceipt(false);
    }
  };

  // Mark Credit Receipt as Paid
  const handleUpdateCreditToPaid = async (receiptId: number) => {
    if (!canAction(profile, 'payment.edit')) return void showAlert('Oggolaansho', 'Ma lihid Payment Edit permission.', 'warning');
    setUpdatingCredit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        const res = await fetch('/api/financials/update-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ receipt_id: receiptId, status: 'Paid' })
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Failed to update receipt status.');
      } else {
        const { error } = await supabase
          .from('receipts')
          .update({ status: 'Paid', payment_date: new Date().toISOString().split('T')[0] })
          .eq('id', receiptId);

        if (error) throw error;
      }

      showAlert('Guul', 'Resiidhka waxaa loo bedelay Paid (Waa la bixiyey)!', 'success');
      setSelectedReceipt(null);
      fetchData();
    } catch (err: any) {
      console.error('Error updating credit to paid:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setUpdatingCredit(false);
    }
  };

  // Open Pay Debt Modal for a Reference
  const openPayDebtDialog = (ref: any) => {
    const receipts = ref.receipts || [];
    const creditReceipt = receipts.find((r: any) => r.status === 'Credit');
    const creditSum = creditReceipt ? parseFloat(creditReceipt.amount.toString()) : 0;
    const paidSum = receipts
      .filter((r: any) => r.status === 'Paid')
      .reduce((sum: number, r: any) => sum + parseFloat(r.amount.toString()), 0);

    setPayDebtRef(ref);
    setPayDebtCreditReceipt(creditReceipt || null);
    setPayDebtTotalCredit(creditSum);
    setPayDebtPaidSoFar(paidSum);
    setPayDebtAmount(creditSum > 0 ? creditSum.toString() : '');
    setPayDebtMode('EVC Plus');
    setPayDebtDate(new Date().toISOString().split('T')[0]);
    setPayDebtDetails(`Bixinta deynta: ${ref.ref_number || ''}`);
    setShowPayDebtModal(true);
  };

  // Save Debt Payment (Full or Partial)
  const handleSaveDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAction(profile, 'payment.pay_debt')) return void showAlert('Oggolaansho', 'Ma lihid Pay Debt permission.', 'warning');
    if (!payDebtRef || !payDebtCreditReceipt) return;

    const payAmt = parseFloat(payDebtAmount);
    if (isNaN(payAmt) || payAmt <= 0) {
      showAlert('Cillad', 'Fadlan geli lacag sax ah.', 'error');
      return;
    }

    if (payAmt > payDebtTotalCredit + 0.001) {
      showAlert('Cillad', `Lacagta la bixinayo ($${payAmt.toFixed(2)}) kama badan karto deynta lagu leeyahay ($${payDebtTotalCredit.toFixed(2)}).`, 'error');
      return;
    }

    setSavingDebtPayment(true);

    try {
      const remainingCredit = payDebtTotalCredit - payAmt;
      const today = payDebtDate || new Date().toISOString().split('T')[0];

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        const res = await fetch('/api/financials/pay-debt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            reference_id: payDebtRef.id,
            credit_receipt_id: payDebtCreditReceipt.id,
            pay_amount: payAmt,
            total_credit: payDebtTotalCredit,
            payment_mode: payDebtMode,
            payment_date: today,
            details: payDebtDetails
          })
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Cillad ayaa ka dhacday bixinta deynta.');
      } else {
        if (remainingCredit <= 0.001) {
          const { error: updateError } = await supabase
            .from('receipts')
            .update({
              status: 'Paid',
              amount: payAmt,
              payment_mode: payDebtMode,
              payment_date: today,
              details: payDebtDetails || `Bixinta buuxda ee deynta (${payDebtRef.ref_number})`
            })
            .eq('id', payDebtCreditReceipt.id);

          if (updateError) throw updateError;
        } else {
          const { error: updateError } = await supabase
            .from('receipts')
            .update({
              amount: remainingCredit,
              details: `Deyn harsan (${payDebtRef.ref_number})`
            })
            .eq('id', payDebtCreditReceipt.id);

          if (updateError) throw updateError;

          const randomNum = Math.floor(1000 + Math.random() * 9000);
          const newReceiptNo = `REC-${randomNum}`;

          const { error: insertError } = await supabase
            .from('receipts')
            .insert({
              receipt_no: newReceiptNo,
              reference_id: payDebtRef.id,
              amount: payAmt,
              status: 'Paid',
              payment_mode: payDebtMode,
              payment_date: today,
              details: payDebtDetails || `Bixinta qeyb ka mid ah deynta (${payDebtRef.ref_number})`,
              created_by: user?.id,
            });

          if (insertError) throw insertError;
        }
      }

      if (remainingCredit <= 0.001) {
        showAlert('Guul', `Deyntii oo dhan ($${payDebtTotalCredit.toFixed(2)}) waa la wada bixiyey!`, 'success');
      } else {
        showAlert('Guul', `Lacagta $${payAmt.toFixed(2)} waa la bixiyey. Deynta oo harsan waa $${remainingCredit.toFixed(2)}.`, 'success');
      }

      setShowPayDebtModal(false);
      setSelectedReceipt(null);
      fetchData();
    } catch (err: any) {
      console.error('Error saving debt payment:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingDebtPayment(false);
    }
  };

  // Add Expense Dialog
  const openExpenseDialog = () => {
    setEditingExpense(null);
    setExpDescription('');
    setExpQty('1');
    setExpAmount('');
    setExpDate(new Date().toISOString().split('T')[0]);
    setShowExpenseModal(true);
  };

  const openExpenseEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    setExpDescription(expense.description);
    setExpQty(String(expense.qty));
    setExpAmount(String(expense.amount));
    setExpDate(expense.expense_date ? expense.expense_date.slice(0, 10) : '');
    setShowExpenseModal(true);
  };

  const closeExpenseDialog = () => {
    setShowExpenseModal(false);
    setEditingExpense(null);
    setExpDescription('');
    setExpQty('1');
    setExpAmount('');
  };

  // Save (or update) Office Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAction(profile, editingExpense ? 'expense.edit' : 'expense.create')) return void showAlert('Oggolaansho', 'Ma lihid fasaxa keydinta kharashkan.', 'warning');
    setSavingExpense(true);

    const qty = parseInt(expQty) || 0;
    const amount = parseFloat(expAmount) || 0;
    const total = qty * amount;

    try {
      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update({ description: expDescription, qty, amount, total, expense_date: expDate })
          .eq('id', editingExpense.id);
        if (error) throw error;

        showAlert('Guul', 'Kharashka si guul leh ayaa loo cusboonaysiiyey!', 'success');
        closeExpenseDialog();
        fetchData();
        return;
      }

      // Expenses previously had no number at all, despite the "Expense Records"
      // numbering settings existing on the Settings page — nothing ever read them.
      const { data: expenseNo, error: rpcError } = await supabase.rpc('next_expense_number');
      if (rpcError) throw rpcError;

      const payload = {
        description: expDescription,
        qty,
        amount,
        total,
        expense_date: expDate,
        created_by: profile?.fullname || 'Unknown Admin',
        expense_no: expenseNo || null,
      };

      const { data: savedExpense, error } = await supabase
        .from('expenses')
        .insert([payload]).select('*').single();

      if (error) throw error;

      dataRevision.current += 1;
      setExpenses(current => [savedExpense, ...current.filter(expense => expense.id !== savedExpense.id)]);
      setTotalExpenses(value => value + Number(savedExpense.total));
      setExpenseSearchQuery('');
      setExpenseCreatorFilter('');
      setExpenseSortBy('newest');
      showAlert('Guul', expenseNo ? `Kharashka (${expenseNo}) waa la keydiyey!` : 'Kharashka waa la keydiyey!', 'success');
      closeExpenseDialog();
      refetchSettings();
    } catch (err: any) {
      console.error('Error saving expense:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!canAction(profile, 'expense.delete')) return void showAlert('Oggolaansho', 'Ma lihid Expense Delete permission.', 'warning');
    const isConfirmed = await showConfirm(
      'Tirtir Kharashka',
      `Ma hubtaa inaad tirtirto kharashka "${expense.description}"? Tallaabadan lama soo celin karo.`,
      'Haa, tirtir',
      'Maya'
    );
    if (!isConfirmed) return;

    setDeletingExpenseId(expense.id);
    try {
      const { data: deleted, error } = await supabase.from('expenses').delete().eq('id', expense.id).select('id, total').maybeSingle();
      if (error) throw error;
      if (!deleted) throw new Error('Kharashka lama tirtirin. Hubi oggolaanshahaaga ama dib u cusboonaysii liiska.');
      dataRevision.current += 1;
      setExpenses(current => current.filter(item => item.id !== deleted.id));
      setTotalExpenses(current => current - Number(deleted.total));
      showAlert('Guul', 'Kharashka waa la tirtiray.', 'success');
    } catch (err) {
      console.error('Error deleting expense:', err);
      showAlert('Cillad', err instanceof Error ? err.message : 'Tirtiridda wuu fashilmay.', 'error');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  // Render receipt details popup
  const openReceiptDetails = (receipt: any, ref: any) => {
    const parentRef = typeof ref === 'object'
      ? ref
      : referencesWithReceipts.find((item) => item.ref_number === ref);
    const refNum = parentRef?.ref_number || (typeof ref === 'string' ? ref : undefined);
    const refId = parentRef?.id || receipt?.reference_id;
    const survey = Array.isArray(parentRef?.surveys) ? parentRef.surveys[0] : parentRef?.surveys;
    setSelectedReceipt({
      ...receipt,
      reference_id: refId || receipt?.reference_id,
      ref_number: refNum,
      ref_subject: parentRef?.subject,
      survey_serial_no: survey?.serial_no,
      survey_no: survey?.survey_no,
      owner_name: survey?.owner_name,
      neighborhood: survey?.neighborhood,
      land_type: survey?.land_type,
      sketch_area: survey?.sketch_area,
    });
    setReceiptEditMode(false);
  };

  const openReceiptEditMode = () => {
    if (!selectedReceipt) return;
    const storedDetails = parseReceiptDetails(selectedReceipt.details);
    setEditReceiptNo(selectedReceipt.receipt_no || '');
    setEditReceiptAmount(String(selectedReceipt.amount ?? ''));
    setEditReceiptStatus(selectedReceipt.status === 'Credit' ? 'Credit' : 'Paid');
    setEditReceiptMode(selectedReceipt.payment_mode || 'Cash');
    setEditReceiptDate(selectedReceipt.payment_date ? String(selectedReceipt.payment_date).slice(0, 10) : '');
    setEditReceiptDetails(storedDetails.details);
    setReceiptEditMode(true);
  };

  const handleSaveReceiptEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAction(profile, 'payment.edit')) return void showAlert('Oggolaansho', 'Ma lihid Payment Edit permission.', 'warning');
    if (!selectedReceipt) return;
    setSavingReceiptEdit(true);
    try {
      const storedDetails = parseReceiptDetails(selectedReceipt.details);
      const payload = {
        receipt_no: editReceiptNo,
        amount: parseFloat(editReceiptAmount) || 0,
        status: editReceiptStatus,
        payment_mode: editReceiptMode,
        payment_date: editReceiptDate,
        details: serializeReceiptDetails(storedDetails.payerName || selectedReceipt.owner_name || '', editReceiptDetails, storedDetails.refNumbers),
      };
      const { error } = await supabase.from('receipts').update(payload).eq('id', selectedReceipt.id);
      if (error) throw error;

      showAlert('Guul', 'Resiidhka si guul leh ayaa loo cusboonaysiiyey!', 'success');
      setSelectedReceipt(null);
      setReceiptEditMode(false);
      fetchData();
    } catch (err) {
      console.error('Error updating receipt:', err);
      showAlert('Cillad', err instanceof Error ? err.message : 'Cillad ayaa dhacday xilliga cusboonaysiinta.', 'error');
    } finally {
      setSavingReceiptEdit(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!canAction(profile, 'payment.delete')) return void showAlert('Oggolaansho', 'Ma lihid Payment Delete permission.', 'warning');
    if (!selectedReceipt) return;
    const isConfirmed = await showConfirm(
      'Tirtir Resiidhka',
      `Ma hubtaa inaad tirtirto resiidhka "${selectedReceipt.receipt_no}"? Tallaabadan waxay saameyn doontaa xisaabinta guud (revenue/credit). Lama soo celin karo.`,
      'Haa, tirtir',
      'Maya'
    );
    if (!isConfirmed) return;

    setDeletingReceipt(true);
    try {
      const { data: deleted, error } = await supabase.from('receipts').delete().eq('id', selectedReceipt.id).select('id, amount, status').maybeSingle();
      if (error) throw error;
      if (!deleted) throw new Error('Resiidhka lama tirtirin. Hubi oggolaanshahaaga ama dib u cusboonaysii liiska.');
      dataRevision.current += 1;
      setReferencesWithReceipts(current => current.map(reference => ({ ...reference,
        receipts: (reference.receipts || []).filter((receipt: Receipt) => receipt.id !== deleted.id),
      })));
      if (deleted.status === 'Paid') setTotalRevenue(current => current - Number(deleted.amount));
      if (deleted.status === 'Credit') setTotalCredit(current => current - Number(deleted.amount));
      showAlert('Guul', 'Resiidhka waa la tirtiray.', 'success');
      setSelectedReceipt(null);
      setReceiptEditMode(false);
    } catch (err) {
      console.error('Error deleting receipt:', err);
      showAlert('Cillad', err instanceof Error ? err.message : 'Tirtiridda wuu fashilmay.', 'error');
    } finally {
      setDeletingReceipt(false);
    }
  };

  const handleDownloadReceiptPdf = async () => {
    if (!selectedReceipt || downloadingReceipt) return;
    setDownloadingReceipt(true);

    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const amount = Number(selectedReceipt.amount || 0);
      const amountText = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const receiptNo = String(selectedReceipt.receipt_no || '-');
      const refNo = String(selectedReceipt.ref_number || '-');
      const storedReceiptDetails = parseReceiptDetails(selectedReceipt.details);
      const displayRefNumbers = storedReceiptDetails.refNumbers || refNo;
      const issueDateValue = selectedReceipt.payment_date ? new Date(selectedReceipt.payment_date) : new Date();
      const paymentDate = issueDateValue.toLocaleDateString('en-GB');
      const dueDateValue = new Date(issueDateValue);
      dueDateValue.setDate(dueDateValue.getDate() + 30);
      const dueDate = dueDateValue.toLocaleDateString('en-GB');
      const paymentMode = String(selectedReceipt.payment_mode || 'Cash');
      const normalizedStatus = String(selectedReceipt.status || '').trim().toLowerCase();
      const paid = !['credit', 'deyn', 'unpaid', 'invoice'].includes(normalizedStatus);
      const documentTitle = paid ? 'Receipt' : 'Invoice';
      const safe = (value: unknown) => String(value ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const qrCode = await QRCode.toDataURL([
        `Marwaazpn ${documentTitle}: ${receiptNo}`,
        `Reference: ${displayRefNumbers}`,
        `Amount: $${amountText}`,
        `Status: ${paid ? 'Paid' : 'Credit'}`,
        `Date: ${paymentDate}`,
      ].join('\n'), { width: 220, margin: 1, errorCorrectionLevel: 'M' });

      const purpose = safe(storedReceiptDetails.details || selectedReceipt.ref_subject || 'Bixinta adeegga');
      const payer = safe(storedReceiptDetails.payerName || selectedReceipt.owner_name || 'Macmiilka');
      const location = safe(selectedReceipt.neighborhood || '-');
      const landType = safe(selectedReceipt.land_type || '-');
      const area = safe(selectedReceipt.sketch_area || '-');
      // Same-origin transparent PNG avoids cross-origin canvas failures during export.
      const logo = '/icon.png';
      const orgSo = safe(settings.org_name_so || 'Nootaayo Marwaaz');
      const orgEn = safe(settings.org_name_en || 'Marwaaz Public Notary');
      const checked = '<span style="font-family:Arial,sans-serif;font-weight:900;">&#9745;</span>';
      const unchecked = '<span style="font-family:Arial,sans-serif;">&#9744;</span>';

      if (paid) {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const raw = (value: unknown, fallback = '-') => String(value || fallback);
        const rawPayer = raw(storedReceiptDetails.payerName || selectedReceipt.owner_name, 'Macmiilka');
        const rawPlotNo = raw(selectedReceipt.survey_no || selectedReceipt.survey_serial_no);
        const receiptDetails = raw(storedReceiptDetails.details, '');
        const autoGeneratedDetails = /^Bixinta\s+(deynta|lacagta)\s*:/i.test(receiptDetails);
        const rawPurpose = raw(autoGeneratedDetails ? selectedReceipt.ref_subject : (receiptDetails || selectedReceipt.ref_subject), 'Adeegga Nootaayada');
        const rawLocation = raw(selectedReceipt.neighborhood);
        const rawArea = raw(selectedReceipt.sketch_area);
        const rawLandType = raw(selectedReceipt.land_type);

        const logoData = await fetch(logo)
          .then((response) => response.blob())
          .then((blob) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }));

        const logoGrayData = await new Promise<string>((resolve) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) return resolve(logoData);
            context.filter = 'grayscale(1) contrast(1.1)';
            context.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          image.onerror = () => resolve(logoData);
          image.src = logoData;
        });

        const amountInWords = (value: number) => {
          const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
          const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
          const whole = Math.floor(Math.max(0, value));
          const underThousand = (number: number): string => {
            if (number < 20) return ones[number];
            if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? `-${ones[number % 10]}` : ''}`;
            return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${underThousand(number % 100)}` : ''}`;
          };
          let words = whole < 1000
            ? underThousand(whole)
            : `${underThousand(Math.floor(whole / 1000))} Thousand${whole % 1000 ? ` ${underThousand(whole % 1000)}` : ''}`;
          if (!words) words = 'Zero';
          const cents = Math.round((value - whole) * 100);
          return `${words} Dollar${whole === 1 ? '' : 's'}${cents ? ` and ${cents}/100` : ''}`;
        };

        const drawReceiptCopy = (startY: number, copy: boolean) => {
          const ink: [number, number, number] = copy ? [17, 24, 39] : [23, 74, 156];
          const red: [number, number, number] = copy ? [17, 24, 39] : [220, 38, 38];
          pdf.setTextColor(17, 24, 39);
          pdf.addImage(copy ? logoGrayData : logoData, 'PNG', 17, startY + 1, 24, 24);
          pdf.setFillColor(copy ? 248 : 255, copy ? 248 : 255, copy ? 248 : 255);
          pdf.setDrawColor(232, 232, 232);
          pdf.rect(51, startY + 4, 91, 18, 'FD');
          pdf.setFont('times', 'bold');
          pdf.setFontSize(13);
          pdf.text(raw(settings.org_name_so, 'Nootaayo Marwaaz'), 96.5, startY + 11, { align: 'center' });
          pdf.setFont('times', 'normal');
          pdf.setFontSize(10);
          pdf.text(raw(settings.org_name_en, 'Marwaaz Public Notary'), 96.5, startY + 17, { align: 'center' });
          if (copy) {
            pdf.setDrawColor(17, 24, 39);
            pdf.setLineWidth(0.45);
            pdf.roundedRect(166, startY + 5, 29, 11, 1.5, 1.5);
            pdf.setFont('times', 'bold');
            pdf.setFontSize(10);
            pdf.text('COPY', 180.5, startY + 12, { align: 'center' });
          }

          pdf.setDrawColor(17, 24, 39);
          pdf.setLineWidth(0.35);
          pdf.line(15, startY + 28, 195, startY + 28);
          pdf.setTextColor(...ink);
          pdf.setFont('times', 'bold');
          pdf.setFontSize(16);
          pdf.text('Receipt', 15, startY + 40);
          pdf.setFontSize(12);
          const underlinedValue = (
            label: string,
            value: string,
            x: number,
            y: number,
            maxWidth: number,
            valueColor: [number, number, number] = [17, 24, 39],
          ) => {
            pdf.setTextColor(17, 24, 39);
            pdf.text(label, x, y);
            const valueX = x + pdf.getTextWidth(label) + 1.5;
            const availableWidth = Math.max(5, maxWidth - (valueX - x));
            const displayValue = pdf.splitTextToSize(value || '-', availableWidth)[0];
            pdf.setTextColor(...valueColor);
            pdf.text(displayValue, valueX, y);
            const lineWidth = Math.min(pdf.getTextWidth(displayValue) + 1, availableWidth);
            pdf.setDrawColor(...valueColor);
            pdf.setLineWidth(0.25);
            pdf.line(valueX, y + 1.2, valueX + lineWidth, y + 1.2);
            pdf.setTextColor(17, 24, 39);
          };

          underlinedValue('Receipt No:', receiptNo, 132, startY + 39, 63, red);
          underlinedValue('Magaca Bixiyaha (Payer Name):', rawPayer, 15, startY + 50, 180);
          underlinedValue('Sumad (Ref):', displayRefNumbers, 15, startY + 59, 88);
          underlinedValue('Payment Date:', paymentDate, 112, startY + 59, 83);
          underlinedValue('Paid Via:', paymentMode, 15, startY + 68, 88);
          underlinedValue('Faahfaahinta (Details):', rawPurpose, 15, startY + 77, 180);

          pdf.setDrawColor(17, 24, 39);
          pdf.line(15, startY + 94, 76, startY + 94);
          pdf.setFont('times', 'normal');
          pdf.setFontSize(9.5);
          pdf.text('Saxiixa Lacag Qabtaha', 15, startY + 100);
          pdf.addImage(qrCode, 'PNG', 168, startY + 81, 25, 25);
        };

        drawReceiptCopy(7, false);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.setDrawColor(17, 24, 39);
        pdf.line(12, 128, 198, 128);
        pdf.setLineDashPattern([], 0);
        drawReceiptCopy(134, true);
        pdf.save(`Receipt_${receiptNo.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`);
        return;
      }

      if (!paid) {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const raw = (value: unknown, fallback = '-') => String(value || fallback);
        const invoicePayer = raw(storedReceiptDetails.payerName || selectedReceipt.owner_name, 'Macmiilka');
        const invoicePlotNo = raw(selectedReceipt.survey_no || selectedReceipt.survey_serial_no);
        const invoicePurpose = raw(selectedReceipt.ref_subject || storedReceiptDetails.details, 'Adeegga Nootaayada');
        const invoiceLocation = raw(selectedReceipt.neighborhood);
        const invoiceArea = raw(selectedReceipt.sketch_area);
        const invoiceLandType = raw(selectedReceipt.land_type);
        const logoData = await fetch(logo)
          .then((response) => response.blob())
          .then((blob) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }));
        const logoGrayData = await new Promise<string>((resolve) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) return resolve(logoData);
            context.filter = 'grayscale(1) contrast(1.1)';
            context.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          image.onerror = () => resolve(logoData);
          image.src = logoData;
        });

        const drawInvoiceCopy = (startY: number, copy: boolean) => {
          const primary: [number, number, number] = copy ? [17, 24, 39] : [23, 74, 156];
          const accent: [number, number, number] = copy ? [17, 24, 39] : [220, 38, 38];
          pdf.addImage(copy ? logoGrayData : logoData, 'PNG', 16, startY + 1, 21, 21);
          pdf.setTextColor(17, 24, 39);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.text(raw(settings.org_name_so, 'Nootaayo Marwaaz'), 105, startY + 9, { align: 'center' });
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.text(raw(settings.org_name_en, 'Marwaaz Public Notary'), 105, startY + 14.5, { align: 'center' });
          if (copy) {
            pdf.setDrawColor(17, 24, 39);
            pdf.roundedRect(167, startY + 4, 27, 10, 1.5, 1.5);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text('COPY', 180.5, startY + 10.5, { align: 'center' });
          }
          pdf.setDrawColor(17, 24, 39);
          pdf.line(15, startY + 25, 195, startY + 25);
          pdf.setTextColor(...primary);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(19);
          pdf.text('INVOICE', 15, startY + 38);
          pdf.setTextColor(17, 24, 39);
          pdf.setFontSize(8.5);
          pdf.text('Invoice No:', 137, startY + 36);
          pdf.setTextColor(...accent);
          pdf.text(receiptNo, 158, startY + 36);
          pdf.setTextColor(17, 24, 39);
          const drawField = (label: string, value: string, x: number, y: number, width: number) => {
            pdf.setFillColor(copy ? 247 : 248, copy ? 247 : 250, copy ? 247 : 252);
            pdf.setDrawColor(copy ? 80 : 203, copy ? 80 : 213, copy ? 80 : 225);
            pdf.roundedRect(x, y, width, 18, 1.5, 1.5, 'FD');
            pdf.setTextColor(100, 116, 139);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.text(label.toUpperCase(), x + 4, y + 6);
            pdf.setTextColor(17, 24, 39);
            pdf.setFontSize(9.5);
            pdf.text(pdf.splitTextToSize(value || '-', width - 8)[0], x + 4, y + 13);
          };
          drawField('Magaca Bixiyaha (Payer Name)', invoicePayer, 15, startY + 48, 180);
          drawField('Receipt No', receiptNo, 15, startY + 70, 56);
          drawField('Sumad (Ref)', displayRefNumbers, 76, startY + 70, 56);
          drawField('Payment Date', paymentDate, 137, startY + 70, 58);
          drawField('Paid Via', paymentMode, 15, startY + 92, 56);
          drawField('Faahfaahinta (Details)', storedReceiptDetails.details || invoicePurpose, 76, startY + 92, 119);
          pdf.addImage(qrCode, 'PNG', 170, startY + 115, 20, 20);
        };

        drawInvoiceCopy(5, false);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.setDrawColor(17, 24, 39);
        pdf.line(12, 149, 198, 149);
        pdf.setLineDashPattern([], 0);
        drawInvoiceCopy(154, true);
        pdf.save(`Invoice_${receiptNo.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`);
        return;
      }

      const receiptCopy = (copyLabel: string) => `
        <section style="height:126mm;box-sizing:border-box;position:relative;font-family:Georgia,'Times New Roman',serif;color:#111827;">
          ${copyLabel === 'COPY' ? '<div style="position:absolute;top:0;right:0;z-index:5;border:2px solid #111827;border-radius:4px;padding:4px 12px;background:#ffffff;color:#111827;font:900 12px Arial,sans-serif;letter-spacing:1.5px;">COPY</div>' : ''}
          <div style="display:grid;grid-template-columns:27mm 1fr 27mm;align-items:center;gap:5mm;">
            <img src="${logo}" alt="Logo" style="width:25mm;height:25mm;object-fit:contain;${copyLabel === 'COPY' ? 'filter:grayscale(1) contrast(1.15);' : ''}" />
            <div style="text-align:center;">
              <div style="font-size:16px;font-weight:800;line-height:1.2;">${orgSo}</div>
              <div style="font-size:12px;margin-top:2px;">${orgEn}</div>
            </div>
            <div></div>
          </div>
          <div style="border-top:1px solid #111827;margin:4mm 0 4mm;"></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8mm;">
            <div style="font-size:22px;font-weight:800;color:${copyLabel === 'COPY' ? '#111827' : '#174a9c'};">${documentTitle}</div>
            <div style="font-size:13px;font-weight:800;">${documentTitle} No: <span style="color:${copyLabel === 'COPY' ? '#111827' : '#dc2626'};">${safe(receiptNo)}</span> &nbsp; Ref No: <span style="color:${copyLabel === 'COPY' ? '#111827' : '#dc2626'};">${safe(refNo)}</span></div>
          </div>
          <div style="font-size:12.5px;font-weight:700;line-height:2.05;margin-top:2mm;">
            <div style="display:flex;justify-content:space-between;gap:8mm;"><span>Taariikh: <u>${safe(paymentDate)}</u></span><span>${paid ? 'Laga qabtay' : 'Lagu leeyahay'} Md./Marwo: <u>${payer}</u></span></div>
            <div>Ujeedka: ${paid ? checked : unchecked} Bixin &nbsp;&nbsp; ${!paid ? checked : unchecked} Deyn &nbsp;&nbsp; Faahfaahin: <u>${purpose}</u></div>
            <div style="display:flex;flex-wrap:wrap;gap:2mm 9mm;"><span>Reference: <u>${safe(refNo)}</u></span><span>Goobta: <u>${location}</u></span><span>Bedka: <u>${area}</u></span><span>Isticmaalka: <u>${landType}</u></span></div>
            <div style="display:flex;justify-content:space-between;gap:8mm;"><span>${paid ? 'Lacagta la bixiyey' : 'Lacagta deynta'}: <u>$ ${amountText}</u></span><span>Xaaladda: <u>${paid ? 'Paid / La bixiyey' : 'Credit / Deyn'}</u></span></div>
            <div>Habka lacag bixinta: ${paymentMode === 'Cash' ? checked : unchecked} Cash &nbsp;&nbsp; ${paymentMode !== 'Cash' ? checked : unchecked} Mobile &nbsp;&nbsp; Habka: <u>${safe(paymentMode)}</u></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 30mm;gap:12mm;align-items:end;margin-top:5mm;">
            <div><div style="border-top:1px solid #111827;padding-top:2px;font-size:11px;">Saxiixa Lacag Qabtaha</div></div>
            <div></div>
            <img src="${qrCode}" alt="Receipt QR" style="width:28mm;height:28mm;display:block;" />
          </div>
        </section>`;

      const invoiceCopy = (copyLabel: string) => `
        <section style="height:126mm;box-sizing:border-box;position:relative;font-family:Arial,sans-serif;color:#111827;">
          ${copyLabel === 'COPY' ? '<div style="position:absolute;top:0;right:0;z-index:5;border:2px solid #111827;border-radius:4px;padding:4px 12px;background:#ffffff;color:#111827;font:900 12px Arial,sans-serif;letter-spacing:1.5px;">COPY</div>' : ''}
          <div style="display:grid;grid-template-columns:27mm 1fr 27mm;align-items:center;gap:5mm;">
            <img src="${logo}" alt="Logo" style="width:25mm;height:25mm;object-fit:contain;${copyLabel === 'COPY' ? 'filter:grayscale(1) contrast(1.15);' : ''}" />
            <div style="text-align:center;"><div style="font-size:16px;font-weight:900;">${orgSo}</div><div style="font-size:11px;margin-top:3px;">${orgEn}</div></div>
            <div></div>
          </div>
          <div style="border-top:2px solid #111827;margin:3mm 0 3mm;"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;">
            <div style="font-size:24px;font-weight:900;color:${copyLabel === 'COPY' ? '#111827' : '#174a9c'};letter-spacing:0.5px;">INVOICE</div>
            <div style="text-align:right;font-size:10.5px;line-height:1.6;"><div><strong>Invoice No:</strong> <span style="color:${copyLabel === 'COPY' ? '#111827' : '#dc2626'};font-weight:900;">${safe(receiptNo)}</span></div><div><strong>Issue Date:</strong> ${safe(paymentDate)}</div><div><strong>Due Date:</strong> ${safe(dueDate)}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:8mm;margin-top:3mm;font-size:10px;">
            <div style="border-left:4px solid ${copyLabel === 'COPY' ? '#111827' : '#174a9c'};background:#f8fafc;padding:3mm 4mm;">
              <div style="font-size:8px;font-weight:900;letter-spacing:1px;color:#64748b;margin-bottom:2mm;">LAGU LEEYAHAY / BILL TO</div>
              <div style="font-size:12px;font-weight:900;">${payer}</div><div style="margin-top:1mm;">Goobta: ${location}</div>
            </div>
            <div style="background:#f8fafc;padding:3mm 4mm;line-height:1.7;"><div><strong>Reference:</strong> ${safe(refNo)}</div><div><strong>Bedka:</strong> ${area}</div><div><strong>Isticmaalka:</strong> ${landType}</div></div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:4mm;font-size:10px;">
            <thead><tr style="background:${copyLabel === 'COPY' ? '#111827' : '#174a9c'};color:#ffffff;"><th style="padding:2.5mm;text-align:left;">ADEEGGA / DESCRIPTION</th><th style="padding:2.5mm;width:13mm;">QTY</th><th style="padding:2.5mm;width:24mm;text-align:right;">RATE</th><th style="padding:2.5mm;width:26mm;text-align:right;">AMOUNT</th></tr></thead>
            <tbody><tr><td style="padding:3mm 2.5mm;border:1px solid #cbd5e1;font-weight:700;">${purpose}</td><td style="padding:3mm 2.5mm;border:1px solid #cbd5e1;text-align:center;">1</td><td style="padding:3mm 2.5mm;border:1px solid #cbd5e1;text-align:right;">$${amountText}</td><td style="padding:3mm 2.5mm;border:1px solid #cbd5e1;text-align:right;font-weight:900;">$${amountText}</td></tr></tbody>
          </table>
          <div style="display:grid;grid-template-columns:1fr 57mm;gap:10mm;margin-top:3mm;align-items:start;">
            <div style="font-size:9px;line-height:1.6;"><strong>Terms / Shuruudaha:</strong><br/>Lacagtan waa deyn wali taagan. Fadlan bixi ugu dambayn ${safe(dueDate)}.<br/><span style="color:#64748b;">Invoice-kan ma aha caddeyn lacag-bixin.</span></div>
            <div style="font-size:10px;"><div style="display:flex;justify-content:space-between;padding:2mm 0;border-bottom:1px solid #cbd5e1;"><span>Subtotal</span><strong>$${amountText}</strong></div><div style="display:flex;justify-content:space-between;padding:2.5mm;background:${copyLabel === 'COPY' ? '#e5e7eb' : '#e8f0fb'};font-size:12px;"><strong>AMOUNT DUE</strong><strong>$${amountText}</strong></div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 30mm;gap:12mm;align-items:end;margin-top:3mm;"><div style="font-size:9px;color:#64748b;">Mahadsanid / Thank you<br/><span style="color:#111827;font-weight:700;">Authorized by ${orgSo}</span></div><img src="${qrCode}" alt="Invoice QR" style="width:25mm;height:25mm;display:block;" /></div>
        </section>`;

      const documentCopy = (copyLabel: string) => paid ? receiptCopy(copyLabel) : invoiceCopy(copyLabel);

      const printContainer = document.createElement('div');
      // The node must be painted by Chrome while html2canvas captures it. Moving it
      // off-screen, hiding it, or putting it behind the page can produce a white PDF.
      printContainer.style.cssText = 'width:210mm;min-height:297mm;background:#fff;padding:14mm 16mm 10mm;box-sizing:border-box;position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;overflow:hidden;color-scheme:light;';
      printContainer.setAttribute('aria-hidden', 'true');
      printContainer.innerHTML = `
        ${documentCopy('ORIGINAL')}
        <div style="height:9mm;border-top:2px dashed #111827;box-sizing:border-box;"></div>
        ${documentCopy('COPY')}
      `;
      document.body.appendChild(printContainer);

      await Promise.all(Array.from(printContainer.querySelectorAll('img')).map(async (image) => {
        if (image.complete) return;
        try {
          await image.decode();
        } catch {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }
      }));
      await document.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      try {
        await html2pdf().set({
          margin: 0,
          filename: `${documentTitle}_${receiptNo.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0,
            windowWidth: printContainer.scrollWidth,
            windowHeight: printContainer.scrollHeight,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        }).from(printContainer).save();
      } finally {
        printContainer.remove();
      }
    } catch (error) {
      console.error('Receipt PDF download failed:', error);
      showAlert('Cillad', 'Receipt PDF-ga lama soo dejin karin. Fadlan mar kale isku day.', 'error');
    } finally {
      setDownloadingReceipt(false);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-3.5 md:space-y-6 text-slate-800">
      
      {/* Stats Summary Cards */}
      {/* Desktop Version */}
      <div className="hidden md:grid grid-cols-4 gap-6">
        {/* Revenue */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl border border-emerald-100">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Revenue (Paid)</span>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">
              ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Credit */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 text-amber-600 p-4 rounded-2xl border border-amber-100">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Credit (Deyn)</span>
            <div className="text-2xl font-black text-amber-600 mt-0.5">
              ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
          <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-100">
            <TrendingDown className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Expenses</span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">
              ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
          <div className="bg-teal-50 text-teal-600 p-4 rounded-2xl border border-teal-100">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Net Profit</span>
            <div className={`text-2xl font-black mt-0.5 ${totalRevenue - totalExpenses >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
              ${(totalRevenue - totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Version (2x2 Grid) */}
      <div className="md:hidden grid grid-cols-2 gap-3.5">
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Revenue (Paid)</span>
          <div className="text-sm font-black text-emerald-600 mt-0.5 truncate">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Credit (Deyn)</span>
          <div className="text-sm font-black text-amber-600 mt-0.5 truncate">
            ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Expenses</span>
          <div className="text-sm font-black text-rose-600 mt-0.5 truncate">
            ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Net Profit</span>
          <div className={`text-sm font-black mt-0.5 truncate ${totalRevenue - totalExpenses >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
            ${(totalRevenue - totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 max-w-md">
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'payments'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Client Payments
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'expenses'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          Office Expenses
        </button>
      </div>

      {/* Search / Sort / Group toolbar */}
      <div className={`${showMobileSearch ? 'flex' : 'hidden md:flex'} flex-col gap-2 md:flex-row md:items-center bg-white border border-slate-100 rounded-2xl md:rounded-3xl p-3 shadow-sm w-full`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          {activeTab === 'payments' ? (
            <input
              type="text"
              value={receiptSearchQuery}
              onChange={(e) => setReceiptSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              placeholder="Raadi Sumad / Ujeedo..."
            />
          ) : (
            <input
              type="text"
              value={expenseSearchQuery}
              onChange={(e) => setExpenseSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              placeholder="Raadi Description..."
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {activeTab === 'payments' ? (
            <>
              <select
                value={receiptStatusFilter}
                onChange={(e) => setReceiptStatusFilter(e.target.value as typeof receiptStatusFilter)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="">Status (All)...</option>
                <option value="Paid">Paid</option>
                <option value="Credit">Credit</option>
                <option value="Unpaid">Unpaid</option>
              </select>
              <select
                value={receiptCreatorFilter}
                onChange={(e) => setReceiptCreatorFilter(e.target.value)}
                aria-label="Filter payments by Record Creator"
                className="max-w-52 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="">Record Creator: All</option>
                {paymentCreators.map((creator) => <option key={creator} value={creator}>{resolveCreatorName(creator, profileNames) || creator}</option>)}
              </select>
              <select
                value={receiptSortBy}
                onChange={(e) => setReceiptSortBy(e.target.value as typeof receiptSortBy)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="newest">Sort: Newest first</option>
                <option value="oldest">Sort: Oldest first</option>
              </select>
            </>
          ) : (
            <><select
              value={expenseCreatorFilter}
              onChange={(e) => setExpenseCreatorFilter(e.target.value)}
              aria-label="Filter expenses by Record Creator"
              className="max-w-52 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
            >
              <option value="">Record Creator: All</option>
              {expenseCreators.map((creator) => <option key={creator} value={creator}>{resolveCreatorName(creator, profileNames) || creator}</option>)}
            </select><select
              value={expenseSortBy}
              onChange={(e) => setExpenseSortBy(e.target.value as typeof expenseSortBy)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
            >
              <option value="newest">Sort: Newest first</option>
              <option value="oldest">Sort: Oldest first</option>
              <option value="amount_high">Sort: Amount (high–low)</option>
            </select></>
          )}
        </div>

        <div className="flex gap-2">
          {activeTab === 'payments' ? (
            <>
              <select
                value={receiptGroupBy}
                onChange={(e) => setReceiptGroupBy(e.target.value as typeof receiptGroupBy)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="none">No group</option>
                <option value="date">Group: Date</option>
              </select>
              {receiptGroupBy !== 'none' && (
                <select
                  value={receiptGroupAggregate}
                  onChange={(e) => setReceiptGroupAggregate(e.target.value as typeof receiptGroupAggregate)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="none">Aggregate: None</option>
                  <option value="count">Aggregate: Count</option>
                  <option value="sum">Aggregate: Sum</option>
                </select>
              )}
            </>
          ) : (
            <>
              <select
                value={expenseGroupBy}
                onChange={(e) => setExpenseGroupBy(e.target.value as typeof expenseGroupBy)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="none">No group</option>
                <option value="date">Group: Date</option>
              </select>
              {expenseGroupBy !== 'none' && (
                <select
                  value={expenseGroupAggregate}
                  onChange={(e) => setExpenseGroupAggregate(e.target.value as typeof expenseGroupAggregate)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="none">Aggregate: None</option>
                  <option value="count">Aggregate: Count</option>
                  <option value="sum">Aggregate: Sum</option>
                </select>
              )}
            </>
          )}
        </div>
      </div>

      {/* Table & Dashboard view */}
      {loading ? (
        <ListLoadingSkeleton />
      ) : activeTab === 'payments' ? (
        /* Client Payments list */
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                    <th className="px-4 py-4 text-center w-12">
                      <input
                        type="checkbox"
                        checked={
                          sortedReferencesWithReceipts.length > 0 &&
                          sortedReferencesWithReceipts.filter(r => {
                            const latestRec = r.receipts && r.receipts[0];
                            return !latestRec || latestRec.status !== 'Paid';
                          }).every(r => selectedRefIds.includes(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const unpaidIds = sortedReferencesWithReceipts
                              .filter(r => {
                                const latestRec = r.receipts && r.receipts[0];
                                return !latestRec || latestRec.status !== 'Paid';
                              })
                              .map(r => r.id);
                            setSelectedRefIds(unpaidIds);
                          } else {
                            setSelectedRefIds([]);
                          }
                        }}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer h-4 w-4"
                      />
                    </th>
                    <th className="px-6 py-4">Ref No.</th>
                    <th className="px-6 py-4">Ujeedo (Subject)</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-center">Status / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {(groupedReferencesWithReceipts ?? [{ key: 'all', label: '', items: sortedReferencesWithReceipts }]).map((group) => (
                    <React.Fragment key={group.key}>
                      {receiptGroupBy !== 'none' && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/70 px-6 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            {group.label}
                          </td>
                        </tr>
                      )}
                      {group.items.map((ref) => {
                        const receipts = ref.receipts || [];
                        const paidAmount = receipts
                          .filter((r: any) => r.status === 'Paid')
                          .reduce((sum: number, r: any) => sum + parseFloat(r.amount.toString()), 0);
                        const creditAmount = receipts
                          .filter((r: any) => r.status === 'Credit')
                          .reduce((sum: number, r: any) => sum + parseFloat(r.amount.toString()), 0);

                        const hasCredit = creditAmount > 0;
                        const isPaid = !hasCredit && paidAmount > 0;
                        const activeReceipt = receipts.find((r: any) => r.status === 'Credit') || receipts[0];

                        return (
                          <tr
                            key={ref.id}
                            onClick={() => activeReceipt && openReceiptDetails(activeReceipt, ref.ref_number)}
                            className={`hover:bg-slate-50/80 transition-all ${activeReceipt ? 'cursor-pointer' : ''}`}
                          >
                            <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {!isPaid && (
                                <input
                                  type="checkbox"
                                  checked={selectedRefIds.includes(ref.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRefIds(prev => [...prev, ref.id]);
                                    } else {
                                      setSelectedRefIds(prev => prev.filter(id => id !== ref.id));
                                    }
                                  }}
                                  className="rounded border-slate-300 text-teal-650 focus:ring-teal-500 cursor-pointer h-4 w-4"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 font-black text-teal-600">
                              {ref.ref_number}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {ref.subject}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {ref.issue_date ? new Date(ref.issue_date).toLocaleDateString('so-SO') : '-'}
                            </td>
                            <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {isPaid ? (
                                <span
                                  className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 px-3.5 py-1.5 rounded-full font-extrabold uppercase text-[10px] cursor-pointer"
                                  onClick={() => openReceiptDetails(activeReceipt, ref.ref_number)}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Paid (${paidAmount.toFixed(2)})
                                </span>
                              ) : hasCredit ? (
                                <div className="flex items-center justify-center gap-2">
                                  <div className="flex flex-col items-end">
                                    <span
                                      className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/60 px-3 py-1 rounded-full font-extrabold uppercase text-[10px] cursor-pointer"
                                      onClick={() => openReceiptDetails(activeReceipt, ref.ref_number)}
                                    >
                                      <AlertCircle className="h-3 w-3" /> Deyn: ${creditAmount.toFixed(2)}
                                    </span>
                                    {paidAmount > 0 && (
                                      <span className="text-[9px] text-emerald-600 font-bold mt-0.5">
                                        (Bixiyey: ${paidAmount.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                  {canAction(profile, 'payment.pay_debt') ? (<button
                                    onClick={() => openPayDebtDialog(ref)}
                                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] py-1.5 px-3 rounded-xl shadow-sm cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                                  >
                                    Pay Debt
                                  </button>) : null}
                                </div>
                              ) : (
                                (canAction(profile, 'payment.create') ? (<button
                                  onClick={() => openPayDialog(ref.id, ref.ref_number, ref.subject)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1.5 px-4 rounded-xl shadow-sm cursor-pointer transition-colors"
                                >
                                  Pay Now
                                </button>) : null)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile List View */}
          <div className="md:hidden">
            {sortedReferencesWithReceipts.length > 0 && (
              <div className="border-b border-slate-200 px-1 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                Tixraacyo &amp; Lacag Bixinno
              </div>
            )}
            {sortedReferencesWithReceipts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">
                Tixraacyo lama hayo.
              </div>
            ) : (
              <>
              {(groupedReferencesWithReceipts ?? [{ key: 'all', label: '', items: sortedReferencesWithReceipts }]).map((group) => (
              <div key={group.key}>
                {receiptGroupBy !== 'none' && (
                  <div className="px-4 pb-1.5 pt-3 text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                    {group.label}
                  </div>
                )}
                <div className="divide-y divide-slate-200/80">
              {group.items.map((ref) => {
                const receipts = ref.receipts || [];
                const paidAmount = receipts
                  .filter((r: any) => r.status === 'Paid')
                  .reduce((sum: number, r: any) => sum + parseFloat(r.amount.toString()), 0);
                const creditAmount = receipts
                  .filter((r: any) => r.status === 'Credit')
                  .reduce((sum: number, r: any) => sum + parseFloat(r.amount.toString()), 0);
                
                const hasCredit = creditAmount > 0;
                const isPaid = !hasCredit && paidAmount > 0;
                const activeReceipt = receipts.find((r: any) => r.status === 'Credit') || receipts[0];

                return (
                  <div
                    key={ref.id}
                    onClick={() => activeReceipt && openReceiptDetails(activeReceipt, ref.ref_number)}
                    className={`px-1 py-4 flex flex-col gap-3 transition-colors hover:bg-slate-50/80 ${
                      activeReceipt ? 'cursor-pointer active:bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isPaid && (
                          <input
                            type="checkbox"
                            checked={selectedRefIds.includes(ref.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRefIds(prev => [...prev, ref.id]);
                              } else {
                                setSelectedRefIds(prev => prev.filter(id => id !== ref.id));
                              }
                            }}
                            className="rounded border-slate-300 text-teal-650 focus:ring-teal-500 cursor-pointer h-3.5 w-3.5"
                          />
                        )}
                        <span className="font-black text-xs text-teal-650">{ref.ref_number}</span>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-full font-black uppercase text-[9px] cursor-pointer" onClick={() => openReceiptDetails(activeReceipt, ref.ref_number)}>
                            <CheckCircle2 className="h-2.5 w-2.5" /> Paid (${paidAmount.toFixed(2)})
                          </span>
                        ) : hasCredit ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-black uppercase text-[9px] cursor-pointer" onClick={() => openReceiptDetails(activeReceipt, ref.ref_number)}>
                              <AlertCircle className="h-2.5 w-2.5" /> Deyn: ${creditAmount.toFixed(2)}
                            </span>
                            {canAction(profile, 'payment.pay_debt') ? (<button
                              onClick={() => openPayDebtDialog(ref)}
                              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-[9px] py-0.5 px-2 rounded-xl shadow-sm cursor-pointer transition-colors"
                            >
                              Pay Debt
                            </button>) : null}
                          </div>
                        ) : (
                          (canAction(profile, 'payment.create') ? (<button
                            onClick={() => openPayDialog(ref.id, ref.ref_number, ref.subject)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1 px-3.5 rounded-xl shadow-sm cursor-pointer transition-colors"
                          >
                            Pay Now
                          </button>) : null)
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-extrabold text-slate-800">{ref.subject}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {ref.issue_date ? new Date(ref.issue_date).toLocaleDateString('so-SO') : '-'}
                      </span>
                    </div>
                  </div>
                );
              })}
                </div>
              </div>
              ))}
              </>
            )}
          </div>
        </>
      ) : (
        /* Office Expenses list */
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h4 className="font-extrabold text-sm text-slate-700">Liiska Kharashyada (Expense List)</h4>
            {canAction(profile, 'expense.create') ? (<button
              onClick={openExpenseDialog}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm cursor-pointer transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </button>) : null}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                    <th className="px-6 py-4">S/N</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-center">Qty</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Created By</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {sortedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                        Kharashyo lama hayo.
                      </td>
                    </tr>
                  ) : (
                    (groupedExpenses ?? [{ key: 'all', label: '', items: sortedExpenses }]).map((group) => (
                      <React.Fragment key={group.key}>
                        {expenseGroupBy !== 'none' && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/70 px-6 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </td>
                          </tr>
                        )}
                        {group.items.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/80 transition-all">
                            <td className="px-6 py-4 font-black text-slate-400">
                              {expenseSerial.get(e.id)}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {e.description}
                              {e.expense_no && <span className="block text-[10px] font-black text-teal-600">{e.expense_no}</span>}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {e.expense_date ? new Date(e.expense_date).toLocaleDateString('so-SO') : '-'}
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-slate-700">
                              {e.qty}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-700">
                              ${parseFloat(e.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 font-black text-rose-600 text-sm">
                              ${parseFloat(e.total.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-150 text-slate-500 text-[10px] font-extrabold">
                                {e.created_by || 'Admin'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {canAction(profile, 'expense.edit') ? (<button
                                  onClick={() => openExpenseEditDialog(e)}
                                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>) : null}
                                {canAction(profile, 'expense.delete') ? (<button
                                  onClick={() => handleDeleteExpense(e)}
                                  disabled={deletingExpenseId === e.id}
                                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                  aria-label="Delete"
                                >
                                  {deletingExpenseId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile List View */}
          <div className="md:hidden">
            {sortedExpenses.length > 0 && (
              <div className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-slate-200 px-1 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                <span>#</span>
                <span>Description</span>
                <span>Total</span>
              </div>
            )}
            {sortedExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">
                Kharashyo lama hayo.
              </div>
            ) : (
              (groupedExpenses ?? [{ key: 'all', label: '', items: sortedExpenses }]).map((group) => (
                <div key={group.key}>
                  {expenseGroupBy !== 'none' && (
                    <div className="px-1 pb-1.5 pt-3 text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                      {group.label}
                    </div>
                  )}
                  <div className="divide-y divide-slate-200/80">
                    {group.items.map((e) => (
                      <div
                        key={e.id}
                        onClick={canAction(profile, 'expense.edit') ? () => openExpenseEditDialog(e) : undefined}
                        className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-1 py-3.5 cursor-pointer active:bg-slate-50"
                      >
                        <span className="truncate text-xs font-black text-slate-400">{expenseSerial.get(e.id)}</span>
                        <div className="min-w-0">
                          <h4 className="truncate text-xs font-extrabold text-slate-800">{e.description}</h4>
                          {e.expense_no && <p className="truncate text-[9px] font-black text-teal-600">{e.expense_no}</p>}
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-slate-500">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>{e.expense_date ? new Date(e.expense_date).toLocaleDateString('so-SO') : '-'}</span>
                            <span>•</span>
                            <span>{e.qty} × ${parseFloat(e.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="whitespace-nowrap text-xs font-black text-rose-600">
                            ${parseFloat(e.total.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                          {canAction(profile, 'expense.delete') ? (<button
                            onClick={(ev) => { ev.stopPropagation(); void handleDeleteExpense(e); }}
                            disabled={deletingExpenseId === e.id}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                            aria-label="Delete"
                          >
                            {deletingExpenseId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pay Modal (Create Receipt) */}
      {showPayModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="min-w-0 font-extrabold text-slate-800 flex items-center gap-2">
                <CreditCard className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="truncate">Diiwaangeli Resiidhka (Pay Receipt)</span>
              </h3>
              <button
                onClick={closePayDialog}
                className="shrink-0 text-slate-400 hover:text-slate-650 p-2 rounded-xl hover:bg-slate-105 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReceipt} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Receipt No</label>
                  <input
                    type="text"
                    readOnly
                    value={payReceiptNo}
                    placeholder="Waxaa la sameyn doonaa marka la kaydiyo..."
                    className="w-full rounded-xl bg-slate-100 border border-slate-200 px-4 py-3.5 text-sm text-slate-500 font-extrabold focus:outline-none placeholder:text-xs placeholder:font-semibold placeholder:normal-case"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Sumad (Ref)</label>
                  <input
                    type="text"
                    readOnly
                    value={payRefNumber}
                    className="w-full rounded-xl bg-slate-100 border border-slate-200 px-4 py-3.5 text-sm text-teal-600 font-extrabold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Magaca Bixiyaha (Payer Name)</label>
                <input
                  type="text"
                  required
                  value={payPayerName}
                  onChange={(e) => setPayPayerName(e.target.value)}
                  placeholder="Geli magaca qofka lacagta bixiyey"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Faahfaahin (Details)</label>
                <input
                  type="text"
                  required
                  value={payDetails}
                  onChange={(e) => setPayDetails(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Date</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
                {selectedRefIds.length === 1 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Lacagta (Amount USD)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={bulkAmounts[selectedRefIds[0]] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBulkAmounts(prev => ({
                          ...prev,
                          [selectedRefIds[0]]: val
                        }));
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                )}
              </div>

              {selectedRefIds.length > 1 && (
                <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                  <label className="block text-xs font-extrabold text-slate-500 uppercase">Qaybta Lacagaha ee References-ka</label>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {referencesWithReceipts.filter(r => selectedRefIds.includes(r.id)).map(ref => (
                      <div key={ref.id} className="flex justify-between items-center gap-4 bg-white border border-slate-200/60 p-3 rounded-xl shadow-sm">
                        <div className="text-xs">
                          <span className="font-black text-teal-650 block">{ref.ref_number}</span>
                          <span className="text-[10px] text-slate-450 font-semibold truncate block max-w-[180px]">{ref.subject}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-slate-405 font-extrabold">$</span>
                          <input
                            type="number"
                            required
                            step="0.01"
                            value={bulkAmounts[ref.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBulkAmounts(prev => ({
                                ...prev,
                                [ref.id]: val
                              }));
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-24 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 font-bold focus:outline-none text-right"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-200 pt-3 text-xs font-black text-slate-700">
                    <span>Total Amount:</span>
                    <span className="text-sm text-teal-600">
                      ${Object.values(bulkAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Status</label>
                  <select
                    value={payStatus}
                    onChange={(e) => setPayStatus(e.target.value as any)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Payment Mode</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as any)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="EVC Plus">EVC Plus</option>
                    <option value="eDahab">eDahab</option>
                    <option value="Jeeb">Jeeb</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingReceipt}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 px-5 py-4 font-bold text-white shadow-md cursor-pointer transition-all active:scale-95 text-sm"
              >
                {savingReceipt ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>PRINT & SAVE RECEIPT</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* View Receipt Details Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header Accent Bar & Close Button */}
            <div className={`relative pt-7 pb-4 px-6 text-center border-b ${
              selectedReceipt.status === 'Credit' 
                ? 'bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent border-amber-100/80' 
                : 'bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-100/80'
            }`}>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100/80 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Status Icon with Glowing Effect */}
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm mb-3 transition-transform hover:scale-105">
                {selectedReceipt.status === 'Credit' ? (
                  <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-white p-3.5 rounded-2xl shadow-lg shadow-amber-500/30">
                    <AlertCircle className="h-8 w-8" />
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white p-3.5 rounded-2xl shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                )}
              </div>

              <h3 className="text-xl font-black text-slate-900 tracking-tight">Xogta Resiidhka</h3>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                Tixraac: <span className="text-teal-600 font-extrabold">{selectedReceipt.ref_number || 'N/A'}</span>
              </p>
              
              <div className="mt-3 flex justify-center">
                {selectedReceipt.status === 'Credit' ? (
                  <span className="inline-flex items-center gap-1.5 bg-amber-100/80 text-amber-800 border border-amber-300/80 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Deyn / Credit
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-100/80 text-emerald-800 border border-emerald-300/80 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-xs">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    Waa la Bixiyey / Paid
                  </span>
                )}
              </div>
            </div>

            {receiptEditMode ? (
              /* Edit Mode: Receipt Fields */
              <form onSubmit={handleSaveReceiptEdit} className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Receipt No</span>
                    <input
                      type="text"
                      required
                      value={editReceiptNo}
                      onChange={(e) => setEditReceiptNo(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Amount (USD)</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editReceiptAmount}
                      onChange={(e) => setEditReceiptAmount(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Status</span>
                    <select
                      value={editReceiptStatus}
                      onChange={(e) => setEditReceiptStatus(e.target.value as 'Paid' | 'Credit')}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Paid Via</span>
                    <select
                      value={editReceiptMode}
                      onChange={(e) => setEditReceiptMode(e.target.value as typeof editReceiptMode)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="EVC Plus">EVC Plus</option>
                      <option value="eDahab">eDahab</option>
                      <option value="Jeeb">Jeeb</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Payment Date</span>
                    <input
                      type="date"
                      required
                      value={editReceiptDate}
                      onChange={(e) => setEditReceiptDate(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </label>
                  <label className="col-span-2 block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Details</span>
                    <textarea
                      rows={3}
                      value={editReceiptDetails}
                      onChange={(e) => setEditReceiptDetails(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </label>
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setReceiptEditMode(false)}
                    className="flex-1 rounded-xl bg-white border border-slate-200 text-slate-700 font-extrabold text-xs px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingReceiptEdit}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-xs px-3.5 py-2.5 cursor-pointer"
                  >
                    {savingReceiptEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* Receipt Digital Card Body */}
                <div className="px-6 py-5 space-y-4">
                  {/* Receipt Ticket Structure */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-5 shadow-xs relative overflow-hidden">

                    {/* Visual Top Pattern */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-500 via-amber-500 to-emerald-500 opacity-30"></div>

                    {/* Amount Row */}
                    <div className="text-center py-3 border-b border-dashed border-slate-300">
                      <span className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                        Wadarta Lacagta (Amount USD)
                      </span>
                      <div className={`text-4xl font-black tracking-tight ${
                        selectedReceipt.status === 'Credit' ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        ${parseFloat(selectedReceipt.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Receipt Fields Grid */}
                    <div className="space-y-3 pt-4 text-xs">
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Receipt No</span>
                        <span className="font-mono font-black text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
                          {selectedReceipt.receipt_no}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Sumad (Ref)</span>
                        <span className="font-mono font-black text-teal-650 bg-teal-50/80 border border-teal-200/70 px-3 py-1 rounded-xl shadow-2xs">
                          {selectedReceipt.ref_number || 'N/A'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Payment Date</span>
                        <span className="font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
                          {selectedReceipt.payment_date ? new Date(selectedReceipt.payment_date).toLocaleDateString('so-SO') : '-'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Paid Via</span>
                        <span className="inline-flex px-3 py-1 rounded-xl bg-slate-900 text-white font-black uppercase text-[10px] shadow-xs">
                          {selectedReceipt.payment_mode || 'Cash'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Record Creator</span>
                        <span className="font-bold text-slate-700 text-right">
                          {resolveCreatorName(selectedReceipt.created_by, profileNames) || '-'}
                        </span>
                      </div>

                      <div className="border-t border-slate-200/80 pt-3 mt-2">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-extrabold mb-1.5">
                          Faahfaahinta (Details)
                        </span>
                        <div className="font-bold text-slate-700 bg-white border border-slate-200 p-3.5 rounded-2xl text-xs leading-relaxed text-left shadow-2xs">
                          {parseReceiptDetails(selectedReceipt.details).details || 'Bixinta lacagta'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 sm:px-6 sm:py-4.5 border-t border-slate-150 bg-slate-50/80 flex flex-col gap-2.5">
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={handleDownloadReceiptPdf}
                      disabled={downloadingReceipt}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-xs px-3.5 py-2.5 w-full cursor-pointer shadow-sm transition-all active:scale-95"
                    >
                      {downloadingReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      <span>{downloadingReceipt ? 'SAMEYNAYA PDF...' : 'DOWNLOAD PDF'}</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-xs px-3.5 py-2.5 w-full cursor-pointer shadow-2xs border border-slate-200 transition-all active:scale-95"
                    >
                      <Printer className="h-3.5 w-3.5 text-slate-500" />
                      <span>PRINT RECEIPT</span>
                    </button>

                    {selectedReceipt.status === 'Credit' && (
                      (canAction(profile, 'payment.pay_debt') ? (<button
                        onClick={() => {
                          const currentSelected = selectedReceipt;
                          setSelectedReceipt(null);
                          const parentRef = referencesWithReceipts.find(
                            r => r.id === currentSelected.reference_id || r.ref_number === currentSelected.ref_number
                          );
                          if (parentRef) {
                            openPayDebtDialog(parentRef);
                          } else {
                            openPayDebtDialog({
                              id: currentSelected.reference_id,
                              ref_number: currentSelected.ref_number,
                              subject: currentSelected.details || 'Bixinta deynta',
                              receipts: [currentSelected]
                            });
                          }
                        }}
                        disabled={updatingCredit}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs px-3.5 py-2.5 w-full cursor-pointer shadow-sm shadow-amber-500/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-400"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>BIXI DEYNTA (PAY DEBT)</span>
                      </button>) : null)
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    {canAction(profile, 'payment.edit') ? (<button
                      onClick={openReceiptEditMode}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-xs px-3.5 py-2.5 w-full cursor-pointer shadow-2xs border border-slate-200 transition-all active:scale-95"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>EDIT</span>
                    </button>) : null}
                    {canAction(profile, 'payment.delete') ? (<button
                      onClick={handleDeleteReceipt}
                      disabled={deletingReceipt}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 font-extrabold text-xs px-3.5 py-2.5 w-full cursor-pointer shadow-2xs border border-rose-200 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {deletingReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      <span>DELETE</span>
                    </button>) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pay Debt Modal (Partial or Full Payment) */}
      {showPayDebtModal && payDebtRef && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-amber-50 border-b border-amber-200/60">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="bg-amber-500 text-white p-2 rounded-xl shadow-xs shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-800 text-base truncate">
                    Bixinta Deynta (Pay Debt)
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">
                    Sumad: <span className="text-teal-600 font-extrabold">{payDebtRef.ref_number}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPayDebtModal(false)}
                className="shrink-0 text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-white/60 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Summary Box */}
            <div className="px-6 pt-5 pb-2">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Deynta Lagu Leeyahay</span>
                  <span className="text-xl font-black text-amber-600">
                    ${payDebtTotalCredit.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Waa La Bixiyey Hada</span>
                  <span className="text-xl font-black text-emerald-600">
                    ${payDebtPaidSoFar.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveDebtPayment} className="p-6 space-y-4 pt-2">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5 uppercase">
                  Lacagta Hada La Bixinayo (Amount to Pay USD)
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  max={payDebtTotalCredit}
                  value={payDebtAmount}
                  onChange={(e) => setPayDebtAmount(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full rounded-2xl bg-white border-2 border-amber-300 focus:border-amber-500 px-4 py-3.5 text-lg font-black text-slate-900 shadow-xs focus:outline-none"
                  placeholder="0.00"
                />
                
                {/* Dynamic Payment Status Alert */}
                {(() => {
                  const val = parseFloat(payDebtAmount) || 0;
                  const remaining = payDebtTotalCredit - val;
                  if (val > 0 && remaining <= 0.001) {
                    return (
                      <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Deynta oo dhan waa la wada bixinayaa (Full Payment: ${val.toFixed(2)})</span>
                      </div>
                    );
                  } else if (val > 0 && remaining > 0) {
                    return (
                      <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-bold flex items-center justify-between">
                        <span>⚠ Qeyb ka mid ah deynta ayaa la bixinayaa</span>
                        <span className="bg-amber-200/60 px-2.5 py-1 rounded-lg text-amber-900 font-extrabold">
                          Deyn Harsan: ${remaining.toFixed(2)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Payment Mode</label>
                  <select
                    value={payDebtMode}
                    onChange={(e) => setPayDebtMode(e.target.value as any)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-900 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="EVC Plus">EVC Plus</option>
                    <option value="eDahab">eDahab</option>
                    <option value="Jeeb">Jeeb</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Date</label>
                  <input
                    type="date"
                    required
                    value={payDebtDate}
                    onChange={(e) => setPayDebtDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-900 font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Faahfaahin (Details)</label>
                <input
                  type="text"
                  value={payDebtDetails}
                  onChange={(e) => setPayDebtDetails(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-900 focus:outline-none"
                  placeholder="Tusaale: Bixinta deynta qeyb ahaan"
                />
              </div>

              <button
                type="submit"
                disabled={savingDebtPayment}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 px-4 py-3 font-extrabold text-xs text-white shadow-sm cursor-pointer transition-all active:scale-95"
              >
                {savingDebtPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>KEYDI BIXINTA DEYNTA</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="min-w-0 font-extrabold text-slate-800 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 shrink-0 text-rose-500" />
                <span className="truncate">{editingExpense ? 'Edit Expense' : 'Add New Expense'}</span>
              </h3>
              <button
                onClick={closeExpenseDialog}
                className="shrink-0 text-slate-400 hover:text-slate-650 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Faahfaahinta (Description)</label>
                <input
                  type="text"
                  required
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                  placeholder="Tusaale: Billka Internet-ka ama Qalabka Xafiiska"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Tirada (Qty)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={expQty}
                    onChange={(e) => setExpQty(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Qiimaha (Amount USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Taariikhda</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Wadarta (Total)</label>
                  <div className="w-full rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-600 font-extrabold flex items-center">
                    <span>$</span>
                    <span>{((parseInt(expQty) || 0) * (parseFloat(expAmount) || 0)).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {editingExpense && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Record Creator</span>
                  <span className="mt-1 block text-sm font-bold text-slate-800">
                    {resolveCreatorName(editingExpense.created_by, profileNames) || editingExpense.created_by || '-'}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingExpense}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-100 disabled:text-slate-400 px-4 py-3.5 font-bold text-white shadow-md cursor-pointer transition-all active:scale-95"
              >
                {savingExpense ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>{editingExpense ? 'CUSBOONAYSII KHARASHKA' : 'KEYDI KHARASHKA'}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Bulk Pay Bar */}
      {selectedRefIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-6 border border-slate-800 animate-in slide-in-from-bottom duration-250">
          <span className="text-xs font-bold">
            {selectedRefIds.length} {selectedRefIds.length === 1 ? 'tixraac ayaa la doortay' : 'tixraac ayaa la doortay'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedRefIds([])}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {canAction(profile, 'payment.create') ? (<button
              onClick={openBulkPayDialog}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              Pay Selected
            </button>) : null}
          </div>
        </div>
      )}

    </div>
  );
}
