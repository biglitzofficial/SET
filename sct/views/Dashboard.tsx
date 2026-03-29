
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats, Invoice, Payment, UserRole, Customer, Liability, BankAccount } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import OutstandingReports from './OutstandingReports';
import { computeOpening, sumPaymentsInForLedger } from '../utils/ledgerUtils';

interface DashboardProps {
  stats: DashboardStats;
  invoices: Invoice[];
  payments: Payment[];
  role: UserRole;
  setRole: React.Dispatch<React.SetStateAction<UserRole>>;
  customers: Customer[];
  liabilities: Liability[];
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  bankAccounts: BankAccount[];
  expenseCategories: string[];
  otherBusinesses: string[];
  incomeCategories: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ stats, customers, role, invoices, payments, liabilities, openingBalances, bankAccounts, expenseCategories, otherBusinesses, incomeCategories }) => {
  const navigate = useNavigate();
  const formatCurrency = (val: number) => `${Math.abs(val || 0).toFixed(2)} INR`;
  
  // Debug: Log when Dashboard mounts and when payments change
  useEffect(() => {
    console.log('🎯 Dashboard mounted/updated with payments:', payments.length);
    if (payments.length > 0) {
      console.log('   First payment:', payments[0]);
    }
  }, [payments]);
  

  // --- Real-time Projections ---
  const projections = useMemo(() => {
    const royaltyCount = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE').length;
    const royaltyValue = customers.reduce((acc, c) => acc + (c.isRoyalty && c.status === 'ACTIVE' ? c.royaltyAmount : 0), 0);
    
    const interestCount = customers.filter(c => c.isInterest && c.status === 'ACTIVE').length;
    const interestYield = customers.reduce((acc, c) => acc + (c.isInterest && c.status === 'ACTIVE' ? (c.interestPrincipal * (c.interestRate / 100)) : 0), 0);

    const totalAssets = stats.cashInHand + stats.bankCUB + stats.bankKVB + stats.receivableOutstanding + stats.totalInvestments;
    const netWorth = totalAssets - stats.payableOutstanding;

    // --- Category-wise Receivables & Payables ---
    // Uses the exact same payment-based formula as OutstandingReports so numbers always match

    // Build per-customer breakdown (mirrors customerAnalysis in OutstandingReports)
    const custAnalysis = customers.map(cust => {
      const custInv = invoices.filter(i => i.customerId === cust.id && !i.isVoid);
      const custPay = payments.filter(p => p.sourceId === cust.id);

      const opening = computeOpening(cust);
      const invIN  = custInv.filter(i => i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const invOUT = custInv.filter(i => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const payIN  = sumPaymentsInForLedger(custPay);
      const payOUT = custPay.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
      const netLedger = (opening + invIN + payOUT) - (invOUT + payIN);

      const chitInAmt  = custInv.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
      const chitOutAmt = custInv.filter(i => i.type === 'CHIT' && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
      const chitPaidIn  = custPay.filter(p => p.type === 'IN'  && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitPaidOut = custPay.filter(p => p.type === 'OUT' && (p.category === 'CHIT' || p.category === 'CHIT_FUND')).reduce((s, p) => s + p.amount, 0);
      const chitNet = (chitInAmt + chitPaidOut) - (chitOutAmt + chitPaidIn);

      const royaltyAmt  = custInv.filter(i => i.type === 'ROYALTY').reduce((s, i) => s + i.amount, 0);
      const royaltyPaid = custPay.filter(p => p.type === 'IN' && p.category === 'ROYALTY').reduce((s, p) => s + p.amount, 0);
      const royaltyNet  = royaltyAmt - royaltyPaid;

      const interestAmt  = custInv.filter(i => i.type === 'INTEREST').reduce((s, i) => s + i.amount, 0);
      const interestPaid = custPay.filter(p => p.type === 'IN' && p.category === 'INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestNet  = interestAmt - interestPaid;

      const interestOutAmt  = custInv.filter(i => i.type === 'INTEREST_OUT' && !i.isVoid).reduce((s, i) => s + i.amount, 0);
      const interestOutPaid = custPay.filter(p => p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((s, p) => s + p.amount, 0);
      const interestOutNet  = Math.max(0, interestOutAmt - interestOutPaid);

      const generalNet = netLedger - chitNet - royaltyNet - interestNet - interestOutNet - (cust.interestPrincipal || 0) + (cust.creditPrincipal || 0);

      return { ...cust, chitNet, royaltyNet, interestNet, interestOutNet, generalNet, netLedger, payOUT };
    });

    // RECEIVABLES: customers with positive category balance
    const royaltyRec = custAnalysis.filter(c => c.royaltyNet > 0);
    const royaltyReceivable = royaltyRec.reduce((s, c) => s + c.royaltyNet, 0);
    const royaltyReceivableCount = royaltyRec.length;

    const loanRec = custAnalysis.filter(c => c.interestNet > 0);
    const loanReceivable = loanRec.reduce((s, c) => s + c.interestNet, 0);
    const loanReceivableCount = loanRec.length;

    const chitRec = custAnalysis.filter(c => c.chitNet > 0);
    const chitReceivable = chitRec.reduce((s, c) => s + c.chitNet, 0);
    const chitReceivableCount = chitRec.length;

    // OTHER = General from Analytics Outstanding
    // Receivable: customers with positive generalNet (same as before)
    const generalRec = custAnalysis.filter(c => c.generalNet > 0);
    const generalReceivable = generalRec.reduce((s, c) => s + c.generalNet, 0);
    const generalReceivableCount = generalRec.length;

    // GENERAL TRADE: customers we owe for general (generalNet < 0, not lenders)
    const generalTradePayables = custAnalysis.filter(c => !c.isLender && c.generalNet < 0);
    const generalPayable = generalTradePayables.reduce((s, c) => s + Math.abs(c.generalNet), 0);
    const generalPayableCount = generalTradePayables.length;

    // PAYABLES: mirrors Analytics Outstanding — Loan Payable = Interest Out total
    const customerInterestOut = custAnalysis.reduce((s, c) => s + (c.interestOutNet || 0), 0);
    const liabilityInterestOut = liabilities.reduce((s, l) => {
      const amt = invoices.filter(i => i.lenderId === l.id && i.type === 'INTEREST_OUT' && !i.isVoid).reduce((a, i) => a + i.amount, 0);
      const paid = payments.filter(p => p.sourceId === l.id && p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((a, p) => a + p.amount, 0);
      return s + Math.max(0, amt - paid);
    }, 0);
    const loanPayable = customerInterestOut + liabilityInterestOut;
    const customersWithInterestOut = custAnalysis.filter(c => (c.interestOutNet || 0) > 0).length;
    const lendersWithInterestOut = liabilities.filter(l => {
      const amt = invoices.filter(i => i.lenderId === l.id && i.type === 'INTEREST_OUT' && !i.isVoid).reduce((a, i) => a + i.amount, 0);
      const paid = payments.filter(p => p.sourceId === l.id && p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((a, p) => a + p.amount, 0);
      return amt - paid > 0;
    }).length;
    const loanPayableCount = customersWithInterestOut + lendersWithInterestOut;

    // Chit winners we owe payout (negative chitNet customers)
    const chitDebtors = custAnalysis.filter(c => c.chitNet < 0 && !c.isLender).map(c => {
      return Math.max(0, Math.abs(c.chitNet) - c.payOUT);
    });
    const chitPayable = chitDebtors.reduce((s, v) => s + v, 0);
    const chitPayableCount = chitDebtors.filter(v => v > 0).length;

    const royaltyPayable = 0;
    const royaltyPayableCount = 0;

    return { 
      royaltyCount, royaltyValue, interestCount, interestYield, netWorth,
      royaltyReceivable, royaltyReceivableCount, royaltyPayable, royaltyPayableCount,
      loanReceivable, loanReceivableCount, loanPayable, loanPayableCount,
      chitReceivable, chitReceivableCount, chitPayable, chitPayableCount,
      generalReceivable, generalReceivableCount, generalPayable, generalPayableCount
    };
  }, [customers, stats, invoices, payments, liabilities]);

  // --- Expense Chart Data (by category) ---
  const expenseChartData = useMemo(() => {
    const colors = ['#F43F5E', '#EF4444', '#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#FB7185', '#F472B6', '#EC4899', '#D946EF'];
    
    console.log('==================');
    console.log('DASHBOARD EXPENSE CHART CALCULATION');
    console.log('==================');
    console.log('Total payments received:', payments.length);
    console.log('Expense categories:', expenseCategories);
    
    if (payments.length > 0) {
      console.log('Sample payment structure:', JSON.stringify(payments[0], null, 2));
      console.log('All payments summary:', payments.map((p, i) => ({
        index: i,
        id: p.id?.substring(0, 8),
        type: p.type,
        voucherType: p.voucherType,
        category: p.category,
        amount: p.amount,
        sourceName: p.sourceName
      })));
    }
    
    const categoryTotals = expenseCategories.map((category, index) => {
      const matchingPayments = payments.filter(p => p.type === 'OUT' && p.voucherType === 'PAYMENT' && p.category === category);
      const total = matchingPayments.reduce((sum, p) => sum + p.amount, 0);
      console.log(`Category "${category}": ${matchingPayments.length} payments, total: ${total}`);
      if (matchingPayments.length > 0) {
        console.log('  Matching payments:', matchingPayments.map(p => ({ sourceName: p.sourceName, amount: p.amount })));
      }
      return {
        name: category,
        value: total,
        color: colors[index % colors.length]
      };
    });
    
    const filtered = categoryTotals.filter(d => d.value > 0);
    console.log('Chart data after filtering:', filtered);
    console.log('==================');
    
    return filtered;
  }, [payments, expenseCategories]);

  // --- Income Chart Data (by business units and direct income) ---
  const incomeChartData = useMemo(() => {
    const colors = ['#10B981', '#059669', '#047857', '#065F46', '#064E3B', '#34D399', '#6EE7B7', '#A7F3D0', '#3B82F6', '#60A5FA'];
    
    // Business units income
    const businessIncome = otherBusinesses.map((business, index) => {
      const total = payments
        .filter(p => p.type === 'IN' && p.businessUnit === business)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        name: business,
        value: total,
        color: colors[index % colors.length]
      };
    });
    
    // Direct income categories
    const directIncome = incomeCategories.map((category, index) => {
      const total = payments
        .filter(p => p.type === 'IN' && p.category === category)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        name: category,
        value: total,
        color: colors[(otherBusinesses.length + index) % colors.length]
      };
    });
    
    return [...businessIncome, ...directIncome].filter(d => d.value > 0);
  }, [payments, otherBusinesses, incomeCategories]);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* PAGE TITLE */}
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-3xl md:text-4xl font-display font-black text-slate-900 tracking-tighter italic">Overview</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Financial Snapshot & Key Metrics</p>
         </div>
      </div>

      {/* BENTO GRID LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 auto-rows-[minmax(140px,auto)]">
        
        {/* 1. Outstanding Balances - Receivables & Payables Breakdown (Wide) */}
        <div className="md:col-span-4 bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl shadow-slate-200/50 border border-slate-100">
           <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-display font-black text-slate-900 uppercase tracking-tighter italic">Outstanding Balances</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-100">By Category</span>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {/* ROYALTY */}
              <div className="space-y-3">
                <div onClick={() => navigate('/reports/outstanding?filter=royalty&tab=receivables')} className="group p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-blue-200/30 hover:-translate-y-0.5 hover:border-blue-200 transition-all duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <i className="fas fa-crown text-blue-400 text-xs"></i>
                     <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Royalty</span>
                   </div>
                   <div className="text-base sm:text-lg font-display font-black text-blue-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.royaltyReceivable)}
                     {projections.royaltyReceivableCount > 0 && (
                       <span className="text-xs font-bold text-blue-500 ml-1">/ {projections.royaltyReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=royalty&tab=payables')} className="group p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-blue-200/30 hover:-translate-y-0.5 hover:border-blue-200 transition-all duration-300">
                   <div className="text-base sm:text-lg font-display font-black text-blue-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.royaltyPayable)}
                     {projections.royaltyPayableCount > 0 && (
                       <span className="text-xs font-bold text-blue-500 ml-1">/ {projections.royaltyPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Payable</div>
                </div>
              </div>

              {/* LOAN */}
              <div className="space-y-3">
                <div onClick={() => navigate('/reports/outstanding?filter=interest&tab=receivables')} className="group p-4 bg-gradient-to-br from-slate-50 to-zinc-100 rounded-2xl border border-slate-200/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-slate-200/30 hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <i className="fas fa-hand-holding-usd text-slate-400 text-xs"></i>
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Loan</span>
                   </div>
                   <div className="text-base sm:text-lg font-display font-black text-slate-800 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.loanReceivable)}
                     {projections.loanReceivableCount > 0 && (
                       <span className="text-xs font-bold text-slate-500 ml-1">/ {projections.loanReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?tab=payables')} className="group p-4 bg-gradient-to-br from-slate-50 to-zinc-100 rounded-2xl border border-slate-200/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-slate-200/30 hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-300">
                   <div className="text-base sm:text-lg font-display font-black text-slate-800 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.loanPayable)}
                     {projections.loanPayableCount > 0 && (
                       <span className="text-xs font-bold text-slate-500 ml-1">/ {projections.loanPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Payable</div>
                </div>
              </div>

              {/* CHIT */}
              <div className="space-y-3">
                <div onClick={() => navigate('/reports/outstanding?filter=chit&tab=receivables')} className="group p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-orange-200/30 hover:-translate-y-0.5 hover:border-orange-200 transition-all duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <i className="fas fa-piggy-bank text-orange-400 text-xs"></i>
                     <span className="text-[10px] font-black text-orange-500 uppercase tracking-wider">Chit</span>
                   </div>
                   <div className="text-base sm:text-lg font-display font-black text-orange-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.chitReceivable)}
                     {projections.chitReceivableCount > 0 && (
                       <span className="text-xs font-bold text-orange-500 ml-1">/ {projections.chitReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest mt-1">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=chit&tab=payables')} className="group p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-orange-200/30 hover:-translate-y-0.5 hover:border-orange-200 transition-all duration-300">
                   <div className="text-base sm:text-lg font-display font-black text-orange-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.chitPayable)}
                     {projections.chitPayableCount > 0 && (
                       <span className="text-xs font-bold text-orange-500 ml-1">/ {projections.chitPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest mt-1">Payable</div>
                </div>
              </div>

              {/* GENERAL */}
              <div className="space-y-3">
                <div onClick={() => navigate('/reports/outstanding?filter=general&tab=receivables')} className="group p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl border border-amber-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-amber-200/30 hover:-translate-y-0.5 hover:border-amber-200 transition-all duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <i className="fas fa-file-invoice-dollar text-amber-500 text-xs"></i>
                     <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">General</span>
                   </div>
                   <div className="text-base sm:text-lg font-display font-black text-amber-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.generalReceivable)}
                     {projections.generalReceivableCount > 0 && (
                       <span className="text-xs font-bold text-amber-600 ml-1">/ {projections.generalReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=general&tab=payables')} className="group p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl border border-amber-100/80 overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-amber-200/30 hover:-translate-y-0.5 hover:border-amber-200 transition-all duration-300">
                   <div className="text-base sm:text-lg font-display font-black text-amber-900 whitespace-nowrap tabular-nums">
                     {formatCurrency(projections.generalPayable)}
                     {projections.generalPayableCount > 0 && (
                       <span className="text-xs font-bold text-amber-600 ml-1">/ {projections.generalPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1">Payable <span className="opacity-80">(General Trade)</span></div>
                </div>
              </div>

           </div>
        </div>

        {/* 2. Outstanding Tracker - Full Outstanding Reports */}
        <div className="md:col-span-4">
          <OutstandingReports 
            customers={customers}
            invoices={invoices}
            liabilities={liabilities}
            payments={payments}
            summaryOnly={true}
            onDrillDown={(id, type) => {
              if (type === 'CUSTOMER') {
                navigate(`/customers?id=${id}`);
              } else {
                navigate(`/liabilities?id=${id}`);
              }
            }}
          />
        </div>

      </div>

      {/* EXPENSE & INCOME TRACKING CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mt-8">
        
        {/* Expense Breakdown Chart */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <i className="fas fa-chart-pie text-rose-400 text-sm"></i>
              <h3 className="text-xl font-display font-black text-slate-900 uppercase tracking-tighter italic">Expense Breakdown</h3>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total expenses by category</p>
          </div>
          
          {expenseChartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={expenseChartData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={100} 
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expenseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      padding: '12px'
                    }}
                    formatter={(value: number) => `${value.toLocaleString()}`}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <i className="fas fa-chart-pie text-4xl mb-3 opacity-30"></i>
                <p className="text-sm font-bold">No expense data available</p>
                <p className="text-xs mt-1">Start recording expenses to see breakdown</p>
              </div>
            </div>
          )}
        </div>

        {/* Income Breakdown Chart */}
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <i className="fas fa-coins text-emerald-400 text-sm"></i>
              <h3 className="text-xl font-display font-black text-slate-900 uppercase tracking-tighter italic">Income Breakdown</h3>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue from business units & direct income</p>
          </div>
          
          {incomeChartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={incomeChartData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={100} 
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {incomeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      padding: '12px'
                    }}
                    formatter={(value: number) => `${value.toLocaleString()}`}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <i className="fas fa-chart-pie text-4xl mb-3 opacity-30"></i>
                <p className="text-sm font-bold">No income data available</p>
                <p className="text-xs mt-1">Start recording income to see breakdown</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;

