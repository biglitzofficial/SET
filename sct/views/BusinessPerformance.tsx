
import React, { useMemo, useState } from 'react';
import { Payment } from '../types';

interface BusinessPerformanceProps {
  payments: Payment[];
  otherBusinesses: string[];
}

const BusinessPerformance: React.FC<BusinessPerformanceProps> = ({ payments, otherBusinesses }) => {
  const [ledgerBiz, setLedgerBiz] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  const performanceData = useMemo(() => {
    return otherBusinesses.map(biz => {
      const bizPayments = payments.filter(p => p.businessUnit === biz);
      
      const income = bizPayments
        .filter(p => p.type === 'IN')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const expense = bizPayments
        .filter(p => p.type === 'OUT')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const net = income - expense;
      const margin = income > 0 ? (net / income) * 100 : 0;
      
      return { name: biz, income, expense, net, margin };
    });
  }, [payments, otherBusinesses]);

  const grandTotals = useMemo(() => {
    return performanceData.reduce((acc, d) => ({
      income: acc.income + d.income,
      expense: acc.expense + d.expense,
      net: acc.net + d.net
    }), { income: 0, expense: 0, net: 0 });
  }, [performanceData]);

  // ── FULL-PAGE LEDGER VIEW ──────────────────────────────────────────────────
  if (ledgerBiz) {
    const bizPayments = payments.filter(p => p.businessUnit === ledgerBiz).sort((a, b) => a.date - b.date);
    const totalIn  = bizPayments.filter(p => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
    const totalOut = bizPayments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
    let running = 0;
    const allRows = bizPayments.map(p => {
      running += p.type === 'IN' ? p.amount : -p.amount;
      return { ...p, runningBalance: running };
    });
    const rows = filterType === 'ALL' ? allRows : allRows.filter(r => r.type === filterType);
    const closing = totalIn - totalOut;

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

          {/* Filter pills */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setFilterType('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'ALL' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>All</button>
            <button onClick={() => setFilterType('IN')}  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'IN'  ? 'bg-emerald-100 text-emerald-700 shadow' : 'text-slate-400'}`}>Income</button>
            <button onClick={() => setFilterType('OUT')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'OUT' ? 'bg-rose-100 text-rose-700 shadow' : 'text-slate-400'}`}>Expenses</button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total IN</div>
            <div className="text-3xl font-black text-emerald-600 italic tabular-nums">₹{totalIn.toLocaleString()}</div>
          </div>
          <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100">
            <div className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Total OUT</div>
            <div className="text-3xl font-black text-rose-500 italic tabular-nums">₹{totalOut.toLocaleString()}</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-[2rem]">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Balance</div>
            <div className={`text-3xl font-black italic tabular-nums ${closing >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>₹{closing.toLocaleString()}</div>
          </div>
        </div>

        {/* Bank-Statement Table */}
        <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-lg overflow-hidden">
          {bizPayments.length === 0 ? (
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-50">
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
                      {p.type === 'IN' ? `₹${p.amount.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-mono font-bold text-rose-500 tabular-nums">
                      {p.type === 'OUT' ? `₹${p.amount.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-sm font-black italic tabular-nums ${p.runningBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        ₹{p.runningBalance.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="px-6 py-5 text-left text-xs font-black uppercase tracking-widest">Closing Balance</td>
                  <td className="px-6 py-5 text-right text-sm font-mono font-bold text-emerald-400 tabular-nums">₹{totalIn.toLocaleString()}</td>
                  <td className="px-6 py-5 text-right text-sm font-mono font-bold text-rose-400 tabular-nums">₹{totalOut.toLocaleString()}</td>
                  <td className="px-6 py-5 text-right text-xl font-black italic tabular-nums">₹{closing.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
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

      {/* Summary totals strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Revenue</div>
           <div className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums italic">₹{grandTotals.income.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Expenses</div>
           <div className="text-3xl font-black text-rose-500 tracking-tighter tabular-nums italic">₹{grandTotals.expense.toLocaleString()}</div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
           <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Unit Net Profit</div>
           <div className="text-3xl font-black text-amber-400 tracking-tighter tabular-nums italic">₹{grandTotals.net.toLocaleString()}</div>
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
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-emerald-300">Income</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-rose-300">Expense</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-amber-300">Net Profit</th>
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Margin</th>
                <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {performanceData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-xs font-black text-slate-300 uppercase tracking-widest">
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
                    <td className="px-6 py-5 text-right text-sm font-black text-emerald-600 tabular-nums">
                      {biz.income > 0 ? `₹${biz.income.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-rose-500 tabular-nums">
                      {biz.expense > 0 ? `₹${biz.expense.toLocaleString()}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-sm font-black italic tabular-nums ${biz.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                        ₹{biz.net.toLocaleString()}
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
                <td className="px-6 py-5 text-right text-sm font-black text-emerald-400 tabular-nums">₹{grandTotals.income.toLocaleString()}</td>
                <td className="px-6 py-5 text-right text-sm font-black text-rose-400 tabular-nums">₹{grandTotals.expense.toLocaleString()}</td>
                <td className="px-6 py-5 text-right text-sm font-black text-amber-400 tabular-nums italic">₹{grandTotals.net.toLocaleString()}</td>
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
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Total Income</span>
                      <span className="font-black text-emerald-600">₹{biz.income.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Total Expense</span>
                      <span className="font-black text-rose-500">₹{biz.expense.toLocaleString()}</span>
                   </div>
                   <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Operating Profit</span>
                      <span className={`text-xl font-black italic tracking-tighter ${biz.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>₹{biz.net.toLocaleString()}</span>
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
