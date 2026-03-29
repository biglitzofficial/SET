import React, { useState, useMemo } from 'react';
import { UserRole, DashboardStats, Invoice, Payment, Customer, Liability, Investment, ChitGroup, JournalEntry } from '../types';
import { computeJournalEffects } from '../utils/accountingConfig';
import { computeOpening, sumPaymentsInForLedger } from '../utils/ledgerUtils';

interface ReportListProps {
  role: UserRole;
  stats: DashboardStats;
  invoices: Invoice[];
  payments: Payment[];
  customers: Customer[];
  liabilities: Liability[];
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; RETAINED_EARNINGS?: number };
  otherBusinesses?: string[];
  investments?: Investment[];
  chitGroups?: ChitGroup[];
  journals?: JournalEntry[];
  bankAccounts?: { id: string; name: string }[];
  defaultType?: 'PL' | 'BS';
}

type ExpandKey = 'bankBalances' | 'receivables' | 'receivablesRoyalty' | 'receivablesInterest' | 'receivablesChit' | 'receivablesGeneral'
  | 'investments' | 'investmentsChit' | 'investmentsLic' | 'investmentsSip' | 'investmentsGold' | 'investmentsFd' | 'investmentsOther'
  | 'principalLent' | 'bankLoans' | 'privateDebt' | 'accountsPayable' | 'advances' | 'retainedEarnings'
  | 'revenueRoyalty' | 'revenueInterest' | 'revenueChit' | 'revenueBusiness' | 'expenseOperational' | 'expenseLoanInterest' | 'expenseBusiness'
  | 'cumulativeNetProfit';
const DEFAULT_EXPANDED: Record<ExpandKey, boolean> = {
  bankBalances: false, receivables: false, receivablesRoyalty: false, receivablesInterest: false, receivablesChit: false, receivablesGeneral: false,
  investments: false, investmentsChit: false, investmentsLic: false, investmentsSip: false, investmentsGold: false, investmentsFd: false, investmentsOther: false,
  principalLent: false,
  bankLoans: false, privateDebt: false, accountsPayable: false, advances: false, retainedEarnings: false,
  revenueRoyalty: false, revenueInterest: false, revenueChit: false, revenueBusiness: false,
  expenseOperational: false, expenseLoanInterest: false, expenseBusiness: false,
  cumulativeNetProfit: false,
};

