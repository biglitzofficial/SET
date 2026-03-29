
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Customer, Invoice, Liability, Payment } from '../types';
import { computeOpening, sumPaymentsInForLedger } from '../utils/ledgerUtils';

interface OutstandingReportsProps {
  customers: Customer[];
  invoices: Invoice[];
  liabilities: Liability[];
  payments: Payment[]; // Added to calculate true ledger balance
  onDrillDown: (id: string, type: 'CUSTOMER' | 'LENDER') => void;
  summaryOnly?: boolean; // If true, only show summary cards without detailed tables
}

const OutstandingReports: React.FC<OutstandingReportsProps> = ({ customers, invoices, liabilities, payments, onDrillDown, summaryOnly = false }) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'OVERALL' | 'RECEIVABLES' | 'PAYABLES' | 'ADVANCES' | 'MARKET_CAPITAL'>('OVERALL');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [overallSort, setOverallSort] = useState<{ col: string; dir: 'DESC' | 'ASC' }>({ col: 'net', dir: 'DESC' });
  // All columns visible by default — user can toggle each off/on
  const ALL_OVERALL_COLS = [
    { col: 'royalty',     label: 'Royalty',      cls: 'text-purple-500',  footCls: 'text-purple-300'  },
    { col: 'interest',    label: 'Interest',     cls: 'text-emerald-600', footCls: 'text-emerald-300' },
    { col: 'chit',        label: 'Chit',         cls: 'text-orange-500',  footCls: 'text-orange-300'  },
    { col: 'principal',   label: 'Principal',    cls: 'text-blue-600',    footCls: 'text-blue-300'    },
    { col: 'general',     label: 'General',      cls: 'text-slate-500',   footCls: 'text-slate-300'   },
    { col: 'interestOut', label: 'Interest Out', cls: 'text-rose-600',    footCls: 'text-rose-300'    },
    { col: 'payable',     label: 'Payable',      cls: 'text-rose-500',    footCls: 'text-rose-300'    },
  ] as const;
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_OVERALL_COLS.map(c => c.col))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL' | 'LOAN' | 'PRINCIPAL' | 'CHIT_ROYALTY_INTEREST'>('ALL');
  const [overallViewMode, setOverallViewMode] = useState<'PARTY' | 'INVOICE'>('PARTY'); // Party summary vs individual invoices
  const [listViewMode, setListViewMode] = useState(false); // Single list view — mobile-friendly, all visible

  // Handle URL parameters for initial filter and tab
  useEffect(() => {
    const filter = searchParams.get('filter');
    const tab = searchParams.get('tab');
    
    // Set the active tab if provided in URL
    if (tab === 'overall' || tab === 'receivables' || tab === 'payables' || tab === 'advances' || tab === 'market_capital') {
      setActiveTab(tab.toUpperCase().replace('_', '_') as 'OVERALL' | 'RECEIVABLES' | 'PAYABLES' | 'ADVANCES' | 'MARKET_CAPITAL');
      setCategoryFilter('ALL');
    }
    
    // Set the filter if provided in URL (only affects receivables filtering)
    if (filter && (filter === 'royalty' || filter === 'interest' || filter === 'chit' || filter === 'general' || filter === 'loan' || filter === 'principal' || filter === 'chit_royalty_interest')) {
      setCategoryFilter(filter === 'chit_royalty_interest' ? 'CHIT_ROYALTY_INTEREST' : filter.toUpperCase() as any);
    }
  }, [searchParams]);

  const customerAnalysis = useMemo(() => {
    return customers.map(cust => {
      // Filter Transactions for this customer
      const custInvoices = invoices.filter(inv => inv.customerId === cust.id && !inv.isVoid);
      const custPayments = payments.filter(p => p.sourceId === cust.id);

      // --- LEDGER BALANCE CALCULATION ---
      // Uses shared ledger utils: EXCLUDE PRINCIPAL_RECOVERY and LOAN_TAKEN from payIN
      const opening = computeOpening(cust);
      const totalInvoicesAmount = custInvoices.filter(i => i.direction === 'IN').reduce((sum, i) => sum + i.amount, 0);
      const paymentsOut = custPayments.filter(p => p.type === 'OUT').reduce((sum, p) => sum + p.amount, 0);
      const totalPayableInvoices = custInvoices.filter(i => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0);
      const paymentsIn = sumPaymentsInForLedger(custPayments);

      // Net Ledger Balance: (Opening + InvoicesIN + PaymentsOUT) - (InvoicesOUT + PaymentsIN)
      // Positive = Receivable (Debit Balance)
      // Negative = Payable (Credit Balance)
      const netLedgerBalance = (opening + totalInvoicesAmount + paymentsOut) - (totalPayableInvoices + paymentsIn);

      // --- CATEGORY BREAKDOWN using invoice amounts + category-specific payments ---
      // Same logic as netLedgerBalance but scoped per category, so filter results match the ledger
      const chitInAmt    = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const chitOutAmt   = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const chitPaidIn   = custPayments.filter(p => p.type === 'IN'  && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitPaidOut  = custPayments.filter(p => p.type === 'OUT' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitNet      = (chitInAmt + chitPaidOut) - (chitOutAmt + chitPaidIn); // positive = receivable, negative = payable

      const royaltyAmt   = custInvoices.filter(i => i.type === 'ROYALTY').reduce((s, i) => s + i.amount, 0);
      const royaltyPaid  = custPayments.filter(p => p.type === 'IN' && p.category === 'ROYALTY').reduce((s, p) => s + p.amount, 0);
      const royaltyNet   = royaltyAmt - royaltyPaid;

      const interestAmt  = custInvoices.filter(i => i.type === 'INTEREST').reduce((s, i) => s + i.amount, 0);
      const interestPaid = custPayments.filter(p => p.type === 'IN' && p.category === 'INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestNet  = interestAmt - interestPaid;

      // Interest Out: INTEREST_OUT invoices (we owe them interest) minus LOAN_INTEREST payments
      const interestOutAmt  = custInvoices.filter(i => i.type === 'INTEREST_OUT' && !i.isVoid).reduce((s, i) => s + i.amount, 0);
      const interestOutPaid = custPayments.filter(p => p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestOutNet  = Math.max(0, interestOutAmt - interestOutPaid);

      // Explicit GENERAL invoice tracking (manual general invoices raised via billing)
      const generalInvAmt  = custInvoices.filter(i => i.type === 'GENERAL' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const generalInvPaid = custPayments.filter(p => p.type === 'IN' && p.category === 'GENERAL').reduce((s, p) => s + p.amount, 0);
      const generalInvNet  = generalInvAmt - generalInvPaid;

      // GENERAL = trade/other outstanding only (exclude interestOut so it goes to its own column)
      // Fix: interestOut is in netLedgerBalance; subtracting interestOutNet + creditPrincipal adjustment was
      // double-counting it into general for creditors. Add 2*interestOutNet to correct (restores principal-only in general).
      const generalDue   = netLedgerBalance - chitNet - royaltyNet - interestNet - interestOutNet - generalInvNet - (cust.interestPrincipal || 0) + (cust.creditPrincipal || 0);
      const generalTotal = generalDue + generalInvNet + 2 * interestOutNet; // corrects double-subtraction so interest stays only in interestOut

      const breakdown = {
        CHIT:            chitNet,
        CHIT_RECEIVABLE: Math.max(0, chitInAmt - chitPaidIn),
        ROYALTY:         royaltyNet,
        INTEREST:        interestNet,
        INTEREST_OUT:    interestOutNet,
        GENERAL:         generalTotal
      };

      return { 
          ...cust, 
          breakdown, 
          netLedgerBalance 
      };
    });
  }, [customers, invoices, payments]);

  // OVERALL: every party (customer + liability) with any outstanding, showing full breakdown
  // Consolidate: when a liability's providerName matches a customer, merge into one row (same person)
  const overallData = useMemo(() => {
    const normalize = (s: string) => (s || '').trim().toUpperCase().replace(/\s*\(lender\)\s*$/i, '');
    const custByNorm = new Map<string, { idx: number }>();
    const rows: any[] = [];

    customerAnalysis.forEach(c => {
      const royalty    = c.breakdown.ROYALTY     || 0;
      const interest   = c.breakdown.INTEREST    || 0;
      const chit       = c.breakdown.CHIT        || 0;
      const principal  = c.interestPrincipal    || 0;
      const general    = c.breakdown.GENERAL    || 0;
      const interestOut= c.breakdown.INTEREST_OUT|| 0;
      const net        = c.netLedgerBalance;
      if (royalty === 0 && interest === 0 && chit === 0 && principal === 0 && general === 0 && interestOut === 0) return;
      const idx = rows.length;
      custByNorm.set(normalize(c.name), { idx });
      rows.push({ id: c.id, name: c.name, phone: c.phone, royalty, interest, chit, principal, general, interestOut, payable: 0, net, sourceType: 'CUSTOMER' });
    });

    liabilities.forEach(l => {
      const paidOut = payments
        .filter(p => p.type === 'OUT' && (p.sourceId === l.id || (p.sourceName || '').toLowerCase() === (l.providerName || '').toLowerCase()))
        .reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, l.principal - paidOut);

      const interestOutAmt = invoices
        .filter(i => i.lenderId === l.id && i.type === 'INTEREST_OUT' && !i.isVoid)
        .reduce((s, i) => s + i.amount, 0);
      const interestOutPaid = payments
        .filter(p => p.sourceId === l.id && p.type === 'OUT' && p.category === 'LOAN_INTEREST')
        .reduce((s, p) => s + p.amount, 0);
      const interestOut = Math.max(0, interestOutAmt - interestOutPaid);

      const liaAmount = remaining + interestOut;
      if (liaAmount === 0) return;

      const match = custByNorm.get(normalize(l.providerName));
      if (match) {
        const r = rows[match.idx];
        r.interestOut = (r.interestOut || 0) + interestOut;
        r.payable = (r.payable || 0) + remaining;
        r.net = (r.net || 0) - liaAmount;
      } else {
        rows.push({ id: l.id, name: l.providerName, phone: l.phone || '', royalty: 0, interest: 0, chit: 0, principal: 0, general: 0, interestOut, payable: remaining, net: -liaAmount, sourceType: 'LIABILITY' });
      }
    });

    return rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [customerAnalysis, liabilities, payments, invoices]);

  // Individual invoice rows for "By Invoice" view — each bill as its own row with date
  const invoiceLevelData = useMemo(() => {
    const rows: any[] = [];
    const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const unpaid = invoices.filter(i => !i.isVoid && (i.balance ?? i.amount) > 0);
    unpaid.forEach(inv => {
      const amt = inv.balance ?? inv.amount;
      const isOut = inv.direction === 'OUT' || inv.type === 'INTEREST_OUT';
      const typeLabel = inv.type === 'INTEREST_OUT' ? 'INT. OUT' : inv.type?.replace('_', ' ');
      const categoryCol = inv.type === 'ROYALTY' ? 'royalty' : inv.type === 'INTEREST' ? 'interest' : inv.type === 'CHIT' ? 'chit' : inv.type === 'INTEREST_OUT' ? 'interestOut' : 'general';
      if (inv.customerId) {
        const cust = customers.find(c => c.id === inv.customerId);
        rows.push({ id: inv.id, partyId: inv.customerId, partyName: inv.customerName || cust?.name || '', date: inv.date, dateStr: fmtDate(inv.date), type: typeLabel, voucher: inv.invoiceNumber, amount: amt, isOut, sourceType: 'CUSTOMER' as const, categoryCol });
      } else if (inv.lenderId) {
        const l = liabilities.find(li => li.id === inv.lenderId);
        rows.push({ id: inv.id, partyId: inv.lenderId, partyName: l?.providerName || inv.customerName || '', date: inv.date, dateStr: fmtDate(inv.date), type: 'INT. OUT', voucher: inv.invoiceNumber, amount: amt, isOut: true, sourceType: 'LIABILITY' as const, categoryCol });
      }
    });
    return rows.sort((a, b) => b.date - a.date);
  }, [customers, liabilities, invoices]);

  const data = useMemo(() => {
    let result: any[] = [];
    
    if (activeTab === 'OVERALL') return []; // handled separately

    if (activeTab === 'RECEIVABLES') {
       result = customerAnalysis
         .map(c => {
            let displayAmount = 0;
            let categoryKey = '';
            if (categoryFilter === 'ALL') {
              displayAmount = c.netLedgerBalance;
              categoryKey = 'ALL';
            } else if (categoryFilter === 'CHIT_ROYALTY_INTEREST') {
              displayAmount = (c.breakdown.CHIT || 0) + (c.breakdown.ROYALTY || 0) + (c.breakdown.INTEREST || 0);
              categoryKey = 'CHIT_ROYALTY_INTEREST';
            } else if (categoryFilter === 'PRINCIPAL') {
              displayAmount = (c.isInterest && (c.interestPrincipal || 0) > 0) ? (c.interestPrincipal || 0) : 0;
              categoryKey = 'PRINCIPAL';
            } else if (categoryFilter === 'CHIT') {
              displayAmount = c.breakdown.CHIT; // mirrors Party Ledger CHIT scope exactly
              categoryKey = 'CHIT';
            } else {
              displayAmount = c.breakdown[categoryFilter] ?? 0;
              categoryKey = categoryFilter;
            }
            return { ...c, displayAmount, categoryKey, sourceType: 'CUSTOMER' as const };
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
           return { ...c, displayAmount: catAmt, categoryKey: categoryFilter === 'ALL' ? 'ADVANCE' : categoryFilter, sourceType: 'CUSTOMER' as const };
         })
         .filter(c => c.displayAmount < 0 && !c.isLender);
    }
    else if (activeTab === 'MARKET_CAPITAL') {
       // Market Capital = interest principal loans; filter by INTEREST or ALL
       result = customers
         .filter(c => c.isInterest && c.interestPrincipal > 0)
         .filter(() => categoryFilter === 'ALL' || categoryFilter === 'INTEREST')
         .map(c => ({ ...c, displayAmount: c.interestPrincipal, categoryKey: 'CAPITAL', sourceType: 'CUSTOMER' as const }));
    }
    else {
       // PAYABLES
       // LOAN: Liabilities (money borrowed) + isLender customers (credit principal)
       const lenders = (categoryFilter === 'ALL' || categoryFilter === 'LOAN')
         ? liabilities.map(l => {
             const paidOut = payments
               .filter(p => p.type === 'OUT' && (
                 p.sourceId === l.id ||
                 (p.sourceName || '').toLowerCase() === (l.providerName || '').toLowerCase()
               ))
               .reduce((sum, p) => sum + p.amount, 0);
             const remaining = Math.max(0, l.principal - paidOut);
             return { ...l, displayAmount: remaining, categoryKey: 'LOAN', sourceType: 'LIABILITY' };
           }).filter(l => l.displayAmount > 0)
         : [];

       // isLender customers (credit principal - LOAN category)
       const customerCreditors = (categoryFilter === 'ALL' || categoryFilter === 'LOAN')
         ? customers.filter(c => c.isLender).map(c => {
             const paidOut = payments
               .filter(p => p.sourceId === c.id && p.type === 'OUT')
               .reduce((sum, p) => sum + p.amount, 0);
             const outstanding = Math.max(0, (c.creditPrincipal || 0) - paidOut);
             return { ...c, displayAmount: outstanding, name: `${c.name} (Lender)`, categoryKey: 'LOAN', sourceType: 'CUSTOMER' };
           }).filter(c => c.displayAmount > 0)
         : [];

       // GENERAL TRADE: customers we owe for general (breakdown.GENERAL < 0, not lenders)
       const generalTradePayables = (categoryFilter === 'ALL' || categoryFilter === 'GENERAL')
         ? customerAnalysis.filter(c => !c.isLender && (c.breakdown.GENERAL || 0) < 0).map(c => {
             const remaining = Math.abs(c.breakdown.GENERAL || 0); // breakdown already net of payments
             return { ...c, displayAmount: remaining, name: c.name, categoryKey: 'GENERAL', sourceType: 'CUSTOMER' };
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
             return { ...c, displayAmount: remaining, categoryKey: 'CHIT', sourceType: 'CUSTOMER' };
           }).filter(c => c.displayAmount > 0)
         : [];

       // Consolidate lenders + customerCreditors by party name to avoid duplicates (e.g. same person as Liability + Customer)
       const normalizeName = (n: string) => (n || '').replace(/\s*\(lender\)\s*$/i, '').trim().toUpperCase();
       const loanPayables = [...lenders, ...customerCreditors];
       const mergedByName = new Map<string, { id: string; name: string; displayAmount: number; categoryKey: string; sourceType: 'CUSTOMER' | 'LIABILITY' }>();
       for (const item of loanPayables) {
         const baseName = normalizeName(item.name || item.providerName || '');
         const displayName = (item.providerName || item.name || '').replace(/\s*\(lender\)\s*$/i, '').trim();
         if (!baseName) continue;
         const existing = mergedByName.get(baseName);
         if (existing) {
           existing.displayAmount += item.displayAmount || 0;
         } else {
           mergedByName.set(baseName, {
             id: item.id,
             name: displayName,
             displayAmount: item.displayAmount || 0,
             categoryKey: item.categoryKey || 'LOAN',
             sourceType: item.sourceType || 'CUSTOMER'
           });
         }
       }
       const consolidatedLoan = Array.from(mergedByName.values()).filter(x => x.displayAmount > 0);

       result = [...consolidatedLoan, ...generalTradePayables, ...debtorCustomers];
    }

    // Dynamic Sort
    return result.sort((a, b) => {
       const valA = Math.abs(a.displayAmount);
       const valB = Math.abs(b.displayAmount);
       return sortOrder === 'DESC' ? valB - valA : valA - valB;
    });
  }, [activeTab, customerAnalysis, customers, liabilities, payments, sortOrder, categoryFilter]);


  const grandTotal = useMemo(() => data.reduce((acc, item) => acc + (Math.abs(item.displayAmount || 0)), 0), [data]);

  // For summaryOnly (Dashboard): use overallData when OVERALL tab, else data
  const summaryTotal = useMemo(() => {
    if (activeTab === 'OVERALL') return overallData.reduce((s, r) => s + Math.abs(r.net || 0), 0);
    return grandTotal;
  }, [activeTab, overallData, grandTotal]);
  const summaryCount = useMemo(() => {
    if (activeTab === 'OVERALL') return overallData.length;
    return data.length;
  }, [activeTab, overallData, data]);

  // Chit + Royalty + Interest receivables for Excel export (one row per customer, amounts summed)
  const chitRoyaltyInterestExportData = useMemo(() => {
    return customerAnalysis
      .map(c => {
        const amount = (c.breakdown.CHIT || 0) + (c.breakdown.ROYALTY || 0) + (c.breakdown.INTEREST || 0);
        return { customer: c.name || c.providerName || '', amount: Math.abs(amount) };
      })
      .filter(c => c.amount > 0)
      .sort((a, b) => (sortOrder === 'DESC' ? b.amount - a.amount : a.amount - b.amount));
  }, [customerAnalysis, sortOrder]);

  const handleDownloadExcel = () => {
    const rows = chitRoyaltyInterestExportData.map(item => ({
      'Customer': item.customer,
      'Amount': item.amount
    }));
    const total = chitRoyaltyInterestExportData.reduce((sum, i) => sum + i.amount, 0);
    rows.push({ 'Customer': '', 'Amount': total });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chit Royalty Interest');
    XLSX.writeFile(wb, `Receivables_Chit_Royalty_Interest_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
          {[
            { key: 'OVERALL', label: 'Overall' },
            { key: 'RECEIVABLES', label: 'Receivables' },
            { key: 'PAYABLES', label: 'Payables' },
            { key: 'ADVANCES', label: 'Advances' },
            { key: 'MARKET_CAPITAL', label: 'Market Capital' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key as any); setCategoryFilter('ALL'); }}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {activeTab !== 'OVERALL' && (
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
           {activeTab === 'RECEIVABLES' && (
             <>
               <button
                 onClick={() => setCategoryFilter(categoryFilter === 'CHIT_ROYALTY_INTEREST' ? 'ALL' : 'CHIT_ROYALTY_INTEREST')}
                 className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                   categoryFilter === 'CHIT_ROYALTY_INTEREST'
                     ? 'bg-indigo-600 text-white shadow-lg'
                     : 'bg-indigo-50 text-indigo-600 border-2 border-indigo-200 hover:bg-indigo-100'
                 }`}
                 title="Filter for mobile screenshot — Chit, Royalty & Interest only"
               >
                 <i className="fas fa-mobile-alt"></i>
                 Chit + Royalty + Interest
               </button>
               <button
                 onClick={handleDownloadExcel}
                 className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 whitespace-nowrap bg-emerald-50 text-emerald-700 border-2 border-emerald-200 hover:bg-emerald-100"
                 title="Download Chit + Royalty + Interest receivables as Excel"
               >
                 <i className="fas fa-file-excel"></i>
                 Download Excel
               </button>
             </>
           )}
           <select 
             className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 uppercase tracking-widest outline-none focus:border-indigo-500"
             value={categoryFilter === 'CHIT_ROYALTY_INTEREST' ? 'CHIT_ROYALTY_INTEREST' : categoryFilter}
             onChange={(e) => setCategoryFilter(e.target.value as any)}
           >
             <option value="ALL">All Categories</option>
             {activeTab === 'RECEIVABLES' && <option value="CHIT_ROYALTY_INTEREST">Chit + Royalty + Interest</option>}
             {(activeTab === 'RECEIVABLES' || activeTab === 'PAYABLES' || activeTab === 'ADVANCES') && <option value="ROYALTY">Royalty Only</option>}
             <option value="INTEREST">{activeTab === 'MARKET_CAPITAL' ? 'Market Capital' : 'Interest Only'}</option>
             <option value="CHIT">Chit Fund Only</option>
             {(activeTab === 'RECEIVABLES' || activeTab === 'PAYABLES' || activeTab === 'ADVANCES') && <option value="GENERAL">General Trade</option>}
             {activeTab === 'RECEIVABLES' && <option value="PRINCIPAL">Loan Principal</option>}
             {activeTab === 'PAYABLES' && <option value="LOAN">Loan (Loan Principal)</option>}
           </select>

           <button 
              onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
              className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 flex items-center gap-2"
           >
              <i className={`fas fa-sort-amount-${sortOrder === 'ASC' ? 'up' : 'down'}`}></i>
              {sortOrder === 'ASC' ? 'Low-High' : 'High-Low'}
           </button>
           <button
             onClick={() => setListViewMode(!listViewMode)}
             className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 ${
               listViewMode ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
             }`}
             title="List view — all items in one scroll, mobile-friendly"
           >
             <i className="fas fa-list"></i>
             List View
           </button>
        </div>
        )}
      </div>

      {/* Summary Cards - Only show in Dashboard summary view */}
      {/* ── OVERALL TAB ─────────────────────────────────────────────── */}
      {!summaryOnly && activeTab === 'OVERALL' && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-100">
            {[
              { label: 'Total Receivable', value: overallData.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0), cls: 'text-emerald-600' },
              { label: 'Total Payable',    value: overallData.filter(r => r.net < 0).reduce((s, r) => s + Math.abs(r.net), 0), cls: 'text-rose-600' },
              { label: 'Market Capital',   value: overallData.reduce((s, r) => s + (r.principal || 0), 0), cls: 'text-blue-600' },
              { label: 'Net Position',     value: overallData.reduce((s, r) => s + r.net, 0), cls: overallData.reduce((s, r) => s + r.net, 0) >= 0 ? 'text-emerald-600' : 'text-rose-600' },
            ].map(card => (
              <div key={card.label} className="p-6 border-r border-slate-100 last:border-0">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</div>
                <div className={`text-xl font-display font-black tracking-tighter ${card.cls}`}>{Math.abs(card.value).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* View mode: Party summary vs Individual Invoices */}
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">View</span>
              <button onClick={() => setOverallViewMode('PARTY')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${overallViewMode === 'PARTY' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-500 bg-white hover:border-slate-400'}`}>
                <i className="fas fa-users mr-1"></i>By Party
              </button>
              <button onClick={() => setOverallViewMode('INVOICE')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${overallViewMode === 'INVOICE' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-500 bg-white hover:border-slate-400'}`}>
                <i className="fas fa-file-invoice mr-1"></i>Individual Bills
              </button>
            </div>
            {overallViewMode === 'PARTY' && (
            <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Columns</span>
            {ALL_OVERALL_COLS.map(c => {
              const on = visibleCols.has(c.col);
              return (
                <button key={c.col} onClick={() => setVisibleCols(prev => {
                    const next = new Set(prev);
                    on ? next.delete(c.col) : next.add(c.col);
                    return next;
                  })}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                    on
                      ? `border-current ${c.cls} bg-white shadow-sm`
                      : 'border-dashed border-slate-300 text-slate-300 bg-white hover:border-slate-400 hover:text-slate-400'
                  }`}
                >
                  {on ? <><i className="fas fa-check mr-1"></i>{c.label}</> : <><i className="fas fa-plus mr-1"></i>{c.label}</>}
                </button>
              );
            })}
            </div>
            )}
          </div>

          {/* Table — Party summary or Individual Bills */}
          <div className="overflow-x-auto">
            {overallViewMode === 'INVOICE' ? (
              /* Individual Bills view: each invoice as a row with date, voucher, amount */
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-500">Date</th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-500">Type / Voucher</th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-500 w-48">Party</th>
                    <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest text-rose-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoiceLevelData.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-xs font-black text-slate-300 uppercase tracking-widest">No outstanding invoices</td></tr>
                  ) : invoiceLevelData.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onDrillDown(row.partyId, row.sourceType === 'LIABILITY' ? 'LENDER' : 'CUSTOMER')}>
                      <td className="px-6 py-4 font-mono text-slate-700">{row.dateStr}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${row.isOut ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{row.type}</span>
                          <span className="font-mono text-slate-600">{row.voucher}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800 uppercase text-xs">{row.partyName}</div>
                        <div className={`text-[8px] font-black uppercase tracking-wider ${row.sourceType === 'LIABILITY' ? 'text-rose-400' : 'text-indigo-400'}`}>
                          {row.sourceType === 'LIABILITY' ? 'Lender / Bank' : 'Customer'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-mono font-bold ${row.isOut ? 'text-rose-500' : 'text-emerald-600'}`}>
                          {row.isOut ? '−' : ''}{Math.abs(row.amount).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {invoiceLevelData.length > 0 && (
                  <tfoot className="bg-slate-900 text-white">
                    <tr>
                      <td colSpan={3} className="px-6 py-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{invoiceLevelData.length} Bills</div>
                      </td>
                      <td className="px-6 py-4 text-right font-display font-black">
                        {invoiceLevelData.reduce((s, r) => s + (r.isOut ? -r.amount : r.amount), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (() => {
              const activeCols = ALL_OVERALL_COLS.filter(c => visibleCols.has(c.col));
              const colSpanTotal = 2 + activeCols.length; // Party + active cols + Net

              // Net = sum of currently visible columns only
              const calcVisibleNet = (row: any) =>
                activeCols.reduce((s, c) => s + (row[c.col] || 0), 0);

              // Sort by actual numeric value so positives rank high and negatives rank low
              const sorted = [...overallData].map(row => ({
                ...row,
                visibleNet: calcVisibleNet(row),
              })).sort((a, b) => {
                const va = overallSort.col === 'net' ? a.visibleNet : (a[overallSort.col] || 0);
                const vb = overallSort.col === 'net' ? b.visibleNet : (b[overallSort.col] || 0);
                return overallSort.dir === 'DESC' ? vb - va : va - vb;
              });

              return (
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-500 w-48">Party</th>
                    {activeCols.map(h => {
                      const active = overallSort.col === h.col;
                      return (
                        <th key={h.col}
                          onClick={() => setOverallSort(prev => prev.col === h.col ? { col: h.col, dir: prev.dir === 'DESC' ? 'ASC' : 'DESC' } : { col: h.col, dir: 'DESC' })}
                          className={`px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest cursor-pointer select-none hover:bg-slate-100 transition-colors ${h.cls}`}
                        >
                          <span className="flex items-center justify-end gap-1">
                            {h.label}
                            {active
                              ? <i className={`fas fa-sort-amount-${overallSort.dir === 'DESC' ? 'down' : 'up'} text-[8px]`}></i>
                              : <i className="fas fa-sort text-[8px] opacity-20"></i>
                            }
                          </span>
                        </th>
                      );
                    })}
                    {/* Net always visible */}
                    <th onClick={() => setOverallSort(prev => prev.col === 'net' ? { col: 'net', dir: prev.dir === 'DESC' ? 'ASC' : 'DESC' } : { col: 'net', dir: 'DESC' })}
                      className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest cursor-pointer select-none hover:bg-slate-100 transition-colors text-slate-800">
                      <span className="flex items-center justify-end gap-1">
                        Net
                        {overallSort.col === 'net'
                          ? <i className={`fas fa-sort-amount-${overallSort.dir === 'DESC' ? 'down' : 'up'} text-[8px]`}></i>
                          : <i className="fas fa-sort text-[8px] opacity-20"></i>
                        }
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.length === 0 ? (
                    <tr><td colSpan={colSpanTotal} className="px-6 py-12 text-center text-xs font-black text-slate-300 uppercase tracking-widest">No outstanding balances found</td></tr>
                  ) : sorted.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onDrillDown(row.id, row.sourceType === 'LIABILITY' ? 'LENDER' : 'CUSTOMER')}>
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800 uppercase text-xs">{row.name}</div>
                        {row.phone && <div className="text-[9px] text-slate-400 mt-0.5">{row.phone}</div>}
                        <div className={`text-[8px] font-black uppercase tracking-wider mt-0.5 ${row.sourceType === 'LIABILITY' ? 'text-rose-400' : 'text-indigo-400'}`}>
                          {row.sourceType === 'LIABILITY' ? 'Lender / Bank' : 'Customer'}
                        </div>
                      </td>
                      {activeCols.map(c => {
                        const val = row[c.col] || 0;
                        return (
                          <td key={c.col} className="px-4 py-4 text-right font-mono font-bold">
                            {val !== 0 ? (
                              <span className={val < 0 ? 'text-rose-500' : c.cls}>
                                {val < 0 ? '−' : ''}{Math.abs(val).toLocaleString()}
                              </span>
                            ) : <span className="text-slate-200">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-right">
                        <span className={`font-display font-black text-sm ${row.visibleNet < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {row.visibleNet < 0 ? '−' : ''}{Math.abs(row.visibleNet).toLocaleString()}
                        </span>
                        <div className={`text-[8px] font-black uppercase ${row.visibleNet >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>{row.visibleNet >= 0 ? 'Dr' : 'Cr'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Grand Total Row */}
                {overallData.length > 0 && (
                  <tfoot className="bg-slate-900 text-white">
                    <tr>
                      <td className="px-6 py-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{overallData.length} Parties</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-600 mt-0.5">Grand Total</div>
                      </td>
                      {activeCols.map(col => (
                        <td key={col.col} className="px-4 py-4 text-right">
                          <div className={`font-mono font-black ${col.footCls}`}>{sorted.reduce((s, r) => s + (r[col.col] || 0), 0).toLocaleString()}</div>
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-600 mt-0.5">{col.label}</div>
                        </td>
                      ))}
                      <td className="px-6 py-4 text-right">
                        {(() => {
                          const n = sorted.reduce((s, r) => s + r.visibleNet, 0);
                          return <>
                            <div className={`font-display font-black text-sm ${n < 0 ? 'text-rose-300' : 'text-white'}`}>{n < 0 ? '−' : ''}{Math.abs(n).toLocaleString()}</div>
                            <div className={`text-[8px] font-black uppercase mt-0.5 ${n >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{n >= 0 ? 'Dr' : 'Cr'}</div>
                          </>;
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              );
            })()}
          </div>
        </div>
      )}

      {summaryOnly && (
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <i className="fas fa-chart-line text-2xl opacity-80"></i>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding Total</h3>
              <div className="text-2xl font-display font-black">{summaryTotal.toLocaleString()}</div>
              <div className="text-[9px] font-black text-slate-400 mt-0.5">{summaryCount} items</div>
            </div>
          </div>
        </div>
      )}

      {/* List View (mobile-friendly) — single scrollable list */}
      {!summaryOnly && activeTab !== 'OVERALL' && listViewMode && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">All Items ({data.length}) — Scroll to view</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
            {data.map((item, idx) => (
              <div key={`${item.id}-${item.categoryKey}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-slate-900 uppercase truncate">{item.name || item.providerName}</div>
                </div>
                <div className="text-base font-display font-black text-slate-900 shrink-0">{Math.abs(item.displayAmount || 0).toLocaleString()}</div>
              </div>
            ))}
            {data.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm font-bold text-slate-400">No items</div>
            ) : null}
          </div>
          <div className="p-4 bg-slate-900 text-white border-t border-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest opacity-80">Grand Total</span>
              <span className="text-xl font-display font-black">{grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Single table layout — all outstanding items (Customer + Amount) */}
      {!summaryOnly && activeTab !== 'OVERALL' && !listViewMode && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">
                Outstanding Items ({data.length})
              </h3>
            </div>
            <div className="max-h-[600px] overflow-auto custom-scrollbar overflow-x-auto">
              {data.length > 0 ? (
                <table className="w-full min-w-[260px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item, idx) => (
                      <tr key={`${item.id}-${item.categoryKey}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onDrillDown(item.id, (item.sourceType === 'LIABILITY' ? 'LENDER' : 'CUSTOMER'))}>
                        <td className="px-4 py-3 min-w-0">
                          <div className="min-w-0">
                            <div className="font-black text-sm text-slate-900 uppercase break-words">{item.name || item.providerName}</div>
                            {categoryFilter !== 'ALL' && (
                              <span className="inline-block px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 mt-1">
                                {categoryFilter === 'CHIT_ROYALTY_INTEREST' ? 'Chit + Royalty + Interest' : categoryFilter}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-base font-display font-black text-slate-900">
                            {Math.abs(item.displayAmount).toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="bg-slate-50 rounded-xl p-8 text-center border-2 border-dashed border-slate-200 m-4">
                  <i className="fas fa-check-circle text-4xl text-slate-300 mb-3"></i>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No outstanding items</p>
                </div>
              )}
            </div>
          </div>

          {/* Total Summary */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <i className="fas fa-chart-line text-2xl opacity-80"></i>
                <h3 className="text-sm font-black uppercase tracking-widest opacity-80">Grand Total Outstanding</h3>
              </div>
              <div className="text-3xl font-display font-black">{grandTotal.toLocaleString()}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OutstandingReports;

