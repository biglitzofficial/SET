
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Customer, Invoice, Liability, Payment } from '../types';
import { dueDatesAPI } from '../services/api';

interface OutstandingReportsProps {
  customers: Customer[];
  invoices: Invoice[];
  liabilities: Liability[];
  payments: Payment[]; // Added to calculate true ledger balance
  onDrillDown: (id: string, type: 'CUSTOMER' | 'LENDER') => void;
  summaryOnly?: boolean; // If true, only show summary cards without detailed tables
}

interface DueDateRecord {
  id: string; // customer/lender ID
  category: string; // ROYALTY, INTEREST, CHIT, GENERAL, or PAYABLE
  dueDate: number; // timestamp
  amount: number;
}

const OutstandingReports: React.FC<OutstandingReportsProps> = ({ customers, invoices, liabilities, payments, onDrillDown, summaryOnly = false }) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'RECEIVABLES' | 'PAYABLES' | 'ADVANCES' | 'MARKET_CAPITAL'>('RECEIVABLES');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL'>('ALL');
  
  // Due dates storage - persisted in Firebase
  const [dueDates, setDueDates] = useState<DueDateRecord[]>([]);
  const [dueDatesLoading, setDueDatesLoading] = useState(true);
  
  // Date picker state
  const [editingDueDate, setEditingDueDate] = useState<{ id: string; category: string } | null>(null);
  
  // Load due dates from Firebase
  useEffect(() => {
    const loadDueDates = async () => {
      try {
        const data = await dueDatesAPI.getAll();
        setDueDates(data || []);
      } catch (error) {
        console.error('Failed to load due dates:', error);
      } finally {
        setDueDatesLoading(false);
      }
    };
    loadDueDates();
  }, []);
  
  // Helper: Set due date for an outstanding
  const setDueDate = async (id: string, category: string, dueDate: number, amount: number) => {
    try {
      console.log('Saving due date:', { id, category, dueDate, amount });
      const result = await dueDatesAPI.upsert({ id, category, dueDate, amount });
      console.log('Due date saved successfully:', result);
      setDueDates(prev => {
        const filtered = prev.filter(d => !(d.id === id && d.category === category));
        return [...filtered, { id, category, dueDate, amount }];
      });
      setEditingDueDate(null);
    } catch (error: any) {
      console.error('Failed to save due date:', error);
      console.error('Error details:', error.message, error.stack);
      alert(`Failed to save due date: ${error.message || 'Please try again.'}`);
    }
  };
  
  // Helper: Get due date for an outstanding
  const getDueDate = (id: string, category: string): number | undefined => {
    return dueDates.find(d => d.id === id && d.category === category)?.dueDate;
  };
  
  // Helper: Categorize by due date
  const categorizeDueDate = (dueDate: number | undefined): 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NONE' => {
    if (!dueDate) return 'NONE';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const dueDateObj = new Date(dueDate);
    dueDateObj.setHours(0, 0, 0, 0);
    const dueDateTimestamp = dueDateObj.getTime();
    
    if (dueDateTimestamp < todayTimestamp) return 'OVERDUE';
    if (dueDateTimestamp === todayTimestamp) return 'TODAY';
    return 'UPCOMING';
  };
  
  // Helper: Check if due within 3 days (for reminders)
  const isDueWithin3Days = (dueDate: number | undefined): boolean => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dueDateObj = new Date(dueDate);
    dueDateObj.setHours(0, 0, 0, 0);
    return dueDateObj.getTime() >= today.getTime() && dueDateObj.getTime() <= threeDaysFromNow.getTime();
  };

  // Handle URL parameters for initial filter and tab
  useEffect(() => {
    const filter = searchParams.get('filter');
    const tab = searchParams.get('tab');
    
    // Set the active tab if provided in URL
    if (tab === 'receivables' || tab === 'payables' || tab === 'advances' || tab === 'market_capital') {
      setActiveTab(tab.toUpperCase().replace('_', '_') as 'RECEIVABLES' | 'PAYABLES' | 'ADVANCES' | 'MARKET_CAPITAL');
      setCategoryFilter('ALL');
    }
    
    // Set the filter if provided in URL (only affects receivables filtering)
    if (filter && (filter === 'royalty' || filter === 'interest' || filter === 'chit' || filter === 'general')) {
      setCategoryFilter(filter.toUpperCase() as 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL');
    }
  }, [searchParams]);

  const customerAnalysis = useMemo(() => {
    return customers.map(cust => {
      // Filter Transactions for this customer
      const custInvoices = invoices.filter(inv => inv.customerId === cust.id && !inv.isVoid);
      const custPayments = payments.filter(p => p.sourceId === cust.id);

      // --- LEDGER BALANCE CALCULATION ---
      // MUST exactly match Party Ledger COMBINED opening formula in ReportCenter.tsx:
      // opening = interestPrincipal + openingBalance - creditPrincipal
      const opening = (cust.interestPrincipal || 0) + (cust.openingBalance || 0) - (cust.creditPrincipal || 0);
      const totalInvoicesAmount = custInvoices.filter(i => i.direction === 'IN').reduce((sum, i) => sum + i.amount, 0);
      const paymentsOut = custPayments.filter(p => p.type === 'OUT').reduce((sum, p) => sum + p.amount, 0); // We paid them (Debit)

      // Payables (Credits)
      const totalPayableInvoices = custInvoices.filter(i => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0);
      const paymentsIn = custPayments.filter(p => p.type === 'IN').reduce((sum, p) => sum + p.amount, 0); // They paid us (Credit)

      // Net Ledger Balance: (Opening + InvoicesIN + PaymentsOUT) - (InvoicesOUT + PaymentsIN)
      // Positive = Receivable (Debit Balance)
      // Negative = Payable (Credit Balance)
      const netLedgerBalance = (opening + totalInvoicesAmount + paymentsOut) - (totalPayableInvoices + paymentsIn);

      // --- CATEGORY BREAKDOWN using invoice amounts + category-specific payments ---
      // Same logic as netLedgerBalance but scoped per category, so filter results match the ledger
      const chitInAmt    = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const chitOutAmt   = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const chitPaidIn   = custPayments.filter(p => p.type === 'IN' && p.category === 'CHIT').reduce((s, p) => s + p.amount, 0);
      const chitPaidOut  = custPayments.filter(p => p.type === 'OUT' && p.category === 'CHIT').reduce((s, p) => s + p.amount, 0);
      const chitNet      = (chitInAmt + chitPaidOut) - (chitOutAmt + chitPaidIn); // positive = receivable, negative = payable

      const royaltyAmt   = custInvoices.filter(i => i.type === 'ROYALTY').reduce((s, i) => s + i.amount, 0);
      const royaltyPaid  = custPayments.filter(p => p.type === 'IN' && p.category === 'ROYALTY').reduce((s, p) => s + p.amount, 0);
      const royaltyNet   = royaltyAmt - royaltyPaid;

      const interestAmt  = custInvoices.filter(i => i.type === 'INTEREST').reduce((s, i) => s + i.amount, 0);
      const interestPaid = custPayments.filter(p => p.type === 'IN' && (p.category === 'INTEREST' || p.category === 'PRINCIPAL_RECOVERY')).reduce((s, p) => s + p.amount, 0);
      const interestNet  = interestAmt - interestPaid;

      // GENERAL absorbs the remainder so category totals always reconcile to netLedgerBalance
      const generalDue   = netLedgerBalance - chitNet - royaltyNet - interestNet;

      const breakdown = {
        CHIT:            chitNet,
        CHIT_RECEIVABLE: Math.max(0, chitInAmt - chitPaidIn), // installments owed to us only (no payout netting)
        ROYALTY:         royaltyNet,
        INTEREST:        interestNet,
        GENERAL:         generalDue
      };

      return { 
          ...cust, 
          breakdown, 
          netLedgerBalance 
      };
    });
  }, [customers, invoices, payments]);

  const data = useMemo(() => {
    let result: any[] = [];
    
    if (activeTab === 'RECEIVABLES') {
       result = customerAnalysis
         .map(c => {
            let displayAmount = 0;
            let categoryKey = '';
            if (categoryFilter === 'ALL') {
              displayAmount = c.netLedgerBalance;
              categoryKey = 'ALL';
            } else if (categoryFilter === 'CHIT') {
              displayAmount = c.breakdown.CHIT; // mirrors Party Ledger CHIT scope exactly
              categoryKey = 'CHIT';
            } else {
              displayAmount = c.breakdown[categoryFilter];
              categoryKey = categoryFilter;
            }
            const dueDate = getDueDate(c.id, categoryKey);
            const dueStatus = categorizeDueDate(dueDate);
            const needsReminder = isDueWithin3Days(dueDate);
            return { ...c, displayAmount, categoryKey, dueDate, dueStatus, needsReminder };
         })
         .filter(c => c.displayAmount > 0);
    }
    else if (activeTab === 'ADVANCES') {
       result = customerAnalysis
         .map(c => {
           const catAmt = categoryFilter === 'ALL' ? c.netLedgerBalance
             : categoryFilter === 'CHIT' ? c.breakdown.CHIT
             : categoryFilter === 'INTEREST' ? c.breakdown.INTEREST
             : categoryFilter === 'ROYALTY' ? c.breakdown.ROYALTY
             : c.breakdown.GENERAL;
           const dueDate = getDueDate(c.id, 'ADVANCE');
           const dueStatus = categorizeDueDate(dueDate);
           const needsReminder = isDueWithin3Days(dueDate);
           return { ...c, displayAmount: catAmt, categoryKey: categoryFilter === 'ALL' ? 'ADVANCE' : categoryFilter, dueDate, dueStatus, needsReminder };
         })
         .filter(c => c.displayAmount < 0 && !c.isLender);
    }
    else if (activeTab === 'MARKET_CAPITAL') {
       // Market Capital = interest principal loans; filter by INTEREST or ALL
       result = customers
         .filter(c => c.isInterest && c.interestPrincipal > 0)
         .filter(() => categoryFilter === 'ALL' || categoryFilter === 'INTEREST')
         .map(c => {
           const dueDate = getDueDate(c.id, 'CAPITAL');
           const dueStatus = categorizeDueDate(dueDate);
           const needsReminder = isDueWithin3Days(dueDate);
           return { ...c, displayAmount: c.interestPrincipal, categoryKey: 'CAPITAL', dueDate, dueStatus, needsReminder };
         });
    }
    else {
       // PAYABLES
       // Liabilities (money borrowed - INTEREST / GENERAL category)
       const lenders = (categoryFilter === 'ALL' || categoryFilter === 'INTEREST' || categoryFilter === 'GENERAL')
         ? liabilities.map(l => {
             // Subtract any OUT payments matched by name (covers LOAN_REPAYMENT by sourceId or GENERAL payments by sourceName)
             const paidOut = payments
               .filter(p => p.type === 'OUT' && (
                 p.sourceId === l.id ||
                 (p.sourceName || '').toLowerCase() === (l.providerName || '').toLowerCase()
               ))
               .reduce((sum, p) => sum + p.amount, 0);
             const remaining = Math.max(0, l.principal - paidOut);
             const dueDate = getDueDate(l.id, 'PAYABLE');
             const dueStatus = categorizeDueDate(dueDate);
             const needsReminder = isDueWithin3Days(dueDate);
             return { ...l, displayAmount: remaining, categoryKey: 'PAYABLE', dueDate, dueStatus, needsReminder };
           }).filter(l => l.displayAmount > 0)
         : [];

       // isLender customers (credit principal minus OUT payments - GENERAL)
       const customerCreditors = (categoryFilter === 'ALL' || categoryFilter === 'GENERAL')
         ? customers.filter(c => c.isLender).map(c => {
             // Sum all OUT payments made to this lender customer (repayments)
             const paidOut = payments
               .filter(p => p.sourceId === c.id && p.type === 'OUT')
               .reduce((sum, p) => sum + p.amount, 0);
             const outstanding = Math.max(0, (c.creditPrincipal || 0) - paidOut);
             const dueDate = getDueDate(c.id, 'PAYABLE');
             const dueStatus = categorizeDueDate(dueDate);
             const needsReminder = isDueWithin3Days(dueDate);
             return { ...c, displayAmount: outstanding, name: `${c.name} (Lender)`, categoryKey: 'PAYABLE', dueDate, dueStatus, needsReminder };
           }).filter(c => c.displayAmount > 0)
         : [];

       // Debtor customers: chit winners we owe payout (CHIT category)
       const debtorCustomers = (categoryFilter === 'ALL' || categoryFilter === 'CHIT')
         ? customerAnalysis.filter(c => c.breakdown.CHIT < 0 && !c.isLender).map(c => {
             // Any OUT payment to this customer (regardless of category) reduces what we owe them
             const totalPaidOut = payments
               .filter(p => p.sourceId === c.id && p.type === 'OUT')
               .reduce((sum, p) => sum + p.amount, 0);
             const remaining = Math.max(0, Math.abs(c.breakdown.CHIT) - totalPaidOut);
             const dueDate = getDueDate(c.id, 'PAYABLE');
             const dueStatus = categorizeDueDate(dueDate);
             const needsReminder = isDueWithin3Days(dueDate);
             return { ...c, displayAmount: remaining, categoryKey: 'CHIT', dueDate, dueStatus, needsReminder };
           }).filter(c => c.displayAmount > 0)
         : [];

       result = [...lenders, ...customerCreditors, ...debtorCustomers];
    }

    // Dynamic Sort
    return result.sort((a, b) => {
       const valA = Math.abs(a.displayAmount);
       const valB = Math.abs(b.displayAmount);
       return sortOrder === 'DESC' ? valB - valA : valA - valB;
    });
  }, [activeTab, customerAnalysis, customers, liabilities, payments, sortOrder, categoryFilter, dueDates]);

  // Categorize data into 3 columns based on due status
  const categorizedData = useMemo(() => {
    return {
      overdue: data.filter(item => item.dueStatus === 'OVERDUE'),
      today: data.filter(item => item.dueStatus === 'TODAY'),
      upcoming: data.filter(item => item.dueStatus === 'UPCOMING'),
      noDueDate: data.filter(item => item.dueStatus === 'NONE')
    };
  }, [data]);

  const grandTotal = useMemo(() => data.reduce((acc, item) => acc + (Math.abs(item.displayAmount || 0)), 0), [data]);

  // Render item card (reusable component for all columns)
  const renderOutstandingRow = (item: any) => (
    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {item.needsReminder && (
            <i className="fas fa-bell text-amber-500 text-xs"></i>
          )}
          <div>
            <div className="font-black text-sm text-slate-900 uppercase">{item.name || item.providerName}</div>
            {categoryFilter !== 'ALL' && (
              <span className="inline-block px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 mt-1">
                {categoryFilter}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-3 text-center">
        {editingDueDate?.id === item.id && editingDueDate?.category === item.categoryKey ? (
          <div className="flex gap-1 items-center justify-center">
            <input 
              type="date" 
              className="px-1.5 py-1 border border-slate-300 rounded text-[11px] outline-none focus:border-indigo-500 w-28"
              onChange={(e) => {
                if (e.target.value) {
                  const selectedDate = new Date(e.target.value).getTime();
                  setDueDate(item.id, item.categoryKey, selectedDate, Math.abs(item.displayAmount));
                }
              }}
              defaultValue={item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : ''}
            />
            <button 
              onClick={() => setEditingDueDate(null)}
              className="px-1.5 py-1 bg-slate-200 rounded text-[10px] font-black hover:bg-slate-300"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setEditingDueDate({ id: item.id, category: item.categoryKey })}
            className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded text-[11px] hover:bg-slate-100 transition font-bold text-slate-600 mx-auto"
          >
            <i className="fas fa-calendar-alt text-[9px]"></i>
            {item.dueDate ? (
              <span>{new Date(item.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            ) : (
              <span className="text-slate-400 text-[10px]">Set</span>
            )}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-base font-display font-black text-slate-900">
          ₹{Math.abs(item.displayAmount).toLocaleString()}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
          {['RECEIVABLES', 'MARKET_CAPITAL', 'ADVANCES', 'PAYABLES'].map(tab => (
            <button 
              key={tab} 
              onClick={() => { setActiveTab(tab as any); setCategoryFilter('ALL'); }} 
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${
                activeTab === tab 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
           <select 
             className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 uppercase tracking-widest outline-none focus:border-indigo-500"
             value={categoryFilter}
             onChange={(e) => setCategoryFilter(e.target.value as any)}
           >
             <option value="ALL">All Categories</option>
             {(activeTab === 'RECEIVABLES' || activeTab === 'PAYABLES' || activeTab === 'ADVANCES') && <option value="ROYALTY">Royalty Only</option>}
             <option value="INTEREST">{activeTab === 'MARKET_CAPITAL' ? 'Market Capital' : 'Interest Only'}</option>
             <option value="CHIT">Chit Fund Only</option>
             {(activeTab === 'RECEIVABLES' || activeTab === 'PAYABLES' || activeTab === 'ADVANCES') && <option value="GENERAL">General Trade</option>}
           </select>

           <button 
              onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
              className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 flex items-center gap-2"
           >
              <i className={`fas fa-sort-amount-${sortOrder === 'ASC' ? 'up' : 'down'}`}></i>
              {sortOrder === 'ASC' ? 'Low-High' : 'High-Low'}
           </button>
        </div>
      </div>

      {/* Summary Cards - Only show in Dashboard summary view */}
      {summaryOnly && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 border-2 border-rose-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-exclamation-circle text-rose-600 text-lg"></i>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-600">Overdue</h3>
            </div>
            <div className="text-2xl font-display font-black text-rose-900">₹{categorizedData.overdue.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
            <div className="text-[9px] font-black text-rose-600 mt-1">{categorizedData.overdue.length} items</div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-clock text-amber-600 text-lg"></i>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-600">Due Today</h3>
            </div>
            <div className="text-2xl font-display font-black text-amber-900">₹{categorizedData.today.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
            <div className="text-[9px] font-black text-amber-600 mt-1">{categorizedData.today.length} items</div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-calendar-check text-blue-600 text-lg"></i>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Upcoming</h3>
            </div>
            <div className="text-2xl font-display font-black text-blue-900">₹{categorizedData.upcoming.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
            <div className="text-[9px] font-black text-blue-600 mt-1">{categorizedData.upcoming.length} items</div>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-question-circle text-slate-600 text-lg"></i>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600">No Due Date</h3>
            </div>
            <div className="text-2xl font-display font-black text-slate-900">₹{categorizedData.noDueDate.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
            <div className="text-[9px] font-black text-slate-600 mt-1">{categorizedData.noDueDate.length} items</div>
          </div>
        </div>
      )}

      {/* 3-Column Layout - Only show if not summary only */}
      {!summaryOnly && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* OVERDUE Column */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <i className="fas fa-exclamation-triangle text-2xl"></i>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Overdue</h3>
                  <p className="text-[9px] opacity-80 font-bold">Past Due Date</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-display font-black">₹{categorizedData.overdue.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
                <div className="text-[8px] opacity-80 font-bold">{categorizedData.overdue.length} items</div>
              </div>
            </div>
          </div>
          <div className="max-h-[600px] overflow-auto custom-scrollbar">
            {categorizedData.overdue.length > 0 ? (
              <table className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Customer</th>
                    <th className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 w-24">Due Date</th>
                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {categorizedData.overdue.map(renderOutstandingRow)}
                </tbody>
              </table>
            ) : (
              <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-dashed border-slate-200">
                <i className="fas fa-check-circle text-4xl text-slate-300 mb-3"></i>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Overdue Items</p>
              </div>
            )}
          </div>
        </div>

        {/* DUE TODAY Column */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <i className="fas fa-clock text-2xl"></i>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Due Today</h3>
                  <p className="text-[9px] opacity-80 font-bold">Action Required</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-display font-black">₹{categorizedData.today.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
                <div className="text-[8px] opacity-80 font-bold">{categorizedData.today.length} items</div>
              </div>
            </div>
          </div>
          <div className="max-h-[600px] overflow-auto custom-scrollbar">
            {categorizedData.today.length > 0 ? (
              <table className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Customer</th>
                    <th className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 w-24">Due Date</th>
                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {categorizedData.today.map(renderOutstandingRow)}
                </tbody>
              </table>
            ) : (
              <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-dashed border-slate-200">
                <i className="fas fa-calendar-check text-4xl text-slate-300 mb-3"></i>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Items Due Today</p>
              </div>
            )}
          </div>
        </div>

        {/* UPCOMING Column */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <i className="fas fa-calendar-alt text-2xl"></i>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Upcoming</h3>
                  <p className="text-[9px] opacity-80 font-bold">Future Due Dates</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-display font-black">₹{categorizedData.upcoming.reduce((sum, item) => sum + Math.abs(item.displayAmount), 0).toLocaleString()}</div>
                <div className="text-[8px] opacity-80 font-bold">{categorizedData.upcoming.length} items</div>
              </div>
            </div>
          </div>
          <div className="max-h-[600px] overflow-auto custom-scrollbar">
            {categorizedData.upcoming.length > 0 ? (
              <table className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Customer</th>
                    <th className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 w-24">Due Date</th>
                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {categorizedData.upcoming.map(renderOutstandingRow)}
                </tbody>
              </table>
            ) : (
              <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-dashed border-slate-200">
                <i className="fas fa-inbox text-4xl text-slate-300 mb-3"></i>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Upcoming Items</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items Without Due Date */}
      {categorizedData.noDueDate.length > 0 && (
        <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
            <i className="fas fa-question-circle"></i>
            Items Without Due Date ({categorizedData.noDueDate.length})
          </h3>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Customer</th>
                  <th className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 w-24">Due Date</th>
                  <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {categorizedData.noDueDate.map(renderOutstandingRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Total Summary */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <i className="fas fa-chart-line text-2xl opacity-80"></i>
            <h3 className="text-sm font-black uppercase tracking-widest opacity-80">Grand Total Outstanding</h3>
          </div>
          <div className="text-3xl font-display font-black">₹{grandTotal.toLocaleString()}</div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default OutstandingReports;