const ReportList: React.FC<ReportListProps> = ({ stats, invoices, payments, customers, liabilities, openingBalances, otherBusinesses, investments = [], chitGroups = [], journals = [], bankAccounts = [], defaultType }) => {
  const [reportType, setReportType] = useState<'PL' | 'BS'>(defaultType || 'PL');
  const [timeFrame, setTimeFrame] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'ALL'>('THIS_MONTH');
  const [expandedSections, setExpandedSections] = useState<Record<ExpandKey, boolean>>(DEFAULT_EXPANDED);
  const toggleExpand = (key: ExpandKey) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Sync when navigating between the two tabs directly
  React.useEffect(() => { if (defaultType) setReportType(defaultType); }, [defaultType]);

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

    // Journal effects for P&L (filter by date for period reports)
    const journalEffects = computeJournalEffects(
      timeFrame === 'ALL' ? journals : journals.filter(j => isDateInFrame(j.date))
    );

    // 1. REVENUE
    const chitCommissionRevenue = chitGroups.reduce((total, group) => {
        return total + group.auctions
            .filter(auc => isDateInFrame(auc.date))
            .reduce((sum, auc) => sum + auc.commissionAmount, 0);
    }, 0);

    const revenue = {
      royalty: invoices.filter(i => i.type === 'ROYALTY' && !i.isVoid && isDateInFrame(i.date)).reduce((acc, i) => acc + i.amount, 0) + journalEffects.incomeRoyalty,
      interest: invoices.filter(i => i.type === 'INTEREST' && !i.isVoid && isDateInFrame(i.date)).reduce((acc, i) => acc + i.amount, 0) + journalEffects.incomeInterest,
      chit: chitCommissionRevenue + journalEffects.incomeChit,
      businessUnits: payments.filter(p => p.type === 'IN' && p.category === 'OTHER_BUSINESS' && isDateInFrame(p.date)).reduce((acc, p) => acc + p.amount, 0) + journalEffects.incomeDirect,
    };
    // Business unit IN/OUT are partnership flows — excluded from net profit, shown as receivable/payable on Balance Sheet
    const totalRevenue = revenue.royalty + revenue.interest + revenue.chit;

    // P&L item lists (for expandable sections)
    const revenueRoyaltyItems: ExpandItem[] = invoices.filter(i => i.type === 'ROYALTY' && !i.isVoid && isDateInFrame(i.date))
      .map(i => ({ name: i.customerName || 'Unknown', amount: i.amount, detail: `${i.invoiceNumber} · ${new Date(i.date).toLocaleDateString()}` }));
    if (journalEffects.incomeRoyalty !== 0) revenueRoyaltyItems.push({ name: 'Journal Adjustment', amount: journalEffects.incomeRoyalty, detail: '' });

    const revenueInterestItems: ExpandItem[] = invoices.filter(i => i.type === 'INTEREST' && !i.isVoid && isDateInFrame(i.date))
      .map(i => ({ name: i.customerName || 'Unknown', amount: i.amount, detail: `${i.invoiceNumber} · ${new Date(i.date).toLocaleDateString()}` }));
    if (journalEffects.incomeInterest !== 0) revenueInterestItems.push({ name: 'Journal Adjustment', amount: journalEffects.incomeInterest, detail: '' });

    const revenueChitItems: ExpandItem[] = chitGroups.flatMap(g => g.auctions.filter(a => isDateInFrame(a.date)).map(a => ({
      name: g.groupName || 'Chit', amount: a.commissionAmount, detail: `Month ${a.month} · ${new Date(a.date).toLocaleDateString()}`
    })));
    if (journalEffects.incomeChit !== 0) revenueChitItems.push({ name: 'Journal Adjustment', amount: journalEffects.incomeChit, detail: '' });

    const revenueBusinessItems: ExpandItem[] = payments.filter(p => p.type === 'IN' && p.category === 'OTHER_BUSINESS' && isDateInFrame(p.date))
      .map(p => ({ name: p.sourceName || 'Direct', amount: p.amount, detail: `${p.voucherNumber || ''} · ${new Date(p.date).toLocaleDateString()}` }));
    if (journalEffects.incomeDirect !== 0) revenueBusinessItems.push({ name: 'Journal Adjustment', amount: journalEffects.incomeDirect, detail: '' });

    // 2. EXPENSES
    // EXCLUDES: CONTRA, LOAN_REPAYMENT, CHIT_SAVINGS, CHIT, CHIT_FUND (winner payouts = liability settlement), INVESTMENT_*, DRAWINGS, excludeFromPL
    const expensePayments = payments.filter(p =>
        p.type === 'OUT' &&
        !p.excludeFromPL &&
        !['CONTRA', 'LOAN_REPAYMENT', 'CHIT_SAVINGS', 'CHIT', 'CHIT_FUND', 'DRAWINGS'].includes(p.category) &&
        !p.category.startsWith('INVESTMENT_') &&
        isDateInFrame(p.date)
    );
    
    const expenses = {
      operational: expensePayments.filter(p => p.voucherType === 'PAYMENT' && p.category !== 'LOAN_INTEREST' && p.category !== 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0) + (journalEffects.expenseOperating + journalEffects.expenseSalary + journalEffects.expenseOffice + journalEffects.expenseTravel),
      loanInterest: expensePayments.filter(p => p.category === 'LOAN_INTEREST').reduce((acc, p) => acc + p.amount, 0) + journalEffects.expenseInterest,
      businessUnits: expensePayments.filter(p => p.category === 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0),
    };
    // Business unit excluded from total — partnership flows go to Balance Sheet receivable/payable
    const totalExpenses = expenses.operational + expenses.loanInterest;

    // P&L expense item lists
    const expenseOperationalItems: ExpandItem[] = expensePayments
      .filter(p => p.voucherType === 'PAYMENT' && p.category !== 'LOAN_INTEREST' && p.category !== 'OTHER_BUSINESS')
      .map(p => ({ name: p.sourceName || p.category || 'Expense', amount: p.amount, detail: `${p.category || ''} · ${new Date(p.date).toLocaleDateString()}` }));
    if (journalEffects.expenseOperating !== 0) expenseOperationalItems.push({ name: 'Operating (Journal)', amount: journalEffects.expenseOperating, detail: '' });
    if (journalEffects.expenseSalary !== 0) expenseOperationalItems.push({ name: 'Salary (Journal)', amount: journalEffects.expenseSalary, detail: '' });
    if (journalEffects.expenseOffice !== 0) expenseOperationalItems.push({ name: 'Office (Journal)', amount: journalEffects.expenseOffice, detail: '' });
    if (journalEffects.expenseTravel !== 0) expenseOperationalItems.push({ name: 'Travel (Journal)', amount: journalEffects.expenseTravel, detail: '' });

    const expenseLoanInterestItems: ExpandItem[] = expensePayments
      .filter(p => p.category === 'LOAN_INTEREST')
      .map(p => ({ name: p.sourceName || 'Lender', amount: p.amount, detail: `${new Date(p.date).toLocaleDateString()}` }));
    if (journalEffects.expenseInterest !== 0) expenseLoanInterestItems.push({ name: 'Journal Adjustment', amount: journalEffects.expenseInterest, detail: '' });

    const expenseBusinessItems: ExpandItem[] = expensePayments
      .filter(p => p.category === 'OTHER_BUSINESS')
      .map(p => ({ name: p.sourceName || 'Business Unit', amount: p.amount, detail: `${new Date(p.date).toLocaleDateString()}` }));

    // DRAWINGS: Owner withdrawals (reduce equity, not expense) - cumulative for Balance Sheet equity
    const totalDrawings = payments.filter(p => p.type === 'OUT' && p.category === 'DRAWINGS').reduce((acc, p) => acc + p.amount, 0) + computeJournalEffects(journals).drawings;

    // NET PROFIT (For the period selected - used in P&L display)
    const netProfit = totalRevenue - totalExpenses;

    // Cumulative (all-time) figures for Balance Sheet equity
    // Chit revenue = company amount (commission) per auction only — not full chit invoice amounts
    // Business unit IN/OUT excluded — partnership flows shown as receivable/payable on Balance Sheet
    const allTimeRevenue = invoices.filter(i => !i.isVoid && ['ROYALTY','INTEREST'].includes(i.type)).reduce((acc, i) => acc + i.amount, 0)
      + chitGroups.reduce((t, g) => t + g.auctions.reduce((s, a) => s + a.commissionAmount, 0), 0)
      + computeJournalEffects(journals).incomeRoyalty + computeJournalEffects(journals).incomeInterest + computeJournalEffects(journals).incomeChit;

    const journalEffectsAllTimeForExpense = computeJournalEffects(journals);
    const allTimeExpensePayments = payments.filter(p =>
      p.type === 'OUT' &&
      !p.excludeFromPL &&
      !['CONTRA', 'LOAN_REPAYMENT', 'CHIT_SAVINGS', 'CHIT', 'CHIT_FUND', 'DRAWINGS'].includes(p.category) &&
      !p.category.startsWith('INVESTMENT_')
    );
    const allTimeExpenses =
      allTimeExpensePayments.filter(p => p.voucherType === 'PAYMENT' && p.category !== 'LOAN_INTEREST' && p.category !== 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0)
      + allTimeExpensePayments.filter(p => p.category === 'LOAN_INTEREST').reduce((acc, p) => acc + p.amount, 0)
      + (journalEffectsAllTimeForExpense.expenseOperating + journalEffectsAllTimeForExpense.expenseSalary + journalEffectsAllTimeForExpense.expenseOffice + journalEffectsAllTimeForExpense.expenseTravel + journalEffectsAllTimeForExpense.expenseInterest);
    const cumulativeNetProfit = allTimeRevenue - allTimeExpenses;

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

    // Receivable items: per-customer net ledger (positive = receivable)
    let receivableItems: { name: string; amount: number; detail: string }[] = customers.map(c => {
      const custInvoices = invoices.filter(inv => inv.customerId === c.id && !inv.isVoid);
      const custPayments = payments.filter(p => p.sourceId === c.id);
      const opening = computeOpening(c);
      const invIN = custInvoices.filter(i => i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const payOUT = custPayments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
      const invOUT = custInvoices.filter(i => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const payIN = sumPaymentsInForLedger(custPayments);
      const net = (opening + invIN + payOUT) - (invOUT + payIN);
      return { name: c.name, amount: net, detail: '' };
    }).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);

    // Investment items: per investment
    const investmentItems: { name: string; amount: number; detail: string }[] = investments.map(inv => {
      const amt = inv.contributionType === 'LUMP_SUM' ? (inv.currentValue ?? inv.amountInvested ?? 0) : (inv.transactions?.reduce((s, t) => s + t.amountPaid, 0) || 0);
      return { name: inv.name, amount: amt, detail: `${inv.type}` };
    }).filter(i => i.amount > 0);

    // Investments by category (Chit, LIC, SIP, Gold, FD, Other) for expandable dropdowns
    type InvestmentCategory = 'chit' | 'lic' | 'sip' | 'gold' | 'fd' | 'other';
    const getCategory = (type: string): InvestmentCategory => {
      if (type === 'CHIT_SAVINGS') return 'chit';
      if (type === 'LIC') return 'lic';
      if (type === 'SIP') return 'sip';
      if (type === 'GOLD_SAVINGS') return 'gold';
      if (type === 'FIXED_DEPOSIT') return 'fd';
      return 'other';
    };
    const investmentsByCategory: Record<InvestmentCategory, { total: number; items: { name: string; amount: number }[] }> = {
      chit: { total: 0, items: [] },
      lic: { total: 0, items: [] },
      sip: { total: 0, items: [] },
      gold: { total: 0, items: [] },
      fd: { total: 0, items: [] },
      other: { total: 0, items: [] },
    };
    investments.forEach(inv => {
      const amt = inv.contributionType === 'LUMP_SUM' ? (inv.currentValue ?? inv.amountInvested ?? 0) : (inv.transactions?.reduce((s, t) => s + t.amountPaid, 0) || 0);
      if (amt <= 0) return;
      const cat = getCategory(inv.type);
      investmentsByCategory[cat].items.push({ name: inv.name, amount: amt });
      investmentsByCategory[cat].total += amt;
    });
    (['chit', 'lic', 'sip', 'gold', 'fd', 'other'] as InvestmentCategory[]).forEach(k => {
      investmentsByCategory[k].items.sort((a, b) => b.amount - a.amount);
    });

    // Principal lent items: customers with isInterest
    const principalLentItems: { name: string; amount: number; detail: string }[] = customers
      .filter(c => c.isInterest && (c.interestPrincipal || 0) > 0)
      .map(c => ({ name: c.name, amount: c.interestPrincipal || 0, detail: '' }))
      .sort((a, b) => b.amount - a.amount);

    // Journal effects for Balance Sheet (all-time)
    const journalEffectsBS = computeJournalEffects(journals);
    if (journalEffectsBS.receivable !== 0) receivableItems.push({ name: 'Journal Adjustment', amount: journalEffectsBS.receivable, detail: '' });

    // Business unit IN/OUT — partnership flows (must be before assets/liabilities)
    const businessUnitIN = payments.filter(p => p.type === 'IN' && p.category === 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0) + journalEffectsBS.incomeDirect;
    const businessUnitOUT = payments.filter(p => p.type === 'OUT' && p.category === 'OTHER_BUSINESS').reduce((acc, p) => acc + p.amount, 0);
    const businessUnitReceivable = Math.max(0, businessUnitOUT - businessUnitIN);
    const businessUnitPayable = Math.max(0, businessUnitIN - businessUnitOUT);

    // Category-wise receivables (Royalty, Interest, Chit, General) — per OutstandingReports breakdown
    // Note: Principal is shown separately as "Principal Lent Out" in assets
    type CategoryReceivable = { total: number; items: { name: string; amount: number }[] };
    const receivablesByCategory: Record<'royalty' | 'interest' | 'chit' | 'general', CategoryReceivable> = {
      royalty: { total: 0, items: [] },
      interest: { total: 0, items: [] },
      chit: { total: 0, items: [] },
      general: { total: 0, items: [] },
    };
    customers.forEach(c => {
      const custInvoices = invoices.filter(inv => inv.customerId === c.id && !inv.isVoid);
      const custPayments = payments.filter(p => p.sourceId === c.id);
      const chitInAmt = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const chitOutAmt = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const chitPaidIn = custPayments.filter(p => p.type === 'IN' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitPaidOut = custPayments.filter(p => p.type === 'OUT' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitNet = (chitInAmt + chitPaidOut) - (chitOutAmt + chitPaidIn);
      const royaltyAmt = custInvoices.filter(i => i.type === 'ROYALTY').reduce((s, i) => s + i.amount, 0);
      const royaltyPaid = custPayments.filter(p => p.type === 'IN' && p.category === 'ROYALTY').reduce((s, p) => s + p.amount, 0);
      const royaltyNet = royaltyAmt - royaltyPaid;
      const interestAmt = custInvoices.filter(i => i.type === 'INTEREST').reduce((s, i) => s + i.amount, 0);
      const interestPaid = custPayments.filter(p => p.type === 'IN' && p.category === 'INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestNet = interestAmt - interestPaid;
      const generalInvAmt = custInvoices.filter(i => i.type === 'GENERAL' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const generalInvPaid = custPayments.filter(p => p.type === 'IN' && p.category === 'GENERAL').reduce((s, p) => s + p.amount, 0);
      const generalInvNet = generalInvAmt - generalInvPaid;
      const opening = computeOpening(c);
      const invIN = custInvoices.filter(i => i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const payOUT = custPayments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
      const invOUT = custInvoices.filter(i => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const payIN = sumPaymentsInForLedger(custPayments);
      const netLedgerBalance = (opening + invIN + payOUT) - (invOUT + payIN);
      const interestOutAmt = custInvoices.filter(i => i.type === 'INTEREST_OUT' && !i.isVoid).reduce((s, i) => s + i.amount, 0);
      const interestOutPaid = custPayments.filter(p => p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestOutNet = Math.max(0, interestOutAmt - interestOutPaid);
      const generalDue = netLedgerBalance - chitNet - royaltyNet - interestNet - interestOutNet - generalInvNet - (c.interestPrincipal || 0) + (c.creditPrincipal || 0);
      const generalTotal = generalDue + generalInvNet + 2 * interestOutNet;
      if (royaltyNet > 0) {
        receivablesByCategory.royalty.items.push({ name: c.name, amount: royaltyNet });
        receivablesByCategory.royalty.total += royaltyNet;
      }
      if (interestNet > 0) {
        receivablesByCategory.interest.items.push({ name: c.name, amount: interestNet });
        receivablesByCategory.interest.total += interestNet;
      }
      if (chitNet > 0) {
        receivablesByCategory.chit.items.push({ name: c.name, amount: chitNet });
        receivablesByCategory.chit.total += chitNet;
      }
      if (generalTotal > 0) {
        receivablesByCategory.general.items.push({ name: c.name, amount: generalTotal });
        receivablesByCategory.general.total += generalTotal;
      }
    });
    ['royalty', 'interest', 'chit', 'general'].forEach(k => {
      receivablesByCategory[k as keyof typeof receivablesByCategory].items.sort((a, b) => b.amount - a.amount);
    });

    // Receivables total = sum of categories + journal (so section total matches breakdown)
    const receivablesTotal = receivablesByCategory.royalty.total + receivablesByCategory.interest.total
      + receivablesByCategory.chit.total + receivablesByCategory.general.total + journalEffectsBS.receivable;

    const bankBalancesMap = stats.bankBalances || {};
    const totalBankBalance = Object.values(bankBalancesMap).reduce((a, b) => a + b, 0);

    // Bank balance items
    const bankBalanceItems = Object.keys(bankBalancesMap).length > 0
      ? Object.entries(bankBalancesMap).map(([name, amt]) => ({ name: `Bank (${name})`, amount: amt, detail: '' }))
      : [
          ...((stats.bankCUB ?? 0) !== 0 ? [{ name: 'Bank (CUB)', amount: stats.bankCUB ?? 0, detail: '' }] : []),
          ...((stats.bankKVB ?? 0) !== 0 ? [{ name: 'Bank (KVB)', amount: stats.bankKVB ?? 0, detail: '' }] : []),
        ];

    const assets = {
      cash: stats.cashInHand,
      bankBalances: bankBalancesMap,
      bankCUB: stats.bankCUB ?? 0,
      bankKVB: stats.bankKVB ?? 0,
      receivables: receivablesTotal,
      lendingPrincipal: customers.filter(c => c.isInterest).reduce((acc, c) => acc + c.interestPrincipal, 0) + journalEffectsBS.principalLent,
      investments: Object.values(investmentBreakdown).reduce((a, b) => a + b, 0),
      businessUnitReceivable,
    };
    const totalAssets = assets.cash + totalBankBalance + assets.receivables + assets.lendingPrincipal + assets.investments + assets.businessUnitReceivable;

    // 4. LIABILITIES
    // Accounts Payable = CHIT winner payouts — use OutstandingReports ledger-based logic (payable outstandings)
    type PayableItem = { name: string; amount: number; detail: string };
    const accountsPayableItems: PayableItem[] = [];
    customers
      .filter(c => !c.isLender)
      .forEach(c => {
        const custInvoices = invoices.filter(inv => inv.customerId === c.id && !inv.isVoid);
        const custPayments = payments.filter(p => p.sourceId === c.id);
        const chitInAmt = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
        const chitOutAmt = custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
        const chitPaidIn = custPayments.filter(p => p.type === 'IN' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
        const chitPaidOut = custPayments.filter(p => p.type === 'OUT' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
        const chitNet = (chitInAmt + chitPaidOut) - (chitOutAmt + chitPaidIn);
        if (chitNet >= 0) return;
        const totalPaidOut = custPayments.filter(p => p.type === 'OUT').reduce((sum, p) => sum + p.amount, 0);
        const remaining = Math.max(0, Math.abs(chitNet) - totalPaidOut);
        if (remaining <= 0) return;
        const unpaidInvs = invoices.filter(inv => inv.customerId === c.id && inv.direction === 'OUT' && inv.status !== 'PAID' && !inv.isVoid && (inv.balance ?? inv.amount) > 0);
        const detail = unpaidInvs.length > 0
          ? unpaidInvs.map(i => `${i.invoiceNumber} · ${new Date(i.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`).join('; ')
          : 'CHIT payable';
        accountsPayableItems.push({ name: c.name, amount: remaining, detail });
      });
    accountsPayableItems.sort((a, b) => b.amount - a.amount);
    const unpaidAccountsPayable = accountsPayableItems.reduce((acc, i) => acc + i.amount, 0);

    // Fix: Include 'creditPrincipal' from Customers who are Lenders (e.g. Friends Foundation, Private Parties)
    const customerPrivateDebt = customers.filter(c => c.isLender).reduce((acc, c) => acc + c.creditPrincipal, 0);
    const liabilityPrivateDebt = liabilities.filter(l => l.type === 'PRIVATE').reduce((acc, l) => acc + l.principal, 0);

    const bankLoanItems: { name: string; amount: number; detail: string }[] = liabilities
      .filter(l => l.type === 'BANK').map(l => ({ name: l.providerName || 'Bank', amount: l.principal, detail: '' }));

    const privateDebtItems: { name: string; amount: number; detail: string }[] = [
      ...liabilities.filter(l => l.type === 'PRIVATE').map(l => ({ name: l.providerName || 'Creditor', amount: l.principal, detail: '' })),
      ...customers.filter(c => c.isLender && (c.creditPrincipal || 0) > 0).map(c => ({ name: `${c.name} (Lender)`, amount: c.creditPrincipal || 0, detail: '' })),
    ];

    // Customer Advances = trade advances from NON-LENDER customers only (lenders go to Private Debt)
    const advancesItems: { name: string; amount: number; detail: string }[] = customers
      .filter(c => !c.isLender)
      .map(c => {
        const custInvoices = invoices.filter(inv => inv.customerId === c.id && !inv.isVoid);
        const custPayments = payments.filter(p => p.sourceId === c.id);
        const opening = computeOpening(c);
        const invIN = custInvoices.filter(i => i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
        const payOUT = custPayments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
        const invOUT = custInvoices.filter(i => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
        const payIN = sumPaymentsInForLedger(custPayments);
        const net = (opening + invIN + payOUT) - (invOUT + payIN);
        return { name: c.name, amount: -net, detail: '' };
      })
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const advancesTotal = advancesItems.reduce((acc, i) => acc + i.amount, 0);

    const liabilitiesList = {
      bankLoans: liabilities.filter(l => l.type === 'BANK').reduce((acc, l) => acc + l.principal, 0),
      privateDebt: liabilityPrivateDebt + customerPrivateDebt,
      advances: advancesTotal, 
      accountsPayable: unpaidAccountsPayable,
      businessUnitPayable,
      journalCreditor: journalEffectsBS.liabilityCreditor + journalEffectsBS.liabilityInterestPayable
    };
    const totalLiabilities = Object.values(liabilitiesList).reduce((a, b) => a + b, 0);

    // 5. EQUITY (Industry-standard formula)
    // Retained Earnings = Opening RE + Cumulative Net Profit - Drawings (+ Journal capital/retained effects)
    const openingRetainedEarnings = openingBalances.RETAINED_EARNINGS ?? 0;
    const journalCapital = journalEffectsBS.capital;
    const journalRetained = journalEffectsBS.retainedEarnings;

    const retainedEarnings = openingRetainedEarnings + cumulativeNetProfit - totalDrawings + journalRetained;
    const computedEquity = openingBalances.CAPITAL + journalCapital + retainedEarnings;
    const totalEquity = computedEquity;

    const journalEffectsAllTime = computeJournalEffects(journals);
    const allTimeRevenueRoyalty = invoices.filter(i => !i.isVoid && i.type === 'ROYALTY').reduce((acc, i) => acc + i.amount, 0) + journalEffectsAllTime.incomeRoyalty;
    const allTimeRevenueInterest = invoices.filter(i => !i.isVoid && i.type === 'INTEREST').reduce((acc, i) => acc + i.amount, 0) + journalEffectsAllTime.incomeInterest;
    // Chit revenue = company amount (commission) per auction only — we don't get all chit money, only our profit
    const allTimeRevenueChit = chitGroups.reduce((t, g) => t + g.auctions.reduce((s, a) => s + a.commissionAmount, 0), 0) + journalEffectsAllTime.incomeChit;

    const cumulativeNetProfitItems: ExpandItem[] = [
      { name: 'All Time Revenue (Royalty)', amount: allTimeRevenueRoyalty, detail: '' },
      { name: 'All Time Revenue (Interest)', amount: allTimeRevenueInterest, detail: '' },
      { name: 'All Time Revenue (Chit)', amount: allTimeRevenueChit, detail: '' },
      { name: 'Less: All Time Expenses', amount: -allTimeExpenses, detail: '' },
    ];

    const retainedEarningsItems: { name: string; amount: number; detail: string }[] = [
      { name: 'Opening Retained Earnings', amount: openingRetainedEarnings, detail: '' },
      { name: 'Cumulative Net Profit', amount: cumulativeNetProfit, detail: '' },
      { name: 'Drawings', amount: -totalDrawings, detail: '' },
    ];
    if (journalRetained !== 0) retainedEarningsItems.push({ name: 'Journal Adjustment', amount: journalRetained, detail: '' });

    const equity = {
      openingCapital: openingBalances.CAPITAL + journalCapital,
      currentNetProfit: netProfit,
      retainedEarnings,
      drawings: totalDrawings
    };

    // Meaningful balance check: Assets = Liabilities + Equity (not a plug)
    const balanceDifference = totalAssets - (totalLiabilities + totalEquity);
    const isBalanced = Math.abs(balanceDifference) < 1;

    return {
      revenue, totalRevenue, expenses, totalExpenses, netProfit, totalDrawings, assets, totalAssets,
      liabilitiesList, totalLiabilities, equity, totalEquity, investmentBreakdown, balanceDifference, isBalanced,
      accountsPayableItems, bankBalanceItems, receivableItems, investmentItems, principalLentItems,
      investmentsByCategory,
      bankLoanItems, privateDebtItems, advancesItems, retainedEarningsItems, cumulativeNetProfitItems,
      totalBankBalance,
      revenueRoyaltyItems, revenueInterestItems, revenueChitItems, revenueBusinessItems,
      expenseOperationalItems, expenseLoanInterestItems, expenseBusinessItems,
      receivablesByCategory,
      journalReceivable: journalEffectsBS.receivable,
    };
  }, [invoices, payments, stats, customers, liabilities, openingBalances, investments, chitGroups, journals, bankAccounts, timeFrame]);

  const balanceDifference = financials.balanceDifference;
  const isBalanced = financials.isBalanced; 

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Controls Row — only time filter shown (report type is driven by the top-level tab) */}
      {reportType === 'PL' && (
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button onClick={() => setTimeFrame('THIS_MONTH')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'THIS_MONTH' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>This Month</button>
            <button onClick={() => setTimeFrame('LAST_MONTH')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'LAST_MONTH' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Last Month</button>
            <button onClick={() => setTimeFrame('ALL')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${timeFrame === 'ALL' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>All Time</button>
          </div>
        </div>
      )}

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
                   <ExpandableSection label="Royalty Income" total={financials.revenue.royalty} items={financials.revenueRoyaltyItems} expanded={expandedSections.revenueRoyalty} onToggle={() => toggleExpand('revenueRoyalty')} theme="emerald" />
                   <ExpandableSection label="Interest Income" total={financials.revenue.interest} items={financials.revenueInterestItems} expanded={expandedSections.revenueInterest} onToggle={() => toggleExpand('revenueInterest')} theme="emerald" />
                   <ExpandableSection label="Chit Fund Commission (5%)" subtext="Net Profit from Auctions" total={financials.revenue.chit} items={financials.revenueChitItems} expanded={expandedSections.revenueChit} onToggle={() => toggleExpand('revenueChit')} theme="emerald" />
                   <TotalRow label="Total Revenue" amount={financials.totalRevenue} color="text-emerald-600" />
                </div>
             </div>

             {/* EXPENSE SECTION */}
             <div className="mb-8">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b-2 border-rose-100 pb-2 mb-4">Expenses</h3>
                <div className="space-y-3">
                   <ExpandableSection label="Operational Expenses" total={financials.expenses.operational} items={financials.expenseOperationalItems} expanded={expandedSections.expenseOperational} onToggle={() => toggleExpand('expenseOperational')} theme="rose" />
                   <ExpandableSection label="Cost of Debt (Interest Paid)" total={financials.expenses.loanInterest} items={financials.expenseLoanInterestItems} expanded={expandedSections.expenseLoanInterest} onToggle={() => toggleExpand('expenseLoanInterest')} theme="rose" />
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
                   {financials.netProfit.toLocaleString()}
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
                     <ExpandableSection label="Bank Balances" total={financials.totalBankBalance} items={financials.bankBalanceItems} expanded={expandedSections.bankBalances} onToggle={() => toggleExpand('bankBalances')} theme="slate" />
                     {financials.assets.businessUnitReceivable > 0 && (
                      <Row label="Business Unit Receivable" amount={financials.assets.businessUnitReceivable} subtext="Partnership — we contributed more than received" />
                    )}
                     <ExpandableAccountsReceivable
                      total={financials.assets.receivables}
                      receivablesByCategory={financials.receivablesByCategory}
                      journalReceivable={financials.journalReceivable}
                      expanded={expandedSections.receivables}
                      onToggle={() => toggleExpand('receivables')}
                      categoryExpanded={{
                        receivablesRoyalty: expandedSections.receivablesRoyalty,
                        receivablesInterest: expandedSections.receivablesInterest,
                        receivablesChit: expandedSections.receivablesChit,
                        receivablesGeneral: expandedSections.receivablesGeneral,
                      }}
                      onCategoryToggle={(k) => toggleExpand(k)}
                    />
                     
                     <div className="h-4"></div>
                     <SectionHeader title="Investments & Holdings" />
                     <ExpandableInvestments
                      total={financials.assets.investments}
                      investmentsByCategory={financials.investmentsByCategory}
                      expanded={expandedSections.investments}
                      onToggle={() => toggleExpand('investments')}
                      categoryExpanded={{
                        investmentsChit: expandedSections.investmentsChit,
                        investmentsLic: expandedSections.investmentsLic,
                        investmentsSip: expandedSections.investmentsSip,
                        investmentsGold: expandedSections.investmentsGold,
                        investmentsFd: expandedSections.investmentsFd,
                        investmentsOther: expandedSections.investmentsOther,
                      }}
                      onCategoryToggle={(k) => toggleExpand(k)}
                    />
                     
                     <div className="h-4"></div>
                     <SectionHeader title="Loan Portfolio" />
                     <ExpandableSection label="Principal Lent Out" subtext="Loan principal to customers" total={financials.assets.lendingPrincipal} items={financials.principalLentItems} expanded={expandedSections.principalLent} onToggle={() => toggleExpand('principalLent')} theme="slate" />
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
                     <ExpandableSection label="Bank Loans" total={financials.liabilitiesList.bankLoans} items={financials.bankLoanItems} expanded={expandedSections.bankLoans} onToggle={() => toggleExpand('bankLoans')} theme="rose" />
                     <ExpandableSection label="Private Debt (Total)" subtext="Creditors + Registry Debt" total={financials.liabilitiesList.privateDebt} items={financials.privateDebtItems} expanded={expandedSections.privateDebt} onToggle={() => toggleExpand('privateDebt')} theme="rose" />
                     <ExpandableAccountsPayable items={financials.accountsPayableItems} total={financials.liabilitiesList.accountsPayable} expanded={expandedSections.accountsPayable} onToggle={() => toggleExpand('accountsPayable')} />
                     {financials.liabilitiesList.businessUnitPayable > 0 && (
                      <Row label="Business Unit Payable" amount={financials.liabilitiesList.businessUnitPayable} subtext="Partnership — we received more than contributed" />
                    )}
                     <ExpandableSection label="Customer Advances" subtext="Advance from customers" total={financials.liabilitiesList.advances} items={financials.advancesItems} expanded={expandedSections.advances} onToggle={() => toggleExpand('advances')} theme="rose" />
                     {financials.liabilitiesList.journalCreditor > 0 && (
                       <Row label="Other Payables (Journal)" amount={financials.liabilitiesList.journalCreditor} subtext="Creditor & Interest Payable from Journals" />
                     )}
                     
                     <div className="pl-4 py-2 border-l-2 border-rose-200">
                        <div className="flex justify-between items-center text-rose-800">
                           <span className="text-xs font-bold uppercase">Total Liabilities</span>
                           <span className="font-mono font-bold">{financials.totalLiabilities.toLocaleString()}</span>
                        </div>
                     </div>

                     <div className="h-4"></div>
                     <SectionHeader title="Equity" />
                     <Row label="Owner's Capital (Opening)" amount={financials.equity.openingCapital} />
                     <RetainedEarningsSection 
                       total={financials.equity.retainedEarnings} 
                       items={financials.retainedEarningsItems} 
                       cumulativeNetProfitItems={financials.cumulativeNetProfitItems}
                       expanded={expandedSections.retainedEarnings} 
                       onToggle={() => toggleExpand('retainedEarnings')}
                       cumulativeExpanded={expandedSections.cumulativeNetProfit}
                       onCumulativeToggle={() => toggleExpand('cumulativeNetProfit')}
                     />
                     <div className="pl-4 py-2 border-l-2 border-emerald-200">
                        <div className="flex justify-between items-center text-emerald-800">
                           <span className="text-xs font-bold uppercase">Total Equity</span>
                           <span className="font-mono font-bold">{financials.totalEquity.toLocaleString()}</span>
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
                        {isBalanced ? <i className="fas fa-check-circle"></i> : `${balanceDifference.toLocaleString()}`}
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

type ExpandItem = { name: string; amount: number; detail?: string };

const RetainedEarningsSection = ({ total, items, cumulativeNetProfitItems, expanded, onToggle, cumulativeExpanded, onCumulativeToggle }: {
  total: number; items: ExpandItem[]; cumulativeNetProfitItems: ExpandItem[];
  expanded: boolean; onToggle: () => void; cumulativeExpanded: boolean; onCumulativeToggle: () => void;
}) => {
  const themeCls = { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', total: 'text-emerald-800' };
  const cumItem = items.find(i => i.name === 'Cumulative Net Profit');
  const otherItems = items.filter(i => i.name !== 'Cumulative Net Profit');
  return (
    <div className={`${themeCls.bg} px-2 rounded-lg -mx-2 py-2`}>
      <button onClick={onToggle} className="w-full flex justify-between items-center text-left">
        <div>
          <div className={`text-xs font-bold uppercase ${themeCls.text}`}>Retained Earnings</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Opening RE + Net Profit − Drawings</div>
          {items.length > 0 && <div className="text-[9px] text-slate-500 mt-0.5">{items.length} account{items.length !== 1 ? 's' : ''}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${themeCls.text}`}>{total.toLocaleString()}</span>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
        </div>
      </button>
      {expanded && items.length > 0 && (
        <div className={`mt-3 pt-3 border-t ${themeCls.border} space-y-2`}>
          {otherItems.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-[11px] py-1.5 px-2 rounded bg-white/60">
              <div><div className={`font-semibold ${themeCls.text}`}>{item.name}</div></div>
              <span className={`font-mono font-bold ${themeCls.text}`}>{item.amount.toLocaleString()}</span>
            </div>
          ))}
          {/* Cumulative Net Profit with nested dropdown */}
          {cumItem && (
            <div className="rounded bg-white/60 overflow-hidden">
              <button onClick={onCumulativeToggle} className="w-full flex justify-between items-center text-[11px] py-1.5 px-2 text-left">
                <div className={`font-semibold ${themeCls.text}`}>Cumulative Net Profit</div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${themeCls.text}`}>{cumItem.amount.toLocaleString()}</span>
                  <i className={`fas fa-chevron-${cumulativeExpanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
                </div>
              </button>
              {cumulativeExpanded && cumulativeNetProfitItems.length > 0 && (
                <div className={`px-2 pb-2 pt-1 border-t ${themeCls.border} space-y-1.5 ml-2`}>
                  {cumulativeNetProfitItems.map((sub, i) => (
                    <div key={i} className="flex justify-between text-[10px] py-1 px-2 rounded bg-emerald-50/80">
                      <span className="text-slate-600">{sub.name}</span>
                      <span className={`font-mono font-bold ${sub.amount < 0 ? 'text-rose-600' : themeCls.text}`}>{sub.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className={`flex justify-between pt-1.5 border-t ${themeCls.border} font-bold ${themeCls.total} text-[10px]`}>
                    <span>Net</span>
                    <span className="font-mono">{cumItem.amount.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={`flex justify-between items-center pt-2 border-t ${themeCls.border} font-bold ${themeCls.total}`}>
            <span className="text-[10px] uppercase">Total</span>
            <span className="font-mono">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const ExpandableSection = ({ label, subtext, total, items, expanded, onToggle, theme = 'slate' }: {
  label: string; subtext?: string; total: number; items: ExpandItem[]; expanded: boolean; onToggle: () => void;
  theme?: 'slate' | 'indigo' | 'emerald' | 'rose';
}) => {
  const themeCls = {
    slate: { bg: 'bg-slate-50', text: 'text-slate-700', sub: 'text-slate-400', border: 'border-slate-100', total: 'text-slate-800' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', sub: 'text-slate-400', border: 'border-indigo-100', total: 'text-indigo-800' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-slate-400', border: 'border-emerald-100', total: 'text-emerald-800' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', sub: 'text-slate-400', border: 'border-rose-100', total: 'text-rose-800' },
  }[theme];
  return (
    <div className={`${themeCls.bg} px-2 rounded-lg -mx-2 py-2`}>
      <button onClick={onToggle} className="w-full flex justify-between items-center text-left">
        <div>
          <div className={`text-xs font-bold uppercase ${themeCls.text}`}>{label}</div>
          {subtext && <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{subtext}</div>}
          {items.length > 0 && <div className="text-[9px] text-slate-500 mt-0.5">{items.length} account{items.length !== 1 ? 's' : ''}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${themeCls.text}`}>{total.toLocaleString()}</span>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
        </div>
      </button>
      {expanded && items.length > 0 && (
        <div className={`mt-3 pt-3 border-t ${themeCls.border} space-y-2`}>
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-[11px] py-1.5 px-2 rounded bg-white/60">
              <div>
                <div className={`font-semibold ${themeCls.text}`}>{item.name}</div>
                {item.detail && <div className="text-[9px] text-slate-400">{item.detail}</div>}
              </div>
              <span className={`font-mono font-bold ${themeCls.text}`}>{item.amount.toLocaleString()}</span>
            </div>
          ))}
          <div className={`flex justify-between items-center pt-2 border-t ${themeCls.border} font-bold ${themeCls.total}`}>
            <span className="text-[10px] uppercase">Total</span>
            <span className="font-mono">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
      {expanded && items.length === 0 && (
        <div className={`mt-3 pt-3 border-t ${themeCls.border} text-[10px] text-slate-500 italic`}>No accounts</div>
      )}
    </div>
  );
};

const ExpandableAccountsReceivable = ({
  total,
  receivablesByCategory,
  journalReceivable = 0,
  expanded,
  onToggle,
  categoryExpanded,
  onCategoryToggle,
}: {
  total: number;
  receivablesByCategory: Record<'royalty' | 'interest' | 'chit' | 'general', { total: number; items: { name: string; amount: number }[] }>;
  journalReceivable?: number;
  expanded: boolean;
  onToggle: () => void;
  categoryExpanded: Record<'receivablesRoyalty' | 'receivablesInterest' | 'receivablesChit' | 'receivablesGeneral', boolean>;
  onCategoryToggle: (key: 'receivablesRoyalty' | 'receivablesInterest' | 'receivablesChit' | 'receivablesGeneral') => void;
}) => {
  const themeCls = { bg: 'bg-slate-50', text: 'text-slate-700', sub: 'text-slate-400', border: 'border-slate-100', total: 'text-slate-800' };
  const categories: { key: 'receivablesRoyalty' | 'receivablesInterest' | 'receivablesChit' | 'receivablesGeneral'; label: string }[] = [
    { key: 'receivablesRoyalty', label: 'Royalty' },
    { key: 'receivablesInterest', label: 'Interest' },
    { key: 'receivablesChit', label: 'Chit' },
    { key: 'receivablesGeneral', label: 'General' },
  ];
  const totalItems = categories.reduce((sum, c) => sum + receivablesByCategory[c.key === 'receivablesRoyalty' ? 'royalty' : c.key === 'receivablesInterest' ? 'interest' : c.key === 'receivablesChit' ? 'chit' : 'general'].items.length, 0);
  return (
    <div className={`${themeCls.bg} px-2 rounded-lg -mx-2 py-2`}>
      <button onClick={onToggle} className="w-full flex justify-between items-center text-left">
        <div>
          <div className={`text-xs font-bold uppercase ${themeCls.text}`}>Accounts Receivable (Trade & Dues)</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Category-wise outstanding from customers</div>
          {totalItems > 0 && <div className="text-[9px] text-slate-500 mt-0.5">{categories.length} categories</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${themeCls.text}`}>{total.toLocaleString()}</span>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
        </div>
      </button>
      {expanded && (
        <div className={`mt-3 pt-3 border-t ${themeCls.border} space-y-2`}>
          {journalReceivable !== 0 && (
            <div className="flex justify-between text-[11px] py-1.5 px-2 rounded bg-white/60">
              <span className={`font-semibold ${themeCls.text}`}>Journal Adjustment</span>
              <span className={`font-mono font-bold ${themeCls.text}`}>{journalReceivable.toLocaleString()}</span>
            </div>
          )}
          {categories.map(({ key, label }) => {
            const cat = receivablesByCategory[key === 'receivablesRoyalty' ? 'royalty' : key === 'receivablesInterest' ? 'interest' : key === 'receivablesChit' ? 'chit' : 'general'];
            const isExpanded = categoryExpanded[key];
            return (
              <div key={key} className="rounded bg-white/60 overflow-hidden">
                <button onClick={() => onCategoryToggle(key)} className="w-full flex justify-between items-center text-[11px] py-1.5 px-2 text-left">
                  <div className={`font-semibold ${themeCls.text}`}>{label}</div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold ${themeCls.text}`}>{cat.total.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-400">({cat.items.length} account{cat.items.length !== 1 ? 's' : ''})</span>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
                  </div>
                </button>
                {isExpanded && cat.items.length > 0 && (
                  <div className={`px-2 pb-2 pt-1 border-t ${themeCls.border} space-y-1.5 ml-2`}>
                    {cat.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[10px] py-1 px-2 rounded bg-slate-50/80">
                        <span className="text-slate-600">{item.name}</span>
                        <span className={`font-mono font-bold ${themeCls.text}`}>{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className={`flex justify-between pt-1.5 border-t ${themeCls.border} font-bold ${themeCls.total} text-[10px]`}>
                      <span>Subtotal</span>
                      <span className="font-mono">{cat.total.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className={`flex justify-between items-center pt-2 border-t ${themeCls.border} font-bold ${themeCls.total}`}>
            <span className="text-[10px] uppercase">Total</span>
            <span className="font-mono">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const ExpandableInvestments = ({
  total,
  investmentsByCategory,
  expanded,
  onToggle,
  categoryExpanded,
  onCategoryToggle,
}: {
  total: number;
  investmentsByCategory: Record<'chit' | 'lic' | 'sip' | 'gold' | 'fd' | 'other', { total: number; items: { name: string; amount: number }[] }>;
  expanded: boolean;
  onToggle: () => void;
  categoryExpanded: Record<'investmentsChit' | 'investmentsLic' | 'investmentsSip' | 'investmentsGold' | 'investmentsFd' | 'investmentsOther', boolean>;
  onCategoryToggle: (key: 'investmentsChit' | 'investmentsLic' | 'investmentsSip' | 'investmentsGold' | 'investmentsFd' | 'investmentsOther') => void;
}) => {
  const themeCls = { bg: 'bg-slate-50', text: 'text-slate-700', sub: 'text-slate-400', border: 'border-slate-100', total: 'text-slate-800' };
  const categories: { key: 'investmentsChit' | 'investmentsLic' | 'investmentsSip' | 'investmentsGold' | 'investmentsFd' | 'investmentsOther'; label: string }[] = [
    { key: 'investmentsChit', label: 'Chit' },
    { key: 'investmentsLic', label: 'LIC' },
    { key: 'investmentsSip', label: 'SIP' },
    { key: 'investmentsGold', label: 'Gold' },
    { key: 'investmentsFd', label: 'FD' },
    { key: 'investmentsOther', label: 'Other' },
  ];
  const catKeyToCat = (k: string) => k.replace('investments', '').toLowerCase() as 'chit' | 'lic' | 'sip' | 'gold' | 'fd' | 'other';
  return (
    <div className={`${themeCls.bg} px-2 rounded-lg -mx-2 py-2`}>
      <button onClick={onToggle} className="w-full flex justify-between items-center text-left">
        <div>
          <div className={`text-xs font-bold uppercase ${themeCls.text}`}>Investments</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Chit, LIC, SIP, Gold, FD, Other</div>
          <div className="text-[9px] text-slate-500 mt-0.5">{categories.length} categories</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${themeCls.text}`}>{total.toLocaleString()}</span>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
        </div>
      </button>
      {expanded && (
        <div className={`mt-3 pt-3 border-t ${themeCls.border} space-y-2`}>
          {categories.map(({ key, label }) => {
            const cat = investmentsByCategory[catKeyToCat(key)];
            const isExpanded = categoryExpanded[key];
            return (
              <div key={key} className="rounded bg-white/60 overflow-hidden">
                <button onClick={() => onCategoryToggle(key)} className="w-full flex justify-between items-center text-[11px] py-1.5 px-2 text-left">
                  <div className={`font-semibold ${themeCls.text}`}>{label}</div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold ${themeCls.text}`}>{cat.total.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-400">({cat.items.length} account{cat.items.length !== 1 ? 's' : ''})</span>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-slate-500 text-[10px]`}></i>
                  </div>
                </button>
                {isExpanded && cat.items.length > 0 && (
                  <div className={`px-2 pb-2 pt-1 border-t ${themeCls.border} space-y-1.5 ml-2`}>
                    {cat.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[10px] py-1 px-2 rounded bg-slate-50/80">
                        <span className="text-slate-600">{item.name}</span>
                        <span className={`font-mono font-bold ${themeCls.text}`}>{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className={`flex justify-between pt-1.5 border-t ${themeCls.border} font-bold ${themeCls.total} text-[10px]`}>
                      <span>Subtotal</span>
                      <span className="font-mono">{cat.total.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className={`flex justify-between items-center pt-2 border-t ${themeCls.border} font-bold ${themeCls.total}`}>
            <span className="text-[10px] uppercase">Total</span>
            <span className="font-mono">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const ExpandableAccountsPayable = ({ items, total, expanded, onToggle }: { items: { name: string; amount: number; detail: string }[]; total: number; expanded: boolean; onToggle: () => void }) => {
  return (
    <div className="bg-indigo-50 px-2 rounded-lg -mx-2 py-2">
      <button onClick={onToggle} className="w-full flex justify-between items-center text-left">
        <div>
          <div className="text-xs font-bold uppercase text-indigo-700">Accounts Payable</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Unpaid Winner Payouts {items.length > 0 && `(${items.length} account${items.length !== 1 ? 's' : ''})`}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-indigo-700">{total.toLocaleString()}</span>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-indigo-500 text-[10px]`}></i>
        </div>
      </button>
      {expanded && items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-indigo-100 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-[11px] py-1.5 px-2 rounded bg-white/60">
              <div>
                <div className="font-semibold text-slate-700">{item.name}</div>
                {item.detail && <div className="text-[9px] text-slate-400">{item.detail}</div>}
              </div>
              <span className="font-mono font-bold text-indigo-700">{item.amount.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 border-t border-indigo-200 font-bold text-indigo-800">
            <span className="text-[10px] uppercase">Total</span>
            <span className="font-mono">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
      {expanded && items.length === 0 && (
        <div className="mt-3 pt-3 border-t border-indigo-100 text-[10px] text-slate-500 italic">No unpaid winner payouts</div>
      )}
    </div>
  );
};

const Row = ({ label, amount, highlight = false, subtext }: { label: string, amount: number, highlight?: boolean, subtext?: string }) => (
  <div className={`flex justify-between items-center py-2 border-b border-slate-50 last:border-0 ${highlight ? 'bg-indigo-50 px-2 rounded-lg -mx-2' : ''}`}>
     <div>
        <div className={`text-xs font-bold uppercase ${highlight ? 'text-indigo-700' : 'text-slate-500'}`}>{label}</div>
        {subtext && <div className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">{subtext}</div>}
     </div>
     <span className={`font-mono font-bold text-sm ${highlight ? 'text-indigo-700' : 'text-slate-700'}`}>{amount.toLocaleString()}</span>
  </div>
);

const TotalRow = ({ label, amount, color }: { label: string, amount: number, color: string }) => (
  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl">
     <span className="text-xs font-black uppercase tracking-widest text-slate-600">{label}</span>
     <span className={`text-xl font-display font-black italic tracking-tighter ${color}`}>{amount.toLocaleString()}</span>
  </div>
);

const SectionHeader = ({ title }: { title: string }) => (
  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{title}</div>
);

export default ReportList;

