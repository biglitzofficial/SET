
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats, Invoice, Payment, UserRole, Customer } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  stats: DashboardStats;
  invoices: Invoice[];
  payments: Payment[];
  role: UserRole;
  setRole: React.Dispatch<React.SetStateAction<UserRole>>;
  customers: Customer[];
}

const Dashboard: React.FC<DashboardProps> = ({ stats, customers, role, invoices }) => {
  const navigate = useNavigate();
  const formatCurrency = (val: number) => `${Math.abs(val || 0).toFixed(2)} INR`;

  // --- Real-time Projections ---
  const projections = useMemo(() => {
    const royaltyCount = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE').length;
    const royaltyValue = customers.reduce((acc, c) => acc + (c.isRoyalty && c.status === 'ACTIVE' ? c.royaltyAmount : 0), 0);
    
    const interestCount = customers.filter(c => c.isInterest && c.status === 'ACTIVE').length;
    const interestYield = customers.reduce((acc, c) => acc + (c.isInterest && c.status === 'ACTIVE' ? (c.interestPrincipal * (c.interestRate / 100)) : 0), 0);

    const totalAssets = stats.cashInHand + stats.bankCUB + stats.bankKVB + stats.receivableOutstanding + stats.totalInvestments;
    const netWorth = totalAssets - stats.payableOutstanding;

    // Calculate category-wise receivables and payables
    const royaltyReceivable = invoices.filter(i => i.type === 'ROYALTY' && i.status === 'UNPAID' && i.direction === 'IN').reduce((acc, i) => acc + i.balance, 0);
    const royaltyPayable = invoices.filter(i => i.type === 'ROYALTY' && i.status === 'UNPAID' && i.direction === 'OUT').reduce((acc, i) => acc + i.balance, 0);
    
    const loanReceivable = invoices.filter(i => i.type === 'INTEREST' && i.status === 'UNPAID' && i.direction === 'IN').reduce((acc, i) => acc + i.balance, 0);
    const loanPayable = invoices.filter(i => i.type === 'INTEREST_OUT' && i.status === 'UNPAID' && i.direction === 'OUT').reduce((acc, i) => acc + i.balance, 0);
    
    const chitReceivable = invoices.filter(i => i.type === 'CHIT' && i.status === 'UNPAID' && i.direction === 'IN').reduce((acc, i) => acc + i.balance, 0);
    const chitPayable = invoices.filter(i => i.type === 'CHIT' && i.status === 'UNPAID' && i.direction === 'OUT').reduce((acc, i) => acc + i.balance, 0);
    
    const generalReceivable = invoices.filter(i => !['ROYALTY', 'INTEREST', 'CHIT'].includes(i.type) && i.status === 'UNPAID' && i.direction === 'IN').reduce((acc, i) => acc + i.balance, 0);
    const generalPayable = invoices.filter(i => !['ROYALTY', 'INTEREST_OUT', 'CHIT'].includes(i.type) && i.status === 'UNPAID' && i.direction === 'OUT').reduce((acc, i) => acc + i.balance, 0);

    return { 
      royaltyCount, royaltyValue, interestCount, interestYield, netWorth,
      royaltyReceivable, royaltyPayable, loanReceivable, loanPayable,
      chitReceivable, chitPayable, generalReceivable, generalPayable
    };
  }, [customers, stats, invoices]);

  // --- Chart Data ---
  const chartData = useMemo(() => {
    const savings = Math.max(0, stats.netProfitMonth);
    const expenses = stats.expensesMonth;
    
    const data = [
      { name: 'Expense', value: expenses, color: '#F43F5E' }, // Rose
      { name: 'Retained', value: savings, color: '#10B981' },   // Emerald
    ];

    return data.filter(d => d.value > 0);
  }, [stats]);

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* PAGE TITLE */}
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Overview</h1>
            <p className="text-sm font-medium text-slate-400">Financial Snapshot & Key Metrics</p>
         </div>
         <div className="hidden md:flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Live Data</span>
         </div>
      </div>

      {/* BENTO GRID LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(140px,auto)]">
        
        {/* 1. Net Worth (Big Card) */}
        <div className="md:col-span-2 bg-brand-950 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl flex flex-col justify-center">
           <div className="absolute right-0 bottom-0 w-64 h-64 bg-brand-600 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
           <div className="relative z-10">
              <div className="text-xs font-bold text-brand-200 uppercase tracking-widest mb-2">Net Business Equity</div>
              <div className="text-5xl font-bold tracking-tighter mb-4">{formatCurrency(projections.netWorth)}</div>
              <div className="flex gap-4">
                 <div className="px-3 py-1 bg-white/10 rounded-lg text-[10px] font-medium backdrop-blur-md">
                    Assets: {formatCurrency(stats.cashInHand + stats.bankCUB + stats.bankKVB + stats.receivableOutstanding + stats.totalInvestments)}
                 </div>
                 <div className="px-3 py-1 bg-rose-500/20 text-rose-200 rounded-lg text-[10px] font-medium backdrop-blur-md">
                    Liab: {formatCurrency(stats.payableOutstanding)}
                 </div>
              </div>
           </div>
        </div>

        {/* 2. Cash on Hand */}
        <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-white/50 flex flex-col justify-between group hover:border-brand-200 transition-colors">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                 <i className="fas fa-wallet"></i>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Physical</span>
           </div>
           <div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(stats.cashInHand)}</div>
              <div className="text-[11px] font-medium text-slate-400">Cash Drawer</div>
           </div>
        </div>

        {/* 3. Bank 1 (CUB) */}
        <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-white/50 flex flex-col justify-between group hover:border-brand-200 transition-colors">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                 <i className="fas fa-building-columns"></i>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Primary</span>
           </div>
           <div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(stats.bankCUB)}</div>
              <div className="text-[11px] font-medium text-slate-400">CUB Account</div>
           </div>
        </div>

        {/* 4. Monthly Performance (Wide) */}
        <div className="md:col-span-4 bg-white rounded-[2rem] p-8 shadow-soft border border-white/50">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800">Monthly Performance</h3>
              <div className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">Current Month</div>
           </div>
           <div className="flex gap-4 w-full">
              <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                 <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Royalty</div>
                 <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">{formatCurrency(stats.royaltyIncomeMonth)}</div>
              </div>
              <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                 <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Interest</div>
                 <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">{formatCurrency(stats.interestIncomeMonth)}</div>
              </div>
              <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                 <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Chits</div>
                 <div className="text-sm sm:text-base font-bold text-amber-500 whitespace-nowrap">{formatCurrency(stats.chitIncomeMonth)}</div>
              </div>
              <div className="flex-1 p-3 bg-rose-50 rounded-2xl border border-rose-100 overflow-hidden">
                 <div className="text-[10px] font-bold text-rose-400 uppercase mb-1 tracking-wider">Expenses</div>
                 <div className="text-sm sm:text-base font-bold text-rose-600 whitespace-nowrap">{formatCurrency(stats.expensesMonth)}</div>
              </div>
           </div>
        </div>

        {/* 4.5. Receivables & Payables Breakdown (Wide) */}
        <div className="md:col-span-4 bg-white rounded-[2rem] p-8 shadow-soft border border-white/50">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800">Outstanding Balances</h3>
              <div className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">By Category</div>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* ROYALTY */}
              <div className="space-y-2">
                <div onClick={() => navigate('/customers?filter=royalty')} className="p-3 bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-blue-400 uppercase mb-1 tracking-wider">ROYALTY</div>
                   <div className="text-sm sm:text-base font-bold text-blue-900 whitespace-nowrap">{formatCurrency(projections.royaltyReceivable)}</div>
                   <div className="text-[9px] text-blue-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/customers?filter=royalty')} className="p-3 bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-blue-900 whitespace-nowrap">{formatCurrency(projections.royaltyPayable)}</div>
                   <div className="text-[9px] text-blue-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* LOAN */}
              <div className="space-y-2">
                <div onClick={() => navigate('/customers?filter=interest')} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">LOAN</div>
                   <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">{formatCurrency(projections.loanReceivable)}</div>
                   <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/customers?filter=creditor')} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">{formatCurrency(projections.loanPayable)}</div>
                   <div className="text-[9px] text-slate-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* CHIT */}
              <div className="space-y-2">
                <div onClick={() => navigate('/customers?filter=chit')} className="p-3 bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-orange-400 uppercase mb-1 tracking-wider">CHIT</div>
                   <div className="text-sm sm:text-base font-bold text-orange-900 whitespace-nowrap">{formatCurrency(projections.chitReceivable)}</div>
                   <div className="text-[9px] text-orange-400 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/customers?filter=chit')} className="p-3 bg-orange-50 rounded-2xl border border-orange-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-orange-900 whitespace-nowrap">{formatCurrency(projections.chitPayable)}</div>
                   <div className="text-[9px] text-orange-400 uppercase tracking-widest">Payable</div>
                </div>
              </div>

              {/* GENERAL */}
              <div className="space-y-2">
                <div onClick={() => navigate('/customers?filter=general')} className="p-3 bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-[10px] font-bold text-amber-500 uppercase mb-1 tracking-wider">OTHER</div>
                   <div className="text-sm sm:text-base font-bold text-amber-900 whitespace-nowrap">{formatCurrency(projections.generalReceivable)}</div>
                   <div className="text-[9px] text-amber-500 uppercase tracking-widest mt-0.5">Receivable</div>
                </div>
                <div onClick={() => navigate('/customers?filter=general')} className="p-3 bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200">
                   <div className="text-sm sm:text-base font-bold text-amber-900 whitespace-nowrap">{formatCurrency(projections.generalPayable)}</div>
                   <div className="text-[9px] text-amber-500 uppercase tracking-widest">Payable</div>
                </div>
              </div>
           </div>
        </div>

        {/* 5. Projected Royalty */}
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-[2rem] p-6 shadow-glow text-white flex flex-col justify-between">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                 <i className="fas fa-crown"></i>
              </div>
           </div>
           <div>
              <div className="text-[10px] font-bold text-brand-100 uppercase tracking-widest mb-1">Projected Royalty</div>
              <div className="text-2xl font-bold tracking-tight">{formatCurrency(projections.royaltyValue)}</div>
              <div className="text-[10px] text-brand-100 mt-1">{projections.royaltyCount} Accounts</div>
           </div>
        </div>

        {/* 6. Interest Yield */}
        <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-white/50 flex flex-col justify-between">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                 <i className="fas fa-percent"></i>
              </div>
           </div>
           <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Interest Yield</div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(projections.interestYield)}</div>
              <div className="text-[10px] text-slate-400 mt-1">{projections.interestCount} Portfolios</div>
           </div>
        </div>

        {/* 7. Composition Chart */}
        <div className="md:col-span-2 md:row-span-2 bg-white rounded-[2rem] p-8 shadow-soft border border-white/50 flex flex-col items-center justify-center relative">
           <h3 className="absolute top-8 left-8 font-bold text-slate-800">Cash Flow Composition</h3>
           <div className="w-full h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                       data={chartData}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={80}
                       paddingAngle={5}
                       dataKey="value"
                       stroke="none"
                    >
                       {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} 
                       itemStyle={{ fontSize: '12px', fontWeight: '600' }}
                       formatter={(value: number) => `₹${value.toLocaleString()}`}
                    />
                    <Legend 
                       verticalAlign="bottom" 
                       height={36} 
                       iconType="circle" 
                       wrapperStyle={{ fontSize: '12px', fontWeight: '500', color: '#64748B' }}
                    />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           {chartData.length === 0 && <div className="text-xs font-medium text-slate-400">No data available</div>}
        </div>

        {/* 8. Bank 2 (KVB) */}
        <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-white/50 flex flex-col justify-between">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                 <i className="fas fa-landmark"></i>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Capital</span>
           </div>
           <div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(stats.bankKVB)}</div>
              <div className="text-[11px] font-medium text-slate-400">KVB Account</div>
           </div>
        </div>

        {/* 9. Total Investments */}
        <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-white/50 flex flex-col justify-between">
           <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                 <i className="fas fa-coins"></i>
              </div>
           </div>
           <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Asset Value</div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(stats.totalInvestments)}</div>
              <div className="text-[11px] font-medium text-slate-400">Gold, LIC, Chits</div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
