'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Survey } from '@/types';
import DetailsModal from '@/components/DetailsModal';
import SurveyManagementModal from '@/components/SurveyManagementModal';
import { useMobileSearch } from '@/context/MobileSearchContext';
import { dateGroupKey, groupItems } from '@/lib/listGrouping';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import { useProfileNames, resolveCreatorName } from '@/lib/useProfileNames';
import { displayStatus, type SurveyDisplayStatus } from '@/lib/surveyCompleteness';
import { PENDING_SURVEY_KEY, useDataAutoRefresh } from '@/lib/useDataAutoRefresh';
import { useNotifications } from '@/context/NotificationContext';
import { numericIdentifier } from '@/lib/numbering';
import {
  Plus,
  Search,
  Calendar,
  Info,
  Sliders,
  Settings2,
} from 'lucide-react';

export default function RecordsPage() {
  const { newEntityIdsFor, dismissNewEntity } = useNotifications();
  const newSurveyIds = newEntityIdsFor('/records');
  const [records, setRecords] = useState<Survey[]>([]);
  const fetchRequestId = useRef(0);
  const profileNames = useProfileNames();
  const [usedSurveyIds, setUsedSurveyIds] = useState<Set<number>>(new Set());
  const { isOpen: showMobileSearch, setAvailable: setSearchAvailable } = useMobileSearch();
  const [loading, setLoading] = useState(true);
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [showAdvanceFilters, setShowAdvanceFilters] = useState(false);
  const [filterXaafada, setFilterXaafada] = useState('');
  const [filterLaanta, setFilterLaanta] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Boundary filters
  const [searchW, setSearchW] = useState('');
  const [searchB, setSearchB] = useState('');
  const [searchK, setSearchK] = useState('');
  const [searchG, setSearchG] = useState('');
  
  const [selectedRecord, setSelectedRecord] = useState<Survey | null>(null);
  const [managedRecord, setManagedRecord] = useState<Survey | null>(null);

  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'owner_az'>('newest');
  const [groupBy, setGroupBy] = useState<'none' | 'date' | 'status'>('none');
  const [groupAggregate, setGroupAggregate] = useState<'none' | 'count'>('count');

  useEffect(() => {
    setSearchAvailable(true);
  }, [setSearchAvailable]);

  const statusClass = (status: SurveyDisplayStatus) => ({
    Draft: 'bg-slate-100 text-slate-600',
    Completed: 'bg-emerald-50 text-emerald-700',
  }[status]);

  // Fetch all records from Supabase
  const fetchRecords = async () => {
    const requestId = ++fetchRequestId.current;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .order('serial_no', { ascending: false });

      if (error) throw error;
      // Focus, reconnect, and data-change events can overlap. Only the newest request
      // may update the list, otherwise a slower stale response can hide a new survey.
      if (requestId !== fetchRequestId.current) return;
      const remoteRecords = (data || []) as Survey[];
      let pendingSurvey: Survey | null = null;
      try {
        const pendingRaw = window.sessionStorage.getItem(PENDING_SURVEY_KEY);
        pendingSurvey = pendingRaw ? JSON.parse(pendingRaw) as Survey : null;
      } catch {
        pendingSurvey = null;
      }
      const remoteHasPending = pendingSurvey
        ? remoteRecords.some((record) => String(record.id) === String(pendingSurvey?.id))
        : false;
      const nextRecords = pendingSurvey && !remoteHasPending
        ? [pendingSurvey, ...remoteRecords]
        : remoteRecords;
      setRecords(nextRecords);
      if (remoteHasPending) window.sessionStorage.removeItem(PENDING_SURVEY_KEY);
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      if (requestId === fetchRequestId.current) setLoading(false);
    }
  };

  // The refresh hook performs the initial fetch as well as subsequent reconciliations.
  useDataAutoRefresh(fetchRecords);

  // Which surveys already have at least one reference issued against them — drives the
  // "Used / Not Used" badge so staff can spot land that's never had a reference at a glance.
  useEffect(() => {
    const fetchUsedSurveys = async () => {
      const { data, error } = await supabase.from('references').select('survey_id').not('survey_id', 'is', null);
      if (error) return;
      setUsedSurveyIds(new Set((data || []).map((r) => r.survey_id as number)));
    };
    fetchUsedSurveys();
  }, []);

  // Filter application
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 1. Search Query (Magaca / Neighborhood)
    if (search.trim() !== '') {
      const query = search.toLowerCase();
      result = result.filter(
        r => r.owner_name.toLowerCase().includes(query) || 
             r.neighborhood.toLowerCase().includes(query)
      );
    }

    // 2. Dropdown Filters
    if (filterXaafada) {
      result = result.filter(r => r.neighborhood === filterXaafada);
    }
    if (filterLaanta) {
      result = result.filter(r => r.branch === filterLaanta);
    }

    // 3. Date Filters
    if (startDate) {
      const start = new Date(startDate);
      result = result.filter(r => r.created_at && new Date(r.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include entire day
      result = result.filter(r => r.created_at && new Date(r.created_at) <= end);
    }

    // 4. Boundary Dimension Filters
    if (searchW) {
      result = result.filter(r => r.boundary_w_val?.includes(searchW));
    }
    if (searchB) {
      result = result.filter(r => r.boundary_b_val?.includes(searchB));
    }
    if (searchK) {
      result = result.filter(r => r.boundary_k_val?.includes(searchK));
    }
    if (searchG) {
      result = result.filter(r => r.boundary_g_val?.includes(searchG));
    }

    return result;
  }, [search, filterXaafada, filterLaanta, startDate, endDate, searchW, searchB, searchK, searchG, records]);

  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords];
    sorted.sort((a, b) => {
      if (sortBy === 'owner_az') return a.owner_name.localeCompare(b.owner_name);
      const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      return sortBy === 'oldest' ? -diff : diff;
    });
    return sorted;
  }, [filteredRecords, sortBy]);

  const groupedRecords = useMemo(() => {
    if (groupBy === 'none') return null;
    return groupItems(sortedRecords, (r) =>
      groupBy === 'date' ? dateGroupKey(r.created_at).key : displayStatus(r),
    ).map((group) => {
      const baseLabel = groupBy === 'date' ? dateGroupKey(group.items[0].created_at).label : displayStatus(group.items[0]);
      const label = groupAggregate === 'count' ? `${baseLabel} · ${group.items.length}` : baseLabel;
      return { ...group, label };
    });
  }, [sortedRecords, groupBy, groupAggregate]);

  return (
    <div className="p-4 md:p-8 w-full space-y-3.5 md:space-y-6 text-slate-800">
      <div className="hidden md:flex justify-end">
        <Link
          href="/records/new"
          className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-lg shadow-teal-600/15 hover:shadow-teal-600/25 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95 shrink-0 select-none"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Survey</span>
        </Link>
      </div>

      {/* Filter and Search Card */}
      <div className={`${showMobileSearch ? 'block' : 'hidden md:block'} bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-3 md:p-6 space-y-3 md:space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.02)]`}>
        <div className="flex flex-col md:flex-row gap-3">
          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 md:pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              placeholder="Raadi Magaca Milkiilaha ama Xaafadda..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Neighborhood Filter */}
            <select
              value={filterXaafada}
              onChange={(e) => setFilterXaafada(e.target.value)}
              className="bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="">Xaafad (All)...</option>
              <option value="Waaberi">Waaberi</option>
              <option value="Towfiiq">Towfiiq</option>
              <option value="Horseed">Horseed</option>
              <option value="Cadaada">Cadaada</option>
              <option value="Berdaale">Berdaale</option>
              <option value="Isha">Isha</option>
              <option value="Howlwadaag">Howlwadaag</option>
              <option value="Salaamay">Salaamay</option>
            </select>

            {/* Branch Filter */}
            <select
              value={filterLaanta}
              onChange={(e) => setFilterLaanta(e.target.value)}
              className="bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="">Laan (All)...</option>
              <option value="Laanta 1aad">Laanta 1aad</option>
              <option value="Laanta 2aad">Laanta 2aad</option>
              <option value="Laanta 3aad">Laanta 3aad</option>
            </select>

            {/* Toggle Advanced Filters */}
            <button
              onClick={() => setShowAdvanceFilters(!showAdvanceFilters)}
              className={`flex items-center gap-1.5 border rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs font-bold transition-all cursor-pointer ${
                showAdvanceFilters
                  ? 'bg-teal-50/80 border-teal-200/60 text-teal-600 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.1)]'
                  : 'bg-slate-50/60 border-slate-200/80 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </button>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs text-slate-700 focus:outline-none cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="newest">Sort: Newest first</option>
              <option value="oldest">Sort: Oldest first</option>
              <option value="owner_az">Sort: Owner (A–Z)</option>
            </select>

          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            className="flex-1 min-w-0 bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs text-slate-700 focus:outline-none cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
          >
            <option value="none">No group</option>
            <option value="date">Group: Date</option>
            <option value="status">Group: Status</option>
          </select>

          {groupBy !== 'none' && (
            <select
              value={groupAggregate}
              onChange={(e) => setGroupAggregate(e.target.value as typeof groupAggregate)}
              className="flex-1 min-w-0 bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3.5 text-xs text-slate-700 focus:outline-none cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="none">Aggregate: None</option>
              <option value="count">Aggregate: Count</option>
            </select>
          )}
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvanceFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Dates range */}
            <div className="space-y-2 lg:col-span-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Taariikhda (Date Range)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
              </div>
            </div>

            {/* Boundary Dimensions */}
            <div className="space-y-2 lg:col-span-2">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-455">Cabirka Soohdimaha (Waqooyi, Bari, Koonfur, Galbeed)</label>
              <div className="grid grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Waqooyi (W)"
                  value={searchW}
                  onChange={(e) => setSearchW(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
                <input
                  type="text"
                  placeholder="Bari (B)"
                  value={searchB}
                  onChange={(e) => setSearchB(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
                <input
                  type="text"
                  placeholder="Koonfur (K)"
                  value={searchK}
                  onChange={(e) => setSearchK(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
                <input
                  type="text"
                  placeholder="Galbeed (G)"
                  value={searchG}
                  onChange={(e) => setSearchG(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Records Listing */}
      {loading ? (
        <ListLoadingSkeleton />
      ) : sortedRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-200 rounded-3xl bg-white">
          <Info className="h-8 w-8 text-slate-400 mb-2" />
          <p className="text-slate-500 font-semibold text-sm">Wax sahano ah oo la helay ma jiraan.</p>
          <p className="text-xs text-slate-400 mt-1">Fadlan isku day inaad bedesho shaandheynta ama ku dar sahan cusub.</p>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-hidden border border-slate-200/60 rounded-3xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-150 text-slate-500 font-extrabold uppercase">
                    <th className="px-6 py-4">S/N</th>
                    <th className="px-6 py-4">Milkiilaha (Owner)</th>
                    <th className="px-6 py-4">Taarikh</th>
                    <th className="px-6 py-4">Xaafad</th>
                    <th className="px-6 py-4">Soohdimaha</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Record Creator</th>
                    <th className="px-6 py-4">Reference</th>
                    <th className="px-6 py-4 text-right">Maamul</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {(groupedRecords ?? [{ key: 'all', label: '', items: sortedRecords }]).map((group) => (
                    <React.Fragment key={group.key}>
                      {groupBy !== 'none' && (
                        <tr>
                          <td colSpan={10} className="bg-slate-50/70 px-6 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            {group.label}
                          </td>
                        </tr>
                      )}
                      {group.items.map((record) => (
                        <tr
                          key={record.id}
                          onClick={() => {
                            dismissNewEntity(record.id);
                            setSelectedRecord(record);
                          }}
                          className={`${newSurveyIds.has(record.id) ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200' : ''} hover:bg-teal-500/5 transition-all cursor-pointer group`}
                        >
                          <td className="px-6 py-4 font-black text-slate-400 group-hover:text-teal-600 transition-colors">
                            {record.survey_no || record.serial_no}
                          </td>
                          <td className="px-6 py-4 font-extrabold text-slate-800 text-sm">
                            <span className="flex items-center gap-2">
                              {record.owner_name}
                              {newSurveyIds.has(record.id) && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">New</span>}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              {record.created_at ? new Date(record.created_at).toLocaleDateString('so-SO') : '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-50 border border-slate-200/60 text-slate-600 text-xs font-extrabold">
                              {record.neighborhood}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">
                            {record.boundary_w_val ?
                              `W:${record.boundary_w_val} | B:${record.boundary_b_val} | K:${record.boundary_k_val} | G:${record.boundary_g_val}`
                              : record.built_details || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <code className="text-teal-600 font-mono font-bold select-all bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
                              {record.gps_location || '0.0, 0.0'}
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusClass(displayStatus(record))}`}>{displayStatus(record)}</span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-bold">
                            {resolveCreatorName(record.created_by, profileNames) || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${
                                usedSurveyIds.has(record.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {usedSurveyIds.has(record.id) ? 'Used' : 'Not Used'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={(event) => { event.stopPropagation(); setManagedRecord(record); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                              <Settings2 className="h-3.5 w-3.5" /> Maamul
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE LIST VIEW */}
          <div className="md:hidden mb-12">
            <div className="grid grid-cols-[52px_1fr_auto_40px] items-center gap-3 border-b border-slate-200 px-1 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>No.</span>
              <span>Milkiile</span>
              <span>Status</span>
              <span className="text-center">Action</span>
            </div>
            {(groupedRecords ?? [{ key: 'all', label: '', items: sortedRecords }]).map((group) => (
              <div key={group.key}>
                {groupBy !== 'none' && (
                  <div className="px-1 pb-1.5 pt-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    {group.label}
                  </div>
                )}
                <div className="divide-y divide-slate-200/80">
                  {group.items.map((record) => (
                    <div
                      key={record.id}
                      onClick={() => {
                        dismissNewEntity(record.id);
                        setSelectedRecord(record);
                      }}
                      className={`grid grid-cols-[52px_1fr_auto_40px] items-center gap-3 px-1 py-3.5 cursor-pointer transition-colors hover:bg-slate-50/80 active:bg-slate-50 ${newSurveyIds.has(record.id) ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200' : ''}`}
                    >
                      <span className="truncate text-xs font-black text-slate-500">{numericIdentifier(record.survey_no || record.serial_no)}</span>
                      <div className="min-w-0">
                        <h4 className="flex items-center gap-1.5 truncate text-xs font-extrabold text-slate-800">{record.owner_name}{newSurveyIds.has(record.id) && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[7px] font-black uppercase text-white">New</span>}</h4>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{record.created_at ? new Date(record.created_at).toLocaleDateString('so-SO') : '-'}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-600">{record.neighborhood}</span>
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] font-semibold text-slate-400">
                          {resolveCreatorName(record.created_by, profileNames) && (
                            <span>Added by {resolveCreatorName(record.created_by, profileNames)}</span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black ${
                              usedSurveyIds.has(record.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {usedSurveyIds.has(record.id) ? 'Used' : 'Not Used'}
                          </span>
                        </p>
                      </div>
                      <span className={`inline-flex items-center justify-self-end whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(displayStatus(record))}`}>{displayStatus(record)}</span>
                      <button
                        onClick={(event) => { event.stopPropagation(); setManagedRecord(record); }}
                        className="flex h-8 w-8 items-center justify-center justify-self-center rounded-lg border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        aria-label="Maamul survey"
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Details Modal Mounting */}
      {selectedRecord && (
        <DetailsModal 
          record={selectedRecord} 
          onClose={() => setSelectedRecord(null)} 
        />
      )}

      {managedRecord && (
        <SurveyManagementModal
          record={managedRecord}
          onClose={() => setManagedRecord(null)}
          onChanged={fetchRecords}
        />
      )}

      {/* Floating Action Button (FAB) for mobile */}
      <Link
        href="/records/new"
        className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 hover:bg-teal-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        aria-label="Add New Survey"
      >
        <Plus className="h-7 w-7" />
      </Link>
    </div>
  );
}
