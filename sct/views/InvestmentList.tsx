
import React, { useState, useMemo } from 'react';
import { Investment, InvestmentTransaction, Payment, PaymentMode } from '../types';
import { investmentAPI, paymentAPI } from '../services/api';

interface InvestmentListProps {
  investments: Investment[];
  setInvestments: React.Dispatch<React.SetStateAction<Investment[]>>;
  savingCategories: string[];
  payments?: Payment[]; // Optional to support existing calls, but utilized here
  setPayments?: React.Dispatch<React.SetStateAction<Payment[]>>;
}

const InvestmentList: React.FC<InvestmentListProps> = ({ investments, setInvestments, savingCategories, payments, setPayments }) => {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // View Detail State
  const [viewDetail, setViewDetail] = useState<Investment | null>(null);
  
  // Filter State
  const [filterType, setFilterType] = useState<string>('ALL');

  // View Mode
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');

  // Ledger Entry State (Chit & Regular)
  const [showLedgerEntry, setShowLedgerEntry] = useState<{ month: number, invId: string } | null>(null);
  const [showPremiumEntry, setShowPremiumEntry] = useState<boolean>(false); // For LIC/SIP/Gold
  const [deletingLedgerMonth, setDeletingLedgerMonth] = useState<number | null>(null);

  const [ledgerForm, setLedgerForm] = useState<{ amountPaid: number; dividend: number; date: number; paymentMode: PaymentMode }>({ 
    amountPaid: 0, 
    dividend: 0, 
    date: Date.now(),
    paymentMode: 'CASH'
  });

  // Prize Declaration State
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [prizeForm, setPrizeForm] = useState<{ amount: number; bidAmount: number; month: number; depositMode: PaymentMode }>({ 
    amount: 0, 
    bidAmount: 0,
    month: 0,
    depositMode: 'CASH'
  });

  const initialForm: Partial<Investment> = {
    name: '', type: savingCategories[0] || 'LIC', provider: '', contributionType: 'LUMP_SUM',
    amountInvested: 0, expectedMaturityValue: 0, startDate: Date.now(),
    maturityDate: Date.now() + (365 * 24 * 60 * 60 * 1000 * 5), status: 'ACTIVE',
    chitConfig: { chitValue: 0, durationMonths: 20, monthlyInstallment: 0, isPrized: false },
    transactions: []
  };

  const [formData, setFormData] = useState<Partial<Investment>>(initialForm);

  const calculateApproxInvested = (inv: Investment) => {
    // For Monthly types (Chit, LIC, SIP), sum the ledger
    if ((inv.type === 'CHIT_SAVINGS' || inv.contributionType === 'MONTHLY') && inv.transactions) {
       return inv.transactions.reduce((sum, t) => sum + t.amountPaid, 0);
    }
    // For Lump sum, use the base value
    return inv.amountInvested;
  };

  const filteredInvestments = useMemo(() => {
    if (filterType === 'ALL') return investments;
    return investments.filter(inv => inv.type === filterType);
  }, [investments, filterType]);

  const totals = useMemo(() => {
    return filteredInvestments.reduce((acc, inv) => {
      const approx = calculateApproxInvested(inv);
      return { totalInvested: acc.totalInvested + approx, expectedCorpus: acc.expectedCorpus + (inv.expectedMaturityValue || 0) };
    }, { totalInvested: 0, expectedCorpus: 0 });
  }, [filteredInvestments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    // Auto-calculate maturity for chits
    let finalData = { ...formData };
    if (finalData.type === 'CHIT_SAVINGS' && finalData.chitConfig) {
       finalData.expectedMaturityValue = finalData.chitConfig.chitValue;
       // Estimate maturity date based on duration
       const startDate = new Date(finalData.startDate || Date.now());
       const endDate = new Date(startDate);
       endDate.setMonth(startDate.getMonth() + finalData.chitConfig.durationMonths);
       finalData.maturityDate = endDate.getTime();
       finalData.amountInvested = 0; // Will be calculated from ledger
    }

    try {
      if (editingId) {
        const { id: _id, ...updatePayload } = finalData as Investment;
        await investmentAPI.update(editingId, updatePayload);
        setInvestments(prev => prev.map(inv => inv.id === editingId ? { ...inv, ...finalData as Investment } : inv));
      } else {
        const newInvestment = { ...finalData as Investment, id: Math.random().toString(36).substr(2, 9), transactions: [] };
        const created = await investmentAPI.create(newInvestment);
        setInvestments([...investments, created]);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(initialForm);
    } catch (error) {
      console.error('Failed to save investment:', error);
      alert('Failed to save investment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  // --- LEDGER SAVING LOGIC (Common for Chit & Regular) ---
  const handleLedgerSave = async () => {
     if (!viewDetail || isSubmitting) return;
     setIsSubmitting(true);

     // Determine month number
     let monthNum = 0;
     if (showLedgerEntry) {
        monthNum = showLedgerEntry.month;
     } else if (showPremiumEntry) {
        monthNum = (viewDetail.transactions?.length || 0) + 1;
     } else {
        setIsSubmitting(false);
        return;
     }

     const newTransaction: InvestmentTransaction = {
        id: Math.random().toString(36).substr(2, 9),
        date: ledgerForm.date,
        month: monthNum,
        amountPaid: ledgerForm.amountPaid,
        dividend: ledgerForm.dividend,
        totalPayable: ledgerForm.amountPaid + ledgerForm.dividend
     };

     try {
        // Persist transaction to backend
        await investmentAPI.recordTransaction(viewDetail.id, newTransaction);

        const updatedInv = {
           ...viewDetail,
           transactions: [...(viewDetail.transactions || []), newTransaction].sort((a,b) => a.month - b.month)
        };
        setInvestments(prev => prev.map(inv => inv.id === viewDetail.id ? updatedInv : inv));
        setViewDetail(updatedInv);

        // Auto-create Payment Voucher if setPayments is available
        if (setPayments) {
           const newPayment: Payment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'OUT',
              voucherType: 'PAYMENT',
              amount: ledgerForm.amountPaid,
              mode: ledgerForm.paymentMode,
              date: ledgerForm.date,
              sourceId: viewDetail.id,
              sourceName: viewDetail.name,
              category: `INVESTMENT_${viewDetail.type}`,
              notes: `${viewDetail.type} Payment - Month ${monthNum}`
           };
           try {
              const savedPayment = await paymentAPI.create(newPayment);
              setPayments(prev => [savedPayment, ...prev]);
           } catch {
              // If payment API fails, still add locally so ledger is consistent
              setPayments(prev => [newPayment, ...prev]);
           }
           alert("Ledger updated & Bank Balance Reduced.");
        }

        setShowLedgerEntry(null);
        setShowPremiumEntry(false);
        setLedgerForm({ amountPaid: 0, dividend: 0, date: Date.now(), paymentMode: 'CASH' });
     } catch (error) {
        console.error('Failed to save ledger entry:', error);
        alert('Failed to save ledger entry. Please try again.');
     } finally {
        setIsSubmitting(false);
     }
  };

  const openPrizeModal = () => {
    if (viewDetail && viewDetail.chitConfig) {
       setPrizeForm({ 
         amount: viewDetail.chitConfig.chitValue, 
         bidAmount: 0,
         month: (viewDetail.transactions?.length || 0) + 1,
         depositMode: 'CASH'
       });
       setShowPrizeModal(true);
    }
  };

  const confirmPrize = async () => {
    if (!viewDetail || !viewDetail.chitConfig || isSubmitting) return;
    setIsSubmitting(true);

    const updatedInv: Investment = {
       ...viewDetail,
       chitConfig: {
          ...viewDetail.chitConfig,
          isPrized: true,
          prizeAmount: prizeForm.amount,
          prizeMonth: prizeForm.month
       }
    };

    try {
       // Persist investment update to backend
       await investmentAPI.update(viewDetail.id, updatedInv);

       // 1. Create Receipt Voucher Automatically
       if (setPayments) {
           const receiptVoucher: Payment = {
               id: Math.random().toString(36).substr(2, 9),
               type: 'IN',
               voucherType: 'RECEIPT',
               amount: prizeForm.amount,
               mode: prizeForm.depositMode,
               date: Date.now(),
               sourceId: viewDetail.id,
               sourceName: viewDetail.name,
               category: 'CHIT_SAVINGS',
               notes: `Prize Money Received - Month ${prizeForm.month} (Bid: ₹${prizeForm.bidAmount})`
           };
           try {
              const savedPayment = await paymentAPI.create(receiptVoucher);
              setPayments(prev => [savedPayment, ...prev]);
           } catch {
              setPayments(prev => [receiptVoucher, ...prev]);
           }
       }

       // 2. Update Investment State
       setInvestments(prev => prev.map(inv => inv.id === viewDetail.id ? updatedInv : inv));
       setViewDetail(updatedInv);
       setShowPrizeModal(false);
       alert(`Prize Declared! ₹${prizeForm.amount.toLocaleString()} receipt voucher created.`);
    } catch (error) {
       console.error('Failed to declare prize:', error);
       alert('Failed to declare prize. Please try again.');
    } finally {
       setIsSubmitting(false);
    }
  };

  const handleDeleteLedgerEntry = async (monthNum: number) => {
    if (!viewDetail || deletingLedgerMonth !== null || isSubmitting) return;
    if (!window.confirm(`Delete Month ${monthNum} ledger entry? This will also remove the linked voucher.`)) return;
    setDeletingLedgerMonth(monthNum);
    try {
      const txn = viewDetail.transactions?.find(t => t.month === monthNum);
      if (!txn) return;

      // Build updated investment without this transaction
      const updatedInv: Investment = {
        ...viewDetail,
        transactions: (viewDetail.transactions || []).filter(t => t.month !== monthNum)
      };
      await investmentAPI.update(viewDetail.id, updatedInv);
      setInvestments(prev => prev.map(inv => inv.id === viewDetail.id ? updatedInv : inv));
      setViewDetail(updatedInv);

      // Find and delete the linked payment voucher
      if (setPayments && payments) {
        // Try by paymentId first, then fallback to matching notes
        const linkedPaymentId = (txn as any).paymentId;
        let matchedPayment = linkedPaymentId
          ? payments.find(p => p.id === linkedPaymentId)
          : payments.find(p =>
              p.sourceId === viewDetail.id &&
              (p.category === 'INVESTMENT_CHIT_SAVINGS' || p.category === `INVESTMENT_${viewDetail.type}`) &&
              (p.notes?.includes(`Month ${monthNum}`) ?? false)
            );
        if (matchedPayment) {
          try {
            await paymentAPI.delete(matchedPayment.id);
            setPayments(prev => prev.filter(p => p.id !== matchedPayment!.id));
          } catch {
            // Still continue even if payment delete fails
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete ledger entry:', error);
      alert('Failed to delete ledger entry. Please try again.');
    } finally {
      setDeletingLedgerMonth(null);
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Savings Hub</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Asset Portfolio & Policies</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              onClick={() => setViewMode('card')}
              title="Card View"
              className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                viewMode === 'card' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className="fas fa-th-large text-xs"></i>
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List View"
              className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className="fas fa-list text-xs"></i>
            </button>
          </div>
          <button 
            onClick={() => { setEditingId(null); setFormData(initialForm); setShowForm(true); }} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> Record Investment
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 overflow-x-auto">
          <button 
             onClick={() => setFilterType('ALL')} 
             className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filterType === 'ALL' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
          >
             All Assets
          </button>
          {savingCategories.map(cat => (
             <button 
                key={cat}
                onClick={() => setFilterType(cat)} 
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filterType === cat ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
             >
                {cat.replace('_', ' ')}
             </button>
          ))}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-blue-100 shadow-sm flex flex-col justify-center">
           <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Capital Deployed (Filtered)</div>
           <div className="text-4xl font-display font-black text-slate-900 italic tracking-tighter">₹{totals.totalInvested.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-blue-100 shadow-sm flex flex-col justify-center">
           <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Projected Maturity Corpus</div>
           <div className="text-4xl font-display font-black text-emerald-600 italic tracking-tighter">₹{totals.expectedCorpus.toLocaleString()}</div>
        </div>
      </div>

      {/* CARD VIEW */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredInvestments.length === 0 && (
            <div className="col-span-full py-16 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No investments found.</div>
          )}
          {filteredInvestments.map((inv) => {
            const approxInvested = calculateApproxInvested(inv);
            const isChit = inv.type === 'CHIT_SAVINGS';
            const paidMonths = inv.transactions?.length || 0;
            const durationMonths = inv.chitConfig?.durationMonths || 0;
            const startDate = new Date(inv.startDate);
            const monthDueDate = isChit && paidMonths < durationMonths
              ? new Date(startDate.getFullYear(), startDate.getMonth() + paidMonths, startDate.getDate())
              : null;
            const isOverdue = monthDueDate && monthDueDate < new Date();
            const fmtDate = (d: Date | null) => d
              ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            return (
              <div key={inv.id} onClick={() => setViewDetail(inv)}
                className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-200 cursor-pointer transition-all p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isChit ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                      <i className={`fas ${isChit ? 'fa-users-viewfinder' : 'fa-piggy-bank'} text-sm`}></i>
                    </div>
                    <div>
                      <div className="font-black text-slate-800 uppercase text-xs">{inv.name}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${isChit ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {inv.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  {isChit && inv.chitConfig?.isPrized && (
                    <span className="bg-blue-500 text-white px-2 py-1 rounded-full text-[8px] font-black uppercase">Won</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Chit Value</div>
                    <div className="font-black text-slate-800 text-sm">{inv.chitConfig?.chitValue ? `₹${inv.chitConfig.chitValue.toLocaleString()}` : '—'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Invested</div>
                    <div className="font-black text-slate-900 text-sm">₹{approxInvested.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Payable</div>
                              <div className="font-black text-xs text-slate-700">
                                 {isChit && inv.chitConfig?.monthlyInstallment ? `₹${inv.chitConfig.monthlyInstallment.toLocaleString()}` : '—'}
                              </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Progress</div>
                    <div className="font-black text-slate-700 text-sm">
                      {isChit ? `${paidMonths}/${durationMonths}` : `${Math.round(inv.maturityDate && inv.startDate ? Math.min(100, Math.max(0, ((Date.now() - inv.startDate) / (inv.maturityDate - inv.startDate)) * 100)) : 0)}%`}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button onClick={(e) => { e.stopPropagation(); setFormData(inv); setEditingId(inv.id); setShowForm(true); }}
                    className="h-8 w-8 rounded-full bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition flex items-center justify-center">
                    <i className="fas fa-pen text-[9px]"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INVESTMENT LIST VIEW */}
      {viewMode === 'list' && <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Name</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</th>
              <th className="px-4 py-4 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Chit Value</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Monthly Payable</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Start Date</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">End Date</th>
              <th className="px-4 py-4 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Invested</th>
              <th className="px-4 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Progress</th>
              <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">Edit</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {filteredInvestments.length === 0 && (
              <tr><td colSpan={10} className="px-6 py-12 text-center text-xs font-bold text-slate-400">No investments found.</td></tr>
            )}
            {filteredInvestments.map((inv, idx) => {
              const approxInvested = calculateApproxInvested(inv);
              const isChit = inv.type === 'CHIT_SAVINGS';
              const paidMonths = inv.transactions?.length || 0;
              const durationMonths = inv.chitConfig?.durationMonths || 0;

              // Start date from stored timestamp
              const startDate = new Date(inv.startDate);

              // End date: startDate + durationMonths (for chit) or stored maturityDate
              const endDate = isChit && durationMonths > 0
                ? new Date(startDate.getFullYear(), startDate.getMonth() + durationMonths, startDate.getDate())
                : inv.maturityDate ? new Date(inv.maturityDate) : null;

              // Month Due: next unpaid installment date = startDate + paidMonths months
              // e.g. if start is Jan 1 and 3 months paid, Month 4 is due on Apr 1
              const monthDueDate = isChit && paidMonths < durationMonths
                ? new Date(startDate.getFullYear(), startDate.getMonth() + paidMonths, startDate.getDate())
                : null;

              const fmtDate = (d: Date | null) => d
                ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

              const isOverdue = monthDueDate && monthDueDate < new Date();

              const progress = isChit && durationMonths > 0
                ? (paidMonths / durationMonths) * 100
                : endDate && inv.maturityDate
                  ? Math.min(100, Math.max(0, ((Date.now() - inv.startDate) / (inv.maturityDate - inv.startDate)) * 100))
                  : 0;

              return (
                <tr key={inv.id} onClick={() => setViewDetail(inv)} className="hover:bg-blue-50/30 cursor-pointer transition-colors">
                  <td className="px-4 py-4 font-black text-slate-400 text-center">{idx + 1}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isChit ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                        <i className={`fas ${isChit ? 'fa-users-viewfinder' : 'fa-piggy-bank'} text-xs`}></i>
                      </div>
                      <div>
                        <div className="font-black text-slate-800 uppercase text-xs whitespace-nowrap">{inv.name}</div>
                        {isChit && inv.chitConfig?.isPrized && (
                          <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase">Won</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${isChit ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                      {inv.type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-black text-slate-700">
                    {inv.chitConfig?.chitValue ? `₹${inv.chitConfig.chitValue.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                              {isChit && inv.chitConfig?.monthlyInstallment ? `₹${inv.chitConfig.monthlyInstallment.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">{fmtDate(startDate)}</td>
                  <td className="px-4 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">{fmtDate(endDate)}</td>
                  <td className="px-4 py-4 text-right font-black text-slate-900 whitespace-nowrap">₹{approxInvested.toLocaleString()}</td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-black text-slate-700">
                      {isChit ? `${paidMonths}/${durationMonths}` : `${Math.round(progress)}%`}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button onClick={(e) => { e.stopPropagation(); setFormData(inv); setEditingId(inv.id); setShowForm(true); }}
                      className="h-7 w-7 rounded-full bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition flex items-center justify-center mx-auto">
                      <i className="fas fa-pen text-[9px]"></i>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* TOTAL ROW */}
          <tfoot>
            <tr className="bg-slate-900">
              {/* Col 1-3: label */}
              <td colSpan={3} className="px-6 py-4 font-black text-white uppercase text-[10px] tracking-widest whitespace-nowrap">
                Total — {filteredInvestments.length} {filteredInvestments.length === 1 ? 'Investment' : 'Investments'}
              </td>
              {/* Col 4: Chit Value total */}
              <td className="px-4 py-4 text-right font-mono font-black text-amber-300 text-xs whitespace-nowrap">
                ₹{filteredInvestments.reduce((s, inv) => s + (inv.chitConfig?.chitValue || 0), 0).toLocaleString()}
              </td>
              {/* Col 5: Monthly Payable total */}
              <td className="px-4 py-4 text-left font-mono font-black text-amber-300 text-xs whitespace-nowrap">
                ₹{filteredInvestments.reduce((s, inv) => s + (inv.chitConfig?.monthlyInstallment || 0), 0).toLocaleString()}
              </td>
              {/* Col 6-7: dates — blank */}
              <td colSpan={2}></td>
              {/* Col 8: Total Invested */}
              <td className="px-4 py-4 text-right font-mono font-black text-white text-sm whitespace-nowrap">
                ₹{filteredInvestments.reduce((s, inv) => s + calculateApproxInvested(inv), 0).toLocaleString()}
              </td>
              {/* Col 9: Avg Month Count */}
              <td className="px-4 py-4 text-left whitespace-nowrap">
                {(() => {
                  if (filteredInvestments.length === 0) return null;
                  const totalPaid = filteredInvestments.reduce((s, inv) => s + (inv.transactions?.length || 0), 0);
                  const avgPaid = Math.round(totalPaid / filteredInvestments.length);
                  return (
                    <span className="text-[10px] font-black text-amber-300">
                      Avg {avgPaid} mo
                    </span>
                  );
                })()}
              </td>
              {/* Col 10: Edit — blank */}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>}

      {/* DETAIL MODAL (Supports specialized CHIT & Standard View) */}
      {viewDetail && (
         <div className="fixed inset-0 bg-brand-950/90 flex items-center justify-center z-[100] p-4 backdrop-blur-md overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleUp my-10 flex flex-col max-h-[90vh]">
               {/* MODAL HEADER */}
               <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-start flex-shrink-0">
                  <div>
                     <div className="flex gap-3 items-center mb-2">
                        <span className={`text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${viewDetail.type === 'CHIT_SAVINGS' ? 'bg-yellow-500 text-blue-900' : 'bg-blue-600'}`}>{viewDetail.type.replace('_', ' ')}</span>
                        {viewDetail.chitConfig?.isPrized && <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">Prized (Won)</span>}
                     </div>
                     <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">{viewDetail.name}</h2>
                     <p className="text-sm font-bold text-slate-500 mt-1">{viewDetail.provider}</p>
                  </div>
                  <button onClick={() => setViewDetail(null)} className="h-12 w-12 bg-white rounded-full flex items-center justify-center shadow-md text-slate-400 hover:text-rose-500 transition"><i className="fas fa-times text-xl"></i></button>
               </div>

               {/* CONTENT AREA */}
               <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                  {viewDetail.type === 'CHIT_SAVINGS' && viewDetail.chitConfig ? (
                     // --- CHIT SAVINGS VIEW ---
                     <div className="space-y-8">
                        {/* CHIT STATS */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="p-5 bg-yellow-50 rounded-2xl border border-yellow-100">
                              <div className="text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-1">Chit Value</div>
                              <div className="text-xl font-black text-yellow-900">₹{viewDetail.chitConfig.chitValue.toLocaleString()}</div>
                           </div>
                           <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Paid</div>
                              <div className="text-xl font-black text-slate-900">₹{(viewDetail.transactions?.reduce((s,t)=>s+t.amountPaid,0) || 0).toLocaleString()}</div>
                           </div>
                           <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                              <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Dividend Saving</div>
                              <div className="text-xl font-black text-emerald-700">₹{(viewDetail.transactions?.reduce((s,t)=>s+t.dividend,0) || 0).toLocaleString()}</div>
                           </div>
                           <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Pending Months</div>
                              <div className="text-xl font-black text-slate-900">{viewDetail.chitConfig.durationMonths - (viewDetail.transactions?.length || 0)}</div>
                           </div>
                        </div>

                        {/* WINNING / REALIZED PROFIT SECTION */}
                        {viewDetail.chitConfig.isPrized ? (
                           <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                              <div className="relative z-10 space-y-6">
                                 <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                                    <div>
                                       <h3 className="text-xl font-black italic tracking-tighter text-white">Realized Financial Performance</h3>
                                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Profit/Loss Analysis</p>
                                    </div>
                                    <div className="text-right">
                                       <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Prize Received</div>
                                       <div className="text-3xl font-display font-black text-white tracking-tighter">₹{viewDetail.chitConfig.prizeAmount?.toLocaleString()}</div>
                                    </div>
                                 </div>
                                 
                                 {(() => {
                                    const totalPaid = viewDetail.transactions?.reduce((s,t)=>s+t.amountPaid,0) || 0;
                                    const prize = viewDetail.chitConfig.prizeAmount || 0;
                                    const netProfit = prize - totalPaid;
                                    const roi = totalPaid > 0 ? (netProfit / totalPaid) * 100 : 0;
                                    const isProfit = netProfit >= 0;

                                    return (
                                       <div className="grid grid-cols-3 gap-8">
                                          <div>
                                             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Cash Outflow</div>
                                             <div className="text-xl font-black text-rose-400">₹{totalPaid.toLocaleString()}</div>
                                          </div>
                                          <div>
                                             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Realized Profit</div>
                                             <div className={`text-2xl font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {isProfit ? '+' : ''}₹{netProfit.toLocaleString()}
                                             </div>
                                          </div>
                                          <div>
                                             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI</div>
                                             <div className={`text-xl font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {roi.toFixed(1)}%
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })()}
                              </div>
                              <i className="fas fa-chart-line absolute -right-6 -bottom-6 text-9xl text-white opacity-5"></i>
                           </div>
                        ) : (
                           <div className="bg-brand-950 rounded-3xl p-6 text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                              <div className="relative z-10">
                                 <div className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">Status</div>
                                 <div className="text-xl font-black text-slate-300 italic">Currently Running</div>
                              </div>
                              <button onClick={openPrizeModal} className="bg-yellow-500 hover:bg-yellow-600 text-blue-950 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition relative z-10 shadow-lg">
                                 Declare Win
                              </button>
                              <i className="fas fa-hourglass-half absolute right-4 bottom-[-10px] text-8xl text-white opacity-10"></i>
                           </div>
                        )}

                        {/* LEDGER TABLE */}
                        <div>
                           <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Full Ledger</h4>
                           <div className="overflow-hidden rounded-2xl border border-slate-100">
                              <table className="min-w-full divide-y divide-slate-100">
                                 <thead className="bg-slate-50">
                                    <tr>
                                       <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Month</th>
                                       <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Payable</th>
                                       <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Dividend</th>
                                       <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Paid</th>
                                       <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                       <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Del</th>
                                    </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-slate-50">
                                    {Array.from({ length: viewDetail.chitConfig.durationMonths }).map((_, i) => {
                                       const monthNum = i + 1;
                                       const txn = viewDetail.transactions?.find(t => t.month === monthNum);
                                       const isPaid = !!txn;
                                       
                                       return (
                                          <tr key={i} className="hover:bg-slate-50 transition">
                                             <td className="px-6 py-4 text-xs font-bold text-slate-600">Month {monthNum}</td>
                                             <td className="px-6 py-4 text-right text-xs font-bold text-slate-400">₹{viewDetail.chitConfig?.monthlyInstallment.toLocaleString()}</td>
                                             <td className="px-6 py-4 text-right text-xs font-bold text-emerald-600">{txn ? `₹${txn.dividend.toLocaleString()}` : '-'}</td>
                                             <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{txn ? `₹${txn.amountPaid.toLocaleString()}` : '-'}</td>
                                             <td className="px-6 py-4 text-center">
                                                {isPaid ? (
                                                   <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Paid</span>
                                                ) : (
                                                   <button onClick={() => setShowLedgerEntry({ month: monthNum, invId: viewDetail.id })} className="bg-blue-600 text-white px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest hover:bg-yellow-500 hover:text-blue-900 transition">Pay Now</button>
                                                )}
                                             </td>
                                             <td className="px-6 py-4 text-center">
                                                {isPaid && (
                                                   <button
                                                      onClick={() => handleDeleteLedgerEntry(monthNum)}
                                                      disabled={deletingLedgerMonth === monthNum}
                                                      className="h-7 w-7 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition disabled:opacity-40 mx-auto"
                                                   >
                                                      {deletingLedgerMonth === monthNum
                                                         ? <i className="fas fa-spinner fa-spin text-[9px]"></i>
                                                         : <i className="fas fa-trash-alt text-[9px]"></i>}
                                                   </button>
                                                )}
                                             </td>
                                          </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                     </div>
                  ) : (
                     // --- STANDARD INVESTMENT VIEW ---
                     <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-8">
                           <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Start Date</div>
                              <div className="text-2xl font-black text-slate-800">{formatDate(viewDetail.startDate)}</div>
                           </div>
                           <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Maturity Date (End)</div>
                              <div className="text-2xl font-black text-emerald-600">{viewDetail.maturityDate ? formatDate(viewDetail.maturityDate) : 'N/A'}</div>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-12">
                           <div>
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Value Paid</div>
                              <div className="text-4xl font-display font-black text-slate-900 tracking-tighter">₹{calculateApproxInvested(viewDetail).toLocaleString()}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-1">Based on {viewDetail.contributionType === 'MONTHLY' ? 'Monthly Ledger' : 'Lump Sum'}</div>
                           </div>
                           <div>
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Maturity Value</div>
                              <div className="text-4xl font-display font-black text-emerald-600 tracking-tighter">₹{(viewDetail.expectedMaturityValue || 0).toLocaleString()}</div>
                           </div>
                        </div>
                        {viewDetail.remarks && (
                           <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                              <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Notes</div>
                              <p className="text-sm font-bold text-amber-900">{viewDetail.remarks}</p>
                           </div>
                        )}

                        {/* --- MONTHLY LEDGER FOR NON-CHIT ITEMS (LIC, SIP, GOLD) --- */}
                        {viewDetail.contributionType === 'MONTHLY' && (
                           <div>
                              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                                 <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Premium / SIP Ledger</h4>
                                 <button onClick={() => setShowPremiumEntry(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-md">
                                    + Record Premium
                                 </button>
                              </div>
                              <div className="overflow-hidden rounded-2xl border border-slate-100">
                                 <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                       <tr>
                                          <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                                          <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                                          <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</th>
                                       </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-50">
                                       {viewDetail.transactions && viewDetail.transactions.length > 0 ? (
                                          viewDetail.transactions.map((txn, i) => (
                                             <tr key={txn.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600">{i + 1}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600">{formatDate(txn.date)}</td>
                                                <td className="px-6 py-4 text-right text-xs font-black text-slate-900">₹{txn.amountPaid.toLocaleString()}</td>
                                             </tr>
                                          ))
                                       ) : (
                                          <tr>
                                             <td colSpan={3} className="px-6 py-8 text-center text-xs font-bold text-slate-400 italic">No payments recorded yet.</td>
                                          </tr>
                                       )}
                                    </tbody>
                                 </table>
                              </div>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </div>
         </div>
      )}

      {/* LEDGER ENTRY POPOVER (Works for both Chit & Standard Monthly) */}
      {(showLedgerEntry || showPremiumEntry) && (
         <div className="fixed inset-0 bg-brand-950/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl w-full max-w-sm animate-scaleUp shadow-2xl">
               <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-4">
                  {showLedgerEntry ? `Pay Month ${showLedgerEntry.month}` : 'Record Premium Payment'}
               </h3>
               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Source Account (Reduces Balance)</label>
                     <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-xs uppercase outline-none focus:border-blue-500" value={ledgerForm.paymentMode} onChange={e => setLedgerForm({...ledgerForm, paymentMode: e.target.value as PaymentMode})}>
                        <option value="CASH">Cash Drawer</option>
                        <option value="CUB">CUB Bank</option>
                        <option value="KVB">KVB Bank</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount Paid (Voucher Value)</label>
                     <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                        placeholder="Enter amount"
                        value={ledgerForm.amountPaid && ledgerForm.amountPaid !== 0 ? ledgerForm.amountPaid : ''} 
                        onChange={e => {
                            const val = Number(e.target.value) || 0;
                            // Auto Calculate Dividend for Chit
                            let div = ledgerForm.dividend;
                            if (viewDetail?.type === 'CHIT_SAVINGS' && viewDetail.chitConfig) {
                                div = Math.max(0, viewDetail.chitConfig.monthlyInstallment - val);
                            }
                            setLedgerForm({...ledgerForm, amountPaid: val, dividend: div});
                        }}
                        onKeyDown={handleKeyDown}
                     />
                  </div>
                  
                  {/* Only show Dividend for Chits */}
                  {viewDetail?.type === 'CHIT_SAVINGS' && (
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dividend / Profit</label>
                        <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-emerald-600 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Enter amount" value={ledgerForm.dividend && ledgerForm.dividend !== 0 ? ledgerForm.dividend : ''} onChange={e => setLedgerForm({...ledgerForm, dividend: Number(e.target.value) || 0})} onKeyDown={handleKeyDown} />
                        <p className="text-[8px] font-bold text-emerald-500 mt-1">* Auto-calculated (Installment - Paid)</p>
                     </div>
                  )}

                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date</label>
                     <input type="date" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-500 outline-none focus:border-blue-500" value={new Date(ledgerForm.date).toISOString().substr(0,10)} onChange={e => setLedgerForm({...ledgerForm, date: new Date(e.target.value).getTime()})} />
                  </div>
                  <button onClick={handleLedgerSave} disabled={isSubmitting} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? 'Saving...' : 'Save Voucher'}</button>
                  <button onClick={() => { setShowLedgerEntry(null); setShowPremiumEntry(false); }} className="w-full py-3 text-slate-400 font-black uppercase tracking-widest hover:text-slate-600">Cancel</button>
               </div>
            </div>
         </div>
      )}

      {/* PRIZE DECLARATION MODAL */}
      {showPrizeModal && (
         <div className="fixed inset-0 bg-brand-950/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl w-full max-w-sm animate-scaleUp shadow-2xl border-4 border-blue-50">
               <div className="text-center mb-6">
                  <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                     <i className="fas fa-trophy"></i>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Declare Win</h3>
                  <p className="text-xs font-bold text-slate-400">Record winning this chit</p>
               </div>
               
               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bid Amount (Discount)</label>
                     <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                        placeholder="Enter bid amount"
                        value={prizeForm.bidAmount && prizeForm.bidAmount !== 0 ? prizeForm.bidAmount : ''} 
                        onChange={e => {
                            const bid = Number(e.target.value) || 0;
                            const won = Math.max(0, (viewDetail?.chitConfig?.chitValue || 0) - bid);
                            setPrizeForm({...prizeForm, bidAmount: bid, amount: won});
                        }}
                        onKeyDown={handleKeyDown}
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Winning Amount (Received)</label>
                     <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-2xl text-slate-900 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Auto-calculated" value={prizeForm.amount && prizeForm.amount !== 0 ? prizeForm.amount : ''} onChange={e => setPrizeForm({...prizeForm, amount: Number(e.target.value) || 0})} onKeyDown={handleKeyDown} />
                     <p className="text-[8px] font-bold text-slate-400 mt-1">* Auto-calculated (Chit Value - Bid)</p>
                  </div>
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deposit To</label>
                     <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-xs uppercase outline-none focus:border-blue-500" value={prizeForm.depositMode} onChange={e => setPrizeForm({...prizeForm, depositMode: e.target.value as PaymentMode})}>
                        <option value="CASH">Cash Drawer</option>
                        <option value="CUB">CUB Bank</option>
                        <option value="KVB">KVB Bank</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Won in Month</label>
                     <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Month number" value={prizeForm.month && prizeForm.month !== 0 ? prizeForm.month : ''} onChange={e => setPrizeForm({...prizeForm, month: Number(e.target.value) || 0})} onKeyDown={handleKeyDown} />
                  </div>
                  
                  <div className="pt-2">
                     <button onClick={confirmPrize} disabled={isSubmitting} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? 'Saving...' : 'Confirm Victory'}</button>
                     <button onClick={() => setShowPrizeModal(false)} className="w-full py-3 mt-2 text-slate-400 font-black uppercase tracking-widest hover:text-slate-600">Cancel</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* MAIN FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-brand-950/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <div>
                  <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">{editingId ? 'Edit Asset' : 'New Asset'}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Portfolio Record</p>
               </div>
               <button onClick={() => setShowForm(false)} className="h-10 w-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition"><i className="fas fa-times"></i></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                   <select className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>{savingCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Provider / Name</label>
                   <input required className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500" placeholder="INSTITUTION" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} />
                </div>
              </div>

              {formData.type === 'CHIT_SAVINGS' ? (
                 <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 space-y-4">
                    <h4 className="text-xs font-black text-yellow-800 uppercase tracking-widest mb-2 border-b border-yellow-200 pb-2">Chit Configuration</h4>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-1">Chit Value (Pot)</label>
                          <input required type="number" className="w-full bg-white rounded-xl px-3 py-2 font-bold text-slate-900 outline-none border border-yellow-200 focus:border-yellow-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Enter value" value={formData.chitConfig?.chitValue && formData.chitConfig.chitValue !== 0 ? formData.chitConfig.chitValue : ''} onChange={e => setFormData({...formData, chitConfig: { ...formData.chitConfig!, chitValue: Number(e.target.value) || 0 }})} onKeyDown={handleKeyDown} />
                       </div>
                       <div>
                          <label className="block text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-1">Monthly Due</label>
                          <input required type="number" className="w-full bg-white rounded-xl px-3 py-2 font-bold text-slate-900 outline-none border border-yellow-200 focus:border-yellow-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.chitConfig?.monthlyInstallment || ''} onChange={e => setFormData({...formData, chitConfig: { ...formData.chitConfig!, monthlyInstallment: Number(e.target.value) }})} />
                       </div>
                       <div>
                          <label className="block text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-1">Duration (Months)</label>
                          <input required type="number" className="w-full bg-white rounded-xl px-3 py-2 font-bold text-slate-900 outline-none border border-yellow-200 focus:border-yellow-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.chitConfig?.durationMonths || ''} onChange={e => setFormData({...formData, chitConfig: { ...formData.chitConfig!, durationMonths: Number(e.target.value) }})} />
                       </div>
                       <div>
                          <label className="block text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-1">Start Date</label>
                          <input required type="date" className="w-full bg-white rounded-xl px-3 py-2 font-bold text-slate-900 outline-none border border-yellow-200 focus:border-yellow-500" value={new Date(formData.startDate || Date.now()).toISOString().substr(0,10)} onChange={e => setFormData({...formData, startDate: new Date(e.target.value).getTime()})} />
                       </div>
                    </div>
                 </div>
              ) : (
                 <>
                   <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contribution Type</label>
                       <div className="flex bg-slate-100 p-1 rounded-xl">
                           <button type="button" onClick={() => setFormData({...formData, contributionType: 'LUMP_SUM'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${formData.contributionType === 'LUMP_SUM' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>One Time</button>
                           <button type="button" onClick={() => setFormData({...formData, contributionType: 'MONTHLY'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${formData.contributionType === 'MONTHLY' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>Monthly (SIP/Premium)</button>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Start Date</label>
                         <input required type="date" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500" value={new Date(formData.startDate || Date.now()).toISOString().substr(0,10)} onChange={e => setFormData({...formData, startDate: new Date(e.target.value).getTime()})} />
                      </div>
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Maturity Date</label>
                         <input required type="date" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500" value={new Date(formData.maturityDate || Date.now()).toISOString().substr(0,10)} onChange={e => setFormData({...formData, maturityDate: new Date(e.target.value).getTime()})} />
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Investment Amount (₹)</label>
                         <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.amountInvested || ''} onChange={e => setFormData({...formData, amountInvested: Number(e.target.value)})} />
                         {formData.contributionType === 'MONTHLY' && <p className="text-[9px] font-bold text-slate-400 mt-1">* This is the monthly installment amount</p>}
                      </div>
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Value (₹)</label>
                         <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.expectedMaturityValue || ''} onChange={e => setFormData({...formData, expectedMaturityValue: Number(e.target.value)})} />
                      </div>
                   </div>
                 </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : 'Save Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestmentList;
