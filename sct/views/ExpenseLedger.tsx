
import React, { useState, useMemo } from 'react';
import { Payment } from '../types';

interface ExpenseLedgerProps {
  payments: Payment[];
}

const ExpenseLedger: React.FC<ExpenseLedgerProps> = ({ payments }) => {
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const allExpensePayments = useMemo(() => {
    return payments
      .filter(p =>
        p.type === 'OUT' &&
        !['CONTRA', 'LOAN_REPAYMENT', 'CHIT_SAVINGS'].includes(p.category) &&
        !p.category?.startsWith('INVESTMENT_')
      )
      .sort((a, b) => b.date - a.date); // newest first
  }, [payments]);

  const expenseCategories = useMemo(() => {
    const cats = new Set(allExpensePayments.map(p => p.category || 'Other'));
    return Array.from(cats).sort();
  }, [allExpensePayments]);

  const filteredExpenses = useMemo(() => {
    const base = allExpensePayments
      .filter(p => catFilter === 'ALL' || (p.category || 'Other') === catFilter)
      .filter(p => !search || p.sourceName?.toLowerCase().includes(search.toLowerCase()));
    // Compute running total on date-ascending order, then reverse
    const asc = [...base].reverse();
    let running = 0;
    const withRunning = asc.map(p => {
      running += p.amount;
      return { ...p, runningTotal: running };
    });
    return withRunning.reverse(); // back to newest first for display
  }, [allExpensePayments, catFilter, search]);

  const grandTotal = useMemo(() =>
    allExpensePayments
      .filter(p => catFilter === 'ALL' || (p.category || 'Other') === catFilter)
      .filter(p => !search || p.sourceName?.toLowerCase().includes(search.toLowerCase()))
      .reduce((s, p) => s + p.amount, 0),
    [allExpensePayments, catFilter, search]
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 col-span-2 md:col-span-1">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Expenses</div>
          <div className="text-2xl font-display font-black tracking-tighter text-rose-500">
            ₹{allExpensePayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
          </div>
          <div className="text-[9px] font-bold text-slate-400 mt-1">{allExpensePayments.length} transactions (all time)</div>
        </div>
        {expenseCategories.slice(0, 3).map(cat => {
          const total = allExpensePayments.filter(p => (p.category || 'Other') === cat).reduce((s, p) => s + p.amount, 0);
          return (
            <div
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? 'ALL' : cat)}
              className={`bg-white rounded-2xl border shadow p-5 cursor-pointer transition-all hover:shadow-md ${catFilter === cat ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
            >
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{cat}</div>
              <div className="text-xl font-display font-black tracking-tighter text-slate-800">₹{total.toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      {/* Ledger Card */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-100 p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Expense Ledger</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">All Operational Payments</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search party..."
              className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-300 w-44"
            />
            <div className="text-right">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Showing</div>
              <div className="text-xl font-display font-black tracking-tighter text-rose-500">₹{grandTotal.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCatFilter('ALL')}
            className={`flex-none px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${catFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >ALL</button>
          {expenseCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`flex-none px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${catFilter === cat ? 'bg-rose-500 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-rose-100'}`}
            >{cat}</button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Particulars</th>
                <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Mode</th>
                <th className="px-6 py-4 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Running Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <i className="fas fa-receipt text-3xl text-slate-200 mb-3 block"></i>
                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest">No expenses found</div>
                  </td>
                </tr>
              ) : filteredExpenses.map((p) => (
                <tr key={p.id} className="hover:bg-rose-50/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-500 text-[10px] whitespace-nowrap">
                    {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-800 uppercase text-xs">{p.sourceName || '—'}</div>
                    {p.notes && <div className="text-[9px] font-bold text-slate-400 mt-0.5">{p.notes}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest">
                      {p.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">
                      {p.mode}{p.targetMode ? ` → ${p.targetMode}` : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-black text-rose-600">₹{p.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-400 text-[10px]">₹{(p as any).runningTotal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900">
                <td colSpan={4} className="px-6 py-4 font-black text-white uppercase text-[10px] tracking-widest">
                  Grand Total — {filteredExpenses.length} Entries
                </td>
                <td className="px-6 py-4 text-right font-mono font-black text-rose-300 text-sm">₹{grandTotal.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpenseLedger;
