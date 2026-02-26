
import React, { useState, useMemo } from 'react';
import { Liability, Customer, Invoice, Payment } from '../types';
import { liabilityAPI } from '../services/api';

interface LoanListProps {
  liabilities: Liability[];
  setLiabilities: React.Dispatch<React.SetStateAction<Liability[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
}

const LoanList: React.FC<LoanListProps> = ({ liabilities, setLiabilities, customers, setCustomers, invoices, payments, setPayments }) => {
  const [showAddModal, setShowAddModal] = useState<'BANK' | 'PRIVATE' | 'GIVE' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refined action state to handle both Liability object and Customer object
  const [liabilityAction, setLiabilityAction] = useState<{ item: Liability | Customer, itemType: 'LIABILITY' | 'CUSTOMER', type: 'INTEREST' | 'PRINCIPAL' } | null>(null);
  
  const [liabilityPayAmount, setLiabilityPayAmount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'BANK' | 'PRIVATE' | 'LENT'>('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const initialForm = { 
    providerName: '', 
    bankBranch: '', 
    accountNumber: '',
    principal: 0, 
    interestRate: 0, 
    emiAmount: 0,
    startDate: Date.now(), 
    tenureMonths: 12 
  };
  const [formData, setFormData] = useState(initialForm);

  // Consolidated Totals
  const totals = useMemo(() => {
    // 1. Bank Debt (From Liabilities)
    const bankDebt = liabilities.filter(l => l.type === 'BANK').reduce((acc, l) => acc + l.principal, 0);
    
    // 2. Private Debt (Liabilities + Creditor Customers)
    const privateLiabilityDebt = liabilities.filter(l => l.type === 'PRIVATE').reduce((acc, l) => acc + l.principal, 0);
    const customerCreditorDebt = customers.filter(c => c.isLender).reduce((acc, c) => acc + c.creditPrincipal, 0);
    const totalPrivateDebt = privateLiabilityDebt + customerCreditorDebt;

    // 3. Capital Lent (Assets)
    const lentCapital = customers.filter(c => c.isInterest).reduce((acc, c) => acc + c.interestPrincipal, 0);

    return {
      bank: bankDebt,
      private: totalPrivateDebt,
      lent: lentCapital
    };
  }, [liabilities, customers]);

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (showAddModal === 'GIVE') {
       // Adding Lending Asset
       const targetCust = customers.find(c => c.name.toLowerCase() === formData.providerName.toLowerCase());
       if (targetCust) {
         setCustomers(prev => prev.map(c => c.id === targetCust.id ? { ...c, isInterest: true, interestPrincipal: (c.interestPrincipal || 0) + Number(formData.principal), interestRate: Number(formData.interestRate) } : c));
       } else {
         // New customer
         const newCust: Customer = {
            id: Math.random().toString(36).substr(2, 9),
            name: formData.providerName.toUpperCase(),
            phone: '',
            isRoyalty: false,
            isInterest: true,
            isChit: false,
            isGeneral: false,
            isLender: false,
            royaltyAmount: 0,
            interestPrincipal: Number(formData.principal),
            creditPrincipal: 0,
            openingBalance: 0,
            interestRate: Number(formData.interestRate),
            status: 'ACTIVE',
            createdAt: Date.now()
         };
         setCustomers(prev => [...prev, newCust]);
       }
    } else {
        // Create standard Liability
        const newLiability: Liability = {
          id: Math.random().toString(36).substr(2, 9),
          providerName: formData.providerName.toUpperCase(),
          bankBranch: formData.bankBranch,
          accountNumber: formData.accountNumber,
          type: showAddModal as 'BANK' | 'PRIVATE',
          principal: Number(formData.principal),
          interestRate: Number(formData.interestRate),
          emiAmount: Number(formData.emiAmount),
          startDate: new Date(formData.startDate).getTime(),
          tenureMonths: Number(formData.tenureMonths) || 0,
          remainingBalance: Number(formData.principal),
          status: 'ACTIVE'
        };
        
        try {
          const created = await liabilityAPI.create(newLiability);
          setLiabilities([...liabilities, created]);
        } catch (error) {
          console.error('Failed to create liability:', error);
          alert('Failed to create liability. Please try again.');
          setIsSubmitting(false);
          return;
        }
    }
    setShowAddModal(null);
    setFormData(initialForm);
    setIsSubmitting(false);
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (liabilityAction && liabilityPayAmount > 0) {
       const { item, itemType, type } = liabilityAction;
       const name = itemType === 'LIABILITY' ? (item as Liability).providerName : (item as Customer).name;
       
       const newPayment: Payment = {
         id: Math.random().toString(36).substr(2, 9),
         type: 'OUT',
         voucherType: 'PAYMENT',
         amount: liabilityPayAmount,
         mode: 'CASH',
         date: Date.now(),
         sourceId: item.id,
         sourceName: name,
         category: type === 'INTEREST' ? 'LOAN_INTEREST' : 'LOAN_REPAYMENT'
       };
       setPayments(prev => [newPayment, ...prev]);

       // Update Balance
       if (type === 'PRINCIPAL') {
         if (itemType === 'LIABILITY') {
            setLiabilities(prev => prev.map(l => l.id === item.id ? { ...l, principal: Math.max(0, l.principal - liabilityPayAmount) } : l));
         } else {
            setCustomers(prev => prev.map(c => c.id === item.id ? { ...c, creditPrincipal: Math.max(0, c.creditPrincipal - liabilityPayAmount) } : c));
         }
       }
       setLiabilityAction(null);
       setLiabilityPayAmount(0);
    }
  };

  const handleDelete = async (row: any) => {
    const label = row.sourceType === 'LIABILITY' ? row.name : `${row.name} (${row.type})`;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      if (row.sourceType === 'LIABILITY') {
        await liabilityAPI.delete(row.id);
        setLiabilities(prev => prev.filter(l => l.id !== row.id));
      } else {
        // Customer-based lent/lender row — clear the relevant flags/amounts
        if (row.isLent) {
          setCustomers(prev => prev.map(c => c.id === row.id
            ? { ...c, isInterest: false, interestPrincipal: 0 }
            : c));
        } else {
          setCustomers(prev => prev.map(c => c.id === row.id
            ? { ...c, isLender: false, creditPrincipal: 0 }
            : c));
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Unified Rows for Display
  const displayRows = useMemo(() => {
    let rows: any[] = [];

    // 1. LIABILITIES (Bank & Manual Private)
    const liabilityRows = liabilities.map(l => ({
        id: l.id,
        name: l.providerName,
        type: l.type, // 'BANK' or 'PRIVATE'
        principal: l.principal,
        rate: l.interestRate,
        date: l.startDate || 0,
        isLent: false,
        sourceType: 'LIABILITY',
        raw: l
    }));

    // 2. CUSTOMERS (Lenders & Debtors)
    const customerRows = customers
      .filter(c => (c.isLender && c.creditPrincipal > 0) || (c.isInterest && c.interestPrincipal > 0))
      .map(c => {
         // Debt
         if (c.isLender && c.creditPrincipal > 0) {
             return {
                 id: c.id,
                 name: c.name,
                 type: 'PRIVATE', // Treat as Private Debt
                 principal: c.creditPrincipal,
                 rate: c.interestRate,
                 date: c.createdAt || 0,
                 isLent: false,
                 sourceType: 'CUSTOMER',
                 raw: c
             };
         }
         // Asset
         if (c.isInterest && c.interestPrincipal > 0) {
             return {
                 id: c.id,
                 name: c.name,
                 type: 'LENT',
                 principal: c.interestPrincipal,
                 rate: c.interestRate,
                 date: c.createdAt || 0,
                 isLent: true,
                 sourceType: 'CUSTOMER',
                 raw: c
             };
         }
         return null;
      })
      .filter(Boolean);

    rows = [...liabilityRows, ...customerRows];

    // Filter Logic
    if (activeFilter === 'ALL') return rows;
    if (activeFilter === 'LENT') return rows.filter(r => r.isLent);
    if (activeFilter === 'BANK') return rows.filter(r => r.type === 'BANK');
    if (activeFilter === 'PRIVATE') return rows.filter(r => r.type === 'PRIVATE');

    return rows;
  }, [activeFilter, liabilities, customers]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Credit Manager</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Debt Obligations & Lending Portfolio</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowAddModal('BANK')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition">+ Bank Loan</button>
          <button onClick={() => setShowAddModal('PRIVATE')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition">+ Private Debt</button>
          <button onClick={() => setShowAddModal('GIVE')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg transition">+ Lend Capital</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Debt</div>
           <div className="text-3xl font-display font-black italic text-slate-900 tracking-tighter">₹{totals.bank.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Private Debt</div>
           <div className="text-3xl font-display font-black italic text-rose-600 tracking-tighter">₹{totals.private.toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 shadow-sm">
           <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Capital Lent</div>
           <div className="text-3xl font-display font-black italic text-emerald-700 tracking-tighter">₹{totals.lent.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-lg overflow-hidden">
        <div className="p-2 border-b border-slate-200 bg-white flex gap-2 overflow-x-auto">
           {['ALL', 'BANK', 'PRIVATE', 'LENT'].map(f => (
             <button key={f} onClick={() => { setActiveFilter(f as any); setPage(1); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>{f}</button>
           ))}
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-dark-900 text-white">
            <tr>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Party / Institution</th>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Type</th>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Principal</th>
              <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80">Rate</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-5 text-sm font-bold text-slate-800 uppercase">{row.name}</td>
                <td className="px-6 py-5">
                   <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest ${row.isLent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {row.type}
                   </span>
                </td>
                <td className="px-6 py-5 text-xs font-bold text-slate-500">
                  {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-5 text-right text-sm font-bold text-slate-900">₹{row.principal.toLocaleString()}</td>
                <td className="px-6 py-5 text-center text-sm font-bold text-slate-500">{row.rate}%</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end items-center gap-2">
                    {!row.isLent && (
                      <button
                        onClick={() => { setLiabilityAction({ item: row.raw, itemType: row.sourceType, type: 'PRINCIPAL' }); setLiabilityPayAmount(0); }}
                        className="text-rose-600 hover:text-rose-800 text-xs font-black uppercase tracking-wide bg-rose-50 px-3 py-1 rounded hover:bg-rose-100 transition"
                      >
                        Repay
                      </button>
                    )}
                    {row.isLent && (
                      <span className="text-emerald-600 text-xs font-black uppercase tracking-wide">Asset</span>
                    )}
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={deletingId === row.id}
                      className="h-7 w-7 rounded-lg bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === row.id
                        ? <i className="fas fa-spinner fa-spin text-xs"></i>
                        : <i className="fas fa-trash-alt text-xs"></i>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {displayRows.length === 0 && (
                <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No records found for this category</td>
                </tr>
            )}
          </tbody>
        </table>
        </div>
        {/* Pagination */}
        {displayRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, displayRows.length)} of {displayRows.length}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition"
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              {Array.from({ length: Math.ceil(displayRows.length / PAGE_SIZE) }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`h-8 w-8 rounded-lg text-xs font-black transition ${pg === page ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                >{pg}</button>
              ))}
              <button
                disabled={page === Math.ceil(displayRows.length / PAGE_SIZE)}
                onClick={() => setPage(p => p + 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition"
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-scaleUp">
              <h3 className="text-2xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-1">{showAddModal === 'GIVE' ? 'Lend Capital' : 'Add Debt'}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Create new financial obligation</p>
              
              <form onSubmit={handleAddAction} className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Party / Bank Name</label>
                    <input required className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={formData.providerName} onChange={e => setFormData({...formData, providerName: e.target.value.toUpperCase()})} />
                 </div>
                 {showAddModal === 'BANK' && (
                    <div className="grid grid-cols-2 gap-4">
                       <input className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" placeholder="BRANCH" value={formData.bankBranch} onChange={e => setFormData({...formData, bankBranch: e.target.value})} />
                       <input className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" placeholder="ACC NO." value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
                    </div>
                 )}
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Principal (₹)</label>
                       <input required type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.principal || ''} onChange={e => setFormData({...formData, principal: Number(e.target.value)})} />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rate (%)</label>
                       <input required type="number" step="0.1" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.interestRate || ''} onChange={e => setFormData({...formData, interestRate: Number(e.target.value)})} />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Start Date</label>
                        <input type="date" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={new Date(formData.startDate).toISOString().substr(0,10)} onChange={e => setFormData({...formData, startDate: new Date(e.target.value).getTime()})} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tenure (Months)</label>
                        <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.tenureMonths || ''} onChange={e => setFormData({...formData, tenureMonths: Number(e.target.value)})} />
                    </div>
                 </div>
                 <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : 'Create'}</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* REPAYMENT MODAL */}
      {liabilityAction && (
         <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-scaleUp">
               <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-4">Repay Principal</h3>
               <form onSubmit={handlePayment} className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Repayment Amount</label>
                     <input autoFocus required type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={liabilityPayAmount || ''} onChange={e => setLiabilityPayAmount(Number(e.target.value))} />
                  </div>
                  <div className="flex gap-3 pt-2">
                     <button type="button" onClick={() => setLiabilityAction(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                     <button type="submit" className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 shadow-lg">Confirm Payment</button>
                  </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};

export default LoanList;
