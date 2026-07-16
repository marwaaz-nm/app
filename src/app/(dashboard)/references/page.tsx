'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Reference, Survey } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/context/ModalContext';
import { 
  Plus, 
  Search, 
  Files, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  HelpCircle, 
  FileText, 
  X, 
  Loader2, 
  ChevronRight, 
  ArrowRight,
  TrendingUp
} from 'lucide-react';

export default function ReferencesPage() {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  
  const [references, setReferences] = useState<Reference[]>([]);
  const [filteredReferences, setFilteredReferences] = useState<Reference[]>([]);
  const [surveys, setSurveys] = useState<{ id: number; serial_no: number; owner_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search/Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [refNumber, setRefNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  
  // Selected Ref Details Modal
  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);

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

  // Set default issue date when opening form
  const handleOpenAddForm = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setIssueDate(localDateTime);
    setShowAddForm(true);
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
        /* Header card */
        <div className="flex flex-row justify-between items-center gap-4 bg-white p-3 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm w-full">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 text-teal-600 p-2 rounded-xl border border-teal-100 shrink-0">
              <Files className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 leading-tight">
                Reference Records
              </h2>
              <p className="hidden sm:block text-[10px] md:text-xs text-slate-500 font-semibold mt-0.5">
                Maamulka tixraacyada, heshiisyada iyo dukumiintiyada.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile search toggle button */}
            <button
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-650 hover:text-slate-800 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              {showMobileSearch ? <X className="h-4.5 w-4.5" /> : <Search className="h-4.5 w-4.5" />}
            </button>

            <button
              onClick={handleOpenAddForm}
              className="hidden md:flex items-center gap-2 bg-teal-600 hover:bg-teal-705 text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Ref</span>
            </button>
          </div>
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
                  <option value="Beec Dhul">Beec Dhul</option>
                  <option value="Beec Gaari">Beec Gaari</option>
                  <option value="Beec Mooto">Beec Mooto</option>
                  <option value="Sugitaan Milkiyad Dhul">Sugitaan Milkiyad Dhul</option>
                  <option value="Sugitaan Dhaxalkoob">Sugitaan Dhaxalkoob</option>
                  <option value="Sugitaan Milkiyad Gaari/Koox/Nooc kale">Sugitaan Milkiyad Gaari/Koox/Nooc kale</option>
                  <option value="Codsi Sabarloog">Codsi Sabarloog</option>
                  <option value="Wakaalad">Wakaalad</option>
                  <option value="Damaanad">Damaanad</option>
                  <option value="Heshiis">Heshiis</option>
                  <option value="Cadeyn">Cadeyn</option>
                  <option value="Cadeyn Heshiis Kiro">Cadeyn Heshiis Kiro</option>
                  <option value="Xeer Hoosaad">Xeer Hoosaad</option>
                  <option value="Cadeyn Rahan">Cadeyn Rahan</option>
                  <option value="Qiimeyn Guri">Qiimeyn Guri</option>
                  <option value="Cadeyn Hibeyn/ Waqaf">Cadeyn Hibeyn/ Waqaf</option>
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
          <div className={`${showMobileSearch ? 'flex' : 'hidden md:flex'} bg-white border border-slate-100 rounded-2xl md:rounded-3xl p-3 flex flex-row gap-2 shadow-sm w-full items-center`}>
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

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer max-w-[120px] md:max-w-none shrink-0"
            >
              <option value="">Status (All)...</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Picked Up">Picked Up</option>
            </select>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : filteredReferences.length === 0 ? (
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
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredReferences.map(r => (
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
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS */}
              <div className="grid grid-cols-1 gap-4 md:hidden pb-12">
                {filteredReferences.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRef(r)}
                    className="flex items-center justify-between p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:border-slate-300 transition-all group"
                  >
                    <div className="overflow-hidden min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-black text-sm text-teal-600">{r.ref_number}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase ${getStatusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-800 truncate">{r.subject}</h4>
                      {r.surveys && (
                        <p className="text-[10px] text-slate-500 mt-1 truncate font-semibold">
                          Sahan: #{r.surveys.serial_no} — {r.surveys.owner_name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400 shrink-0 group-hover:text-teal-600 transition-colors" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reference Details Modal with Status Stepper */}
      {selectedRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
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
                  <div className="p-5 bg-teal-50/40 border border-teal-100 rounded-2xl space-y-1">
                    <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">CONNECTED LAND SURVEY</span>
                    <div className="flex items-center gap-2 text-slate-855 font-extrabold text-sm">
                      <span className="h-2 w-2 rounded-full bg-teal-500" />
                      <span>Sahan Lr: #{selectedRef.surveys.serial_no} — {selectedRef.surveys.owner_name}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400">FAAHFAAHIN (NOTES/DETAILS)</span>
                  <div className="p-4 rounded-2xl bg-slate-50/40 border border-slate-200 text-sm text-slate-800 min-h-[100px] leading-relaxed">
                    {selectedRef.details || 'No additional notes provided.'}
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
          className="fixed bottom-20 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 hover:bg-teal-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Add New Ref"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

    </div>
  );
}
