
import React, { useState, useMemo, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Payment, Invoice, Customer, Liability, DashboardStats, UserRole, AuditLog, Investment, BankAccount, ChitGroup } from '../types';
import ReportList from './ReportList';
import GeneralLedger from './GeneralLedger';
import OutstandingReports from './OutstandingReports';
import BusinessPerformance from './BusinessPerformance';
import ExpenseLedger from './ExpenseLedger';
import IncomeLedger from './IncomeLedger';

interface ReportCenterProps {
  payments: Payment[];
  invoices: Invoice[];
  customers: Customer[];
  liabilities: Liability[];
  stats: DashboardStats;
  role: UserRole;
  auditLogs: AuditLog[];
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  otherBusinesses: string[];
  investments: Investment[];
  bankAccounts?: BankAccount[];
  chitGroups: ChitGroup[];
}

// Internal Component: Ledger Browser
const AccountLedgerHub = ({ customers, liabilities, invoices, payments }: any) => {
  const location = useLocation();
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  
  // New State: View Scope (Combined vs Separate)
  const [viewScope, setViewScope] = useState<'COMBINED' | 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL'>('COMBINED');

  // Handle auto-selection from navigation state
  useEffect(() => {
    if (location.state && location.state.selectedId) {
      setSelectedPartyId(location.state.selectedId);
    }
  }, [location.state]);

  // Reset view scope when party changes
  useEffect(() => {
    setViewScope('COMBINED');
  }, [selectedPartyId]);

  const filteredParties = useMemo(() => {
    // Combine Customers and Lenders into one sorted list
    const custs = customers.map((c: any) => ({ 
        id: c.id, 
        name: c.name, 
        type: 'CUSTOMER', 
        label: `${c.name}`,
        raw: c 
    }));
    
    const lends = liabilities.map((l: any) => ({ 
        id: l.id, 
        name: l.providerName, 
        type: 'LENDER', 
        label: `${l.providerName} (Lender)`,
        raw: l 
    }));

    return [...custs, ...lends].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, liabilities]);

  const selectedPartyData = useMemo(() => {
     return filteredParties.find(p => p.id === selectedPartyId);
  }, [filteredParties, selectedPartyId]);

  const ledgerData = useMemo(() => {
    if (!selectedPartyData) return null;
    const party = selectedPartyData;

    let entries: any[] = [];
    let opening = 0;

    if (party.type === 'CUSTOMER') {
      const cust = customers.find((c: any) => c.id === party.id);
      
      // --- OPENING BALANCE LOGIC BASED ON VIEW SCOPE ---
      if (viewScope === 'COMBINED') {
         // Interest Principal (Asset) + General Opening (Receivable/Payable) - Credit Principal (Liability)
         opening = (cust?.interestPrincipal || 0) + (cust?.openingBalance || 0) - (cust?.creditPrincipal || 0);
      } else if (viewScope === 'INTEREST') {
         opening = cust?.interestPrincipal || 0;
      } else if (viewScope === 'GENERAL') {
         opening = cust?.openingBalance || 0;
      } else {
         opening = 0;
      }

      // --- FILTER INVOICES ---
      const relevantInvoices = invoices.filter((i: any) => {
         if (i.customerId !== party.id || i.isVoid) return false;
         if (viewScope === 'COMBINED') return true;
         return i.type === viewScope; 
      });

      // --- FILTER PAYMENTS ---
      const relevantPayments = payments.filter((p: any) => {
         if (p.sourceId !== party.id) return false;
         if (viewScope === 'COMBINED') return true;
         
         // Strict Category Matching
         if (viewScope === 'ROYALTY') return p.category === 'ROYALTY';
         if (viewScope === 'INTEREST') return p.category === 'INTEREST' || p.category === 'PRINCIPAL_RECOVERY';
         if (viewScope === 'CHIT') return p.category === 'CHIT' || p.category === 'CHIT_FUND';
         if (viewScope === 'GENERAL') return p.category === 'GENERAL' || p.category === 'CUSTOMER_PAYMENT';
         return false;
      });

      entries = [
        ...relevantInvoices.map((i: any) => ({
          date: i.date, 
          ref: i.invoiceNumber, 
          desc: `${i.type} BILLING ${i.direction === 'OUT' ? '(PAYOUT)' : ''}`,
          // FIX: If direction is OUT (Payable), it goes to CR (Credit). If IN (Receivable), it goes to DR (Debit).
          dr: i.direction === 'OUT' ? 0 : i.amount, 
          cr: i.direction === 'OUT' ? i.amount : 0, 
          type: 'INVOICE'
        })),
        ...relevantPayments.map((p: any) => ({
          date: p.date, 
          ref: p.voucherType, 
          desc: p.category, 
          dr: p.type === 'OUT' ? p.amount : 0, // We paid them -> Debit their account (reduces liability/increases debt)
          cr: p.type === 'IN' ? p.amount : 0,  // We received -> Credit their account (reduces asset)
          type: 'PAYMENT'
        }))
      ];

    } else {
      // LENDER LOGIC
      const lender = liabilities.find((l: any) => l.id === party.id);
      opening = -(lender?.principal || 0); // Liability is negative in this context (Credit Balance)
      
      entries = [
        ...invoices.filter((i: any) => i.lenderId === party.id && !i.isVoid).map((i: any) => ({
           date: i.date, ref: i.invoiceNumber, desc: 'INTEREST ACCRUAL', dr: 0, cr: i.amount, type: 'INVOICE'
        })),
        ...payments.filter((p: any) => p.sourceId === party.id).map((p: any) => ({
          date: p.date, ref: p.voucherType, desc: p.category, dr: p.type === 'OUT' ? p.amount : 0, cr: p.type === 'IN' ? p.amount : 0, type: 'PAYMENT'
        }))
      ];
    }

    entries.sort((a, b) => a.date - b.date);
    
    // Calculate Running Balance
    let running = opening;
    const rows = entries.map(e => { 
       running += (e.dr - e.cr); 
       return { ...e, balance: running }; 
    });

    return { party, opening, rows, closing: running };
  }, [selectedPartyData, customers, liabilities, invoices, payments, viewScope]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Search Bar - Hidden when printing */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 print:hidden">
        <div className="w-full">
           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Account Holder</label>
           <select className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={selectedPartyId} onChange={e => setSelectedPartyId(e.target.value)}>
              <option value="">-- Choose Account --</option>
              {filteredParties.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
           </select>
        </div>
      </div>

      {ledgerData ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden print:shadow-none print:border-none print:rounded-none">
          
          <div className="px-8 py-8 border-b border-slate-100 bg-slate-50 print:bg-white print:px-0">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                   <h3 className="text-2xl font-display font-black text-slate-900 uppercase italic tracking-tighter">{ledgerData.party.name}</h3>
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Statement of Account • {viewScope} View</span>
                </div>
                <div className="text-right print:hidden">
                   <button 
                     onClick={handlePrint}
                     className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 ml-auto"
                   >
                     <i className="fas fa-print"></i> Print / Save PDF
                   </button>
                </div>
             </div>

             {/* DYNAMIC VIEW SWITCHER - Hidden on Print */}
             {ledgerData.party.type === 'CUSTOMER' && (
                <div className="mt-8 flex flex-wrap gap-2 print:hidden">
                   <button 
                      onClick={() => setViewScope('COMBINED')} 
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === 'COMBINED' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                   >
                      Combined Ledger
                   </button>
                   
                   {ledgerData.party.raw.isRoyalty && (
                      <button 
                         onClick={() => setViewScope('ROYALTY')} 
                         className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === 'ROYALTY' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-purple-200 hover:text-purple-500'}`}
                      >
                         Royalty
                      </button>
                   )}
                   {ledgerData.party.raw.isInterest && (
                      <button 
                         onClick={() => setViewScope('INTEREST')} 
                         className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === 'INTEREST' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-emerald-200 hover:text-emerald-500'}`}
                      >
                         Interest / Lending
                      </button>
                   )}
                   {ledgerData.party.raw.isChit && (
                      <button 
                         onClick={() => setViewScope('CHIT')} 
                         className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === 'CHIT' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-orange-200 hover:text-orange-500'}`}
                      >
                         Chit Fund
                      </button>
                   )}
                   {ledgerData.party.raw.isGeneral && (
                      <button 
                         onClick={() => setViewScope('GENERAL')} 
                         className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === 'GENERAL' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500'}`}
                      >
                         General Trade
                      </button>
                   )}
                </div>
             )}
          </div>

          <table className="min-w-full divide-y divide-slate-100 print:text-xs">
            <thead className="bg-white">
              <tr>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80 print:px-2">Date</th>
                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80 print:px-2">Reference</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80 print:px-2">Debit (Dr)</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80 print:px-2">Credit (Cr)</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80 print:px-2">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
               {/* OPENING BALANCE ROW — shown as a proper Dr/Cr entry with date & reference */}
               {ledgerData.opening !== 0 && (() => {
                 const raw = ledgerData.party.raw;
                 const isLenderParty = ledgerData.party.type === 'LENDER';
                 const openingDate = isLenderParty ? (raw?.startDate || raw?.createdAt || 0) : (raw?.createdAt || 0);
                 const openingRef = isLenderParty ? 'LOAN RECEIVED'
                   : viewScope === 'INTEREST' ? 'CAPITAL LENT'
                   : 'OPENING BALANCE';
                 const openingDesc = isLenderParty ? 'Initial Loan Principal'
                   : viewScope === 'INTEREST' ? 'Principal Lent to Party'
                   : viewScope === 'COMBINED' ? 'Principal Lent + Opening Trade Balance'
                   : 'Opening Trade Balance';
                 return (
                   <tr className="bg-indigo-50/60 print:bg-white border-b border-indigo-100">
                     <td className="px-8 py-4 text-xs font-bold text-indigo-500 print:px-2">
                       {openingDate ? new Date(openingDate).toLocaleDateString() : '—'}
                     </td>
                     <td className="px-8 py-4 print:px-2">
                       <div className="text-sm font-black text-indigo-700">{openingRef}</div>
                       <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{openingDesc}</div>
                     </td>
                     {/* Dr column: positive opening = Dr (they owe us / we lent out) */}
                     <td className="px-8 py-4 text-sm font-mono font-bold text-emerald-600 text-right print:px-2">
                       {ledgerData.opening > 0 ? `₹${ledgerData.opening.toLocaleString()}` : '-'}
                     </td>
                     {/* Cr column: negative opening = Cr (we owe them / loan taken) */}
                     <td className="px-8 py-4 text-sm font-mono font-bold text-rose-600 text-right print:px-2">
                       {ledgerData.opening < 0 ? `₹${Math.abs(ledgerData.opening).toLocaleString()}` : '-'}
                     </td>
                     <td className="px-8 py-4 text-right text-sm font-mono font-bold text-slate-800 print:px-2">
                       ₹{Math.abs(ledgerData.opening).toLocaleString()}
                       <span className="text-[9px] text-slate-400 ml-1">{ledgerData.opening >= 0 ? 'Dr' : 'Cr'}</span>
                     </td>
                   </tr>
                 );
               })()}
               
               {/* TRANSACTIONS */}
               {ledgerData.rows.map((row: any, i: number) => (
                 <tr key={i} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent">
                    <td className="px-8 py-4 text-xs font-bold text-slate-500 print:px-2">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="px-8 py-4 print:px-2">
                        <div className="text-sm font-bold text-slate-800">{row.ref}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{row.desc}</div>
                    </td>
                    <td className="px-8 py-4 text-sm font-mono font-bold text-emerald-600 text-right print:px-2">{row.dr ? `₹${row.dr.toLocaleString()}` : '-'}</td>
                    <td className="px-8 py-4 text-sm font-mono font-bold text-rose-600 text-right print:px-2">{row.cr ? `₹${row.cr.toLocaleString()}` : '-'}</td>
                    <td className={`px-8 py-4 text-sm font-mono font-bold text-right print:px-2 ${row.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                        ₹{Math.abs(row.balance).toLocaleString()} 
                        <span className="text-[9px] text-slate-400 ml-1">{row.balance >= 0 ? 'Dr' : 'Cr'}</span>
                    </td>
                 </tr>
               ))}
               
               {ledgerData.rows.length === 0 && (
                  <tr>
                     <td colSpan={5} className="py-12 text-center text-xs font-black text-slate-300 uppercase tracking-widest">No transactions found for this view</td>
                  </tr>
               )}
            </tbody>
            {/* FOOTER TOTAL */}
            <tfoot className="bg-slate-900 text-white print:bg-white print:text-black print:border-t-2 print:border-black">
               {/* DR / CR column totals and closing balance aligned */}
               <tr className="border-b border-slate-700">
                  <td colSpan={2} className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Column Totals</td>
                  <td className="px-8 py-4 text-right text-sm font-mono font-black text-emerald-400">
                     ₹{(ledgerData.rows.reduce((s: number, r: any) => s + (r.dr || 0), 0) + (ledgerData.opening > 0 ? ledgerData.opening : 0)).toLocaleString()}
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Total Debit</div>
                  </td>
                  <td className="px-8 py-4 text-right text-sm font-mono font-black text-rose-400">
                     ₹{(ledgerData.rows.reduce((s: number, r: any) => s + (r.cr || 0), 0) + (ledgerData.opening < 0 ? Math.abs(ledgerData.opening) : 0)).toLocaleString()}
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Total Credit</div>
                  </td>
                  <td className="px-8 py-4 text-right text-xl font-display font-black tracking-tighter">
                     <div className="text-xs font-black uppercase tracking-widest mb-1">Closing Balance</div>
                     ₹{Math.abs(ledgerData.closing).toLocaleString()}
                     <span className={`text-xs ml-2 font-black ${ledgerData.closing >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                       {ledgerData.closing >= 0 ? '＋ They Owe You' : '－ You Owe Them'}
                     </span>
                  </td>
               </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-center py-20 text-slate-300 border-2 border-dashed border-slate-200 rounded-[2rem] print:hidden">
          <i className="fas fa-book-open text-4xl mb-3"></i>
          <div className="text-xs font-black uppercase tracking-widest">Select an account to view ledger history</div>
        </div>
      )}
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .animate-fadeIn, .animate-fadeIn * { visibility: visible; }
          .animate-fadeIn { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          header, aside, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

const ReportCenter: React.FC<ReportCenterProps> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname.includes(path);

  // Drill down handler
  const handleDrillDown = (id: string, type: 'CUSTOMER' | 'LENDER') => {
    navigate('/reports/accounts', { state: { selectedId: id } });
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-10">
      {/* HEADER - Hidden on Print */}
      <div className="print:hidden">
        <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Analytics Center</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Financial Intelligence & Reporting</p>
      </div>

      {/* TABS - Hidden on Print */}
      <div className="border-b border-slate-200 print:hidden">
         <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {[
               { path: '/ledger', label: 'Bank Books' },
               { path: '/accounts', label: 'Party Ledgers' },
               { path: '/outstanding', label: 'Outstanding' },
               { path: '/income-ledger', label: 'Income Ledger' },
               { path: '/expense-ledger', label: 'Expense Ledger' },
               { path: '/statements', label: 'Statements' }
            ].map(tab => (
               <Link 
                  key={tab.path}
                  to={`/reports${tab.path}`} 
                  className={`whitespace-nowrap py-4 px-1 border-b-4 text-[10px] font-black uppercase tracking-widest transition-colors ${isActive(tab.path) ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'}`}
               >
                  {tab.label}
               </Link>
            ))}
         </nav>
      </div>

      <Routes>
        <Route path="ledger" element={<GeneralLedger payments={props.payments} openingBalances={props.openingBalances} bankAccounts={props.bankAccounts} />} />
        <Route path="accounts" element={<AccountLedgerHub {...props} />} />
        <Route path="outstanding" element={<OutstandingReports customers={props.customers} invoices={props.invoices} liabilities={props.liabilities} payments={props.payments} onDrillDown={handleDrillDown} />} />
        <Route path="statements" element={<ReportList {...props} />} />
        <Route path="expense-ledger" element={<ExpenseLedger payments={props.payments} />} />
        <Route path="income-ledger" element={<IncomeLedger payments={props.payments} />} />
      </Routes>
    </div>
  );
};

export default ReportCenter;
