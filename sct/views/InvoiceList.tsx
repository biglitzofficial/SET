
import React, { useState, useMemo } from 'react';
import { Invoice, Customer, InvoiceType, ChitGroup, Liability, AuditLog, UserRole, ChitAuction, StaffUser } from '../types';
import { invoiceAPI, chitAPI } from '../services/api';

interface InvoiceListProps {
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  customers: Customer[];
  chitGroups: ChitGroup[];
  setChitGroups: React.Dispatch<React.SetStateAction<ChitGroup[]>>;
  liabilities: Liability[];
  role: UserRole;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  currentUser?: StaffUser | null;
}

type BatchType = 'ROYALTY' | 'INTEREST' | 'CHIT' | 'INTEREST_OUT';

const InvoiceList: React.FC<InvoiceListProps> = ({ invoices, setInvoices, customers, chitGroups, setChitGroups, liabilities, role, setAuditLogs, currentUser }) => {
  
  // Load invoices from backend
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        const data = await invoiceAPI.getAll();
        setInvoices(data);
      } catch (error) {
        console.error('Failed to load invoices:', error);
      }
    };
    loadInvoices();
  }, [setInvoices]);
  const [activeTab, setActiveTab] = useState<InvoiceType | 'ALL'>('ALL');
  
  // Strict Modal State
  const [activeBatchType, setActiveBatchType] = useState<BatchType | null>(null);
  const [reviewBatch, setReviewBatch] = useState<Invoice[] | null>(null);
  
  // CHIT BIDDING STATE
  const [selectedChitForBilling, setSelectedChitForBilling] = useState<string>('');
  const [chitBidAmount, setChitBidAmount] = useState<number>(0);
  const [chitWinnerId, setChitWinnerId] = useState<string>('');
  
  const [billingDate, setBillingDate] = useState(() => new Date().toISOString().substr(0, 10));
  const [search, setSearch] = useState('');

  // DATE FILTER STATE
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // --- FILTER LOGIC ---
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
    const customStart = customStartDate ? new Date(customStartDate).getTime() : 0;
    const customEnd = customEndDate ? new Date(customEndDate).setHours(23,59,59,999) : Number.MAX_SAFE_INTEGER;

    return invoices.filter(inv => {
      if (inv.isVoid) return false;
      const matchesTab = activeTab === 'ALL' || inv.type === activeTab;
      const matchesSearch = inv.customerName.toLowerCase().includes(search.toLowerCase()) || 
                            inv.invoiceNumber.toLowerCase().includes(search.toLowerCase());
      let matchesDate = true;
      if (dateFilter === 'THIS_MONTH') matchesDate = inv.date >= startOfThisMonth;
      else if (dateFilter === 'LAST_MONTH') matchesDate = inv.date >= startOfLastMonth && inv.date <= endOfLastMonth;
      else if (dateFilter === 'CUSTOM') matchesDate = inv.date >= customStart && inv.date <= customEnd;

      return matchesTab && matchesSearch && matchesDate;
    }).sort((a, b) => b.date - a.date);
  }, [invoices, activeTab, search, dateFilter, customStartDate, customEndDate]);

  const totalFilteredAmount = useMemo(() => filteredInvoices.reduce((acc, i) => acc + i.amount, 0), [filteredInvoices]);
  const totalUnpaid = useMemo(() => filteredInvoices.reduce((acc, i) => acc + i.balance, 0), [filteredInvoices]);

  // --- LIVE CHIT CALCULATION ---
  const chitCalc = useMemo(() => {
    if (activeBatchType !== 'CHIT' || !selectedChitForBilling) return null;
    const group = chitGroups.find(g => g.id === selectedChitForBilling);
    if (!group) return null;

    // Use derived next month to ensure accuracy
    const nextMonth = group.auctions.length + 1;

    // Check if month limit reached
    if (nextMonth > group.durationMonths) return { error: 'Group Completed' };

    const commission = group.totalValue * (group.commissionPercentage / 100);
    const dividendPot = Math.max(0, chitBidAmount - commission);
    const dividendPerMember = dividendPot / group.durationMonths;
    const netPayable = Math.max(0, group.monthlyInstallment - dividendPerMember);
    const winnerPayable = group.totalValue - chitBidAmount;

    return {
      groupName: group.name,
      month: nextMonth,
      totalValue: group.totalValue,
      installment: group.monthlyInstallment,
      commission,
      dividendPot,
      dividendPerMember,
      netPayable,
      winnerPayable
    };
  }, [activeBatchType, selectedChitForBilling, chitBidAmount, chitGroups]);

  // --- INVOICE NUMBER GENERATOR ---
  const getNextInvoiceNumber = (type: InvoiceType, date: number, currentBatch: Invoice[] = [], suffix?: string) => {
    const d = new Date(date);
    const prefix = type === 'INTEREST_OUT' ? 'PAY-INT' : type.substring(0, 3).toUpperCase();
    const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    // If suffix provided (e.g. PAYOUT), append it
    const finalPrefix = suffix ? `${prefix}-${suffix}` : prefix;
    
    const pattern = new RegExp(`^${finalPrefix}-${yearMonth}-(\\d+)$`);
    
    let maxNum = 0;
    // Check existing invoices
    invoices.forEach(inv => {
      const match = inv.invoiceNumber.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    // Check current batch being generated
    currentBatch.forEach(inv => {
      const match = inv.invoiceNumber.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });

    return `${finalPrefix}-${yearMonth}-${String(maxNum + 1).padStart(3, '0')}`;
  };

  // --- BATCH GENERATOR LOGIC ---
  const generatePreviewBatch = () => {
    if (!activeBatchType) return;
    
    const date = new Date(billingDate).getTime();
    const batch: Invoice[] = [];

    // 1. ROYALTY BATCH
    if (activeBatchType === 'ROYALTY') {
      const validCustomers = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE');
      validCustomers.forEach(cust => {
        const amount = cust.royaltyAmount;
        if (amount > 0) {
          batch.push({
            id: Math.random().toString(36).substr(2, 9),
            invoiceNumber: getNextInvoiceNumber('ROYALTY', date, batch),
            customerId: cust.id,
            customerName: cust.name,
            type: 'ROYALTY',
            direction: 'IN',
            amount: amount,
            date: date,
            status: 'UNPAID',
            balance: amount
          });
        }
      });
    } 
    // 2. INTEREST (IN) BATCH
    else if (activeBatchType === 'INTEREST') {
      const validCustomers = customers.filter(c => c.isInterest && c.status === 'ACTIVE');
      validCustomers.forEach(cust => {
        const amount = cust.interestPrincipal * (cust.interestRate / 100);
        if (amount > 0) {
          batch.push({
            id: Math.random().toString(36).substr(2, 9),
            invoiceNumber: getNextInvoiceNumber('INTEREST', date, batch),
            customerId: cust.id,
            customerName: cust.name,
            type: 'INTEREST',
            direction: 'IN',
            amount: Math.round(amount),
            date: date,
            status: 'UNPAID',
            balance: Math.round(amount)
          });
        }
      });
    }
    // 3. INTEREST (OUT) BATCH
    else if (activeBatchType === 'INTEREST_OUT') {
      // A. External Liabilities (Private Loans in Credit Manager)
      const validLenders = liabilities.filter(l => l.type === 'PRIVATE' && l.status === 'ACTIVE');
      validLenders.forEach(lender => {
        const amount = lender.principal * (lender.interestRate / 100);
        if (amount > 0) {
          batch.push({
            id: Math.random().toString(36).substr(2, 9),
            invoiceNumber: getNextInvoiceNumber('INTEREST_OUT', date, batch),
            lenderId: lender.id,
            customerName: lender.providerName,
            type: 'INTEREST_OUT',
            direction: 'OUT',
            amount: Math.round(amount),
            date: date,
            status: 'UNPAID',
            balance: Math.round(amount),
            notes: 'Interest Payable Accrual'
          });
        }
      });

      // B. Registered Creditors (Customers flagged as Lenders)
      const customerCreditors = customers.filter(c => c.isLender && c.status === 'ACTIVE' && c.creditPrincipal > 0);
      customerCreditors.forEach(creditor => {
         const amount = creditor.creditPrincipal * (creditor.interestRate / 100);
         if (amount > 0) {
            batch.push({
               id: Math.random().toString(36).substr(2, 9),
               invoiceNumber: getNextInvoiceNumber('INTEREST_OUT', date, batch),
               customerId: creditor.id, // Use customerId so it maps to their ledger
               customerName: creditor.name,
               type: 'INTEREST_OUT',
               direction: 'OUT',
               amount: Math.round(amount),
               date: date,
               status: 'UNPAID',
               balance: Math.round(amount),
               notes: 'Interest Payable Accrual'
            });
         }
      });
    }
    // 4. CHIT BATCH
    else if (activeBatchType === 'CHIT') {
      const group = chitGroups.find(g => g.id === selectedChitForBilling);
      if (!group || !chitWinnerId || !chitCalc || chitCalc.error) { 
        alert("Please select a group and valid winner first."); 
        return; 
      }

      // STRICT VALIDATION
      const seqMonth = group.auctions.length + 1;
      if (group.auctions.some(a => a.month === seqMonth)) {
         alert(`Error: Auction for Sequence Month #${seqMonth} already exists.`);
         return;
      }

      const billingDateObj = new Date(billingDate);
      const alreadyHasAuctionThisMonth = group.auctions.some(a => {
         const d = new Date(a.date);
         return d.getMonth() === billingDateObj.getMonth() && d.getFullYear() === billingDateObj.getFullYear();
      });

      if (alreadyHasAuctionThisMonth) {
         if (!window.confirm(`WARNING: An auction has already been conducted in ${billingDateObj.toLocaleString('default', { month: 'long', year: 'numeric' })}. Are you sure you want to conduct another bid in the same month?`)) {
            return;
         }
      }

      // A. Create INVOICES (Receivables) for all members
      const memberSlots: Record<string, number> = {};
      group.members.forEach(mid => { memberSlots[mid] = (memberSlots[mid] || 0) + 1; });
      
      Object.entries(memberSlots).forEach(([mid, slots]) => {
        const cust = customers.find(c => c.id === mid);
        if (cust) {
          const totalAmount = Math.round(chitCalc.netPayable * slots);
          batch.push({
            id: Math.random().toString(36).substr(2, 9),
            invoiceNumber: getNextInvoiceNumber('CHIT', date, batch),
            customerId: mid,
            customerName: cust.name,
            type: 'CHIT',
            direction: 'IN',
            amount: totalAmount,
            date: date,
            status: 'UNPAID',
            balance: totalAmount,
            notes: `Month ${seqMonth} | Winner: ${customers.find(c=>c.id === chitWinnerId)?.name} | Div: ₹${Math.round(chitCalc.dividendPerMember)}`
          });
        }
      });

      // B. Create PAYOUT VOUCHER (Payable) for the Winner
      const winnerName = customers.find(c => c.id === chitWinnerId)?.name || 'Winner';
      batch.push({
        id: Math.random().toString(36).substr(2, 9),
        invoiceNumber: getNextInvoiceNumber('CHIT', date, batch, 'PAYOUT'),
        customerId: chitWinnerId,
        customerName: winnerName,
        type: 'CHIT',
        direction: 'OUT',
        amount: chitCalc.winnerPayable,
        date: date,
        status: 'UNPAID',
        balance: chitCalc.winnerPayable,
        notes: `Prize Money Payable for Month ${seqMonth} (Bid: ₹${chitBidAmount.toLocaleString()})`
      });
    }

    if (batch.length > 0) {
      setReviewBatch(batch);
    } else {
      alert(`No valid records found for ${activeBatchType} batch.`);
    }
  };

  const confirmBatch = async () => {
    if (reviewBatch) {
      
      let finalBatch = [...reviewBatch];
      
      // FOR CHIT: Generate a unique Auction ID and tag all invoices
      if (activeBatchType === 'CHIT' && selectedChitForBilling) {
        const group = chitGroups.find(g => g.id === selectedChitForBilling);
        if (group) {
          const newAuctionId = Math.random().toString(36).substr(2, 9);
          const nextSeqMonth = group.auctions.length + 1;
          
          // Tag Invoices with Auction ID for Cascade Delete
          finalBatch = finalBatch.map(inv => ({ ...inv, relatedAuctionId: newAuctionId }));

          const newAuction: ChitAuction = {
             id: newAuctionId,
             month: nextSeqMonth,
             winnerId: chitWinnerId,
             winnerName: customers.find(c => c.id === chitWinnerId)?.name || 'Unknown',
             bidAmount: chitBidAmount,
             winnerHand: group.totalValue - chitBidAmount,
             commissionAmount: chitCalc?.commission || 0,
             dividendPerMember: chitCalc?.dividendPerMember || 0,
             date: new Date(billingDate).getTime()
          };

          try {
            // Update chit group with auction data via API
            await chitAPI.recordAuction(group.id, newAuction);
            
            const updatedAuctions = [...group.auctions, newAuction];
            setChitGroups(prev => prev.map(g => g.id === group.id ? { 
               ...g, 
               auctions: updatedAuctions,
               currentMonth: updatedAuctions.length + 1
            } : g));
          } catch (error) {
            console.error('Failed to record chit auction:', error);
            alert('Failed to record chit auction. Please try again.');
            return;
          }
        }
      }

      try {
        // Save all invoices to backend
        const createdInvoices = await Promise.all(
          finalBatch.map(invoice => invoiceAPI.create(invoice))
        );
        
        setInvoices(prev => [...prev, ...createdInvoices]);
        closeModal();
      } catch (error) {
        console.error('Failed to create invoices:', error);
        alert('Failed to create invoices. Please try again.');
      }
    }
  };

  const closeModal = () => {
    setActiveBatchType(null);
    setReviewBatch(null);
    setChitBidAmount(0);
    setChitWinnerId('');
    setSelectedChitForBilling('');
  };

  const InvoiceBadge = ({ type, direction }: { type: string, direction: 'IN' | 'OUT' }) => {
    const styles: any = {
      'ROYALTY': 'bg-action-purple text-white',
      'INTEREST': 'bg-action-green text-white',
      'CHIT': 'bg-action-orange text-white',
      'INTEREST_OUT': 'bg-action-red text-white'
    };
    
    if (direction === 'OUT' && type === 'CHIT') {
        return <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white">PRIZE PAYABLE</span>;
    }

    return (
      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${styles[type] || 'bg-gray-500 text-white'}`}>
        {type === 'INTEREST_OUT' ? 'INT. OUT' : type}
      </span>
    );
  }

  const getModalTitle = () => {
     switch(activeBatchType) {
        case 'ROYALTY': return 'Generate Royalty Invoices';
        case 'INTEREST': return 'Generate Interest (Income)';
        case 'INTEREST_OUT': return 'Generate Interest Payables';
        case 'CHIT': return 'Run Chit Auction Batch';
        default: return 'Batch Operation';
     }
  };

  const handleDeleteInvoice = async (id: string) => {
     if (window.confirm("Are you sure you want to void/delete this invoice?")) {
        try {
          await invoiceAPI.delete(id);
          setInvoices(prev => prev.filter(i => i.id !== id));
        } catch (error) {
          console.error('Failed to delete invoice:', error);
          alert('Failed to delete invoice. Please try again.');
        }
     }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
         <div>
            <h1 className="text-4xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Voucher Management</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Double-Entry Billing Hub</p>
         </div>
         
         {/* ACTION BUTTONS */}
         <div className="flex flex-wrap gap-3">
            <button onClick={() => setActiveBatchType('ROYALTY')} className="bg-action-purple hover:bg-action-purpleHover text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2">
               <i className="fas fa-crown text-sm"></i> Raise Royalty
            </button>
            <button onClick={() => setActiveBatchType('INTEREST')} className="bg-action-green hover:bg-action-greenHover text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2">
               <i className="fas fa-hand-holding-dollar text-sm"></i> Raise Interest In
            </button>
            <button onClick={() => setActiveBatchType('INTEREST_OUT')} className="bg-action-red hover:bg-action-redHover text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2">
               <i className="fas fa-arrow-trend-down text-sm"></i> Raise Interest Out
            </button>
            <button onClick={() => setActiveBatchType('CHIT')} className="bg-action-orange hover:bg-action-orangeHover text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2">
               <i className="fas fa-users-viewfinder text-sm"></i> Raise Chit
            </button>
         </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-center h-40">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Records Found</span>
            <div className="text-5xl font-display font-black text-slate-900 italic tracking-tighter">{filteredInvoices.length} <span className="text-lg not-italic text-slate-400">Vouchers</span></div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-center h-40">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Gross (Filtered)</span>
            <div className="text-5xl font-display font-black text-action-purple tracking-tighter">₹{totalFilteredAmount.toLocaleString()}</div>
         </div>
         <div className="bg-rose-50 p-8 rounded-[2rem] shadow-inner border border-rose-100 flex flex-col justify-center h-40">
            <span className="text-[11px] font-black text-rose-400 uppercase tracking-widest mb-2">Current Unpaid Dues</span>
            <div className="text-5xl font-display font-black text-rose-600 tracking-tighter">₹{totalUnpaid.toLocaleString()}</div>
         </div>
      </div>

      {/* FILTERS CONTAINER */}
      <div className="space-y-4">
        <div className="bg-white p-3 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-center">
            {/* SEARCH */}
            <div className="flex-1 relative w-full">
                <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-lg"></i>
                <input 
                type="text" 
                placeholder="Search by party or invoice..." 
                className="w-full pl-14 pr-6 py-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                value={search}
                onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* DATE FILTER CONTROLS */}
            <div className="flex flex-col md:flex-row gap-2 w-full lg:w-auto items-center">
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 w-full md:w-auto overflow-x-auto">
                    {['ALL', 'THIS_MONTH', 'LAST_MONTH', 'CUSTOM'].map(df => (
                        <button 
                            key={df}
                            onClick={() => setDateFilter(df as any)}
                            className={`px-4 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${dateFilter === df ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {df.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                {dateFilter === 'CUSTOM' && (
                    <div className="flex gap-2 items-center bg-slate-50 p-1 rounded-xl border border-slate-100 animate-fadeIn">
                        <input type="date" className="bg-white border-none rounded-lg px-2 py-2 text-xs font-bold outline-none" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        <span className="text-slate-300">-</span>
                        <input type="date" className="bg-white border-none rounded-lg px-2 py-2 text-xs font-bold outline-none" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                    </div>
                )}
            </div>

            {/* TYPE TABS */}
            <div className="flex gap-2 px-2 overflow-x-auto w-full lg:w-auto">
                {['ALL', 'ROYALTY', 'INTEREST', 'INTEREST_OUT', 'CHIT'].map(tab => (
                <button 
                    key={tab} 
                    onClick={() => setActiveTab(tab as any)} 
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                >
                    {tab.replace('_', ' ')}
                </button>
                ))}
            </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-lg border border-slate-200">
         <div className="overflow-x-auto">
         <table className="min-w-full">
            <thead className="bg-dark-900 text-white">
               <tr>
                  <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Voucher</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Stakeholder</th>
                  <th className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Gross Amount</th>
                  <th className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Balance Due</th>
                  <th className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
               {filteredInvoices.map((inv, idx) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                     <td className="px-8 py-6 whitespace-nowrap text-xs font-bold text-slate-500">{new Date(inv.date).toLocaleDateString()}</td>
                     <td className="px-8 py-6 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                           <InvoiceBadge type={inv.type} direction={inv.direction} />
                           <span className="font-display text-sm font-bold text-slate-800">{inv.invoiceNumber}</span>
                        </div>
                     </td>
                     <td className="px-8 py-6 whitespace-nowrap">
                        <div className="font-bold text-sm text-slate-700 uppercase">{inv.customerName}</div>
                        {inv.direction === 'OUT' && <div className="text-[8px] font-black text-rose-500 uppercase">PAYABLE</div>}
                     </td>
                     <td className="px-8 py-6 whitespace-nowrap text-right">
                        <div className={`font-black text-lg font-display italic ${inv.direction === 'OUT' ? 'text-rose-600' : 'text-slate-900'}`}>
                           ₹{inv.amount.toLocaleString()}
                        </div>
                     </td>
                     <td className="px-8 py-6 whitespace-nowrap text-right">
                        <div className={`font-black text-lg font-display italic ${inv.balance > 0 ? (inv.direction === 'OUT' ? 'text-rose-500' : 'text-indigo-600') : 'text-emerald-500 opacity-50'}`}>
                           ₹{inv.balance.toLocaleString()}
                        </div>
                     </td>
                     <td className="px-8 py-6 whitespace-nowrap text-right">
                        {currentUser?.permissions.canDelete && (
                           <button onClick={() => handleDeleteInvoice(inv.id)} className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors">
                              <i className="fas fa-trash-alt text-xs"></i>
                           </button>
                        )}
                     </td>
                  </tr>
               ))}
               {filteredInvoices.length === 0 && (
                  <tr>
                     <td colSpan={6} className="px-8 py-20 text-center">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                           <i className="fas fa-search text-slate-300 text-2xl"></i>
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No vouchers match your criteria</p>
                     </td>
                  </tr>
               )}
            </tbody>
         </table>
         </div>
      </div>

      {/* BULK GENERATION MODAL */}
      {activeBatchType && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleUp">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">{getModalTitle()}</h3>
                 <button onClick={closeModal} className="h-10 w-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition"><i className="fas fa-times"></i></button>
              </div>
              <div className="p-8">
                 {!reviewBatch ? (
                   <div className="space-y-6">
                      <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-6">
                        <div className="flex gap-4 items-center">
                           <div className="h-12 w-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white"><i className="fas fa-calendar-alt text-xl"></i></div>
                           <div className="flex-1">
                              <label className="block text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">Billing Date</label>
                              <input type="date" className="bg-white border-none rounded-lg px-4 py-2 w-full text-sm font-bold shadow-sm outline-none" value={billingDate} onChange={e => setBillingDate(e.target.value)} />
                           </div>
                        </div>
                      </div>

                      {activeBatchType === 'CHIT' && (
                        <div className="space-y-4">
                           <div>
                             <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Select Group</label>
                             <select className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-white outline-none focus:border-indigo-500" value={selectedChitForBilling} onChange={e => { setSelectedChitForBilling(e.target.value); setChitBidAmount(0); }}>
                                <option value="">-- Choose Chit Group --</option>
                                {chitGroups.filter(g => g.status === 'ACTIVE').map(g => (
                                    <option key={g.id} value={g.id}>{g.name} - Next Month {g.auctions.length + 1}</option>
                                ))}
                             </select>
                           </div>
                           <div className="grid grid-cols-2 gap-6">
                              <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Auction Winner</label>
                                <select className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-white outline-none focus:border-indigo-500" value={chitWinnerId} onChange={e => setChitWinnerId(e.target.value)}>
                                   <option value="">-- Select Member --</option>
                                   {chitGroups.find(g=>g.id===selectedChitForBilling)?.members.filter((mid, index, self) => self.indexOf(mid) === index).map(mid => {
                                      const group = chitGroups.find(g=>g.id===selectedChitForBilling);
                                      if (!group) return null;
                                      
                                      // Logic: Check Total Seats vs Total Wins
                                      const totalSeats = group.members.filter(m => m === mid).length;
                                      const wonCount = group.auctions.filter(a => a.winnerId === mid).length;
                                      const remaining = totalSeats - wonCount;
                                      
                                      // ONLY SHOW IF REMAINING SEATS > 0
                                      if (remaining <= 0) return null;

                                      const c = customers.find(cust => cust.id === mid);
                                      return c ? <option key={mid} value={mid}>{c.name} ({remaining} Chance{remaining > 1 ? 's' : ''})</option> : null;
                                   })}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Bid / Discount (₹)</label>
                                <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-white outline-none focus:border-indigo-500" value={chitBidAmount || ''} onChange={e => setChitBidAmount(Number(e.target.value))} />
                              </div>
                           </div>

                           {/* LIVE CHIT CALCULATION PREVIEW */}
                           {chitCalc && !chitCalc.error && (
                             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-2 animate-fadeIn">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Billing Preview: Month {chitCalc.month}</h4>
                                <div className="space-y-2 text-xs">
                                   <div className="flex justify-between">
                                      <span className="font-bold text-slate-400">Total Chit Value</span>
                                      <span className="font-bold text-slate-700">₹{chitCalc.totalValue.toLocaleString()}</span>
                                   </div>
                                   <div className="flex justify-between">
                                      <span className="font-bold text-slate-400">Commission (5%)</span>
                                      <span className="font-bold text-emerald-600">+ ₹{chitCalc.commission.toLocaleString()}</span>
                                   </div>
                                   <div className="flex justify-between border-t border-slate-200 pt-2">
                                      <span className="font-bold text-slate-400">Winner Payable (Liability)</span>
                                      <span className="font-black text-rose-600">₹{chitCalc.winnerPayable.toLocaleString()}</span>
                                   </div>
                                   <div className="flex justify-between mt-1">
                                      <span className="font-bold text-slate-400">Dividend Per Member</span>
                                      <span className="font-bold text-emerald-600">₹{Math.round(chitCalc.dividendPerMember).toLocaleString()}</span>
                                   </div>
                                   <div className="flex justify-between bg-white p-3 rounded-lg border border-slate-100 mt-2 shadow-sm">
                                      <span className="font-black text-slate-900 uppercase">Net Payable by Members</span>
                                      <span className="font-black text-indigo-600 text-lg">₹{Math.round(chitCalc.netPayable).toLocaleString()}</span>
                                   </div>
                                   <div className="text-[9px] text-center text-slate-400 mt-2">
                                      Company Commission of <strong className="text-slate-600">₹{chitCalc.commission.toLocaleString()}</strong> will be automatically booked as Revenue. <br/>
                                      A Liability of <strong className="text-rose-500">₹{chitCalc.winnerPayable.toLocaleString()}</strong> will be recorded for the winner.
                                   </div>
                                </div>
                             </div>
                           )}
                           {chitCalc && chitCalc.error && (
                              <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-xs font-bold text-center border border-rose-100">
                                 {chitCalc.error}
                              </div>
                           )}
                        </div>
                      )}
                      
                      <button onClick={generatePreviewBatch} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 hover:scale-[1.02] transition-all shadow-xl">
                         Generate Preview
                      </button>
                   </div>
                 ) : (
                   <div>
                      <div className="flex justify-between items-center mb-4">
                         <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{reviewBatch.length} Invoices Ready</span>
                         <span className="text-lg font-black text-slate-900">Total: ₹{reviewBatch.reduce((a,b)=>a+b.amount,0).toLocaleString()}</span>
                      </div>
                      <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-2xl mb-6 custom-scrollbar">
                         <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                               <tr>
                                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Customer</th>
                                  <th className="px-6 py-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                  <th className="px-6 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount</th>
                               </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-50">
                               {reviewBatch.map((inv, i) => (
                                  <tr key={i}>
                                     <td className="px-6 py-3 text-sm font-bold text-slate-700">{inv.customerName}</td>
                                     <td className="px-6 py-3 text-center"><InvoiceBadge type={inv.type} direction={inv.direction} /></td>
                                     <td className={`px-6 py-3 text-sm font-bold text-right ${inv.direction === 'OUT' ? 'text-rose-600' : 'text-slate-900'}`}>
                                        {inv.direction === 'OUT' ? '-' : ''}₹{inv.amount.toLocaleString()}
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                      <div className="flex justify-end gap-4">
                        <button onClick={() => setReviewBatch(null)} className="px-6 py-3 border-2 border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50">Back</button>
                        <button onClick={confirmBatch} className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg">Confirm & Post</button>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;
