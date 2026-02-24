
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats, Invoice, Payment, UserRole, Customer, Liability, BankAccount } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import OutstandingReports from './OutstandingReports';

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
  const [showBalances, setShowBalances] = useState(false);
  const formatCurrency = (val: number) => `${Math.abs(val || 0).toFixed(2)} INR`;
  
  // Debug: Log when Dashboard mounts and when payments change
  useEffect(() => {
    console.log('🎯 Dashboard mounted/updated with payments:', payments.length);
    if (payments.length > 0) {
      console.log('   First payment:', payments[0]);
    }
  }, [payments]);
  
  // Calculate total bank balance
  const totalBankBalance = useMemo(() => {
    return bankAccounts.filter(b => b.status === 'ACTIVE').reduce((sum, bank) => sum + bank.openingBalance, 0);
  }, [bankAccounts]);

  // --- Real-time Projections ---
  const projections = useMemo(() => {
    const royaltyCount = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE').length;
    const royaltyValue = customers.reduce((acc, c) => acc + (c.isRoyalty && c.status === 'ACTIVE' ? c.royaltyAmount : 0), 0);
    
    const interestCount = customers.filter(c => c.isInterest && c.status === 'ACTIVE').length;
    const interestYield = customers.reduce((acc, c) => acc + (c.isInterest && c.status === 'ACTIVE' ? (c.interestPrincipal * (c.interestRate / 100)) : 0), 0);

    const totalAssets = stats.cashInHand + stats.bankCUB + stats.bankKVB + stats.receivableOutstanding + stats.totalInvestments;
    const netWorth = totalAssets - stats.payableOutstanding;

    // Calculate category-wise receivables and payables with member counts
    const royaltyReceivableInvoices = invoices.filter(i => i.type === 'ROYALTY' && i.status === 'UNPAID' && i.direction === 'IN');
    const royaltyReceivable = royaltyReceivableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const royaltyReceivableCount = new Set(royaltyReceivableInvoices.map(i => i.customerId)).size;
    
    const royaltyPayableInvoices = invoices.filter(i => i.type === 'ROYALTY' && i.status === 'UNPAID' && i.direction === 'OUT');
    const royaltyPayable = royaltyPayableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const royaltyPayableCount = new Set(royaltyPayableInvoices.map(i => i.customerId)).size;
    
    const loanReceivableInvoices = invoices.filter(i => i.type === 'INTEREST' && i.status === 'UNPAID' && i.direction === 'IN');
    const loanReceivable = loanReceivableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const loanReceivableCount = new Set(loanReceivableInvoices.map(i => i.customerId)).size;
    
    const loanPayableInvoices = invoices.filter(i => i.type === 'INTEREST_OUT' && i.status === 'UNPAID' && i.direction === 'OUT');
    const loanPayable = loanPayableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const loanPayableCount = new Set(loanPayableInvoices.map(i => i.customerId)).size;
    
    const chitReceivableInvoices = invoices.filter(i => i.type === 'CHIT' && i.status === 'UNPAID' && i.direction === 'IN');
    const chitReceivable = chitReceivableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const chitReceivableCount = new Set(chitReceivableInvoices.map(i => i.customerId)).size;
    
    const chitPayableInvoices = invoices.filter(i => i.type === 'CHIT' && i.status === 'UNPAID' && i.direction === 'OUT');
    const chitPayable = chitPayableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const chitPayableCount = new Set(chitPayableInvoices.map(i => i.customerId)).size;
    
    const generalReceivableInvoices = invoices.filter(i => !['ROYALTY', 'INTEREST', 'CHIT'].includes(i.type) && i.status === 'UNPAID' && i.direction === 'IN');
    const generalReceivable = generalReceivableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const generalReceivableCount = new Set(generalReceivableInvoices.map(i => i.customerId)).size;
    
    const generalPayableInvoices = invoices.filter(i => !['ROYALTY', 'INTEREST_OUT', 'CHIT'].includes(i.type) && i.status === 'UNPAID' && i.direction === 'OUT');
    const generalPayable = generalPayableInvoices.reduce((acc, i) => acc + i.balance, 0);
    const generalPayableCount = new Set(generalPayableInvoices.map(i => i.customerId)).size;

    return { 
      royaltyCount, royaltyValue, interestCount, interestYield, netWorth,
      royaltyReceivable, royaltyReceivableCount, royaltyPayable, royaltyPayableCount,
      loanReceivable, loanReceivableCount, loanPayable, loanPayableCount,
      chitReceivable, chitReceivableCount, chitPayable, chitPayableCount,
      generalReceivable, generalReceivableCount, generalPayable, generalPayableCount
    };
  }, [customers, stats, invoices]);

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
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* PAGE TITLE */}
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Overview</h1>
            <p className="text-sm font-medium text-slate-400">Financial Snapshot & Key Metrics</p>
         </div>
         <div className="flex items-center gap-3">
            {/* Wallet Balance Dropdown */}
            <div className="relative">
               <button 
                  onClick={() => setShowBalances(!showBalances)}
                  className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors shadow-sm"
                  title="Quick Balances"
               >
                  <i className="fas fa-wallet text-sm"></i>
               </button>
               
               {showBalances && (
                  <>
                     <div className="fixed inset-0 z-10" onClick={() => setShowBalances(false)} />
                     <div className="absolute top-0 right-12 bg-white rounded-xl shadow-2xl border border-slate-200 z-20">
                        <div className="flex items-stretch gap-2 p-2">
                           {/* Cash Drawer */}
                           <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg px-3 py-2 border border-emerald-200 min-w-[120px]">
                              <div className="flex items-center gap-1.5 mb-1">
                                 <i className="fas fa-cash-register text-emerald-600 text-xs"></i>
                                 <div className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Cash</div>
                              </div>
                              <div className="text-sm font-black text-emerald-800">₹{openingBalances.CASH.toLocaleString()}</div>
                           </div>
                           
                           {/* Bank Accounts */}
                           {bankAccounts.filter(b => b.status === 'ACTIVE').map((bank) => (
                              <div key={bank.id} className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-3 py-2 border border-blue-200 min-w-[120px]">
                                 <div className="flex items-center gap-1.5 mb-1">
                                    <i className="fas fa-building-columns text-blue-600 text-xs"></i>
                                    <div className="text-[9px] font-black text-blue-600 uppercase tracking-wider">{bank.name}</div>
                                 </div>
                                 <div className="text-sm font-black text-blue-800">₹{bank.openingBalance.toLocaleString()}</div>
                              </div>
                           ))}
                           
                           {/* Total Bank Balance */}
                           <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg px-3 py-2 border-2 border-indigo-300 min-w-[120px]">
                              <div className="flex items-center gap-1.5 mb-1">
                                 <i className="fas fa-chart-line text-indigo-600 text-xs"></i>
                                 <div className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">Total</div>
                              </div>
                              <div className="text-sm font-black text-indigo-900">₹{totalBankBalance.toLocaleString()}</div>
                           </div>
                        </div>
                     </div>
                  </>
               )}
            </div>
            
            <div className="hidden md:flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Live Data</span>
            </div>
         </div>
      </div>

      {/* BENTO GRID LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(140px,auto)]">
        
        {/* 1. Outstanding Balances - Receivables & Payables Breakdown (Wide) */}
        <div className="md:col-span-4 bg-white rounded-[2rem] p-8 shadow-soft border border-white/50">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800">Outstanding Balances</h3>
              <div className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">By Category</div>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* ROYALTY */}
              <div className="space-y-2">
                <div onClick={() => navigate('/reports/outstanding?filter=royalty&tab=receivables')} className="p-3 bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-blue-400 uppercase mb-1 tracking-wider">ROYALTY</div>
                   <div className="text-sm sm:text-base font-bold text-blue-900 whitespace-nowrap">
                     {formatCurrency(projections.royaltyReceivable)}
                     {projections.royaltyReceivableCount > 0 && (
                       <span className="text-xs text-blue-500 ml-1">/ {projections.royaltyReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-blue-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=royalty&tab=payables')} className="p-3 bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-blue-900 whitespace-nowrap">
                     {formatCurrency(projections.royaltyPayable)}
                     {projections.royaltyPayableCount > 0 && (
                       <span className="text-xs text-blue-500 ml-1">/ {projections.royaltyPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-blue-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* LOAN */}
              <div className="space-y-2">
                <div onClick={() => navigate('/reports/outstanding?filter=interest&tab=receivables')} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">LOAN</div>
                   <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">
                     {formatCurrency(projections.loanReceivable)}
                     {projections.loanReceivableCount > 0 && (
                       <span className="text-xs text-slate-500 ml-1">/ {projections.loanReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?tab=payables')} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">
                     {formatCurrency(projections.loanPayable)}
                     {projections.loanPayableCount > 0 && (
                       <span className="text-xs text-slate-500 ml-1">/ {projections.loanPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-slate-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* CHIT */}
              <div className="space-y-2">
                <div onClick={() => navigate('/reports/outstanding?filter=chit&tab=receivables')} className="p-3 bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-orange-400 uppercase mb-1 tracking-wider">CHIT</div>
                   <div className="text-sm sm:text-base font-bold text-orange-900 whitespace-nowrap">
                     {formatCurrency(projections.chitReceivable)}
                     {projections.chitReceivableCount > 0 && (
                       <span className="text-xs text-orange-500 ml-1">/ {projections.chitReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-orange-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=chit&tab=payables')} className="p-3 bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-orange-900 whitespace-nowrap">
                     {formatCurrency(projections.chitPayable)}
                     {projections.chitPayableCount > 0 && (
                       <span className="text-xs text-orange-500 ml-1">/ {projections.chitPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-orange-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* GENERAL */}
              <div className="space-y-2">
                <div onClick={() => navigate('/reports/outstanding?filter=general&tab=receivables')} className="p-3 bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-amber-500 uppercase mb-1 tracking-wider">OTHER</div>
                   <div className="text-sm sm:text-base font-bold text-amber-900 whitespace-nowrap">
                     {formatCurrency(projections.generalReceivable)}
                     {projections.generalReceivableCount > 0 && (
                       <span className="text-xs text-amber-500 ml-1">/ {projections.generalReceivableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-amber-500 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/reports/outstanding?filter=general&tab=payables')} className="p-3 bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-amber-900 whitespace-nowrap">
                     {formatCurrency(projections.generalPayable)}
                     {projections.generalPayableCount > 0 && (
                       <span className="text-xs text-amber-500 ml-1">/ {projections.generalPayableCount}</span>
                     )}
                   </div>
                   <div className="text-[9px] text-amber-500 uppercase tracking-widest">Payable</div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        
        {/* Expense Breakdown Chart */}
        <div className="bg-white rounded-[2rem] p-8 shadow-soft border border-white/50 relative">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-800">Expense Breakdown</h3>
            <p className="text-xs text-slate-500 mt-1">Total expenses by category</p>
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
                    formatter={(value: number) => `₹${value.toLocaleString()}`}
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
        <div className="bg-white rounded-[2rem] p-8 shadow-soft border border-white/50 relative">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-800">Income Breakdown</h3>
            <p className="text-xs text-slate-500 mt-1">Revenue from business units & direct income</p>
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
                    formatter={(value: number) => `₹${value.toLocaleString()}`}
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
