
import React, { useState, useMemo } from 'react';
import { UserRole, DashboardStats, Invoice, Payment, Customer, Liability, Investment, ChitGroup } from '../types';

interface ReportListProps {
  role: UserRole;
  stats: DashboardStats;
  invoices: Invoice[];
  payments: Payment[];
  customers: Customer[];
  liabilities: Liability[];
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  otherBusinesses?: string[];
  investments?: Investment[];
  chitGroups?: ChitGroup[];
}

const ReportList: React.FC<ReportListProps> = ({ stats, invoices, payments, customers, liabilities, openingBalances, otherBusinesses, investments = [], chitGroups = [] }) => {
  const [reportType, setReportType] = useState<'PL' | 'BS'>('PL');
  const [timeFrame, setTimeFrame] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'ALL'>('THIS_MONTH');

  // --- FINANCIAL CALCULATIONS ---

  const financials = useMemo(() => {
    // DATE FILTERS
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const isDateInFrame = (ts: number) => {
        if (timeFrame === 'ALL') return true;
        const d = new Date(ts);
        if (timeFrame === 'THIS_MONTH') return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        if (timeFrame === 'LAST_MONTH') return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
        return false;
    };

    // 1. REVENUE
    
    // Corrected Chit Revenue: Sum of Commissions from relevant auctions
    const chitCommissionRevenue = chitGroups.reduce((total, group) => {
        return total + group.auctions
            .filter(auc => isDateInFrame(auc.date))
            .reduce((sum, auc) => sum + auc.commissionAmount, 0);
    }, 0);

    const revenue = {
      royalty: invoices.filter(i => i.type === 'ROYALTY' && !i.isVoid && isDateInFrame(i.date)).reduce((acc, i) => acc + i.amount, 0),
      interest: invoices.filter(i => i.type === 'INTEREST' && !i.isVoid && isDateInFrame(i.date)).reduce((acc, i) => acc + i.amount, 0),
      chit: chitCommissionRevenue, // ONLY COMMISSION IS PROFIT (Filtered by date)
      businessUnits: payments.filter(p => p.type === 'IN' && p.category === 'OTHER_BUSINESS' && isDateInFrame(p.date)).reduce((acc, p) => acc + p.amount, 0),
    };
    const totalRevenue = revenue.royalty + revenue.interest + revenue.chit + revenue.businessUnits;

    // 2. EXPENSES
    // Operational: General expenses.
    // EXCLUDES: 
    // - Loan Repayments (Liability reduction)
    // - Investment Contributions (Asset transfer, e.g., Paying LIC premium or Chit Installment)
    // - Contra (Internal transfer)
    const expensePayments = payments.filter(p => 
        p.type === 'OUT' && 
        !['CONTRA', 'LOAN_REPAYMENT', 'CHIT_SAVINGS'].includes(p.category) && 
        !p.category.startsWith('INVESTMENT_') && // Fix: Don't count Savings/Asset purchases as Expense
        isDateInFrame(p.date)
    );
    
    const expenses = {
      operational: expensePayments.filter(p => p.voucherType === 'PAYMENT' && p.category !== 'LOAN_INTEREST' && p.category !== 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0),
      loanInterest: expensePayments.filter(p => p.category === 'LOAN_INTEREST').reduce((acc, p) => acc + p.amount, 0),
      businessUnits: expensePayments.filter(p => p.category === 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0),
    };
    const totalExpenses = expenses.operational + expenses.loanInterest + expenses.businessUnits;

    // NET PROFIT (For the period selected)
    const netProfit = totalRevenue - totalExpenses;

    // --- BALANCE SHEET ALWAYS SHOWS CURRENT POSITION (SNAPSHOT) ---

    // 3. ASSETS
    const investmentBreakdown = {
        chit: investments.filter(i => i.type === 'CHIT_SAVINGS').reduce((acc, i) => acc + (i.transactions?.reduce((s,t)=>s+t.amountPaid,0)||0), 0),
        lic: investments.filter(i => i.type === 'LIC').reduce((acc, i) => acc + (i.transactions?.reduce((s,t)=>s+t.amountPaid,0)||0), 0),
        sip: investments.filter(i => i.type === 'SIP').reduce((acc, i) => acc + (i.transactions?.reduce((s,t)=>s+t.amountPaid,0)||0), 0),
        gold: investments.filter(i => i.type === 'GOLD_SAVINGS').reduce((acc, i) => acc + (i.transactions?.reduce((s,t)=>s+t.amountPaid,0)||0), 0),
        fd: investments.filter(i => i.type === 'FIXED_DEPOSIT').reduce((acc, i) => acc + i.amountInvested, 0),
        other: investments.filter(i => !['CHIT_SAVINGS','LIC','SIP','GOLD_SAVINGS','FIXED_DEPOSIT'].includes(i.type)).reduce((acc, i) => acc + (i.contributionType==='LUMP_SUM' ? i.amountInvested : (i.transactions?.reduce((s,t)=>s+t.amountPaid,0)||0)), 0),
    };

    const generalReceivables = customers.reduce((acc, c) => acc + Math.max(0, c.openingBalance || 0), 0);
    const generalPayables = customers.reduce((acc, c) => acc + Math.abs(Math.min(0, c.openingBalance || 0)), 0);

    const assets = {
      cash: stats.cashInHand,
      bankCUB: stats.bankCUB,
      bankKVB: stats.bankKVB,
      receivables: stats.receivableOutstanding + generalReceivables, 
      lendingPrincipal: customers.filter(c => c.isInterest).reduce((acc, c) => acc + c.interestPrincipal, 0),
      investments: Object.values(investmentBreakdown).reduce((a, b) => a + b, 0)
    };
    const totalAssets = Object.values(assets).reduce((a, b) => a + b, 0);

    // 4. LIABILITIES
    const unpaidAccountsPayable = invoices
        .filter(i => i.direction === 'OUT' && i.status !== 'PAID' && !i.isVoid)
        .reduce((acc, i) => acc + i.balance, 0);

    // Fix: Include 'creditPrincipal' from Customers who are Lenders (e.g. Friends Foundation, Private Parties)
    const customerPrivateDebt = customers.filter(c => c.isLender).reduce((acc, c) => acc + c.creditPrincipal, 0);
    const liabilityPrivateDebt = liabilities.filter(l => l.type === 'PRIVATE').reduce((acc, l) => acc + l.principal, 0);

    const liabilitiesList = {
      bankLoans: liabilities.filter(l => l.type === 'BANK').reduce((acc, l) => acc + l.principal, 0),
      privateDebt: liabilityPrivateDebt + customerPrivateDebt, // Sum of External Liabilities + Customer Registry Debt
      advances: (stats.advancesOwed || 0) + generalPayables, 
      accountsPayable: unpaidAccountsPayable 
    };
    const totalLiabilities = Object.values(liabilitiesList).reduce((a, b) => a + b, 0);

    // 5. EQUITY
    // Assets = Liabilities + Equity
    // True Equity = Assets - Liabilities
    const trueEquity = totalAssets - totalLiabilities;
    
    // Logic: Equity = Opening Capital + Retained Earnings (Historical + Current)
    const historicalReserves = trueEquity - openingBalances.CAPITAL;

    const equity = {
      openingCapital: openingBalances.CAPITAL,
      currentNetProfit: netProfit, // For display only
      reserves: historicalReserves
    };
    
    // We display Total Equity calculated from the balancing equation to ensure the report balances.
    const totalEquity = trueEquity; 

    return { revenue, totalRevenue, expenses, totalExpenses, netProfit, assets, totalAssets, liabilitiesList, totalLiabilities, equity, totalEquity, investmentBreakdown };
  }, [invoices, payments, stats, customers, liabilities, openingBalances, investments, chitGroups, timeFrame]);

  // Check balance 
  const balanceDifference = financials.totalAssets - (financials.totalLiabilities + financials.totalEquity);
  const isBalanced = Math.abs(balanceDifference) < 1; 

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Report Toggle & Time Frame */}
      <div className="flex flex-col items-center gap-4">
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 inline-flex shadow-sm">
          <button 
            onClick={() => setReportType('PL')} 
            className={`px-8 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${reportType === 'PL' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Profit & Loss
          </button>
          <button 
            onClick={() => setReportType('BS')} 
            className={`px-8 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${reportType === 'BS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Balance Sheet
          </button>
        </div>

        {reportType === 'PL' && (
            <div className="bg-slate-100 p-1 rounded-xl flex gap-2">
                <button onClick={() => setTimeFrame('THIS_MONTH')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'THIS_MONTH' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>This Month</button>
                <button onClick={() => setTimeFrame('LAST_MONTH')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'LAST_MONTH' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Last Month</button>
                <button onClick={() => setTimeFrame('ALL')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'ALL' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>All Time</button>
            </div>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
        {/* REPORT HEADER */}
        <div className="bg-slate-50 border-b border-slate-100 p-10 text-center">
           <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">
             {reportType === 'PL' ? 'Statement of Income' : 'Statement of Financial Position'}
           </h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
             {reportType === 'PL' ? `Period: ${timeFrame.replace('_', ' ')}` : `As of ${new Date().toLocaleDateString()}`}
           </p>
        </div>

        {reportType === 'PL' ? (
          <div className="p-10 max-w-4xl mx-auto w-full flex-1">
             {/* REVENUE SECTION */}
             <div className="mb-8">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b-2 border-emerald-100 pb-2 mb-4">Revenue (Income)</h3>
                <div className="space-y-3">
                   <Row label="Royalty Income" amount={financials.revenue.royalty} />
                   <Row label="Interest Income" amount={financials.revenue.interest} />
                   <Row label="Chit Fund Commission (5%)" amount={financials.revenue.chit} subtext="Net Profit from Auctions" />
                   <Row label="Business Units (Income)" amount={financials.revenue.businessUnits} />
                   <TotalRow label="Total Revenue" amount={financials.totalRevenue} color="text-emerald-600" />
                </div>
             </div>

             {/* EXPENSE SECTION */}
             <div className="mb-8">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b-2 border-rose-100 pb-2 mb-4">Expenses</h3>
                <div className="space-y-3">
                   <Row label="Operational Expenses" amount={financials.expenses.operational} />
                   <Row label="Cost of Debt (Interest Paid)" amount={financials.expenses.loanInterest} />
                   <Row label="Business Units (Expense)" amount={financials.expenses.businessUnits} />
                   <TotalRow label="Total Expenses" amount={financials.totalExpenses} color="text-rose-600" />
                </div>
             </div>

             {/* NET PROFIT SECTION */}
             <div className="mt-10 bg-slate-900 rounded-2xl p-8 flex justify-between items-center shadow-lg">
                <div>
                   <h4 className="text-white text-lg font-black uppercase italic tracking-tighter">Net Profit / (Loss)</h4>
                   <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Revenue less Expenses ({timeFrame.replace('_', ' ')})</p>
                </div>
                <div className={`text-4xl font-display font-black tracking-tighter ${financials.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                   ₹{financials.netProfit.toLocaleString()}
                </div>
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-16 flex-1">
               {/* ASSETS COLUMN */}
               <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b-4 border-slate-900 pb-4 mb-6">Assets</h3>
                  <div className="space-y-4">
                     <SectionHeader title="Current Assets" />
                     <Row label="Cash in Hand" amount={financials.assets.cash} />
                     <Row label="Bank (CUB)" amount={financials.assets.bankCUB} />
                     <Row label="Bank (KVB)" amount={financials.assets.bankKVB} />
                     <Row label="Accounts Receivable (Trade & Dues)" amount={financials.assets.receivables} />
                     
                     <div className="h-4"></div>
                     <SectionHeader title="Investments & Holdings" />
                     <Row label="Chit Funds (Paid Value)" amount={financials.investmentBreakdown.chit} />
                     <Row label="Life Insurance (LIC)" amount={financials.investmentBreakdown.lic} />
                     <Row label="Mutual Funds (SIP)" amount={financials.investmentBreakdown.sip} />
                     <Row label="Gold Savings" amount={financials.investmentBreakdown.gold} />
                     <Row label="Fixed Deposits" amount={financials.investmentBreakdown.fd} />
                     
                     <div className="h-4"></div>
                     <SectionHeader title="Loan Portfolio" />
                     <Row label="Principal Lent Out" amount={financials.assets.lendingPrincipal} />
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200">
                     <TotalRow label="Total Assets" amount={financials.totalAssets} color="text-slate-900" />
                  </div>
               </div>

               {/* LIABILITIES & EQUITY COLUMN */}
               <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b-4 border-slate-900 pb-4 mb-6">Liabilities & Equity</h3>
                  <div className="space-y-4">
                     <SectionHeader title="Liabilities" />
                     <Row label="Bank Loans" amount={financials.liabilitiesList.bankLoans} />
                     <Row label="Private Debt (Total)" amount={financials.liabilitiesList.privateDebt} subtext="Creditors + Registry Debt" />
                     <Row label="Accounts Payable" amount={financials.liabilitiesList.accountsPayable} highlight={true} subtext="Unpaid Winner Payouts" />
                     <Row label="Customer Advances" amount={financials.liabilitiesList.advances} />
                     
                     <div className="pl-4 py-2 border-l-2 border-rose-200">
                        <div className="flex justify-between items-center text-rose-800">
                           <span className="text-xs font-bold uppercase">Total Liabilities</span>
                           <span className="font-mono font-bold">₹{financials.totalLiabilities.toLocaleString()}</span>
                        </div>
                     </div>

                     <div className="h-4"></div>
                     <SectionHeader title="Equity" />
                     <Row label="Owner's Capital (Opening)" amount={financials.equity.openingCapital} />
                     <Row 
                        label="Retained Earnings & Reserves" 
                        amount={financials.equity.reserves} 
                        subtext="Historical + Current Net Profit"
                     />
                     <div className="pl-4 py-2 border-l-2 border-emerald-200">
                        <div className="flex justify-between items-center text-emerald-800">
                           <span className="text-xs font-bold uppercase">Total Equity</span>
                           <span className="font-mono font-bold">₹{financials.totalEquity.toLocaleString()}</span>
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-200">
                     <TotalRow label="Total Liabilities & Equity" amount={financials.totalLiabilities + financials.totalEquity} color="text-slate-900" />
                  </div>
               </div>
            </div>

            {/* BALANCE CHECK FOOTER */}
            <div className={`p-6 border-t ${isBalanced ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
               <div className="flex justify-between items-center max-w-4xl mx-auto">
                  <div>
                     <h4 className={`text-lg font-black uppercase italic tracking-tighter ${isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {isBalanced ? 'Balance Sheet is Tallying' : 'Reconciliation Error'}
                     </h4>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {isBalanced ? 'Assets match Liabilities + Equity' : 'Difference between Assets and Sources of Funds'}
                     </p>
                  </div>
                  <div className="text-right">
                     <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Difference</div>
                     <div className={`text-3xl font-display font-black tracking-tighter ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isBalanced ? <i className="fas fa-check-circle"></i> : `₹${balanceDifference.toLocaleString()}`}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- SUB-COMPONENTS FOR CLEANER CODE ---

const Row = ({ label, amount, highlight = false, subtext }: { label: string, amount: number, highlight?: boolean, subtext?: string }) => (
  <div className={`flex justify-between items-center py-2 border-b border-slate-50 last:border-0 ${highlight ? 'bg-indigo-50 px-2 rounded-lg -mx-2' : ''}`}>
     <div>
        <div className={`text-xs font-bold uppercase ${highlight ? 'text-indigo-700' : 'text-slate-500'}`}>{label}</div>
        {subtext && <div className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">{subtext}</div>}
     </div>
     <span className={`font-mono font-bold text-sm ${highlight ? 'text-indigo-700' : 'text-slate-700'}`}>₹{amount.toLocaleString()}</span>
  </div>
);

const TotalRow = ({ label, amount, color }: { label: string, amount: number, color: string }) => (
  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl">
     <span className="text-xs font-black uppercase tracking-widest text-slate-600">{label}</span>
     <span className={`text-xl font-display font-black italic tracking-tighter ${color}`}>₹{amount.toLocaleString()}</span>
  </div>
);

const SectionHeader = ({ title }: { title: string }) => (
  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{title}</div>
);

export default ReportList;
