
import React, { useMemo } from 'react';
import { Payment } from '../types';

interface BusinessPerformanceProps {
  payments: Payment[];
  otherBusinesses: string[];
}

const BusinessPerformance: React.FC<BusinessPerformanceProps> = ({ payments, otherBusinesses }) => {
  const performanceData = useMemo(() => {
    return otherBusinesses.map(biz => {
      const bizPayments = payments.filter(p => p.businessUnit === biz);
      
      const income = bizPayments
        .filter(p => p.type === 'IN')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const expense = bizPayments
        .filter(p => p.type === 'OUT')
        .reduce((acc, p) => acc + p.amount, 0);
        
      const net = income - expense;
      const margin = income > 0 ? (net / income) * 100 : 0;
      
      return { name: biz, income, expense, net, margin };
    });
  }, [payments, otherBusinesses]);

  const grandTotals = useMemo(() => {
    return performanceData.reduce((acc, d) => ({
      income: acc.income + d.income,
      expense: acc.expense + d.expense,
      net: acc.net + d.net
    }), { income: 0, expense: 0, net: 0 });
  }, [performanceData]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <header className="flex justify-between items-end border-b-2 border-slate-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Business Unit Matrix</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consolidated FITO6 & FITOBOWL Analytics</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Revenue</div>
           <div className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums italic">₹{grandTotals.income.toLocaleString()}</div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Combined Unit Expenses</div>
           <div className="text-3xl font-black text-rose-500 tracking-tighter tabular-nums italic">₹{grandTotals.expense.toLocaleString()}</div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
           <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Unit Net Profit</div>
           <div className="text-3xl font-black text-amber-400 tracking-tighter tabular-nums italic">₹{grandTotals.net.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {performanceData.map(biz => (
          <div key={biz.name} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group hover:border-indigo-200 transition-all transform hover:-translate-y-2">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div className="h-14 w-14 rounded-3xl flex items-center justify-center shadow-lg bg-indigo-50 text-indigo-500">
                  <i className="fas fa-building-circle-check text-2xl"></i>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${biz.margin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {biz.margin.toFixed(1)}% Margin
                </div>
              </div>
              
              <h3 className="font-black text-slate-800 text-xl uppercase leading-none mb-6 italic tracking-tighter">{biz.name}</h3>
              
              <div className="space-y-4">
                 <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-slate-400 uppercase tracking-widest">Total Income</span>
                    <span className="font-black text-emerald-600">₹{biz.income.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-slate-400 uppercase tracking-widest">Total Expense</span>
                    <span className="font-black text-rose-500">₹{biz.expense.toLocaleString()}</span>
                 </div>
                 <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-900 uppercase">Operating Profit</span>
                    <span className={`text-xl font-black italic tracking-tighter ${biz.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>₹{biz.net.toLocaleString()}</span>
                 </div>
              </div>
            </div>
            
            <div className="mt-auto bg-slate-50 p-4">
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${biz.net >= 0 ? 'bg-indigo-500' : 'bg-rose-500'}`} 
                  style={{ width: `${Math.min(100, Math.max(10, (biz.income / (grandTotals.income || 1)) * 100))}%` }}
                ></div>
              </div>
              <div className="text-[8px] font-bold text-slate-400 mt-2 uppercase text-center">Share of Combined Revenue</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BusinessPerformance;
