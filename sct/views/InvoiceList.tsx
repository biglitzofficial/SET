
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, Customer, InvoiceType, ChitGroup, Liability, AuditLog, UserRole, ChitAuction, StaffUser } from '../types';
import { invoiceAPI, chitAPI, dueDatesAPI } from '../services/api';

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
  
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Load invoices from backend
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setFetchError(null);
        const data = await invoiceAPI.getAll();
        setInvoices(data);
      } catch (error: any) {
        console.error('Failed to load invoices:', error);
        setFetchError(error?.message || 'Failed to load billing records. Please refresh the page.');
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
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = (ids: string[]) => setSelectedIds(prev =>
    prev.size === ids.length ? new Set() : new Set(ids)
  );

  const handleBulkDelete = async () => {
    if (isBulkDeleting || selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected invoice${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setIsBulkDeleting(true);
    try {
      await invoiceAPI.bulkDelete([...selectedIds]);
      setInvoices(prev => prev.filter(inv => !selectedIds.has(inv.id)));
      setSelectedIds(new Set());
    } catch (error: any) {
      alert(`Failed to delete invoices: ${error?.message || 'Please try again.'}`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const [billingDate, setBillingDate] = useState(() => new Date().toISOString().substr(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    // Default to 3 days from today
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().substr(0, 10);
  });
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
  const generatePreviewBatch = async () => {
    if (!activeBatchType) return;
    if (isGenerating) return;
    setIsGenerating(true);
    
    const date = new Date(billingDate).getTime();
    const batch: Invoice[] = [];

    // 1. ROYALTY BATCH
    if (activeBatchType === 'ROYALTY') {
      const validCustomers = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE');
      validCustomers.forEach(cust => {
        const amount = cust.royaltyAmount;
        if (amount > 0) {
          batch.push({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
               id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        setIsGenerating(false);
        return; 
      }
      
      // Verify the chit group exists in the backend
      console.log('Validating chit group exists in backend:', group.id);
      try {
        await chitAPI.getById(group.id);
        console.log('Chit group validation successful:', group.id);
      } catch (error: any) {
        console.error('Chit group validation failed:', error);
        alert(`❌ Error: The chit group "${group.name}" no longer exists in the database.\n\nThis might happen if:\n• The group was deleted\n• You're viewing cached data\n\nRefreshing available chit groups now...`);
        
        // Reload chit groups from backend
        try {
          console.log('Reloading chit groups from backend...');
          const chitGroupsData = await chitAPI.getAll();
          console.log('Reloaded chit groups (RAW):', chitGroupsData);
          console.log('Reloaded chit groups:', chitGroupsData.map(g => ({ id: g.id, name: g.name, status: g.status })));
          setChitGroups(chitGroupsData);
          
          // Reset selection so dropdown shows empty
          setSelectedChitForBilling('');
          setChitWinnerId('');
          setChitBidAmount(0);
          
          if (chitGroupsData.length === 0) {
            alert('⚠️ No chit groups found in the database. Please create a chit group first.');
          } else {
            const activeGroups = chitGroupsData.filter(g => g.status === 'ACTIVE');
            if (activeGroups.length === 0) {
              alert(`⚠️ Found ${chitGroupsData.length} chit group(s), but none are ACTIVE.\n\nPlease activate a chit group in the Chits page.`);
            } else {
              const groupNames = activeGroups.map(g => g.name).join(', ');
              alert(`✅ Loaded ${activeGroups.length} ACTIVE chit group(s): ${groupNames}\n\nPlease select one from the dropdown and try again.`);
            }
          }
        } catch (e) {
          console.error('Failed to reload chit groups:', e);
          alert('❌ Failed to reload chit groups from the database. Please refresh the page and try again.');
        }
        setIsGenerating(false);
        return;
      }

      // STRICT VALIDATION
      const seqMonth = group.auctions.length + 1;
      if (group.auctions.some(a => a.month === seqMonth)) {
         alert(`Error: Auction for Sequence Month #${seqMonth} already exists.`);
         setIsGenerating(false);
         return;
      }

      const billingDateObj = new Date(billingDate);
      const alreadyHasAuctionThisMonth = group.auctions.some(a => {
         const d = new Date(a.date);
         return d.getMonth() === billingDateObj.getMonth() && d.getFullYear() === billingDateObj.getFullYear();
      });

      if (alreadyHasAuctionThisMonth) {
         if (!window.confirm(`WARNING: An auction has already been conducted in ${billingDateObj.toLocaleString('default', { month: 'long', year: 'numeric' })}. Are you sure you want to conduct another bid in the same month?`)) {
            setIsGenerating(false);
            return;
         }
      }

      // A. Create INVOICES (Receivables) for all members - ONE INVOICE PER SEAT
      group.members.forEach((mid, seatIndex) => {
        const cust = customers.find(c => c.id === mid);
        if (cust) {
          const seatAmount = Math.round(chitCalc.netPayable);
          batch.push({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            invoiceNumber: getNextInvoiceNumber('CHIT', date, batch),
            customerId: mid,
            customerName: cust.name,
            type: 'CHIT',
            direction: 'IN',
            amount: seatAmount,
            date: date,
            status: 'UNPAID',
            balance: seatAmount,
            notes: `Month ${seqMonth} | Seat #${seatIndex + 1} | Winner: ${customers.find(c=>c.id === chitWinnerId)?.name} | Div: ₹${Math.round(chitCalc.dividendPerMember)}`
          });
        }
      });

      // B. Create PAYOUT VOUCHER (Payable) for the Winner
      const winnerName = customers.find(c => c.id === chitWinnerId)?.name || 'Winner';
      batch.push({
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    setIsGenerating(false);
  };

  const confirmBatch = async () => {
    if (isConfirming) return;
    if (!reviewBatch) return;
    setIsConfirming(true);
    
    let finalBatch = [...reviewBatch];
      
      // FOR CHIT: Generate a unique Auction ID and tag all invoices
      if (activeBatchType === 'CHIT' && selectedChitForBilling) {
        const group = chitGroups.find(g => g.id === selectedChitForBilling);
        
        if (!group) {
          console.error('Chit group not found in local state:', selectedChitForBilling);
          console.log('Available chit groups:', chitGroups.map(g => ({ id: g.id, name: g.name })));
          alert(`Error: Chit group not found (ID: ${selectedChitForBilling}). Please refresh the page and try again.`);
          setIsConfirming(false);
          return;
        }
        
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
        
        console.log('Recording chit auction:', { groupId: group.id, auction: newAuction });

        try {
          // Update chit group with auction data via API
          await chitAPI.recordAuction(group.id, newAuction);
          
          const updatedAuctions = [...group.auctions, newAuction];
          setChitGroups(prev => prev.map(g => g.id === group.id ? { 
             ...g, 
             auctions: updatedAuctions,
             currentMonth: updatedAuctions.length + 1
          } : g));
          
          console.log('Chit auction recorded successfully');
        } catch (error: any) {
          console.error('Failed to record chit auction:', error);
          console.error('Error details:', error.message);
          alert(`Failed to record chit auction: ${error.message}. Please make sure the chit group exists and try again.`);
          setIsConfirming(false);
          return;
        }
      }

      try {
        // BULK CREATE: single Firestore WriteBatch — replaces N sequential HTTP calls
        const result = await invoiceAPI.bulkCreate(finalBatch);
        const createdInvoices: Invoice[] = result.invoices;
        setInvoices(prev => [...prev, ...createdInvoices]);

        // Build all due date items and bulk upsert in one request
        const dueDateTimestamp = new Date(dueDate).getTime();
        const dueDateItems: { id: string; category: string; dueDate: number; amount: number }[] = [];
        for (const invoice of createdInvoices) {
          if (!invoice.customerId) continue;
          let category = 'ALL';
          if (invoice.type === 'ROYALTY') category = 'ROYALTY';
          else if (invoice.type === 'INTEREST') category = 'INTEREST';
          else if (invoice.type === 'INTEREST_OUT') category = 'INTEREST_OUT';
          else if (invoice.type === 'CHIT') category = 'CHIT';
          // category-specific entry
          dueDateItems.push({ id: invoice.customerId, category, dueDate: dueDateTimestamp, amount: invoice.balance });
          // always update the ALL bucket too
          if (category !== 'ALL') dueDateItems.push({ id: invoice.customerId, category: 'ALL', dueDate: dueDateTimestamp, amount: invoice.balance });
        }
        if (dueDateItems.length > 0) {
          try { await dueDatesAPI.bulkUpsert(dueDateItems); } catch (e) { console.error('Due dates bulk save failed (non-blocking):', e); }
        }

        closeModal();
      } catch (error) {
        console.error('Failed to create invoices:', error);
        alert('Failed to create invoices. Please try again.');
      } finally {
        setIsConfirming(false);
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
     if (deletingInvoiceId) return;
     if (!window.confirm("Are you sure you want to void/delete this invoice?")) return;
     setDeletingInvoiceId(id);
     try {
       await invoiceAPI.delete(id);
       setInvoices(prev => prev.filter(i => i.id !== id));
     } catch (error) {
       console.error('Failed to delete invoice:', error);
       alert('Failed to delete invoice. Please try again.');
     } finally {
       setDeletingInvoiceId(null);
     }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Error banner — shown when invoice data failed to load */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <i className="fas fa-circle-exclamation text-rose-500 mt-0.5"></i>
          <div className="flex-1">
            <div className="text-sm font-bold text-rose-700">Failed to load billing records</div>
            <div className="text-xs text-rose-500 mt-0.5">{fetchError}</div>
          </div>
          <button
            onClick={async () => {
              try {
                setFetchError(null);
                const data = await invoiceAPI.getAll();
                setInvoices(data);
              } catch (err: any) {
                setFetchError(err?.message || 'Still failing. Please refresh the page.');
              }
            }}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 underline whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}
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
            <button onClick={async () => {
               // Refresh chit groups before opening modal
               console.log('Loading chit groups from backend...');
               try {
                  const chitGroupsData = await chitAPI.getAll();
                  console.log('Loaded chit groups (RAW):', chitGroupsData);
                  console.log('Loaded chit groups:', chitGroupsData.map(g => ({ id: g.id, name: g.name, status: g.status, auctions: g.auctions?.length || 0 })));
                  console.log('ACTIVE chit groups:', chitGroupsData.filter(g => g.status === 'ACTIVE').map(g => g.name));
                  setChitGroups(chitGroupsData);
                  
                  // Reset selection to force user to pick valid group
                  setSelectedChitForBilling('');
                  setChitWinnerId('');
                  setChitBidAmount(0);
                  
                  if (chitGroupsData.length === 0) {
                     alert('⚠️ No chit groups found. Please create a chit group first in the Chits page.');
                     return;
                  }
                  
                  const activeCount = chitGroupsData.filter(g => g.status === 'ACTIVE').length;
                  if (activeCount === 0) {
                     alert(`⚠️ Found ${chitGroupsData.length} chit group(s), but none are marked as ACTIVE.\n\nPlease check the Chits page and make sure at least one group is active.`);
                     return;
                  }
                  
                  // Wait for React to update state before opening modal
                  await new Promise(resolve => setTimeout(resolve, 100));
               } catch (error) {
                  console.error('Failed to load chit groups:', error);
                  alert('❌ Failed to load chit groups from the database. Please check your connection and try again.');
                  return;
               }
               setActiveBatchType('CHIT');
            }} className="bg-action-orange hover:bg-action-orangeHover text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-lg transform hover:scale-105 transition-all flex items-center gap-2">
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
         {/* BULK ACTION BAR */}
         {selectedIds.size > 0 && (
           <div className="px-8 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
             <span className="text-xs font-black text-rose-700">
               <i className="fas fa-check-square mr-2"></i>
               {selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected
             </span>
             <div className="flex items-center gap-3">
               <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold text-slate-500 hover:text-slate-700 underline">Clear</button>
               <button
                 onClick={handleBulkDelete}
                 disabled={isBulkDeleting}
                 className="px-5 py-2 bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-700 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
               >
                 {isBulkDeleting
                   ? <><i className="fas fa-spinner fa-spin mr-1"></i>Deleting...</>
                   : <><i className="fas fa-trash-alt mr-1"></i>Delete {selectedIds.size} Selected</>}
               </button>
             </div>
           </div>
         )}
         <div className="overflow-x-auto">
         <table className="min-w-full">
            <thead className="bg-dark-900 text-white">
               <tr>
                  <th className="px-4 py-6 text-center w-12">
                    <input
                      type="checkbox"
                      className="rounded cursor-pointer accent-indigo-500"
                      checked={filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length}
                      onChange={() => toggleSelectAll(filteredInvoices.map(i => i.id))}
                    />
                  </th>
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
                  <tr key={inv.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(inv.id) ? 'bg-indigo-50' : ''}`}>
                     <td className="px-4 py-6 text-center">
                       <input
                         type="checkbox"
                         className="rounded cursor-pointer accent-indigo-500"
                         checked={selectedIds.has(inv.id)}
                         onChange={() => toggleSelect(inv.id)}
                       />
                     </td>
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
                           <button onClick={() => handleDeleteInvoice(inv.id)} disabled={deletingInvoiceId === inv.id} className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                              {deletingInvoiceId === inv.id
                                ? <i className="fas fa-spinner fa-spin text-xs"></i>
                                : <i className="fas fa-trash-alt text-xs"></i>}
                           </button>
                        )}
                     </td>
                  </tr>
               ))}
               {filteredInvoices.length === 0 && (
                  <tr>
                     <td colSpan={7} className="px-8 py-20 text-center">
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
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleUp relative">
              {/* POSTING OVERLAY */}
              {isConfirming && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-[2rem]">
                  <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center mb-5">
                    <i className="fas fa-spinner fa-spin text-indigo-600 text-2xl"></i>
                  </div>
                  <div className="text-base font-black text-slate-800 uppercase tracking-widest">Posting {reviewBatch?.length} Invoices</div>
                  <div className="text-xs text-slate-400 mt-2">Saving to database, please wait...</div>
                  <div className="mt-5 text-[10px] font-bold text-rose-500 uppercase tracking-widest">Do not close or click again</div>
                </div>
              )}
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">{getModalTitle()}</h3>
                 <button onClick={closeModal} className="h-10 w-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition"><i className="fas fa-times"></i></button>
              </div>
              <div className="p-8">
                 {!reviewBatch ? (
                   <div className="space-y-6">
                      <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-6 space-y-4">
                        <div className="flex gap-4 items-center">
                           <div className="h-12 w-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white"><i className="fas fa-calendar-alt text-xl"></i></div>
                           <div className="flex-1">
                              <label className="block text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">Billing Date</label>
                              <input type="date" className="bg-white border-none rounded-lg px-4 py-2 w-full text-sm font-bold shadow-sm outline-none" value={billingDate} onChange={e => setBillingDate(e.target.value)} />
                           </div>
                        </div>
                        <div className="flex gap-4 items-center">
                           <div className="h-12 w-12 bg-rose-500 rounded-xl flex items-center justify-center text-white"><i className="fas fa-clock text-xl"></i></div>
                           <div className="flex-1">
                              <label className="block text-xs font-black text-rose-900 uppercase tracking-widest mb-1">Due Date</label>
                              <input type="date" className="bg-white border-none rounded-lg px-4 py-2 w-full text-sm font-bold shadow-sm outline-none" value={dueDate} onChange={e => setDueDate(e.target.value)} />
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
                                {chitGroups.filter(g => g.status === 'ACTIVE').length === 0 && chitGroups.length > 0 && (
                                   <option disabled>No ACTIVE chit groups (found {chitGroups.length} total)</option>
                                )}
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
                                <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-white outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={chitBidAmount || ''} onChange={e => setChitBidAmount(Number(e.target.value))} />
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
                      
                      <button onClick={generatePreviewBatch} disabled={isGenerating} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 hover:scale-[1.02] transition-all shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100">
                         {isGenerating ? <><i className="fas fa-spinner fa-spin mr-2"></i>Generating...</> : 'Generate Preview'}
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
                                  <tr key={`${inv.id}-${i}`}>
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
                        <button onClick={confirmBatch} disabled={isConfirming} className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">{isConfirming ? <><i className="fas fa-spinner fa-spin mr-2"></i>Posting...</> : 'Confirm & Post'}</button>
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
