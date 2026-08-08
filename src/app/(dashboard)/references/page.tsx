'use client';

import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { Reference, Survey } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { useSettings } from '@/context/SettingsContext';
import { useMobileSearch } from '@/context/MobileSearchContext';
import { dateGroupKey, groupItems } from '@/lib/listGrouping';
import DetailsModal from '@/components/DetailsModal';
import {
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  FileText,
  X,
  Loader2,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  QrCode,
  Copy,
  Check
} from 'lucide-react';

export default function ReferencesPage() {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const { settings } = useSettings();
  const { isOpen: showMobileSearch, setAvailable: setSearchAvailable } = useMobileSearch();

  const [references, setReferences] = useState<Reference[]>([]);
  const [filteredReferences, setFilteredReferences] = useState<Reference[]>([]);
  const [surveys, setSurveys] = useState<{ id: number; serial_no: number; owner_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search/Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'ref_az'>('newest');
  const [groupBy, setGroupBy] = useState<'none' | 'date' | 'status'>('none');
  const [groupAggregate, setGroupAggregate] = useState<'none' | 'count'>('count');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setSearchAvailable(!showAddForm);
  }, [showAddForm, setSearchAvailable]);
  const [refNumber, setRefNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  
  // Selected Ref Details Modal
  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Connected survey details modal
  const [viewingSurvey, setViewingSurvey] = useState<Survey | null>(null);
  const [loadingSurvey, setLoadingSurvey] = useState(false);

  const handleViewSurvey = async (surveyId: number) => {
    setLoadingSurvey(true);
    try {
      const { data, error } = await supabase.from('surveys').select('*').eq('id', surveyId).single();
      if (error) throw error;
      setViewingSurvey(data as Survey);
    } catch (err) {
      console.error('Error fetching survey details:', err);
      showAlert('Cillad', 'Ma suuragalin in xogta sahanka la soo qaado.', 'error');
    } finally {
      setLoadingSurvey(false);
    }
  };

  const publicVerifyUrl = (refId: number) =>
    typeof window !== 'undefined' ? `${window.location.origin}/verify/${refId}` : '';

  useEffect(() => {
    if (!selectedRef) { setQrDataUrl(null); return; }
    setLinkCopied(false);
    QRCode.toDataURL(publicVerifyUrl(selectedRef.id), { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch((err) => { console.error('Error generating QR code:', err); setQrDataUrl(null); });
  }, [selectedRef]);

  const handleCopyLink = async () => {
    if (!selectedRef) return;
    try {
      await navigator.clipboard.writeText(publicVerifyUrl(selectedRef.id));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error copying link:', err);
    }
  };

  // Fetch all references with joined surveys
  const fetchReferences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('references')
        .select(`
          *,
          surveys (
            id,
            serial_no,
            owner_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReferences(data || []);
      setFilteredReferences(data || []);
    } catch (err) {
      console.error('Error fetching references:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch surveys for dropdown selection
  const fetchSurveys = async () => {
    try {
      const { data, error } = await supabase
        .from('surveys')
        .select('id, serial_no, owner_name')
        .order('serial_no', { ascending: false });
      if (error) throw error;
      setSurveys(data || []);
    } catch (err) {
      console.error('Error fetching surveys:', err);
    }
  };

  useEffect(() => {
    fetchReferences();
    fetchSurveys();
  }, []);

  // Filter application
  useEffect(() => {
    let result = [...references];

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        r => r.ref_number.toLowerCase().includes(query) || 
             r.subject.toLowerCase().includes(query) ||
             r.details?.toLowerCase().includes(query)
      );
    }

    if (statusFilter) {
      result = result.filter(r => r.status === statusFilter);
    }

    setFilteredRecords(result);
  }, [searchQuery, statusFilter, references]);

  const sortedReferences = useMemo(() => {
    const sorted = [...filteredReferences];
    sorted.sort((a, b) => {
      if (sortBy === 'ref_az') return a.ref_number.localeCompare(b.ref_number);
      const diff = new Date(b.issue_date || 0).getTime() - new Date(a.issue_date || 0).getTime();
      return sortBy === 'oldest' ? -diff : diff;
    });
    return sorted;
  }, [filteredReferences, sortBy]);

  const groupedReferences = useMemo(() => {
    if (groupBy === 'none') return null;
    return groupItems(sortedReferences, (r) =>
      groupBy === 'date' ? dateGroupKey(r.issue_date).key : r.status,
    ).map((group) => {
      const baseLabel = groupBy === 'date' ? dateGroupKey(group.items[0].issue_date).label : group.items[0].status;
      const label = groupAggregate === 'count' ? `${baseLabel} · ${group.items.length}` : baseLabel;
      return { ...group, label };
    });
  }, [sortedReferences, groupBy, groupAggregate]);

  // Set default issue date and suggested ref number when opening form
  const handleOpenAddForm = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setIssueDate(localDateTime);
    setShowAddForm(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('next_reference_number');
        if (!error && data) setRefNumber(data as string);
      } catch (err) {
        console.error('Error generating next reference number:', err);
      }
    })();
  };

  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setRefNumber('');
    setSubject('');
    setDetails('');
    setSelectedSurveyId('');
  };

  // Connected survey visibility check (AppSheet-like dynamic logic)
  const isSurveyLinkVisible = () => {
    const rentalCondition = subject !== 'Cadeyn Heshiis Kiro';
    const allowedSubjects = [
      'Beec Dhul',
      'Sugitaan Milkiyad Dhul',
      'Sugitaan Dhaxalkoob',
      'Cadeyn Hibeyn/ Waqaf',
      'Codsi Sabarloog'
    ];
    const keywords = ['dhul', 'guri', 'boos', 'beer'];
    const hasKeyword = keywords.some(word => details.toLowerCase().includes(word));
    const typeCondition = allowedSubjects.includes(subject) || hasKeyword;

    const excludedWords = ['nootaay', 'notary', 'notaay', 'duleed', 'deegaan', 'tuul'];
    const isExcluded = excludedWords.some(word => details.toLowerCase().includes(word));

    return rentalCondition && typeCondition && !isExcluded && subject !== '';
  };

  const setFilteredRecords = (data: Reference[]) => {
    setFilteredReferences(data);
  };

  const handleSaveReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ref_number: refNumber,
        subject,
        details: details || null,
        issue_date: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
        survey_id: isSurveyLinkVisible() && selectedSurveyId ? parseInt(selectedSurveyId) : null,
        created_by: user?.id,
        status: 'In Progress'
      };

      const { error } = await supabase
        .from('references')
        .insert([payload]);

      if (error) throw error;

      showAlert('Guul', 'Sumadda si guul leh ayaa loo keydiyey!', 'success');
      handleCloseAddForm();
      fetchReferences();
    } catch (err: any) {
      console.error('Error saving reference:', err);
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday xilliga keydinta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (refId: number, newStatus: 'In Progress' | 'Completed' | 'Picked Up') => {
    const isConfirmed = await showConfirm(
      'Xaqiiji Beddelka Xaaladda',
      `Ma rabtaa inaad u beddesho status-ka: ${newStatus}?`,
      'Haa',
      'Maya'
    );
    if (!isConfirmed) return;

    try {
      const { error } = await supabase
        .from('references')
        .update({ status: newStatus })
        .eq('id', refId);

      if (error) throw error;

      // Update state locally
      setReferences(prev => prev.map(r => r.id === refId ? { ...r, status: newStatus } : r));
      if (selectedRef && selectedRef.id === refId) {
        setSelectedRef(prev => prev ? { ...prev, status: newStatus } : null);
      }
      
      showAlert('Guul', 'Heerka shaqada waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      console.error('Error updating reference status:', err);
      showAlert('Cillad', 'Cillad ayaa dhacday xilliga beddelka status-ka.', 'error');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-teal-50 text-teal-600 border-teal-100';
      case 'Picked Up':
        return 'bg-emerald-50 text-emerald-650 border-emerald-100';
      default: // In Progress
        return 'bg-amber-50 text-amber-650 border-amber-100';
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
            <span>Add New Ref</span>
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
              ← Back to references
            </button>
            <h2 className="text-2xl font-black text-slate-800 mt-1.5">New reference</h2>
          </div>

          {/* Form card */}
          <div className="bg-transparent md:bg-white border-0 md:border border-slate-100 rounded-none md:rounded-3xl p-0 md:p-8 space-y-6 shadow-none md:shadow-md w-full">
            <form id="reference-form" onSubmit={handleSaveReference} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Sumad (Ref Number)
                  </label>
                  <input
                    type="text"
                    required
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="REF-2026-001"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Taarikhda iyo Saacadda
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Ujeedo (Subject)
                </label>
                <select
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
                >
                  <option value="">Dooro Ujeedada...</option>
                  {settings.reference_subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Faahfaahin (Details)
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Faahfaahin dheeraad ah..."
                />
              </div>

              {/* Dynamic Connected Survey Dropdown */}
              {isSurveyLinkVisible() && (
                <div className="p-5 bg-teal-50/50 border border-teal-100 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-xs font-bold text-teal-600">
                    Survey Lr (Xidhiidhka Sahanka)
                  </label>
                  <select
                    required
                    value={selectedSurveyId}
                    onChange={(e) => setSelectedSurveyId(e.target.value)}
                    className="w-full rounded-xl bg-white border border-teal-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="">Dooro Sahanka (S/N & Magaca)...</option>
                    {surveys.map(s => (
                      <option key={s.id} value={s.id}>
                        #{s.serial_no} — {s.owner_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-teal-600 font-bold">
                    * Dukumiintigan wuxuu u baahan yahay in lala xidhiidhiyo Sahan hore u jiray.
                  </p>
                </div>
              )}
            </form>
          </div>

          {/* Action buttons outside the card */}
          <div className="flex gap-3">
            <button
              type="submit"
              form="reference-form"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-100 disabled:text-slate-400 px-6 py-3 font-bold text-white shadow-md cursor-pointer transition-all active:scale-95 text-sm"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>SAVE REFERENCE</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleCloseAddForm}
              className="flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm px-6 py-3 cursor-pointer transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`${showMobileSearch ? 'flex' : 'hidden md:flex'} flex-col gap-2 md:flex-row md:items-center bg-white border border-slate-100 rounded-2xl md:rounded-3xl p-3 shadow-sm w-full`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Raadi Sumad / Ujeedo..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="">Status (All)...</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Picked Up">Picked Up</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="newest">Sort: Newest first</option>
                <option value="oldest">Sort: Oldest first</option>
                <option value="ref_az">Sort: Ref No. (A–Z)</option>
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
                <option value="status">Group: Status</option>
              </select>

              {groupBy !== 'none' && (
                <select
                  value={groupAggregate}
                  onChange={(e) => setGroupAggregate(e.target.value as typeof groupAggregate)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="none">Aggregate: None</option>
                  <option value="count">Aggregate: Count</option>
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : sortedReferences.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-200 rounded-3xl bg-white">
              <HelpCircle className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-slate-500 font-semibold text-sm">Wax reference ah oo la helay ma jiraan.</p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}
              <div className="hidden md:block overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                      <th className="px-6 py-4">Sumad (Ref)</th>
                      <th className="px-6 py-4">Survey Lr</th>
                      <th className="px-6 py-4">Ujeedo</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60 bg-white">
                    {(groupedReferences ?? [{ key: 'all', label: '', items: sortedReferences }]).map((group) => (
                      <React.Fragment key={group.key}>
                        {groupBy !== 'none' && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50/70 px-6 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </td>
                          </tr>
                        )}
                        {group.items.map(r => (
                          <tr
                            key={r.id}
                            onClick={() => setSelectedRef(r)}
                            className="hover:bg-slate-50/80 transition-all cursor-pointer group"
                          >
                            <td className="px-6 py-4 font-black text-teal-600 group-hover:text-teal-600">
                              {r.ref_number}
                            </td>
                            <td className="px-6 py-4 text-slate-700 font-semibold">
                              {r.surveys ? `#${r.surveys.serial_no} — ${r.surveys.owner_name}` : 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-655 text-[10px] font-extrabold">
                                {r.subject}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 border rounded-full text-[10px] font-extrabold tracking-wide uppercase ${getStatusBadgeClass(r.status)}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button className="bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 text-slate-600 text-[10px] font-extrabold py-1.5 px-4 rounded-xl cursor-pointer transition-colors shadow-sm">
                                View
                              </button>
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
                <div className="grid grid-cols-[64px_1fr_auto_20px] items-center gap-3 border-b border-slate-200 px-1 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                  <span>Ref No.</span>
                  <span>Title</span>
                  <span>Status</span>
                  <span />
                </div>
                {(groupedReferences ?? [{ key: 'all', label: '', items: sortedReferences }]).map((group) => (
                  <div key={group.key}>
                    {groupBy !== 'none' && (
                      <div className="px-1 pb-1.5 pt-3 text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                        {group.label}
                      </div>
                    )}
                    <div className="divide-y divide-slate-100/60">
                      {group.items.map(r => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRef(r)}
                      className="grid grid-cols-[64px_1fr_auto_20px] items-center gap-3 px-1 py-3.5 cursor-pointer transition-colors hover:bg-slate-50/80 active:bg-slate-50"
                    >
                      <span className="truncate text-xs font-black text-teal-600">{r.ref_number}</span>
                      <div className="min-w-0">
                        <h4 className="truncate text-xs font-extrabold text-slate-800">{r.subject}</h4>
                        {r.surveys && (
                          <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500">
                            Sahan #{r.surveys.serial_no} — {r.surveys.owner_name}
                          </p>
                        )}
                      </div>
                      <span className={`inline-flex items-center justify-self-end whitespace-nowrap px-2 py-0.5 rounded-full border text-[8px] font-extrabold uppercase ${getStatusBadgeClass(r.status)}`}>
                        {r.status}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
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

      {/* Reference Details Modal with Status Stepper */}
      {selectedRef && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="bg-teal-50 text-teal-600 p-2 rounded-xl border border-teal-100">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800">Official Reference Record</h3>
                  <p className="text-xs text-slate-500 font-semibold">Verified document tracking parameters</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRef(null)}
                className="text-slate-450 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-8">
              {/* Left Side */}
              <div className="md:col-span-7 space-y-6">
                <div>
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">REFERENCE ID</span>
                  <h2 className="text-sm font-extrabold text-teal-650 bg-teal-50 border border-teal-100/50 px-3 py-1.5 rounded-xl shadow-xs inline-block mt-1">{selectedRef.ref_number}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
                    <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">SUBJECT (Ujeedo)</span>
                    <div className="text-sm font-extrabold text-slate-800">{selectedRef.subject}</div>
                  </div>
                  <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
                    <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">DATE ISSUED</span>
                    <div className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {selectedRef.issue_date ? new Date(selectedRef.issue_date).toLocaleDateString('so-SO') : '-'}
                    </div>
                  </div>
                </div>

                {/* Survey Connection Panel */}
                {selectedRef.surveys && (
                  <button
                    type="button"
                    onClick={() => handleViewSurvey(selectedRef.surveys!.id)}
                    disabled={loadingSurvey}
                    className="w-full p-5 bg-teal-50/40 border border-teal-100 rounded-2xl space-y-1 text-left transition-colors hover:bg-teal-50 cursor-pointer disabled:opacity-60"
                  >
                    <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">CONNECTED LAND SURVEY</span>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-slate-855 font-extrabold text-sm">
                        <span className="h-2 w-2 rounded-full bg-teal-500" />
                        <span className="text-teal-700 underline decoration-teal-300 underline-offset-2">
                          Sahan Lr: #{selectedRef.surveys.serial_no} — {selectedRef.surveys.owner_name}
                        </span>
                      </div>
                      {loadingSurvey ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-teal-500" />
                      )}
                    </div>
                  </button>
                )}

                <div className="space-y-2">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400">FAAHFAAHIN (NOTES/DETAILS)</span>
                  <div className="p-4 rounded-2xl bg-slate-50/40 border border-slate-200 text-sm text-slate-800 min-h-[100px] leading-relaxed">
                    {selectedRef.details || 'No additional notes provided.'}
                  </div>
                </div>

                {/* Public QR Code + Verification Link */}
                <div className="p-5 bg-slate-50/60 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center gap-5">
                  <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrDataUrl} alt="QR code for public verification link" className="h-28 w-28" />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center text-slate-300">
                        <QrCode className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                    <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400">Link Xaqiijin (Public Verification)</span>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Qof kasta oo scan-gareeya QR-kan wuxuu arki karaa xogtan iyada oo aan loo baahnayn in la soo galo app-ka.
                      {selectedRef.surveys ? ' Wuxuu sidoo kale arki karaa mapka dhulka.' : ''}
                    </p>
                    <button
                      onClick={handleCopyLink}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {linkCopied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {linkCopied ? 'La koobiyeeyay!' : 'Koobi Link-ga'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Status Progress Stepper */}
              <div className="md:col-span-5 bg-slate-50/50 border border-slate-150 rounded-3xl p-5 flex flex-col justify-between">
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <h5 className="font-extrabold text-sm text-slate-800">Workflow Status</h5>
                    <span className={`inline-flex px-3 py-1 border rounded-full text-xs font-extrabold uppercase ${getStatusBadgeClass(selectedRef.status)}`}>
                      {selectedRef.status}
                    </span>
                  </div>

                  {/* Vertical Stepper */}
                  <div className="relative pl-6 space-y-8">
                    <div className="absolute left-2.5 top-3 bottom-3 w-[1.5px] bg-slate-200" />
                    <div className={`absolute left-2.5 top-3 w-[1.5px] transition-all duration-500 origin-top ${
                      selectedRef.status === 'Completed' ? 'h-[50%] bg-teal-600' :
                      selectedRef.status === 'Picked Up' ? 'h-[92%] bg-emerald-600' : 'h-0'
                    }`} />

                    {/* Step: In Progress */}
                    <div 
                      onClick={() => handleUpdateStatus(selectedRef.id, 'In Progress')}
                      className="relative flex gap-4 group cursor-pointer"
                    >
                      <div className={`absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        selectedRef.status === 'In Progress' 
                          ? 'bg-amber-500 border-transparent text-white scale-110 shadow-md' 
                          : selectedRef.status === 'Completed' || selectedRef.status === 'Picked Up'
                            ? 'bg-teal-600 border-transparent text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-400 group-hover:border-slate-400'
                      }`}>
                        {selectedRef.status === 'Completed' || selectedRef.status === 'Picked Up' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h6 className={`font-bold text-sm ${
                          selectedRef.status === 'In Progress' ? 'text-amber-600' :
                          selectedRef.status === 'Completed' || selectedRef.status === 'Picked Up' ? 'text-teal-600' :
                          'text-slate-500 group-hover:text-slate-800'
                        }`}>In Progress</h6>
                        <p className="text-xs text-slate-450 mt-0.5">Dukumiintiga waa la wadaa (Processing)</p>
                      </div>
                    </div>

                    {/* Step: Completed */}
                    <div 
                      onClick={() => handleUpdateStatus(selectedRef.id, 'Completed')}
                      className="relative flex gap-4 group cursor-pointer"
                    >
                      <div className={`absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        selectedRef.status === 'Completed' 
                          ? 'bg-teal-600 border-transparent text-white scale-110 shadow-md' 
                          : selectedRef.status === 'Picked Up'
                            ? 'bg-emerald-600 border-transparent text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-400 group-hover:border-slate-400'
                      }`}>
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <div className="min-w-0">
                        <h6 className={`font-bold text-sm ${
                          selectedRef.status === 'Completed' ? 'text-teal-600' :
                          selectedRef.status === 'Picked Up' ? 'text-emerald-600' :
                          'text-slate-500 group-hover:text-slate-800'
                        }`}>Completed</h6>
                        <p className="text-xs text-slate-450 mt-0.5">Waa dhammaaday, diyaar u yahay wareejin</p>
                      </div>
                    </div>

                    {/* Step: Picked Up */}
                    <div 
                      onClick={() => handleUpdateStatus(selectedRef.id, 'Picked Up')}
                      className="relative flex gap-4 group cursor-pointer"
                    >
                      <div className={`absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        selectedRef.status === 'Picked Up' 
                          ? 'bg-emerald-600 border-transparent text-white scale-110 shadow-md' 
                          : 'bg-white border-slate-200 text-slate-400 group-hover:border-slate-400'
                      }`}>
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <div className="min-w-0">
                        <h6 className={`font-bold text-sm ${selectedRef.status === 'Picked Up' ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-800'}`}>Picked Up</h6>
                        <p className="text-xs text-slate-450 mt-0.5">Kliente-ku waa qaatay dukumiintiga (Archived)</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-8">
                  <p className="text-xs text-slate-450 text-center leading-relaxed font-bold">
                    * Waxaad bedeli kartaa status-ka adigoo gujinaya talaabooyinka sare (Admin/Staff only).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) for mobile */}
      {!showAddForm && (
        <button
          onClick={handleOpenAddForm}
          className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 hover:bg-teal-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Add New Ref"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {viewingSurvey && (
        <DetailsModal record={viewingSurvey} onClose={() => setViewingSurvey(null)} />
      )}

    </div>
  );
}
