
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Payment, PaymentMode } from '../types';
import { paymentAPI } from '../services/api';

interface BusinessPerformanceProps {
  payments: Payment[];
  setPayments?: React.Dispatch<React.SetStateAction<Payment[]>>;
  otherBusinesses: string[];
  setOtherBusinesses?: React.Dispatch<React.SetStateAction<string[]>>;
  businessUnitInvestments?: Record<string, number>;
  setBusinessUnitInvestments?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  bankAccounts?: { id: string; name: string; status: string }[];
  openingBalances?: { CASH: number; CUB: number; KVB: number; CAPITAL: number };
  setOpeningBalances?: React.Dispatch<React.SetStateAction<{ CASH: number; CUB: number; KVB: number; CAPITAL: number }>>;
}

const BusinessPerformance: React.FC<BusinessPerformanceProps> = ({ payments, setPayments, otherBusinesses, setOtherBusinesses, businessUnitInvestments = {}, setBusinessUnitInvestments, bankAccounts = [], openingBalances, setOpeningBalances }) => {
  const [ledgerBiz, setLedgerBiz] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryType, setEntryType] = useState<'IN' | 'OUT'>('IN');
  const [entryForm, setEntryForm] = useState({ amount: 0, date: Date.now(), mode: 'CASH' as PaymentMode, notes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({ name: '', investment: 0 });
  const [editingInvestmentFor, setEditingInvestmentFor] = useState<string | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<string | null>(null);
  const [deleteUnitConfirmation, setDeleteUnitConfirmation] = useState('');
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) setShowDateDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const generateVoucherNumber = (date: number, type: 'VCH' | 'RCT'): string => {
    const d = new Date(date);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pattern = new RegExp(`^${type}-${ym}-(\\d+)$`);
    let max = 0;
    payments.forEach(p => {
      const field = type === 'RCT' ? p.receiptNumber : p.voucherNumber;
      const m = field?.match(pattern);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    });
    return `${type}-${ym}-${String(max + 1).padStart(3, '0')}`;
  };

  const performanceData = useMemo(() => {
    return otherBusinesses.map(biz => {
      const investment = businessUnitInvestments[biz] ?? 0;
      const bizPayments = payments.filter(p => p.businessUnit === biz);
      
      const income = bizPayments
        .filter(p => p.type === 'IN')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const expense = bizPayments
        .filter(p => p.type === 'OUT')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const net = investment + income - expense;
      const margin = income > 0 ? ((income - expense) / income) * 100 : 0;
      
      return { name: biz, investment, income, expense, net, margin };
    });
  }, [payments, otherBusinesses, businessUnitInvestments]);

  const grandTotals = useMemo(() => {
    return performanceData.reduce((acc, d) => ({
      investment: acc.investment + (d.investment || 0),
      income: acc.income + d.income,
      expense: acc.expense + d.expense,
      net: acc.net + d.net
    }), { investment: 0, income: 0, expense: 0, net: 0 });
  }, [performanceData]);

  const handleSaveLedgerEntry = async () => {
    if (!ledgerBiz || !entryForm.amount || entryForm.amount <= 0 || !setPayments) return;
    setIsSubmitting(true);
    const paymentDate = typeof entryForm.date === 'number' ? entryForm.date : new Date(entryForm.date).getTime();
    try {
      if (editingPayment) {
        const typeDiff = entryType !== editingPayment.type;
        const payload = {
          type: entryType,
          voucherType: entryType === 'IN' ? 'RECEIPT' : 'PAYMENT',
          amount: entryForm.amount,
          mode: entryForm.mode,
          date: paymentDate,
          notes: entryForm.notes || `${ledgerBiz} - ${entryType === 'IN' ? 'Income' : 'Expense'}`,
        };
        await paymentAPI.update(editingPayment.id, payload);
        setPayments(prev => prev.map(p => p.id === editingPayment.id ? { ...p, ...payload, date: paymentDate } : p));
        if (setOpeningBalances && entryForm.mode === 'CASH') {
          const adj = typeDiff
            ? (entryType === 'IN' ? entryForm.amount : -entryForm.amount) - (editingPayment.type === 'IN' ? editingPayment.amount : -editingPayment.amount)
            : (entryType === 'IN' ? entryForm.amount - editingPayment.amount : -(entryForm.amount - editingPayment.amount));
          setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + adj }));
        }
      } else {
        const voucherNumber = generateVoucherNumber(paymentDate, 'VCH');
        const receiptNumber = entryType === 'IN' ? generateVoucherNumber(paymentDate, 'RCT') : undefined;
        const newPayment: Payment = {
          id: Math.random().toString(36).substr(2, 9),
          type: entryType,
          voucherType: entryType === 'IN' ? 'RECEIPT' : 'PAYMENT',
          voucherNumber,
          receiptNumber,
          sourceId: `BIZ_${ledgerBiz}`,
          sourceName: ledgerBiz,
          amount: entryForm.amount,
          mode: entryForm.mode,
          date: paymentDate,
          notes: entryForm.notes || `${ledgerBiz} - ${entryType === 'IN' ? 'Income' : 'Expense'}`,
          category: 'OTHER_BUSINESS',
          businessUnit: ledgerBiz,
        };
        const { id: _localId, ...toSend } = newPayment;
        const resp = await paymentAPI.create(toSend);
        const saved = { ...newPayment, id: resp.id || newPayment.id };
        setPayments(prev => [saved, ...prev]);
        if (setOpeningBalances && entryForm.mode === 'CASH') {
          setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + (entryType === 'IN' ? entryForm.amount : -entryForm.amount) }));
        }
      }
      setShowEntryModal(false);
      setEntryForm({ amount: 0, date: Date.now(), mode: 'CASH', notes: '' });
      setEditingPayment(null);
    } catch (e) {
      console.error('Failed to save ledger entry:', e);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toDateInputValue = (ts: number) => {
    if (!Number.isFinite(ts)) return new Date().toISOString().slice(0, 10);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  };

  const activeDateRange = useMemo(() => {
    const fmt = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    if (dateFilter === 'ALL') return { label: 'All Time', start: 0, end: Number.MAX_SAFE_INTEGER };
    if (dateFilter === 'TODAY') return { label: fmt(todayStart), start: todayStart, end: todayEnd };
    if (dateFilter === 'YESTERDAY') {
      const s = todayStart - 86400000; const e = todayStart - 1;
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'LAST_7') {
      const s = todayStart - 6 * 86400000;
      return { label: `${fmt(s)} to ${fmt(todayEnd)}`, start: s, end: todayEnd };
    }
    if (dateFilter === 'THIS_MONTH') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'LAST_MONTH') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'CUSTOM') {
      const s = customStartDate ? new Date(customStartDate).getTime() : 0;
      const e = customEndDate ? new Date(customEndDate).setHours(23, 59, 59, 999) : Number.MAX_SAFE_INTEGER;
      const lbl = customStartDate && customEndDate ? `${customStartDate} to ${customEndDate}` : customStartDate ? `From ${customStartDate}` : 'Custom Range';
      return { label: lbl, start: s, end: e };
    }
    return { label: 'All Time', start: 0, end: Number.MAX_SAFE_INTEGER };
  }, [dateFilter, customStartDate, customEndDate]);

  // ── FULL-PAGE LEDGER VIEW ──────────────────────────────────────────────────
  if (ledgerBiz) {
    const openingBalance = businessUnitInvestments[ledgerBiz] ?? 0;
    const allBizPayments = payments.filter(p => p.businessUnit === ledgerBiz).sort((a, b) => a.date - b.date);
    const totalIn  = allBizPayments.filter(p => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
    const totalOut = allBizPayments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
    let running = openingBalance;
    const allRows = allBizPayments.map(p => {
      running += p.type === 'IN' ? p.amount : -p.amount;
      return { ...p, runningBalance: running };
    });
    const filteredByDateSearch = allRows.filter(p => {
      const okDate = p.date >= activeDateRange.start && p.date <= activeDateRange.end;
      const q = search.toLowerCase().trim();
      const okSearch = !q || (p.notes || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.voucherNumber || '').toLowerCase().includes(q);
      return okDate && okSearch;
    });
    const rows = filterType === 'ALL' ? filteredByDateSearch : filteredByDateSearch.filter(r => r.type === filterType);
    const closing = openingBalance + totalIn - totalOut;

    return (
      <div className="space-y-0 animate-fadeIn">
        {/* Page Header */}
        <div className="flex items-center justify-between pb-6 border-b-2 border-slate-100 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setLedgerBiz(null); setFilterType('ALL'); }}
              className="h-11 w-11 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all"
            >
              <i className="fas fa-arrow-left"></i>
            </button>
            <div>
              <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
                <i className="fas fa-book-open text-indigo-500"></i>
                {ledgerBiz}
              </h2>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Transaction Ledger · Business Unit</p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 flex-wrap items-stretch lg:items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
              <input
                type="text"
                placeholder="Search particulars or voucher..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Date filter */}
            <div ref={dateDropdownRef} className="relative">
              <button
                onClick={() => setShowDateDropdown(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 hover:border-indigo-400 transition-all whitespace-nowrap"
              >
                <i className="fas fa-calendar-alt text-indigo-500"></i>
                <span>{activeDateRange.label}</span>
                <i className={`fas fa-chevron-down text-slate-400 text-[9px] transition-transform ${showDateDropdown ? 'rotate-180' : ''}`}></i>
              </button>
              {showDateDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-30 overflow-hidden animate-fadeIn flex">
                  <div className="min-w-[160px]">
                    {([
                      { key: 'ALL', label: 'All Time' },
                      { key: 'TODAY', label: 'Today' },
                      { key: 'YESTERDAY', label: 'Yesterday' },
                      { key: 'LAST_7', label: 'Last 7 Days' },
                      { key: 'THIS_MONTH', label: 'This Month' },
                      { key: 'LAST_MONTH', label: 'Last Month' },
                      { key: 'CUSTOM', label: 'Custom Range' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => { setDateFilter(opt.key); if (opt.key !== 'CUSTOM') setShowDateDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[10px] font-bold transition-colors flex items-center justify-between ${dateFilter === opt.key ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        {opt.label}
                        {opt.key === 'CUSTOM' && <i className={`fas fa-chevron-right text-[8px] ${dateFilter === 'CUSTOM' ? 'text-white' : 'text-slate-300'}`}></i>}
                      </button>
                    ))}
                  </div>
                  {dateFilter === 'CUSTOM' && (
                    <div className="px-4 py-3 space-y-2 border-l border-slate-100 bg-slate-50 min-w-[170px]">
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">From</label>
                        <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-500" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">To</label>
                        <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-500" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                      </div>
                      <button onClick={() => setShowDateDropdown(false)} className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700">Apply</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Add IN / Add OUT */}
            {setPayments && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingPayment(null); setEntryType('IN'); setEntryForm({ ...entryForm, date: Date.now() }); setShowEntryModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md"
                >
                  <i className="fas fa-plus"></i> Add IN
                </button>
                <button
                  onClick={() => { setEditingPayment(null); setEntryType('OUT'); setEntryForm({ ...entryForm, date: Date.now() }); setShowEntryModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-md"
                >
                  <i className="fas fa-minus"></i> Add OUT
                </button>
              </div>
            )}
            {/* Type filter pills */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setFilterType('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'ALL' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>All</button>
              <button onClick={() => setFilterType('IN')}  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'IN'  ? 'bg-emerald-100 text-emerald-700 shadow' : 'text-slate-400'}`}>Income</button>
              <button onClick={() => setFilterType('OUT')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'OUT' ? 'bg-rose-100 text-rose-700 shadow' : 'text-slate-400'}`}>Expenses</button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
            <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Opening (Investment)</div>
            <div className="text-2xl font-black text-indigo-600 italic tabular-nums">{openingBalance.toLocaleString()}</div>
          </div>
          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total IN</div>
            <div className="text-2xl font-black text-emerald-600 italic tabular-nums">{totalIn.toLocaleString()}</div>
          </div>
          <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100">
            <div className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Total OUT</div>
            <div className="text-2xl font-black text-rose-500 italic tabular-nums">{totalOut.toLocaleString()}</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-[2rem]">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Balance</div>
            <div className={`text-2xl font-black italic tabular-nums ${closing >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>{closing.toLocaleString()}</div>
          </div>
        </div>

        {/* Bank-Statement Table */}
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-lg overflow-hidden">
          {allBizPayments.length === 0 ? (
            <div className="text-center py-24 text-slate-400">
              <i className="fas fa-book-open text-5xl mb-4 block opacity-20"></i>
              <p className="text-xs font-black uppercase tracking-widest">No transactions recorded for this unit</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Particulars</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-emerald-300">IN</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-rose-300">OUT</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Balance</th>
                  {setPayments && <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-50">
                {openingBalance > 0 && (
                  <tr className="bg-indigo-50/50 border-b border-indigo-100">
                    <td className="px-6 py-5 text-xs font-bold text-slate-500">—</td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-black text-indigo-800 uppercase">Opening Balance (Investment)</div>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-mono font-bold text-emerald-600 tabular-nums">{openingBalance.toLocaleString()}</td>
                    <td className="px-6 py-5 text-right text-sm text-slate-300">—</td>
                    <td className="px-6 py-5 text-right"><span className="text-sm font-black italic tabular-nums text-indigo-700">{openingBalance.toLocaleString()}</span></td>
                    {setPayments && <td className="px-6 py-5"></td>}
                  </tr>
                )}
                {rows.map((p, idx) => (
                  <tr key={p.id} className={`hover:bg-indigo-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-6 py-5 text-xs font-bold text-slate-500 whitespace-nowrap">
                      {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-black text-slate-800 uppercase leading-tight">{p.notes || p.category || p.voucherType || '—'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {p.mode && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 uppercase">{p.mode}</span>}
                        {p.category && p.notes && <span className="text-[8px] font-bold text-slate-400 uppercase">{p.category}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-mono font-bold text-emerald-600 tabular-nums">
                      {p.type === 'IN' ? `${p.amount.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-mono font-bold text-rose-500 tabular-nums">
                      {p.type === 'OUT' ? `${p.amount.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-sm font-black italic tabular-nums ${p.runningBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        {p.runningBalance.toLocaleString()}
                      </span>
                    </td>
                    {setPayments && (
                      <td className="px-6 py-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setEditingPayment(p); setEntryType(p.type); setEntryForm({ amount: p.amount, date: p.date, mode: p.mode || 'CASH', notes: p.notes || '' }); setShowEntryModal(true); }}
                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit"
                          >
                            <i className="fas fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
                              try {
                                await paymentAPI.delete(p.id);
                                setPayments(prev => prev.filter(x => x.id !== p.id));
                                if (setOpeningBalances && p.mode === 'CASH') {
                                  setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH - (p.type === 'IN' ? p.amount : -p.amount) }));
                                }
                              } catch (e) {
                                console.error(e);
                                alert('Failed to delete.');
                              }
                            }}
                            className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                            title="Delete"
                          >
                            <i className="fas fa-trash-alt text-xs"></i>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="px-6 py-5 text-left text-xs font-black uppercase tracking-widest">Closing Balance</td>
                  <td className="px-6 py-5 text-right text-sm font-mono font-bold text-emerald-400 tabular-nums">{totalIn.toLocaleString()}</td>
                  <td className="px-6 py-5 text-right text-sm font-mono font-bold text-rose-400 tabular-nums">{totalOut.toLocaleString()}</td>
                  <td className="px-6 py-5 text-right text-xl font-black italic tabular-nums">{closing.toLocaleString()}</td>
                  {setPayments && <td></td>}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Add IN/OUT Entry Modal */}
        {showEntryModal && setPayments && (
          <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowEntryModal(false); setEditingPayment(null); }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-scaleUp" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-1">
                {editingPayment ? 'Edit Entry' : (entryType === 'IN' ? 'Add Income' : 'Add Expense')}
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">{ledgerBiz}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount ()</label>
                  <input
                    type="number"
                    className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield]"
                    placeholder="0"
                    value={entryForm.amount || ''}
                    onChange={e => setEntryForm({ ...entryForm, amount: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
                  <input
                    type="date"
                    className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500"
                    value={toDateInputValue(entryForm.date)}
                    onChange={e => setEntryForm({ ...entryForm, date: new Date(e.target.value).getTime() })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Mode</label>
                  <select
                    className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500 bg-white"
                    value={entryForm.mode}
                    onChange={e => setEntryForm({ ...entryForm, mode: e.target.value as PaymentMode })}
                  >
                    <option value="CASH">Cash</option>
                    {bankAccounts.filter(b => b.status === 'ACTIVE').map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Notes (optional)</label>
                  <input
                    type="text"
                    className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500"
                    placeholder="Particulars..."
                    value={entryForm.notes}
                    onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveLedgerEntry}
                  disabled={!entryForm.amount || isSubmitting}
                  className={`flex-1 py-3 rounded-xl font-black uppercase tracking-widest text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${entryType === 'IN' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}
                >
                  {isSubmitting ? 'Saving...' : (editingPayment ? 'Update' : `Save ${entryType === 'IN' ? 'Income' : 'Expense'}`)}
                </button>
                <button onClick={() => { setShowEntryModal(false); setEditingPayment(null); }} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MATRIX / LIST VIEW ─────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fadeIn">
      <header className="flex justify-between items-end border-b-2 border-slate-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Business Unit Matrix</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consolidated Analytics · All Units</p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className="fas fa-list text-xs"></i> List
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'card' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className="fas fa-th-large text-xs"></i> Cards
          </button>
        </div>
      </header>

      {/* Business Units Management */}
      {setOtherBusinesses && (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-display font-black text-slate-900 uppercase italic tracking-tighter mb-1">Business Units</h3>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Other operational divisions · Investment = Opening Balance</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(otherBusinesses || []).filter(biz => biz && biz.trim()).map(biz => (
              <span key={biz} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                {biz}
                {(businessUnitInvestments[biz] ?? 0) > 0 && (
                  <span className="text-indigo-600 font-mono">₹{(businessUnitInvestments[biz] ?? 0).toLocaleString()}</span>
                )}
                {setBusinessUnitInvestments && <button onClick={() => setEditingInvestmentFor(biz)} className="hover:text-indigo-600" title="Edit investment"><i className="fas fa-pen text-[8px]"></i></button>}
                <button onClick={() => { setUnitToDelete(biz); setDeleteUnitConfirmation(''); }} className="hover:text-rose-600" title="Remove business unit"><i className="fas fa-times"></i></button>
              </span>
            ))}
            {(otherBusinesses || []).filter(biz => biz && biz.trim()).length === 0 && <span className="text-xs text-slate-400 italic">No business units added.</span>}
          </div>
          <button
            onClick={() => { setNewUnitForm({ name: '', investment: 0 }); setShowAddUnitModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700"
          >
            <i className="fas fa-plus"></i> Add Business Unit
          </button>
        </div>
      )}

      {/* Add Business Unit Modal */}
      {showAddUnitModal && setOtherBusinesses && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddUnitModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-scaleUp" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-6">Add Business Unit</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unit Name</label>
                <input
                  type="text"
                  className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500 uppercase"
                  placeholder="e.g. TRANSPORT"
                  value={newUnitForm.name}
                  onChange={e => setNewUnitForm(f => ({ ...f, name: e.target.value.trim().toUpperCase() }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Investment Amount (Opening Balance)</label>
                <input
                  type="number"
                  className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield]"
                  placeholder="0"
                  value={newUnitForm.investment || ''}
                  onChange={e => setNewUnitForm(f => ({ ...f, investment: Number(e.target.value) || 0 }))}
                />
                <p className="text-[9px] text-slate-500 mt-1">Acts as opening balance in the ledger</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  const name = newUnitForm.name.trim().toUpperCase();
                  if (!name) { alert('Enter unit name'); return; }
                  if ((otherBusinesses || []).includes(name)) { alert('Unit already exists'); return; }
                  setOtherBusinesses(prev => [...prev, name]);
                  setBusinessUnitInvestments?.(prev => ({ ...prev, [name]: newUnitForm.investment || 0 }));
                  setShowAddUnitModal(false);
                  setNewUnitForm({ name: '', investment: 0 });
                }}
                className="flex-1 py-3 rounded-xl font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Add
              </button>
              <button onClick={() => setShowAddUnitModal(false)} className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Investment Modal */}
      {editingInvestmentFor && setBusinessUnitInvestments && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEditingInvestmentFor(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-scaleUp" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-6">Edit Investment · {editingInvestmentFor}</h3>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Investment (Opening Balance)</label>
              <input
                type="number"
                className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield]"
                value={businessUnitInvestments[editingInvestmentFor] ?? ''}
                onChange={e => setBusinessUnitInvestments(prev => ({ ...prev, [editingInvestmentFor]: Number(e.target.value) || 0 }))}
              />
            </div>
            <button onClick={() => setEditingInvestmentFor(null)} className="mt-6 w-full py-3 rounded-xl font-black uppercase tracking-widest bg-slate-600 text-white hover:bg-slate-700">Done</button>
          </div>
        </div>
      )}

      {/* Delete Business Unit Confirmation Modal */}
      {unitToDelete && setOtherBusinesses && (
        <div className="fixed inset-0 bg-rose-900/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-rose-100 bg-rose-50 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-display font-black text-rose-900 uppercase italic tracking-tighter">⚠️ Remove Business Unit?</h3>
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">This action requires confirmation</p>
              </div>
              <button onClick={() => { setUnitToDelete(null); setDeleteUnitConfirmation(''); }} className="text-rose-400 hover:text-rose-600">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-700">You are about to remove:</p>
                <p className="text-lg font-black text-rose-700 mt-1">{unitToDelete}</p>
                <p className="text-xs text-slate-500 mt-2">Ledger transactions will remain. Only the unit will be removed from this list.</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Type <span className="text-rose-600 font-black">{unitToDelete}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteUnitConfirmation}
                  onChange={e => setDeleteUnitConfirmation(e.target.value)}
                  placeholder="Type unit name..."
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-rose-500 uppercase"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setUnitToDelete(null); setDeleteUnitConfirmation(''); }}
                  className="flex-1 py-3 text-slate-600 font-black uppercase text-xs tracking-widest hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteUnitConfirmation.trim().toUpperCase() === unitToDelete) {
                      setOtherBusinesses(prev => prev.filter(b => b !== unitToDelete));
                      setBusinessUnitInvestments?.(prev => { const next = { ...prev }; delete next[unitToDelete]; return next; });
                      setUnitToDelete(null);
                      setDeleteUnitConfirmation('');
                    }
                  }}
                  disabled={deleteUnitConfirmation.trim().toUpperCase() !== unitToDelete}
                  className="flex-1 py-3 bg-rose-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-rose-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <i className="fas fa-trash-alt mr-2"></i>Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary totals strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 shadow-sm">
           <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Total Investment</div>
           <div className="text-2xl font-black text-indigo-600 tracking-tighter tabular-nums italic">{grandTotals.investment.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Revenue</div>
           <div className="text-2xl font-black text-emerald-600 tracking-tighter tabular-nums italic">{grandTotals.income.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Expenses</div>
           <div className="text-2xl font-black text-rose-500 tracking-tighter tabular-nums italic">{grandTotals.expense.toLocaleString()}</div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
           <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Unit Net Balance</div>
           <div className={`text-2xl font-black tracking-tighter tabular-nums italic ${grandTotals.net >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>{grandTotals.net.toLocaleString()}</div>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">#</th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Business Unit</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-indigo-300">Investment</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-emerald-300">Income</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-rose-300">Expense</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-amber-300">Net Balance</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Margin</th>
                <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {performanceData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-xs font-black text-slate-300 uppercase tracking-widest">
                    No business units found
                  </td>
                </tr>
              ) : (
                performanceData.map((biz, idx) => (
                  <tr key={biz.name} className={`hover:bg-indigo-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-6 py-5 text-xs font-black text-slate-300">{idx + 1}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <i className="fas fa-building-circle-check text-indigo-400 text-xs"></i>
                        </div>
                        <div className="font-black text-slate-800 uppercase text-sm tracking-tight">{biz.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-indigo-600 tabular-nums">
                      {(biz.investment || 0) > 0 ? `${(biz.investment || 0).toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-emerald-600 tabular-nums">
                      {biz.income > 0 ? `${biz.income.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-rose-500 tabular-nums">
                      {biz.expense > 0 ? `${biz.expense.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-sm font-black italic tabular-nums ${biz.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                        {biz.net.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${biz.margin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {biz.margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <button
                        onClick={() => setLedgerBiz(biz.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all text-[9px] font-black uppercase tracking-widest mx-auto"
                      >
                        <i className="fas fa-book-open text-xs"></i> Ledger
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-900 text-white">
              <tr>
                <td colSpan={2} className="px-6 py-5 text-xs font-black uppercase tracking-widest">Total</td>
                <td className="px-6 py-5 text-right text-sm font-black text-indigo-400 tabular-nums">{grandTotals.investment.toLocaleString()}</td>
                <td className="px-6 py-5 text-right text-sm font-black text-emerald-400 tabular-nums">{grandTotals.income.toLocaleString()}</td>
                <td className="px-6 py-5 text-right text-sm font-black text-rose-400 tabular-nums">{grandTotals.expense.toLocaleString()}</td>
                <td className="px-6 py-5 text-right text-sm font-black text-amber-400 tabular-nums italic">{grandTotals.net.toLocaleString()}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {performanceData.map(biz => (
            <div key={biz.name} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group hover:border-indigo-200 transition-all transform hover:-translate-y-2">
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="h-14 w-14 rounded-3xl flex items-center justify-center shadow-lg bg-indigo-50 text-indigo-500">
                    <i className="fas fa-building-circle-check text-2xl"></i>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${biz.margin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {biz.margin.toFixed(1)}% Margin
                  </div>
                </div>
                <h3 className="font-black text-slate-800 text-xl uppercase leading-none mb-6 italic tracking-tighter">{biz.name}</h3>
                <div className="space-y-4">
                   {(biz.investment || 0) > 0 && (
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-indigo-500 uppercase tracking-widest">Investment</span>
                      <span className="font-black text-indigo-600">{biz.investment.toLocaleString()}</span>
                   </div>
                   )}
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Total Income</span>
                      <span className="font-black text-emerald-600">{biz.income.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Total Expense</span>
                      <span className="font-black text-rose-500">{biz.expense.toLocaleString()}</span>
                   </div>
                   <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Net Balance</span>
                      <span className={`text-xl font-black italic tracking-tighter ${biz.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{biz.net.toLocaleString()}</span>
                   </div>
                </div>
              </div>
              <div className="mt-auto bg-slate-50 p-4">
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${biz.net >= 0 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, Math.max(10, (biz.income / (grandTotals.income || 1)) * 100))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[8px] font-bold text-slate-400 uppercase">Share of Combined Revenue</div>
                  <button
                    onClick={() => setLedgerBiz(biz.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all text-[9px] font-black uppercase tracking-widest"
                  >
                    <i className="fas fa-book-open text-xs"></i> Ledger
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BusinessPerformance;

