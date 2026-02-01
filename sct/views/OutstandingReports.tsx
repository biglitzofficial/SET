
import React, { useState, useMemo } from 'react';
import { Customer, Invoice, Liability, Payment } from '../types';

interface OutstandingReportsProps {
  customers: Customer[];
  invoices: Invoice[];
  liabilities: Liability[];
  payments: Payment[]; // Added to calculate true ledger balance
  onDrillDown: (id: string, type: 'CUSTOMER' | 'LENDER') => void;
}

const OutstandingReports: React.FC<OutstandingReportsProps> = ({ customers, invoices, liabilities, payments, onDrillDown }) => {
  const [activeTab, setActiveTab] = useState<'RECEIVABLES' | 'PAYABLES' | 'ADVANCES' | 'MARKET_CAPITAL'>('RECEIVABLES');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [receivableFilter, setReceivableFilter] = useState<'ALL' | 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL'>('ALL');

  const customerAnalysis = useMemo(() => {
    return customers.map(cust => {
      // Filter Transactions for this customer
      const custInvoices = invoices.filter(inv => inv.customerId === cust.id && !inv.isVoid);
      const custPayments = payments.filter(p => p.sourceId === cust.id);

      // --- LEDGER BALANCE CALCULATION ---
      // Receivables (Debits)
      const opening = (cust.openingBalance || 0); // Can be + (dr) or - (cr)
      const totalInvoicesAmount = custInvoices.filter(i => i.direction === 'IN').reduce((sum, i) => sum + i.amount, 0);
      const paymentsOut = custPayments.filter(p => p.type === 'OUT').reduce((sum, p) => sum + p.amount, 0); // We paid them (Debit)

      // Payables (Credits)
      const totalPayableInvoices = custInvoices.filter(i => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0);
      const paymentsIn = custPayments.filter(p => p.type === 'IN').reduce((sum, p) => sum + p.amount, 0); // They paid us (Credit)

      // Net Ledger Balance: (Opening + InvoicesIN + PaymentsOUT) - (InvoicesOUT + PaymentsIN)
      // Positive = Receivable (Debit Balance)
      // Negative = Payable (Credit Balance)
      const netLedgerBalance = (opening + totalInvoicesAmount + paymentsOut) - (totalPayableInvoices + paymentsIn);

      // --- BREAKDOWN APPROXIMATION (Waterfall or Specific) ---
      // Since payments might be generic, we calculate "Due" based on invoice balance for specific categories,
      // but then adjust GENERAL to absorb the unallocated payments to match the Ledger Balance.
      
      const specificDue = {
        ROYALTY: custInvoices.filter(i => i.type === 'ROYALTY').reduce((s, i) => s + i.balance, 0),
        INTEREST: custInvoices.filter(i => i.type === 'INTEREST').reduce((s, i) => s + i.balance, 0),
        CHIT: custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((s, i) => s + i.balance, 0)
      };

      // To ensure Total matches Net Ledger Balance, GENERAL is the plug.
      // General = NetLedgerBalance - (Royalty + Interest + Chit)
      // This implicitly allocates any excess payment to General/Advance.
      const generalDue = netLedgerBalance - (specificDue.ROYALTY + specificDue.INTEREST + specificDue.CHIT);

      const breakdown = {
        ...specificDue,
        GENERAL: generalDue
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
       // Filter based on Category if selected
       result = customerAnalysis
         .map(c => {
            let displayAmount = 0;
            if (receivableFilter === 'ALL') displayAmount = c.netLedgerBalance;
            else displayAmount = c.breakdown[receivableFilter];
            
            return { ...c, displayAmount };
         })
         .filter(c => c.displayAmount > 0); // Only positive receivables
    }
    else if (activeTab === 'ADVANCES') {
       // Advances are negative outstanding (Payables to customers or Overpayment)
       result = customerAnalysis
         .map(c => ({ ...c, displayAmount: c.netLedgerBalance }))
         .filter(c => c.displayAmount < 0);
    }
    else if (activeTab === 'MARKET_CAPITAL') {
       result = customers
         .filter(c => c.isInterest && c.interestPrincipal > 0)
         .map(c => ({ ...c, displayAmount: c.interestPrincipal }));
    }
    else {
       // PAYABLES: Lenders + Customers who are strictly Creditors (via Net Balance check above covers Advances, but this tab is for Dept/Liability list)
       // We include Lenders here.
       const lenders = liabilities
         .filter(l => l.principal > 0)
         .map(l => ({ ...l, displayAmount: l.principal }));
       
       // Also include customers who are flagged as Creditors (Lenders) explicitly, using their creditPrincipal
       // Note: The NetLedgerBalance check above (Advances) covers "Trade Payables" (e.g. Overpayment or Chit Prize).
       // This PAYABLES tab covers "Debt" (Principal Borrowed).
       const customerCreditors = customers
         .filter(c => c.isLender && c.creditPrincipal > 0)
         .map(c => ({ ...c, displayAmount: c.creditPrincipal, name: `${c.name} (Lender)` }));

       result = [...lenders, ...customerCreditors];
    }

    // Dynamic Sort
    return result.sort((a, b) => {
       const valA = Math.abs(a.displayAmount);
       const valB = Math.abs(b.displayAmount);
       return sortOrder === 'DESC' ? valB - valA : valA - valB;
    });
  }, [activeTab, customerAnalysis, customers, liabilities, sortOrder, receivableFilter]);

  const grandTotal = useMemo(() => data.reduce((acc, item) => acc + (Math.abs(item.displayAmount || 0)), 0), [data]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
          {['RECEIVABLES', 'MARKET_CAPITAL', 'ADVANCES', 'PAYABLES'].map(tab => (
            <button 
              key={tab} 
              onClick={() => { setActiveTab(tab as any); setReceivableFilter('ALL'); }} 
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
           {activeTab === 'RECEIVABLES' && (
             <select 
               className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 uppercase tracking-widest outline-none focus:border-indigo-500"
               value={receivableFilter}
               onChange={(e) => setReceivableFilter(e.target.value as any)}
             >
                <option value="ALL">All Categories</option>
                <option value="ROYALTY">Royalty Only</option>
                <option value="INTEREST">Interest Only</option>
                <option value="CHIT">Chit Fund Only</option>
                <option value="GENERAL">General Trade</option>
             </select>
           )}

           <button 
              onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
              className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 flex items-center gap-2"
           >
              <i className={`fas fa-sort-amount-${sortOrder === 'ASC' ? 'up' : 'down'}`}></i>
              {sortOrder === 'ASC' ? 'Low-High' : 'High-Low'}
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-lg overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-dark-900 text-white">
            <tr>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Account Name</th>
              {activeTab === 'RECEIVABLES' && <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Category</th>}
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80 cursor-pointer hover:text-yellow-400 transition" onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}>
                 {activeTab === 'RECEIVABLES' && receivableFilter !== 'ALL' ? `${receivableFilter} Due` : 'Net Outstanding'} <i className={`fas fa-sort ml-1 opacity-50`}></i>
              </th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {data.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-5 text-sm font-bold text-slate-800 uppercase">
                   {item.name || item.providerName}
                   <div className="text-[9px] text-slate-400 font-bold">{item.phone}</div>
                </td>
                {activeTab === 'RECEIVABLES' && (
                   <td className="px-6 py-5">
                      <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                         receivableFilter !== 'ALL' 
                           ? 'bg-slate-100 text-slate-600'
                           : 'bg-indigo-50 text-indigo-600'
                      }`}>
                         {receivableFilter === 'ALL' ? 'CONSOLIDATED' : receivableFilter}
                      </span>
                   </td>
                )}
                <td className="px-6 py-5 text-right text-sm font-display font-black text-slate-900 italic">
                  ₹{Math.abs(item.displayAmount).toLocaleString()}
                </td>
                <td className="px-6 py-5 text-right">
                  <button 
                    onClick={() => onDrillDown(item.id, activeTab === 'PAYABLES' && !item.partyType ? 'LENDER' : 'CUSTOMER')} 
                    className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition"
                  >
                    View Ledger
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={activeTab === 'RECEIVABLES' ? 4 : 3} className="px-6 py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No outstanding records found</td></tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-100">
             <tr>
                <td colSpan={activeTab === 'RECEIVABLES' ? 2 : 1} className="px-6 py-5 text-left text-xs font-black uppercase tracking-widest text-slate-500">Total Outstanding</td>
                <td className="px-6 py-5 text-right text-lg font-display font-black text-slate-900">₹{grandTotal.toLocaleString()}</td>
                <td></td>
             </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default OutstandingReports;
