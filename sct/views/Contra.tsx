import React, { useState, useMemo } from 'react';
import { Payment, BankAccount, UserRole } from '../types';
import { paymentAPI } from '../services/api';

interface ContraProps {
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  bankAccounts: BankAccount[];
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number };
  setOpeningBalances: React.Dispatch<React.SetStateAction<{ CASH: number; CUB: number; KVB: number; CAPITAL: number }>>;
  role: UserRole;
}

const Contra: React.FC<ContraProps> = ({
  payments, setPayments,
  bankAccounts, setBankAccounts,
  openingBalances, setOpeningBalances,
  role,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const [fromAccount, setFromAccount] = useState('CASH');
  const [toAccount, setToAccount]     = useState('');
  const [amount, setAmount]           = useState('');
  const [date, setDate]               = useState(today);
  const [notes, setNotes]             = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg]   = useState('');

  // Table filters
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  const allAccounts = [
    { id: 'CASH', name: 'Cash Drawer' },
    ...bankAccounts.filter(b => b.status === 'ACTIVE').map(b => ({ id: b.name, name: b.name })),
  ];

  // Live balance: opening + all payment movements for that account
  const getLiveBalance = (accountId: string): number => {
    const opening = accountId === 'CASH'
      ? openingBalances.CASH
      : (bankAccounts.find(b => b.name === accountId)?.openingBalance || 0);
    return payments.reduce((acc, p) => {
      if (p.mode === accountId) return p.type === 'IN' ? acc + p.amount : acc - p.amount;
      if (p.voucherType === 'CONTRA' && p.targetMode === accountId) return acc + p.amount;
      return acc;
    }, opening);
  };

  const generateVoucherNumber = (dateMs: number): string => {
    const d = new Date(dateMs);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pattern = new RegExp(`^VCH-${ym}-(\\d+)$`);
    let max = 0;
    payments.forEach(p => {
      const m = p.voucherNumber?.match(pattern);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    });
    return `VCH-${ym}-${String(max + 1).padStart(3, '0')}`;
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAccount || !toAccount || fromAccount === toAccount || !amount || Number(amount) <= 0) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSuccessMsg('');

    const dateMs = new Date(date).getTime();
    const voucherNumber = generateVoucherNumber(dateMs);
    const amt = Number(amount);

    const newPayment: Omit<Payment, 'id'> = {
      type: 'IN',
      voucherType: 'CONTRA',
      voucherNumber,
      sourceId: fromAccount,
      sourceName: `${fromAccount === 'CASH' ? 'Cash Drawer' : fromAccount} → ${toAccount === 'CASH' ? 'Cash Drawer' : toAccount}`,
      amount: amt,
      mode: fromAccount as any,
      targetMode: toAccount as any,
      date: dateMs,
      notes: notes || undefined,
      category: 'TRANSFER',
    };

    // Update wallet balances in memory (opening balance adjustments)
    if (fromAccount === 'CASH') {
      setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH - amt }));
    } else {
      setBankAccounts(prev => prev.map(b => b.name === fromAccount ? { ...b, openingBalance: b.openingBalance - amt } : b));
    }
    if (toAccount === 'CASH') {
      setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + amt }));
    } else {
      setBankAccounts(prev => prev.map(b => b.name === toAccount ? { ...b, openingBalance: b.openingBalance + amt } : b));
    }

    try {
      const saved = await paymentAPI.create(newPayment);
      setPayments(prev => [{ ...newPayment, id: saved.id || Math.random().toString(36).substr(2, 9) }, ...prev]);
      setSuccessMsg(`Contra entry ${voucherNumber} posted successfully.`);
      setAmount('');
      setNotes('');
      setDate(today);
    } catch (err) {
      console.error('Contra post failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    if (!window.confirm(`Delete contra entry ${p.voucherNumber}?`)) return;

    // Reverse the wallet balance
    if (p.mode === 'CASH') {
      setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + p.amount }));
    } else {
      setBankAccounts(prev => prev.map(b => b.name === p.mode ? { ...b, openingBalance: b.openingBalance + p.amount } : b));
    }
    if (p.targetMode === 'CASH') {
      setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH - p.amount }));
    } else {
      setBankAccounts(prev => prev.map(b => b.name === p.targetMode ? { ...b, openingBalance: b.openingBalance - p.amount } : b));
    }

    try {
      await paymentAPI.delete(id);
      setPayments(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const allContraEntries = useMemo(() =>
    payments
      .filter(p => p.voucherType === 'CONTRA' || p.category === 'TRANSFER')
      .sort((a, b) => b.date - a.date),
    [payments]
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return allContraEntries.filter(p => {
      if (q && !(
        p.voucherNumber?.toLowerCase().includes(q) ||
        p.mode?.toLowerCase().includes(q) ||
        p.targetMode?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q)
      )) return false;
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      return true;
    });
  }, [allContraEntries, search, dateFrom, dateTo]);

  const canDelete = role === 'OWNER' || role === 'ADMIN';

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-4xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Contra Entry</h1>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Fund Transfer Between Accounts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* ENTRY FORM */}
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
          <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tight mb-1">New Contra</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
            Debit one account · Credit another
          </p>

          {successMsg && (
            <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-black text-emerald-700 flex items-center gap-2">
              <i className="fas fa-check-circle"></i> {successMsg}
            </div>
          )}

          <form onSubmit={handlePost} className="space-y-5">

            {/* From → To row — fixed alignment */}
            <div className="flex items-start gap-3">
              {/* From */}
              <div className="flex-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  From (Credit)
                </label>
                <select
                  required
                  value={fromAccount}
                  onChange={e => setFromAccount(e.target.value)}
                  className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-white text-sm font-black uppercase outline-none focus:border-rose-400"
                >
                  {allAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-[10px] font-bold text-slate-400 mt-1.5 pl-1">
                  Balance: <span className="text-slate-700 font-black">{getLiveBalance(fromAccount).toLocaleString()}</span>
                </p>
              </div>

              {/* Arrow — centered between the two dropdowns */}
              <div className="pt-7 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shadow">
                  <i className="fas fa-right-long text-white text-sm"></i>
                </div>
              </div>

              {/* To */}
              <div className="flex-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  To (Debit)
                </label>
                <select
                  required
                  value={toAccount}
                  onChange={e => setToAccount(e.target.value)}
                  className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-white text-sm font-black uppercase outline-none focus:border-emerald-400"
                >
                  <option value="">— Select —</option>
                  {allAccounts.filter(a => a.id !== fromAccount).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-[10px] font-bold text-slate-400 mt-1.5 pl-1">
                  Balance: <span className="text-slate-700 font-black">{toAccount ? getLiveBalance(toAccount).toLocaleString() : '—'}</span>
                </p>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount</label>
              <input
                required
                type="number"
                min="1"
                placeholder="Enter amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border-2 border-slate-100 p-4 rounded-2xl text-2xl font-display font-black outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
              <input
                required
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border-2 border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white"
              />
            </div>

            {/* Narration */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Narration / Remarks</label>
              <input
                type="text"
                placeholder="e.g. Cash deposited into CUB..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border-2 border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !fromAccount || !toAccount || fromAccount === toAccount || !amount}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl hover:scale-[1.01] transition text-sm flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isSubmitting
                ? <><i className="fas fa-spinner fa-spin"></i> Posting...</>
                : <><i className="fas fa-right-left"></i> Post Contra Entry</>
              }
            </button>
          </form>
        </div>

        {/* ACCOUNT BALANCES PANEL — live from wallet */}
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
          <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tight mb-1">Account Balances</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Live fund positions</p>
          <div className="space-y-3">
            {allAccounts.map(a => {
              const bal = getLiveBalance(a.id);
              return (
                <div key={a.id} className="flex items-center justify-between px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.id === 'CASH' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                      <i className={`fas ${a.id === 'CASH' ? 'fa-coins text-amber-600' : 'fa-building-columns text-blue-600'} text-sm`}></i>
                    </div>
                    <span className="text-sm font-black text-slate-800 uppercase">{a.name}</span>
                  </div>
                  <span className={`text-base font-display font-black ${bal >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {bal < 0 && '–'}{Math.abs(bal).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CONTRA HISTORY */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
        {/* Header + Filters */}
        <div className="p-8 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">Contra History</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                {filteredEntries.length} of {allContraEntries.length} entries
              </p>
            </div>
            {/* Search */}
            <div className="relative w-56">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search voucher / account..."
                className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <i className="fas fa-calendar-day text-slate-400 text-[9px]"></i>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-[9px] font-black text-slate-600 focus:outline-none bg-transparent w-28"
              />
            </div>
            <span className="text-[9px] font-black text-slate-400">TO</span>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <i className="fas fa-calendar-day text-slate-400 text-[9px]"></i>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-[9px] font-black text-slate-600 focus:outline-none bg-transparent w-28"
              />
            </div>
            {(dateFrom || dateTo || search) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); }}
                className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest transition"
              >
                <i className="fas fa-times-circle mr-1"></i>Clear
              </button>
            )}
            {/* Total for filtered */}
            {filteredEntries.length > 0 && (
              <div className="ml-auto bg-slate-800 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                Total: {filteredEntries.reduce((s, p) => s + p.amount, 0).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-16 text-center">
            <i className="fas fa-right-left text-4xl text-slate-200 mb-4"></i>
            <p className="text-sm font-black text-slate-300 uppercase tracking-widest">
              {allContraEntries.length === 0 ? 'No contra entries yet' : 'No entries match filters'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-300 w-12">S.No</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">Date</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">Voucher No.</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">From (Cr)</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">To (Dr)</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">Narration</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-300">Amount</th>
                  {canDelete && <th className="px-8 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredEntries.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-5 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-8 py-5 whitespace-nowrap text-xs font-bold text-slate-500">
                      {new Date(p.date).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                      <span className="font-display text-sm font-bold text-slate-700">{p.voucherNumber || '—'}</span>
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-black uppercase">
                        <i className="fas fa-arrow-up-from-bracket text-[8px]"></i>
                        {p.mode === 'CASH' ? 'Cash Drawer' : p.mode}
                      </span>
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                        <i className="fas fa-arrow-down-to-bracket text-[8px]"></i>
                        {p.targetMode === 'CASH' ? 'Cash Drawer' : (p.targetMode || '—')}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-xs text-slate-500 font-medium max-w-[200px] truncate">
                      {p.notes || '—'}
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap text-right">
                      <span className="text-base font-display font-black text-slate-800">{p.amount.toLocaleString()}</span>
                    </td>
                    {canDelete && (
                      <td className="px-8 py-5 text-center">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 flex items-center justify-center mx-auto transition-colors"
                        >
                          <i className="fas fa-trash text-xs"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contra;
