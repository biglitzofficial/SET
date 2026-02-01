
import React, { useState, useMemo } from 'react';
import { Payment } from '../types';

interface GeneralLedgerProps {
  payments: Payment[];
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  bankAccounts?: { id: string; name: string; openingBalance: number }[];
}

const GeneralLedger: React.FC<GeneralLedgerProps> = ({ payments, openingBalances, bankAccounts = [] }) => {
  const [selectedBook, setSelectedBook] = useState<string>('CASH');
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  const selectedBankName = useMemo(() => {
    if (selectedBook === 'CASH') return 'Cash Drawer';
    const bank = bankAccounts.find(b => b.id === selectedBook);
    return bank ? bank.name : 'Unknown Account';
  }, [selectedBook, bankAccounts]);

  const ledgerData = useMemo(() => {
    let opening = 0;
    
    // Determine opening balance based on selected book
    if (selectedBook === 'CASH') {
        opening = openingBalances.CASH;
    } else {
        const bank = bankAccounts.find(b => b.id === selectedBook);
        opening = bank ? bank.openingBalance : 0;
    }

    const accountPayments = payments
        .filter(p => p.mode === selectedBook)
        .sort((a, b) => a.date - b.date); // Chronological Order

    let currentBalance = opening;
    
    // Process running balance for all rows first to ensure accuracy
    const allRowsWithBalance = accountPayments.map(p => {
      currentBalance += (p.type === 'IN' ? p.amount : -p.amount);
      return { ...p, runningBalance: currentBalance };
    });

    // Now apply display filter
    const filteredRows = allRowsWithBalance.filter(row => {
        if (filterType === 'ALL') return true;
        return row.type === filterType;
    });

    // Calculate totals based on filtered view
    const totalIncome = filteredRows.filter(r => r.type === 'IN').reduce((acc, r) => acc + r.amount, 0);
    const totalExpense = filteredRows.filter(r => r.type === 'OUT').reduce((acc, r) => acc + r.amount, 0);

    return {
      opening,
      current: currentBalance, // Actual closing balance regardless of filter
      rows: filteredRows, // Chronological
      summary: { totalIncome, totalExpense }
    };
  }, [payments, selectedBook, openingBalances, bankAccounts, filterType]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Book Selector & Filter */}
      <div className="flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            <button 
                onClick={() => setSelectedBook('CASH')} 
                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap ${
                selectedBook === 'CASH' 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
            >
                Cash Drawer
            </button>
            {bankAccounts.map(bank => (
                <button 
                    key={bank.id} 
                    onClick={() => setSelectedBook(bank.id)} 
                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap ${
                    selectedBook === bank.id 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                >
                    {bank.name}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setFilterType('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'ALL' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>All</button>
             <button onClick={() => setFilterType('IN')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'IN' ? 'bg-emerald-100 text-emerald-700 shadow' : 'text-slate-400'}`}>Income</button>
             <button onClick={() => setFilterType('OUT')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'OUT' ? 'bg-rose-100 text-rose-700 shadow' : 'text-slate-400'}`}>Expenses</button>
          </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Book Opening</div>
            <div className="text-2xl font-display font-black text-slate-900 italic tracking-tighter">₹{ledgerData.opening.toLocaleString()}</div>
         </div>
         {filterType !== 'OUT' && (
             <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
                <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Total Receipts (Filtered)</div>
                <div className="text-2xl font-display font-black text-emerald-700 italic tracking-tighter">+ ₹{ledgerData.summary.totalIncome.toLocaleString()}</div>
             </div>
         )}
         {filterType !== 'IN' && (
             <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100 shadow-sm">
                <div className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Total Payments (Filtered)</div>
                <div className="text-2xl font-display font-black text-rose-700 italic tracking-tighter">- ₹{ledgerData.summary.totalExpense.toLocaleString()}</div>
             </div>
         )}
         <div className="bg-slate-900 p-6 rounded-[2rem] shadow-lg text-white">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Closing Balance</div>
            <div className="text-2xl font-display font-black text-white italic tracking-tighter">₹{ledgerData.current.toLocaleString()}</div>
         </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-lg overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-dark-900 text-white">
            <tr>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Particulars</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Debit (In)</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Credit (Out)</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Balance</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {/* OPENING BALANCE ROW */}
            <tr className="bg-slate-50/50">
               <td className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">--</td>
               <td className="px-6 py-4 text-sm font-bold text-slate-800 uppercase">
                  OPENING BALANCE
                  <div className="text-[9px] font-bold text-slate-400">B/F FROM {selectedBankName}</div>
               </td>
               <td className="px-6 py-4 text-right"></td>
               <td className="px-6 py-4 text-right"></td>
               <td className="px-6 py-4 text-right text-sm font-display font-black text-slate-900 italic">₹{ledgerData.opening.toLocaleString()}</td>
            </tr>

            {ledgerData.rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-5 text-xs font-bold text-slate-500">{new Date(row.date).toLocaleDateString()}</td>
                <td className="px-6 py-5">
                    <div className="text-sm font-bold text-slate-800 uppercase">{row.sourceName}</div> 
                    <div className="text-[10px] text-slate-400 font-bold">{row.category} {row.notes ? `- ${row.notes}` : ''}</div>
                </td>
                <td className="px-6 py-5 text-sm font-mono font-bold text-emerald-600 text-right">{row.type === 'IN' ? `₹${row.amount.toLocaleString()}` : '-'}</td>
                <td className="px-6 py-5 text-sm font-mono font-bold text-rose-600 text-right">{row.type === 'OUT' ? `₹${row.amount.toLocaleString()}` : '-'}</td>
                <td className="px-6 py-5 text-sm font-display font-black text-slate-900 text-right italic">₹{row.runningBalance.toLocaleString()}</td>
              </tr>
            ))}
            {ledgerData.rows.length === 0 && (
               <tr><td colSpan={5} className="px-6 py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No transactions found for this filter</td></tr>
            )}
          </tbody>
          <tfoot className="bg-slate-900 text-white">
             <tr>
                 <td colSpan={2} className="px-6 py-5 text-left text-xs font-black uppercase tracking-widest">Closing Balance</td>
                 <td className="px-6 py-5 text-right text-emerald-400 font-mono font-bold">
                     {filterType !== 'OUT' ? `+ ₹${ledgerData.summary.totalIncome.toLocaleString()}` : '-'}
                 </td>
                 <td className="px-6 py-5 text-right text-rose-400 font-mono font-bold">
                     {filterType !== 'IN' ? `- ₹${ledgerData.summary.totalExpense.toLocaleString()}` : '-'}
                 </td>
                 <td className="px-6 py-5 text-right text-xl font-display font-black tracking-tighter">
                     ₹{ledgerData.current.toLocaleString()}
                 </td>
             </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default GeneralLedger;
