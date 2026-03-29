import React, { useState, useMemo, useEffect, useRef } from 'react';
import { JournalEntry, JournalLine, StaffUser } from '../types';
import { journalAPI } from '../services/api';
import { canStaffEditRecord, canStaffDeleteRecord } from '../utils/authHelpers';

interface JournalProps {
  journals: JournalEntry[];
  setJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  currentUser?: StaffUser | null;
}

// Common account heads for quick selection
const ACCOUNT_HEADS = [
  'Cash',
  'Bank - CUB',
  'Bank - KVB',
  'Capital Account',
  'Royalty Receivable',
  'Interest Receivable',
  'Chit Receivable',
  'General Receivable',
  'Royalty Income',
  'Interest Income',
  'Chit Income',
  'Direct Income',
  'Operating Expense',
  'Staff Salary',
  'Office Expense',
  'Travel Expense',
  'Interest Payable',
  'Creditor Account',
  'Debtor Account',
  'Principal Lent',
  'Principal Received',
  'Suspense Account',
  'Profit & Loss',
  'Drawings',
];

const emptyLine = (): JournalLine => ({
  id: Math.random().toString(36).substr(2, 9),
  accountHead: '',
  description: '',
  debit: 0,
  credit: 0,
});

const Journal: React.FC<JournalProps> = ({ journals, setJournals, currentUser }) => {
  // --- FORM STATE ---
  const [formDate, setFormDate] = useState(() => new Date().toISOString().substr(0, 10));
  const [formNarration, setFormNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // --- LIST STATE ---
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH'>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // --- TOTALS ---
  const totalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced  = totalDebit > 0 && totalDebit === totalCredit;
  const diff        = Math.abs(totalDebit - totalCredit);

  // --- JOURNAL NUMBER GENERATOR ---
  const generateJournalNumber = (date: number): string => {
    const d = new Date(date);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pattern = new RegExp(`^JNL-${ym}-(\\d+)$`);
    let max = 0;
    journals.forEach(j => {
      const m = j.journalNumber?.match(pattern);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    });
    return `JNL-${ym}-${String(max + 1).padStart(3, '0')}`;
  };

  // --- LINE HELPERS ---
  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  // --- RESET FORM ---
  const resetForm = () => {
    setFormDate(new Date().toISOString().substr(0, 10));
    setFormNarration('');
    setLines([emptyLine(), emptyLine()]);
    setEditingId(null);
  };

  // --- SUBMIT ---
  const handleSubmit = async () => {
    if (!isBalanced) return;
    if (!formNarration.trim()) { alert('Please enter a narration.'); return; }
    const validLines = lines.filter(l => l.accountHead.trim() && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) { alert('Please add at least 2 valid lines.'); return; }

    setIsSubmitting(true);
    try {
      const date = new Date(formDate).getTime();
      const entry: Omit<JournalEntry, 'id'> = {
        journalNumber: editingId
          ? (journals.find(j => j.id === editingId)?.journalNumber || generateJournalNumber(date))
          : generateJournalNumber(date),
        date,
        narration: formNarration.trim(),
        lines: validLines,
        totalDebit,
        totalCredit,
        isBalanced: true,
        createdAt: Date.now(),
        createdBy: currentUser?.name,
      };

      if (editingId) {
        await journalAPI.update(editingId, entry);
        setJournals(prev => prev.map(j => j.id === editingId ? { ...entry, id: editingId } : j));
        setSubmitSuccess(`Updated ${entry.journalNumber}`);
      } else {
        const result = await journalAPI.create(entry);
        const saved: JournalEntry = { ...entry, id: result.id };
        setJournals(prev => [saved, ...prev]);
        setSubmitSuccess(`Posted ${saved.journalNumber}`);
      }
      resetForm();
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err: any) {
      alert(`Failed to save: ${err?.message || 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- EDIT ---
  const handleEdit = (entry: JournalEntry) => {
    setFormDate(new Date(entry.date).toISOString().substr(0, 10));
    setFormNarration(entry.narration);
    setLines(entry.lines.length >= 2 ? entry.lines.map(l => ({ ...l })) : [...entry.lines.map(l => ({ ...l })), emptyLine()]);
    setEditingId(entry.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- DELETE ---
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await journalAPI.delete(id);
      setJournals(prev => prev.filter(j => j.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      alert(`Failed to delete: ${err?.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // --- FILTERED LIST ---
  const filteredJournals = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
    return journals.filter(j => {
      const matchSearch = !search ||
        j.journalNumber.toLowerCase().includes(search.toLowerCase()) ||
        j.narration.toLowerCase().includes(search.toLowerCase()) ||
        j.lines.some(l => l.accountHead.toLowerCase().includes(search.toLowerCase()));
      let matchDate = true;
      if (dateFilter === 'THIS_MONTH') matchDate = j.date >= thisMonthStart;
      if (dateFilter === 'LAST_MONTH') matchDate = j.date >= lastMonthStart && j.date <= lastMonthEnd;
      return matchSearch && matchDate;
    }).sort((a, b) => b.date - a.date);
  }, [journals, search, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJournals.length / PAGE_SIZE));
  const paginated  = filteredJournals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filteredJournals.length, search, dateFilter]);

  // List stats
  const listTotalDebit  = filteredJournals.reduce((s, j) => s + j.totalDebit,  0);
  const listTotalCredit = filteredJournals.reduce((s, j) => s + j.totalCredit, 0);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Journal</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Double-Entry Journal Entries</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
          <i className="fas fa-info-circle text-indigo-400"></i>
          Total Debit must equal Total Credit to post
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {submitSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3 animate-fadeIn">
          <i className="fas fa-check-circle text-emerald-500"></i>
          <span className="text-sm font-bold text-emerald-700">{submitSuccess} posted successfully.</span>
        </div>
      )}

      {/* ── ENTRY FORM ── */}
      <div className="bg-white rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter">
              {editingId ? 'Edit Journal Entry' : 'New Journal Entry'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {editingId ? journals.find(j => j.id === editingId)?.journalNumber : `Next: ${generateJournalNumber(new Date(formDate).getTime())}`}
            </p>
          </div>
          {editingId && (
            <button onClick={resetForm} className="text-xs font-bold text-slate-400 hover:text-rose-500 transition underline">
              Cancel Edit
            </button>
          )}
        </div>

        <div className="p-8 space-y-6">
          {/* Date + Narration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
              <input type="date" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 bg-white"
                value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Narration / Description</label>
              <input type="text" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 bg-white"
                placeholder="e.g. Being interest income for February 2026..."
                value={formNarration} onChange={e => setFormNarration(e.target.value)} />
            </div>
          </div>

          {/* Lines Table */}
          <div>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="min-w-full">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest w-8">#</th>
                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Account Head</th>
                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest">Description</th>
                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest w-36">Debit (Dr)</th>
                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest w-36">Credit (Cr)</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lines.map((line, idx) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      idx={idx}
                      onChange={updateLine}
                      onRemove={removeLine}
                      canRemove={lines.length > 2}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Total
                    </td>
                    <td className={`px-4 py-3 text-right font-black text-base font-display ${totalDebit > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                      {totalDebit.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right font-black text-base font-display ${totalCredit > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                      {totalCredit.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-4 py-3">
                      {totalDebit === 0 && totalCredit === 0 ? null : isBalanced ? (
                        <div className="flex items-center gap-2 text-emerald-600">
                          <i className="fas fa-check-circle"></i>
                          <span className="text-xs font-black uppercase tracking-widest">Balanced — Ready to Post</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-rose-500">
                          <i className="fas fa-exclamation-triangle"></i>
                          <span className="text-xs font-black uppercase tracking-widest">
                            Not Balanced — Difference: {diff.toLocaleString()} ({totalDebit > totalCredit ? 'Dr side heavy' : 'Cr side heavy'})
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Add Line Button */}
            <button onClick={addLine} className="mt-3 flex items-center gap-2 text-xs font-black text-indigo-600 hover:text-indigo-800 transition px-3 py-2 rounded-xl hover:bg-indigo-50">
              <i className="fas fa-plus-circle"></i> Add Line
            </button>
          </div>

          {/* Post Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isBalanced || !formNarration.trim()}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><i className="fas fa-spinner fa-spin"></i> Posting...</>
              : editingId
                ? <><i className="fas fa-save"></i> Update Entry</>
                : <><i className="fas fa-check-circle"></i> Post Journal Entry</>}
          </button>
        </div>
      </div>

      {/* ── JOURNAL LIST ── */}
      <div className="bg-white rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">
        {/* List Header */}
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase italic tracking-tighter">Journal Entries</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredJournals.length} entries</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                <input type="text" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-300 outline-none focus:ring-2 focus:ring-indigo-200 bg-white w-48" />
              </div>
              {/* Date filter */}
              <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                {(['ALL', 'THIS_MONTH', 'LAST_MONTH'] as const).map(df => (
                  <button key={df} onClick={() => setDateFilter(df)}
                    className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition ${dateFilter === df ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                    {df === 'THIS_MONTH' ? 'This Month' : df === 'LAST_MONTH' ? 'Last Month' : 'All'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Dr</span>
              <span className="text-sm font-black text-indigo-700">{listTotalDebit.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Cr</span>
              <span className="text-sm font-black text-indigo-700">{listTotalCredit.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest">Journal No</th>
                <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest">Narration</th>
                <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest">Debit</th>
                <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest">Credit</th>
                <th className="px-6 py-4 text-center text-[9px] font-black uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center">
                    <i className="fas fa-book-open text-slate-200 text-4xl mb-4 block"></i>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No journal entries found</p>
                  </td>
                </tr>
              )}
              {paginated.map(entry => (
                <React.Fragment key={entry.id}>
                  <tr className={`hover:bg-slate-50 transition cursor-pointer ${expandedId === entry.id ? 'bg-indigo-50/50' : ''}`}
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-black text-indigo-700 font-mono bg-indigo-50 px-2 py-1 rounded-lg">{entry.journalNumber}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-700 max-w-xs truncate">{entry.narration}</td>
                    <td className="px-6 py-4 text-right text-sm font-black text-slate-800 font-display">{entry.totalDebit.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm font-black text-slate-800 font-display">{entry.totalCredit.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      {entry.isBalanced
                        ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest">Balanced</span>
                        : <span className="px-2 py-1 bg-rose-100 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest">Unbalanced</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                        {canStaffEditRecord(currentUser, entry) && (
                          <button onClick={() => handleEdit(entry)} className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition text-xs">
                            <i className="fas fa-pen"></i>
                          </button>
                        )}
                        {canStaffDeleteRecord(currentUser, entry) && (
                          <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id}
                            className="h-8 w-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-600 hover:text-white transition text-xs disabled:opacity-50">
                            {deletingId === entry.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-alt"></i>}
                          </button>
                        )}
                        <button className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition text-xs">
                          <i className={`fas fa-chevron-${expandedId === entry.id ? 'up' : 'down'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded lines */}
                  {expandedId === entry.id && (
                    <tr>
                      <td colSpan={7} className="px-0 py-0 bg-indigo-50/30">
                        <div className="px-10 py-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-indigo-100">
                                <th className="py-2 text-left text-[9px] font-black text-indigo-400 uppercase tracking-widest w-64">Account Head</th>
                                <th className="py-2 text-left text-[9px] font-black text-indigo-400 uppercase tracking-widest">Description</th>
                                <th className="py-2 text-right text-[9px] font-black text-indigo-400 uppercase tracking-widest w-28">Debit</th>
                                <th className="py-2 text-right text-[9px] font-black text-indigo-400 uppercase tracking-widest w-28">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map(line => (
                                <tr key={line.id} className="border-b border-indigo-50 last:border-0">
                                  <td className="py-2 font-black text-slate-700 uppercase">{line.accountHead}</td>
                                  <td className="py-2 text-slate-500">{line.description || '—'}</td>
                                  <td className={`py-2 text-right font-black ${line.debit > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                                    {line.debit > 0 ? line.debit.toLocaleString() : '—'}
                                  </td>
                                  <td className={`py-2 text-right font-black ${line.credit > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                                    {line.credit > 0 ? line.credit.toLocaleString() : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-indigo-200">
                                <td colSpan={2} className="py-2 text-right text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total</td>
                                <td className="py-2 text-right font-black text-indigo-700">{entry.totalDebit.toLocaleString()}</td>
                                <td className="py-2 text-right font-black text-indigo-700">{entry.totalCredit.toLocaleString()}</td>
                              </tr>
                            </tfoot>
                          </table>
                          {entry.createdBy && (
                            <p className="text-[9px] text-indigo-400 font-bold mt-2 uppercase tracking-widest">Posted by {entry.createdBy}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-slate-50">
            <span className="text-xs font-bold text-slate-400">
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredJournals.length)} of {filteredJournals.length}
            </span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs disabled:opacity-30 hover:bg-slate-100">
                <i className="fas fa-chevron-left"></i>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(page - 3, totalPages - 5));
                const pg = offset + i + 1;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`h-8 w-8 rounded-lg text-xs font-black ${pg === page ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                    {pg}
                  </button>
                );
              })}
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs disabled:opacity-30 hover:bg-slate-100">
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── LINE ROW COMPONENT ──
interface LineRowProps {
  line: JournalLine;
  idx: number;
  onChange: (id: string, field: keyof JournalLine, value: any) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

const ACCOUNT_HEADS_SORTED = [...ACCOUNT_HEADS].sort();

const LineRow: React.FC<LineRowProps> = ({ line, idx, onChange, onRemove, canRemove }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = ACCOUNT_HEADS_SORTED.filter(h =>
    !line.accountHead || h.toLowerCase().includes(line.accountHead.toLowerCase())
  ).slice(0, 8);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <tr className="group">
      <td className="px-4 py-2 text-[10px] font-black text-slate-400 text-center">{idx + 1}</td>
      {/* Account Head */}
      <td className="px-2 py-2">
        <div ref={ref} className="relative">
          <input
            type="text"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 bg-white uppercase"
            placeholder="Account Head..."
            value={line.accountHead}
            onChange={e => { onChange(line.id, 'accountHead', e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 z-30 max-h-40 overflow-y-auto">
              {suggestions.map(s => (
                <div key={s} onClick={() => { onChange(line.id, 'accountHead', s); setShowSuggestions(false); }}
                  className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 cursor-pointer uppercase">{s}</div>
              ))}
            </div>
          )}
        </div>
      </td>
      {/* Description */}
      <td className="px-2 py-2">
        <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 bg-white"
          placeholder="Optional note..."
          value={line.description || ''}
          onChange={e => onChange(line.id, 'description', e.target.value)} />
      </td>
      {/* Debit */}
      <td className="px-2 py-2">
        <input type="number" min="0"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-black text-right outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          placeholder="0"
          value={line.debit || ''}
          onChange={e => { onChange(line.id, 'debit', Number(e.target.value) || 0); if (Number(e.target.value) > 0) onChange(line.id, 'credit', 0); }}
        />
      </td>
      {/* Credit */}
      <td className="px-2 py-2">
        <input type="number" min="0"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-black text-right outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          placeholder="0"
          value={line.credit || ''}
          onChange={e => { onChange(line.id, 'credit', Number(e.target.value) || 0); if (Number(e.target.value) > 0) onChange(line.id, 'debit', 0); }}
        />
      </td>
      {/* Remove */}
      <td className="px-2 py-2 text-center">
        {canRemove && (
          <button onClick={() => onRemove(line.id)} className="h-7 w-7 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition text-xs flex items-center justify-center mx-auto">
            <i className="fas fa-times"></i>
          </button>
        )}
      </td>
    </tr>
  );
};

export default Journal;
