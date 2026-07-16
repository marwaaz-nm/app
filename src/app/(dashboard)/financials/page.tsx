'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Reference, Receipt, Expense } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Plus, 
  Printer, 
  X, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  CreditCard,
  AlertCircle,
  Calendar
} from 'lucide-react';

export default function FinancialsPage() {
  const { profile } = useAuth();
  const { showAlert, showConfirm } = useModal();
  
  const [loading, setLoading] = useState(true);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  // Data states
  const [referencesWithReceipts, setReferencesWithReceipts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Totals
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  // Tabs
  const [activeTab, setActiveTab] = useState<'payments' | 'expenses'>('payments');

  // Pay Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payRefNumber, setPayRefNumber] = useState('');
  const [payReceiptNo, setPayReceiptNo] = useState('');
  const [payDetails, setPayDetails] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payStatus, setPayStatus] = useState<'Paid' | 'Credit'>('Paid');
  const [payMode, setPayMode] = useState<'EVC Plus' | 'eDahab' | 'Jeeb' | 'Cash'>('EVC Plus');

  // View Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [updatingCredit, setUpdatingCredit] = useState(false);

  // Bulk Payment Selection State
  const [selectedRefIds, setSelectedRefIds] = useState<number[]>([]);
  const [bulkAmounts, setBulkAmounts] = useState<Record<number, string>>({});

  // Add Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expDescription, setExpDescription] = useState('');
  const [expQty, setExpQty] = useState('1');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState('');

  // Fetch Financial Data
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch references with nested receipts
      const { data: refsData, error: refsError } = await supabase
        .from('references')
        .select(`
          id,
          ref_number,
          subject,
          issue_date,
          receipts (
            id,
            receipt_no,
            amount,
            status,
            payment_mode,
            payment_date,
            details
          )
        `)
        .order('created_at', { ascending: false });

      if (refsError) throw refsError;
      setReferencesWithReceipts(refsData || []);

      // 2. Fetch Expenses
      const { data: expData, error: expError } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (expError) throw expError;
      setExpenses(expData || []);

      // 3. Calculate Totals
      // Fetch all receipts to compute revenue and credit
      const { data: receiptsData } = await supabase
        .from('receipts')
        .select('amount, status');
      
      const revSum = receiptsData?.filter(r => r.status === 'Paid').reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0) || 0;
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

  // Pay Dialog triggers
  const openPayDialog = (refId: number, refNum: string, subject: string) => {
    setSelectedRefIds([refId]);
    setPayRefNumber(refNum);
    setPayDetails(subject);
    
    // Auto-generate Receipt No: REC-XXXX
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setPayReceiptNo(`REC-${randomNum}`);
    
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
    setPayDetails(subjectsString);
    
    // Auto-generate Receipt No: REC-XXXX
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setPayReceiptNo(`REC-${randomNum}`);
    
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
    setPayDetails('');
    setBulkAmounts({});
    setSelectedRefIds([]);
  };

  // Save Client Payment Receipt
  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRefIds.length === 0) return;
    setSavingReceipt(true);

    try {
      const payloads = selectedRefIds.map((refId, idx) => {
        const recNo = selectedRefIds.length > 1 ? `${payReceiptNo}-${idx + 1}` : payReceiptNo;
        const amountVal = parseFloat(bulkAmounts[refId]) || 0;
        
        return {
          receipt_no: recNo,
          reference_id: refId,
          details: payDetails,
          amount: amountVal,
          status: payStatus,
          payment_mode: payMode,
          payment_date: payDate,
        };
      });

      const { error } = await supabase
        .from('receipts')
        .insert(payloads);

      if (error) throw error;

      showAlert('Guul', 'Resiidhka/Resiidhada si guul leh ayaa loo keydiyey!', 'success');
      closePayDialog();
      fetchData();
    } catch (err: any) {
      console.error('Error saving receipt:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingReceipt(false);
    }
  };

  // Mark Credit Receipt as Paid
  const handleUpdateCreditToPaid = async (receiptId: number) => {
    setUpdatingCredit(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .update({ status: 'Paid', payment_date: new Date().toISOString().split('T')[0] })
        .eq('id', receiptId);

      if (error) throw error;

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

  // Add Expense Dialog
  const openExpenseDialog = () => {
    setExpDescription('');
    setExpQty('1');
    setExpAmount('');
    setExpDate(new Date().toISOString().split('T')[0]);
    setShowExpenseModal(true);
  };

  const closeExpenseDialog = () => {
    setShowExpenseModal(false);
    setExpDescription('');
    setExpQty('1');
    setExpAmount('');
  };

  // Save Office Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExpense(true);

    const qty = parseInt(expQty) || 0;
    const amount = parseFloat(expAmount) || 0;
    const total = qty * amount;

    try {
      const payload = {
        description: expDescription,
        qty,
        amount,
        total,
        expense_date: expDate,
        created_by: profile?.fullname || 'Unknown Admin',
      };

      const { error } = await supabase
        .from('expenses')
        .insert([payload]);

      if (error) throw error;

      showAlert('Guul', 'Kharashka waa la keydiyey!', 'success');
      closeExpenseDialog();
      fetchData();
    } catch (err: any) {
      console.error('Error saving expense:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  // Render receipt details popup
  const openReceiptDetails = (receipt: any, refNum: string) => {
    setSelectedReceipt({ ...receipt, ref_number: refNum });
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-3.5 md:space-y-6 text-slate-800">
      
      {/* Financials Header */}
      <div className="flex flex-row justify-between items-center gap-4 bg-white p-3 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm w-full">
        <div className="flex items-center gap-3">
          <div className="bg-teal-50 text-teal-600 p-2 rounded-xl border border-teal-100 shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base md:text-xl font-black text-slate-800 leading-tight">
              Financial Management
            </h2>
            <p className="hidden sm:block text-[10px] md:text-xs text-slate-500 font-semibold mt-0.5">
              Xisaabaadka dakhliga iyo kharashyada xafiiska sahanka.
            </p>
          </div>
        </div>
      </div>

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

      {/* Table & Dashboard view */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
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
                          referencesWithReceipts.length > 0 &&
                          referencesWithReceipts.filter(r => {
                            const latestRec = r.receipts && r.receipts[0];
                            return !latestRec || latestRec.status !== 'Paid';
                          }).every(r => selectedRefIds.includes(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const unpaidIds = referencesWithReceipts
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
                <tbody className="divide-y divide-slate-100 bg-white">
                  {referencesWithReceipts.map((ref) => {
                    const receipt = ref.receipts && ref.receipts[0];
                    const status = receipt ? receipt.status : 'Unpaid';

                    return (
                      <tr
                        key={ref.id}
                        onClick={() => receipt && openReceiptDetails(receipt, ref.ref_number)}
                        className={`hover:bg-slate-50/80 transition-all ${receipt ? 'cursor-pointer' : ''}`}
                      >
                        <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {status !== 'Paid' && (
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
                          {status === 'Paid' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 px-3.5 py-1.5 rounded-full font-extrabold uppercase text-[10px] cursor-pointer" onClick={() => openReceiptDetails(receipt, ref.ref_number)}>
                              <CheckCircle2 className="h-3 w-3" /> Paid
                            </span>
                          ) : status === 'Credit' ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-100 px-3.5 py-1.5 rounded-full font-extrabold uppercase text-[10px] cursor-pointer" onClick={() => openReceiptDetails(receipt, ref.ref_number)}>
                                <AlertCircle className="h-3 w-3" /> Credit
                              </span>
                              <button
                                onClick={() => openReceiptDetails(receipt, ref.ref_number)}
                                className="bg-amber-600 hover:bg-amber-550 text-white font-bold text-[10px] py-1.5 px-3.5 rounded-xl shadow-sm cursor-pointer transition-colors"
                              >
                                Pay Debt
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openPayDialog(ref.id, ref.ref_number, ref.subject)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1.5 px-4 rounded-xl shadow-sm cursor-pointer transition-colors"
                            >
                              Pay Now
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden flex flex-col gap-4">
            {referencesWithReceipts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic bg-white border border-slate-200/60 rounded-2xl">
                Tixraacyo lama hayo.
              </div>
            ) : (
              referencesWithReceipts.map((ref) => {
                const receipt = ref.receipts && ref.receipts[0];
                const status = receipt ? receipt.status : 'Unpaid';

                return (
                  <div
                    key={ref.id}
                    onClick={() => receipt && openReceiptDetails(receipt, ref.ref_number)}
                    className={`p-4 bg-white border border-slate-200/60 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col gap-3 transition-all ${
                      receipt ? 'cursor-pointer active:scale-[0.99]' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {status !== 'Paid' && (
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
                        {status === 'Paid' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-full font-black uppercase text-[9px] cursor-pointer" onClick={() => openReceiptDetails(receipt, ref.ref_number)}>
                            <CheckCircle2 className="h-2.5 w-2.5" /> Paid
                          </span>
                        ) : status === 'Credit' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-full font-black uppercase text-[9px] cursor-pointer" onClick={() => openReceiptDetails(receipt, ref.ref_number)}>
                              <AlertCircle className="h-2.5 w-2.5" /> Credit
                            </span>
                            <button
                              onClick={() => openReceiptDetails(receipt, ref.ref_number)}
                              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-[9px] py-0.5 px-2 rounded-xl shadow-sm cursor-pointer transition-colors"
                            >
                              Pay Debt
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openPayDialog(ref.id, ref.ref_number, ref.subject)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1 px-3.5 rounded-xl shadow-sm cursor-pointer transition-colors"
                          >
                            Pay Now
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="block text-[9px] uppercase tracking-wide text-slate-400 font-extrabold">Ujeedo (Subject)</span>
                      <span className="font-extrabold text-slate-800">{ref.subject}</span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-100 pt-2">
                      <span className="flex items-center gap-1 font-semibold">
                        <Calendar className="h-3 w-3" />
                        {ref.issue_date ? new Date(ref.issue_date).toLocaleDateString('so-SO') : '-'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Office Expenses list */
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h4 className="font-extrabold text-sm text-slate-700">Liiska Kharashyada (Expense List)</h4>
            <button
              onClick={openExpenseDialog}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm cursor-pointer transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </button>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                        Kharashyo lama hayo.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="px-6 py-4 font-black text-slate-400">
                          #{expenses.length - idx}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-800">
                          {e.description}
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden flex flex-col gap-4">
            {expenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic bg-white border border-slate-200/60 rounded-2xl">
                Kharashyo lama hayo.
              </div>
            ) : (
              expenses.map((e, idx) => (
                <div
                  key={e.id}
                  className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col gap-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-black text-xs text-slate-400">#{expenses.length - idx}</span>
                    <span className="font-black text-xs text-rose-600">
                      ${parseFloat(e.total.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-xs">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-400 font-extrabold">Description</span>
                    <span className="font-extrabold text-slate-800">{e.description}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2.5">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wide text-slate-400 font-extrabold">Qty & Amount</span>
                      <span className="font-extrabold text-slate-700 block">
                        {e.qty} × ${parseFloat(e.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wide text-slate-400 font-extrabold">Created By</span>
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-slate-50 border border-slate-150 text-slate-500 text-[9px] font-extrabold">
                        {e.created_by || 'Admin'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-100 pt-2">
                    <span className="flex items-center gap-1 font-semibold">
                      <Calendar className="h-3 w-3" />
                      {e.expense_date ? new Date(e.expense_date).toLocaleDateString('so-SO') : '-'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pay Modal (Create Receipt) */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                Diiwaangeli Resiidhka (Pay Receipt)
              </h3>
              <button
                onClick={closePayDialog}
                className="text-slate-400 hover:text-slate-650 p-2 rounded-xl hover:bg-slate-105 transition-colors cursor-pointer"
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
                    className="w-full rounded-xl bg-slate-100 border border-slate-200 px-4 py-3.5 text-sm text-slate-500 font-extrabold focus:outline-none"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header / Top decoration */}
            <div className="relative pt-8 pb-4 px-6 text-center">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Status Icon */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full shadow-inner mb-4 transition-all">
                {selectedReceipt.status === 'Credit' ? (
                  <div className="bg-amber-50 text-amber-600 p-3.5 rounded-full border border-amber-100/50">
                    <AlertCircle className="h-7 w-7" />
                  </div>
                ) : (
                  <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full border border-emerald-100/50">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                )}
              </div>

              <h3 className="text-xl font-black text-slate-800">Xogta Resiidhka</h3>
              
              <div className="mt-2.5">
                {selectedReceipt.status === 'Credit' ? (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-100 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider">
                    Deyn / Credit
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider">
                    Waa la Bixiyey / Paid
                  </span>
                )}
              </div>
            </div>

            {/* Receipt Card Structure */}
            <div className="px-6 pb-6 pt-2">
              <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                
                {/* Amount Row */}
                <div className="text-center py-4 border-b border-dashed border-slate-200">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                    Wadarta Lacagta (Amount)
                  </span>
                  <div className={`text-4xl font-black tracking-tight ${
                    selectedReceipt.status === 'Credit' ? 'text-amber-600' : 'text-emerald-650'
                  }`}>
                    ${parseFloat(selectedReceipt.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-3.5 pt-2 text-xs">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wide">Receipt No</span>
                    <span className="font-black text-slate-800 bg-white border border-slate-150/60 px-3 py-1.5 rounded-xl shadow-xs">
                      {selectedReceipt.receipt_no}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wide">Sumad (Ref)</span>
                    <span className="font-black text-teal-650 bg-white border border-slate-150/60 px-3 py-1.5 rounded-xl shadow-xs">
                      {selectedReceipt.ref_number}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wide">Payment Date</span>
                    <span className="font-bold text-slate-700">
                      {selectedReceipt.payment_date ? new Date(selectedReceipt.payment_date).toLocaleDateString('so-SO') : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wide">Paid Via</span>
                    <span className="inline-flex px-3 py-1 rounded-full bg-white border border-slate-150 text-slate-650 font-black uppercase text-[10px] shadow-xs">
                      {selectedReceipt.payment_mode}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 my-2 pt-3">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-400 font-extrabold mb-1">
                      Faahfaahinta (Details)
                    </span>
                    <p className="font-bold text-slate-700 bg-white border border-slate-150/60 p-3.5 rounded-2xl shadow-xs leading-relaxed text-left">
                      {selectedReceipt.details}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-4 py-3.5 w-full cursor-pointer shadow-sm border border-slate-200 transition-all active:scale-95"
              >
                <Printer className="h-4 w-4 text-slate-500" />
                <span>PRINT RECEIPT</span>
              </button>

              {selectedReceipt.status === 'Credit' && (
                <button
                  onClick={() => handleUpdateCreditToPaid(selectedReceipt.id)}
                  disabled={updatingCredit}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-4 py-3.5 w-full cursor-pointer shadow-md transition-all active:scale-95 disabled:from-slate-250 disabled:to-slate-250 disabled:text-slate-400"
                >
                  {updatingCredit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>MARK AS PAID</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-rose-500" />
                Ku Dar Kharash Cusub (Add Expense)
              </h3>
              <button
                onClick={closeExpenseDialog}
                className="text-slate-400 hover:text-slate-650 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
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

              <button
                type="submit"
                disabled={savingExpense}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-100 disabled:text-slate-400 px-4 py-3.5 font-bold text-white shadow-md cursor-pointer transition-all active:scale-95"
              >
                {savingExpense ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>KEYDI KHARASHKA</span>
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
            <button
              onClick={openBulkPayDialog}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              Pay Selected
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
