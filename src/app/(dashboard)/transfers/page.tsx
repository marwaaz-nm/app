'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Transfer, Survey } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { useMobileSearch } from '@/context/MobileSearchContext';
import { dateGroupKey, groupItems } from '@/lib/listGrouping';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import { useDataAutoRefresh } from '@/lib/useDataAutoRefresh';
import { useProfileNames, resolveCreatorName } from '@/lib/useProfileNames';
import {
  Plus,
  Search,
  Calendar,
  DollarSign,
  User,
  Phone,
  X,
  Loader2,
  ChevronRight,
  Info,
  Check,
  Pencil,
  Trash2
} from 'lucide-react';

export default function TransfersPage() {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const { isOpen: showMobileSearch, setAvailable: setSearchAvailable } = useMobileSearch();
  const profileNames = useProfileNames();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [filteredTransfers, setFilteredTransfers] = useState<Transfer[]>([]);
  const [surveys, setSurveys] = useState<{ id: number; serial_no: number; survey_no?: string | null; owner_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);

  // Search/Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'price_high'>('newest');
  const [groupBy, setGroupBy] = useState<'none' | 'date'>('none');
  const [groupAggregate, setGroupAggregate] = useState<'none' | 'count' | 'sum'>('count');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setSearchAvailable(!showAddForm);
  }, [showAddForm, setSearchAvailable]);

  const [sellers, setSellers] = useState<{ name: string; tel: string }[]>([{ name: '', tel: '' }]);
  const [buyers, setBuyers] = useState<{ name: string; tel: string }[]>([{ name: '', tel: '' }]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  const [price, setPrice] = useState('');
  const [transferDate, setTransferDate] = useState('');

  // Fetch all transfer records
  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transfers')
        .select(`
          *,
          surveys (
            serial_no,
            survey_no,
            owner_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransfers(data || []);
      setFilteredTransfers(data || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch surveys for dropdown selection
  const fetchSurveys = async () => {
    try {
      const { data, error } = await supabase
        .from('surveys')
        .select('id, serial_no, survey_no, owner_name')
        .order('serial_no', { ascending: false });
      if (error) throw error;
      setSurveys(data || []);
    } catch (err) {
      console.error('Error fetching surveys:', err);
    }
  };

  useEffect(() => {
    fetchTransfers();
    fetchSurveys();
  }, []);
  useDataAutoRefresh(fetchTransfers);

  // Filter application
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTransfers(transfers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const result = transfers.filter(
      t => t.seller_name.toLowerCase().includes(query) || 
           t.buyer_name.toLowerCase().includes(query) ||
           t.surveys?.owner_name.toLowerCase().includes(query)
    );
    setFilteredTransfers(result);
  }, [searchQuery, transfers]);

  const sortedTransfers = useMemo(() => {
    const sorted = [...filteredTransfers];
    sorted.sort((a, b) => {
      if (sortBy === 'price_high') return parseFloat(b.price.toString()) - parseFloat(a.price.toString());
      const diff = new Date(b.transfer_date || b.created_at || 0).getTime() - new Date(a.transfer_date || a.created_at || 0).getTime();
      return sortBy === 'oldest' ? -diff : diff;
    });
    return sorted;
  }, [filteredTransfers, sortBy]);

  const groupedTransfers = useMemo(() => {
    if (groupBy === 'none') return null;
    return groupItems(sortedTransfers, (t) => dateGroupKey(t.transfer_date || t.created_at).key).map((group) => {
      const baseLabel = dateGroupKey(group.items[0].transfer_date || group.items[0].created_at).label;
      const sum = group.items.reduce((total, t) => total + parseFloat(t.price.toString()), 0);
      const label =
        groupAggregate === 'count' ? `${baseLabel} · ${group.items.length}` :
        groupAggregate === 'sum' ? `${baseLabel} · $${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}` :
        baseLabel;
      return { ...group, label };
    });
  }, [sortedTransfers, groupBy, groupAggregate]);

  const handleOpenAddForm = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditingTransfer(null);
    setSellers([{ name: '', tel: '' }]);
    setBuyers([{ name: '', tel: '' }]);
    setSelectedSurveyId('');
    setPrice('');
    setTransferDate(today);
    setShowAddForm(true);
  };

  // Reuses the add form for editing — seller/buyer names & phones are stored as
  // comma-joined strings on the record, so they're split back into per-person rows here
  // (matches how handleSaveTransfer re-joins them on save).
  const handleOpenEditForm = (transfer: Transfer) => {
    const sellerNames = transfer.seller_name.split(',').map((s) => s.trim());
    const sellerTels = transfer.seller_tel.split(',').map((s) => s.trim());
    const buyerNames = transfer.buyer_name.split(',').map((s) => s.trim());
    const buyerTels = transfer.buyer_tel.split(',').map((s) => s.trim());
    const rowCount = Math.max(sellerNames.length, sellerTels.length);
    const buyerRowCount = Math.max(buyerNames.length, buyerTels.length);

    setEditingTransfer(transfer);
    setSellers(Array.from({ length: rowCount || 1 }, (_, i) => ({ name: sellerNames[i] || '', tel: sellerTels[i] || '' })));
    setBuyers(Array.from({ length: buyerRowCount || 1 }, (_, i) => ({ name: buyerNames[i] || '', tel: buyerTels[i] || '' })));
    setSelectedSurveyId(String(transfer.survey_id));
    setPrice(String(transfer.price));
    setTransferDate(transfer.transfer_date ? transfer.transfer_date.slice(0, 10) : '');
    setShowAddForm(true);
  };

  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setEditingTransfer(null);
    setSellers([{ name: '', tel: '' }]);
    setBuyers([{ name: '', tel: '' }]);
    setSelectedSurveyId('');
    setPrice('');
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        seller_name: sellers.map(s => s.name.trim()).filter(Boolean).join(', '),
        seller_tel: sellers.map(s => s.tel.trim()).filter(Boolean).join(', '),
        buyer_name: buyers.map(b => b.name.trim()).filter(Boolean).join(', '),
        buyer_tel: buyers.map(b => b.tel.trim()).filter(Boolean).join(', '),
        survey_id: parseInt(selectedSurveyId),
        price: parseFloat(price),
        transfer_date: transferDate,
      };

      if (editingTransfer) {
        const { error: updateError } = await supabase
          .from('transfers')
          .update(payload)
          .eq('id', editingTransfer.id);
        if (updateError) throw updateError;

        showAlert('Guul', 'Wareejinta si guul leh ayaa loo cusboonaysiiyey!', 'success');
        handleCloseAddForm();
        fetchTransfers();
        return;
      }

      // Fetch next serial number (max + 1)
      const { data: maxData, error: maxError } = await supabase
        .from('transfers')
        .select('serial_no')
        .order('serial_no', { ascending: false })
        .limit(1);

      if (maxError) throw maxError;
      const nextSerialNo = maxData && maxData.length > 0 ? maxData[0].serial_no + 1 : 1;

      const { error: insertError } = await supabase
        .from('transfers')
        .insert([{ ...payload, serial_no: nextSerialNo, created_by: user?.id }]);

      if (insertError) throw insertError;

      showAlert('Guul', 'Wareejinta si guul leh ayaa loo diiwaangeliyey!', 'success');
      handleCloseAddForm();
      fetchTransfers();
    } catch (err: any) {
      console.error('Error saving transfer:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransfer = async (transfer: Transfer) => {
    const isConfirmed = await showConfirm(
      'Tirtir Wareejinta',
      `Ma hubtaa inaad tirtirto wareejinta ${transfer.serial_no} (${transfer.seller_name} → ${transfer.buyer_name})? Tallaabadan lama soo celin karo.`,
      'Haa, tirtir',
      'Maya'
    );
    if (!isConfirmed) return;

    setDeletingId(transfer.id);
    try {
      const { error } = await supabase.from('transfers').delete().eq('id', transfer.id);
      if (error) throw error;
      setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
      showAlert('Guul', 'Wareejinta waa la tirtiray.', 'success');
    } catch (err) {
      console.error('Error deleting transfer:', err);
      showAlert('Cillad', err instanceof Error ? err.message : 'Tirtiridda wuu fashilmay.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={`p-4 md:p-8 mx-auto space-y-3.5 md:space-y-6 text-slate-800 transition-all duration-300 ${showAddForm ? 'form-card' : 'w-full'}`}>
      
      {!showAddForm && (
        <div className="hidden md:flex justify-end">
          <button
            onClick={handleOpenAddForm}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-705 text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Transfer</span>
          </button>
        </div>
      )}

      {showAddForm ? (
        /* Form view */
        <div className="space-y-6">
          {/* Back link & Title */}
          <div className="space-y-1">
            <button
              onClick={handleCloseAddForm}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
            >
              ← Back to transfers
            </button>
            <h2 className="text-2xl font-black text-slate-800 mt-1.5">{editingTransfer ? `Edit transfer — ${editingTransfer.serial_no}` : 'New transfer'}</h2>
          </div>

          {/* Form card */}
          <div className="bg-transparent md:bg-white border-0 md:border border-slate-100 rounded-none md:rounded-3xl p-0 md:p-8 space-y-6 shadow-none md:shadow-md">
            <form id="transfer-form" onSubmit={handleSaveTransfer} className="space-y-6">
              
              {/* Seller Section */}
              <div className="p-0 md:p-5 border-0 md:border border-slate-100 rounded-none md:rounded-2xl space-y-5 bg-transparent md:bg-slate-50/50 border-b border-slate-200/60 pb-6 md:pb-0">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-black text-teal-650 uppercase tracking-widest">Iibiyaha (Seller Details)</h5>
                  <button
                    type="button"
                    onClick={() => setSellers(prev => [...prev, { name: '', tel: '' }])}
                    className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs font-black cursor-pointer select-none"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Another Seller</span>
                  </button>
                </div>

                {sellers.map((seller, idx) => (
                  <div key={idx} className="relative space-y-4 border border-slate-150/60 p-4 rounded-2xl bg-white shadow-xs md:border-0 md:p-0 md:bg-transparent md:shadow-none md:space-y-0">
                    {sellers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSellers(prev => prev.filter((_, sIdx) => sIdx !== idx))}
                        className="absolute -top-2 -right-2 md:top-0 md:right-0 bg-rose-50 text-rose-600 p-1.5 rounded-full border border-rose-100/60 hover:bg-rose-100 cursor-pointer shadow-sm md:shadow-none"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Seller Name {sellers.length > 1 ? `#${idx + 1}` : ''}</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={seller.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSellers(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, name: val } : s));
                            }}
                            className="w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            placeholder="Magaca qofka dhulka iibinaya"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Seller Telephone {sellers.length > 1 ? `#${idx + 1}` : ''}</label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <input
                            type="tel"
                            required
                            value={seller.tel}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSellers(prev => prev.map((s, sIdx) => sIdx === idx ? { ...s, tel: val } : s));
                            }}
                            className="w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            placeholder="Ex: 61xxxxxxx"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Buyer Section */}
              <div className="p-0 md:p-5 border-0 md:border border-slate-100 rounded-none md:rounded-2xl space-y-5 bg-transparent md:bg-slate-50/50 border-b border-slate-200/60 pb-6 md:pb-0">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-black text-teal-650 uppercase tracking-widest">Iibsadaha (Buyer Details)</h5>
                  <button
                    type="button"
                    onClick={() => setBuyers(prev => [...prev, { name: '', tel: '' }])}
                    className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs font-black cursor-pointer select-none"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Another Buyer</span>
                  </button>
                </div>

                {buyers.map((buyer, idx) => (
                  <div key={idx} className="relative space-y-4 border border-slate-150/60 p-4 rounded-2xl bg-white shadow-xs md:border-0 md:p-0 md:bg-transparent md:shadow-none md:space-y-0">
                    {buyers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBuyers(prev => prev.filter((_, bIdx) => bIdx !== idx))}
                        className="absolute -top-2 -right-2 md:top-0 md:right-0 bg-rose-50 text-rose-600 p-1.5 rounded-full border border-rose-100/60 hover:bg-rose-100 cursor-pointer shadow-sm md:shadow-none"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Buyer Name {buyers.length > 1 ? `#${idx + 1}` : ''}</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={buyer.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBuyers(prev => prev.map((b, bIdx) => bIdx === idx ? { ...b, name: val } : b));
                            }}
                            className="w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            placeholder="Magaca qofka iibsanaya"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Buyer Telephone {buyers.length > 1 ? `#${idx + 1}` : ''}</label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <input
                            type="tel"
                            required
                            value={buyer.tel}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBuyers(prev => prev.map((b, bIdx) => bIdx === idx ? { ...b, tel: val } : b));
                            }}
                            className="w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            placeholder="Ex: 61xxxxxxx"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Survey, price, date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Survey Lr (Land)</label>
                  <select
                    required
                    value={selectedSurveyId}
                    onChange={(e) => setSelectedSurveyId(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
                  >
                    <option value="">Dooro Sahanka...</option>
                    {surveys.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.survey_no || s.serial_no} — {s.owner_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Lacagta (Price USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="number"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Taariikhda</label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
            </form>
          </div>

          {/* Action buttons outside the card */}
          <div className="grid grid-cols-2 gap-4 pt-4 pb-16">
            <button
              type="button"
              onClick={handleCloseAddForm}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-200/60 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer select-none active:scale-[0.98]"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </button>

            <button
              type="submit"
              form="transfer-form"
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-600 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-600/15 hover:shadow-teal-600/25 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer select-none"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>{editingTransfer ? 'Update' : 'Save'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Records list view */
        <div className="space-y-4">
          <div className={`${showMobileSearch ? 'flex' : 'hidden md:flex'} flex-col gap-2 md:flex-row md:items-center bg-white border border-slate-100 rounded-2xl md:rounded-3xl p-3 shadow-sm w-full`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Raadi Iibiyaha ama Iibsadaha..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="newest">Sort: Newest first</option>
                <option value="oldest">Sort: Oldest first</option>
                <option value="price_high">Sort: Price (high–low)</option>
              </select>

            </div>

            <div className="flex gap-2">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="none">No group</option>
                <option value="date">Group: Date</option>
              </select>

              {groupBy !== 'none' && (
                <select
                  value={groupAggregate}
                  onChange={(e) => setGroupAggregate(e.target.value as typeof groupAggregate)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="none">Aggregate: None</option>
                  <option value="count">Aggregate: Count</option>
                  <option value="sum">Aggregate: Sum</option>
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <ListLoadingSkeleton />
          ) : sortedTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-200 rounded-3xl bg-white">
              <Info className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-slate-500 font-semibold text-sm">Wax wareejino ah oo la helay ma jiraan.</p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}
              <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                      <th className="px-6 py-4">S/N</th>
                      <th className="px-6 py-4">Iibiyaha (Seller)</th>
                      <th className="px-6 py-4">Iibsadaha (Buyer)</th>
                      <th className="px-6 py-4">Survey Lr</th>
                      <th className="px-6 py-4">Lacagta (Price)</th>
                      <th className="px-6 py-4">Taariikhda</th>
                      <th className="px-6 py-4">Record Creator</th>
                      <th className="px-6 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white">
                    {(groupedTransfers ?? [{ key: 'all', label: '', items: sortedTransfers }]).map((group) => (
                      <React.Fragment key={group.key}>
                        {groupBy !== 'none' && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/70 px-6 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </td>
                          </tr>
                        )}
                        {group.items.map(t => (
                          <tr
                            key={t.id}
                            className="hover:bg-slate-50/80 transition-all"
                          >
                            <td className="px-6 py-4 font-black text-slate-550">
                              {t.serial_no}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              <div>{t.seller_name}</div>
                              <div className="text-xs text-slate-450 mt-0.5">{t.seller_tel}</div>
                            </td>
                            <td className="px-6 py-4 font-bold text-teal-600">
                              <div>{t.buyer_name}</div>
                              <div className="text-xs text-slate-450 mt-0.5">{t.buyer_tel}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-650 text-xs font-bold">
                                {t.surveys ? `${t.surveys.survey_no || t.surveys.serial_no} — ${t.surveys.owner_name}` : 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-black text-emerald-600 text-sm">
                              ${parseFloat(t.price.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                {t.transfer_date ? new Date(t.transfer_date).toLocaleDateString('so-SO') : '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600 font-bold">
                              {resolveCreatorName(t.created_by, profileNames) || '-'}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEditForm(t)}
                                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTransfer(t)}
                                  disabled={deletingId === t.id}
                                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                  aria-label="Delete"
                                >
                                  {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE LIST */}
              <div className="md:hidden mb-12">
                <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-slate-200 px-1 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <span>S/N</span>
                  <span>Iibiye → Iibsade</span>
                  <span>Qiimo</span>
                </div>
                {(groupedTransfers ?? [{ key: 'all', label: '', items: sortedTransfers }]).map((group) => (
                  <div key={group.key}>
                    {groupBy !== 'none' && (
                      <div className="px-1 pb-1.5 pt-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        {group.label}
                      </div>
                    )}
                    <div className="divide-y divide-slate-200/80">
                      {group.items.map(t => (
                        <div
                          key={t.id}
                          onClick={() => handleOpenEditForm(t)}
                          className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-1 py-3.5 cursor-pointer active:bg-slate-50"
                        >
                          <span className="truncate text-xs font-black text-slate-500">{t.serial_no}</span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-extrabold text-slate-800">
                              {t.seller_name} <span className="text-slate-300">→</span> <span className="text-teal-600">{t.buyer_name}</span>
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">
                              <Calendar className="h-3 w-3 shrink-0" />
                              <span>{t.transfer_date ? new Date(t.transfer_date).toLocaleDateString('so-SO') : '-'}</span>
                              <span>•</span>
                              <span>{t.surveys ? `Sahan ${t.surveys.survey_no || t.surveys.serial_no}` : 'N/A'}</span>
                            </p>
                            {resolveCreatorName(t.created_by, profileNames) && (
                              <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                Added by {resolveCreatorName(t.created_by, profileNames)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="whitespace-nowrap text-xs font-black text-emerald-600">
                              ${parseFloat(t.price.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDeleteTransfer(t); }}
                              disabled={deletingId === t.id}
                              className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                              aria-label="Delete"
                            >
                              {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Action Button (FAB) for mobile */}
      {!showAddForm && (
        <button
          onClick={handleOpenAddForm}
          className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 hover:bg-teal-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Wareejin Cusub"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

    </div>
  );
}
