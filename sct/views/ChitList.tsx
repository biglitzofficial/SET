
import React, { useState, useMemo } from 'react';
import { ChitGroup, Customer, Invoice, Investment, ChitAuction, Payment, StaffUser } from '../types';
import { chitAPI, invoiceAPI, investmentAPI } from '../services/api';

interface ChitListProps {
  chitGroups: ChitGroup[];
  setChitGroups: React.Dispatch<React.SetStateAction<ChitGroup[]>>;
  customers: Customer[];
  invoices: Invoice[];
  investments: Investment[];
  setInvestments: React.Dispatch<React.SetStateAction<Investment[]>>;
  setPayments?: React.Dispatch<React.SetStateAction<Payment[]>>;
  setInvoices?: React.Dispatch<React.SetStateAction<Invoice[]>>; // Added setter to support cascade delete
  currentUser?: StaffUser | null;
}

const ChitList: React.FC<ChitListProps> = ({ chitGroups, setChitGroups, customers, invoices, investments, setInvestments, setPayments, setInvoices, currentUser }) => {
  // Use ID to track selection to ensure state updates reflect immediately
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  
  // Derived active group from main state
  const selectedGroup = useMemo(() => 
    chitGroups.find(g => g.id === selectedGroupId) || null
  , [chitGroups, selectedGroupId]);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showMemberSelector, setShowMemberSelector] = useState(false);

  // Passbook State
  const [viewPassbookContext, setViewPassbookContext] = useState<{ memberId: string, seatIndex: number } | null>(null);

  // Auction Summary Table State
  const [showAuctionTableGroupId, setShowAuctionTableGroupId] = useState<string | null>(null);
  const auctionTableGroup = useMemo(() => chitGroups.find(g => g.id === showAuctionTableGroupId) || null, [chitGroups, showAuctionTableGroupId]);
  
  const initialFormState: ChitGroup = {
    id: '',
    name: '',
    totalValue: 0,
    durationMonths: 20, 
    monthlyInstallment: 0,
    commissionPercentage: 5,
    startDate: Date.now(),
    currentMonth: 1,
    members: [],
    auctions: [],
    status: 'ACTIVE'
  };

  const [formData, setFormData] = useState<ChitGroup>(initialFormState);

  // --- LOGIC: MEMBER SELECTION ---
  const handleAddMember = (customerId: string) => {
    if (formData.members.length >= formData.durationMonths) {
      return; // Limit reached
    }
    setFormData(prev => ({ ...prev, members: [...prev.members, customerId] }));
    setShowMemberSelector(false);
  };

  const handleRemoveMemberAtIndex = (index: number) => {
    const newMembers = [...formData.members];
    newMembers.splice(index, 1);
    setFormData(prev => ({ ...prev, members: newMembers }));
  };

  // --- BULK SELECTION METHODS ---
  const handleQuickFill = (customerId: string, count: number) => {
    const availableSlots = formData.durationMonths - formData.members.length;
    const slotsToFill = Math.min(count, availableSlots);
    const newMembers = [...formData.members];
    for (let i = 0; i < slotsToFill; i++) {
      newMembers.push(customerId);
    }
    setFormData(prev => ({ ...prev, members: newMembers }));
  };

  const handleFillRemaining = () => {
    const chitCustomers = customers.filter(c => c.isChit);
    if (chitCustomers.length === 0) return;
    
    const availableSlots = formData.durationMonths - formData.members.length;
    const newMembers = [...formData.members];
    
    for (let i = 0; i < availableSlots; i++) {
      // Distribute evenly among chit customers
      const customer = chitCustomers[i % chitCustomers.length];
      newMembers.push(customer.id);
    }
    
    setFormData(prev => ({ ...prev, members: newMembers }));
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all seat allocations?')) {
      setFormData(prev => ({ ...prev, members: [] }));
    }
  };

  // --- LOGIC: SAVING CHIT GROUP ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await chitAPI.update(formData.id, formData);
        setChitGroups(prev => prev.map(g => g.id === formData.id ? formData : g));
      } else {
        // Don't generate ID on frontend - let Firebase backend create it
        const created = await chitAPI.create(formData);
        console.log('Chit group created with Firebase ID:', created.id);
        setChitGroups(prev => [...prev, created]);
      }
      setShowForm(false);
      setFormData(initialFormState);
      setShowMemberSelector(false);
    } catch (error) {
      console.error('Failed to save chit group:', error);
      alert('Failed to save chit group. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (group: ChitGroup) => {
    setFormData(group);
    setIsEditing(true);
    setShowForm(true);
    setShowMemberSelector(false);
  };

  const openCreate = () => {
    setFormData(initialFormState);
    setIsEditing(false);
    setShowForm(true);
    setShowMemberSelector(false);
  };

  // --- LOGIC: MOVE TO SAVINGS ---
  const handleAddToSavings = async (auction: ChitAuction, group: ChitGroup) => {
    const confirm = window.confirm(`Move ₹${auction.winnerHand.toLocaleString()} to Savings Hub?`);
    if(!confirm) return;

    const newInvestment: Investment = {
        id: Math.random().toString(36).substr(2, 9),
        name: `${group.name} - CHIT #${auction.month}`,
        type: 'CHIT_SAVINGS',
        provider: 'CHIT FUND WINNINGS',
        contributionType: 'LUMP_SUM',
        amountInvested: auction.winnerHand,
        expectedMaturityValue: auction.winnerHand,
        startDate: Date.now(),
        maturityDate: Date.now() + (365 * 24 * 60 * 60 * 1000), 
        status: 'ACTIVE',
        remarks: `Generated from Chit Auction #${auction.month} (Winner: ${auction.winnerName})`
    };

    try {
      const created = await investmentAPI.create(newInvestment);
      setInvestments(prev => [...prev, created]);
      alert("Successfully Capitalized! View in Savings Hub.");
    } catch (error) {
      console.error('Failed to save investment:', error);
      alert('Failed to move to Savings Hub. Please try again.');
    }
  };

  // --- LOGIC: REVERT AUCTION (CASCADE DELETE) ---
  const [isRevertingAuction, setIsRevertingAuction] = useState<string | null>(null);

  const handleRevertAuction = async (groupId: string, auctionId: string) => {
     if (isRevertingAuction) return;
     if (!window.confirm('WARNING: This will delete the auction and ALL associated invoices from the ledger. This cannot be undone. Proceed?')) return;
     setIsRevertingAuction(auctionId);
     try {
       // 1. Delete linked invoices from backend
       const invoicesToDelete = invoices.filter(inv => inv.relatedAuctionId === auctionId);
       const invoiceIds = invoicesToDelete.map(inv => inv.id);
       if (invoiceIds.length > 0) {
         await invoiceAPI.bulkDelete(invoiceIds);
         if (setInvoices) setInvoices(prev => prev.filter(inv => !invoiceIds.includes(inv.id)));
       }

       // 2. Delete linked payments from local state
       if (setPayments) {
         setPayments(prev => prev.filter(p => {
           const isLinkedToAuction = p.relatedAuctionId === auctionId;
           const isLinkedToDeletedInvoice = p.invoiceId && invoiceIds.includes(p.invoiceId);
           return !(isLinkedToAuction || isLinkedToDeletedInvoice);
         }));
       }

       // 3. Remove auction from chit group in Firestore
       await chitAPI.deleteAuction(groupId, auctionId);

       // 4. Update local state
       setChitGroups(prev => prev.map(g => {
         if (g.id !== groupId) return g;
         const updatedAuctions = g.auctions.filter(a => a.id !== auctionId);
         return { ...g, auctions: updatedAuctions, currentMonth: updatedAuctions.length + 1 };
       }));
     } catch (error: any) {
       console.error('Failed to revert auction:', error);
       alert('Failed to delete auction: ' + (error?.message || 'Please try again.'));
     } finally {
       setIsRevertingAuction(null);
     }
  };

  // --- HELPER: MEMBER STATS ---
  const getMemberPassbook = (group: ChitGroup, memberId: string, seatIndex: number) => {
     const memberName = customers.find(c => c.id === memberId)?.name || 'Unknown';
     
     // Determine if *this specific seat* is the one that won
     const totalWins = group.auctions.filter(a => a.winnerId === memberId).length;
     const memberInstance = group.members.slice(0, seatIndex + 1).filter(m => m === memberId).length;
     const isPrized = memberInstance <= totalWins;

     // Find which specific auction corresponds to this win
     const winningAuctions = group.auctions.filter(a => a.winnerId === memberId);
     const winningDetails = isPrized ? winningAuctions[memberInstance - 1] : undefined;
     
     let totalDividendEarned = 0;
     let totalAmountPaid = 0;
     let history = [];

     for(let i = 1; i <= group.durationMonths; i++) {
        const auction = group.auctions.find(a => a.month === i);
        const activeMonth = group.auctions.length + 1;
        const isPastOrCurrent = i < activeMonth;
        const isCurrentActive = i === activeMonth;
        
        let displayDate = 0;
        if (auction && auction.date) {
            displayDate = auction.date;
        } else {
            const projected = new Date(group.startDate);
            projected.setMonth(projected.getMonth() + (i - 1));
            if (projected.getDate() === 1) projected.setDate(10);
            displayDate = projected.getTime();
        }

        const dividend = auction ? auction.dividendPerMember : 0;
        const payable = group.monthlyInstallment - dividend;
        
        if (isPastOrCurrent) {
            totalDividendEarned += dividend;
            totalAmountPaid += payable;
        }

        history.push({
           month: i,
           date: displayDate,
           installment: group.monthlyInstallment,
           dividend: isPastOrCurrent ? dividend : 0,
           netPaid: isPastOrCurrent ? payable : group.monthlyInstallment,
           status: isPastOrCurrent ? 'PAID' : (isCurrentActive ? 'DUE' : 'FUTURE')
        });
     }

     return {
        memberName,
        seatNumber: seatIndex + 1,
        isPrized,
        winningDetails,
        totalDividendEarned,
        totalAmountPaid,
        netProfit: totalDividendEarned, 
        history
     };
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <header className="flex justify-between items-end border-b-2 border-slate-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Chit Hub</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Micro-savings Group Management</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-2xl p-1">
            <button
              onClick={() => setViewMode('card')}
              title="Card View"
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${
                viewMode === 'card' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className="fas fa-th-large"></i>
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List View"
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${
                viewMode === 'list' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className="fas fa-list"></i>
            </button>
          </div>
          <button onClick={openCreate} className="px-6 py-3 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-orange-600 transition hover:scale-105">
            + New Chit Group
          </button>
        </div>
      </header>

      {viewMode === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">S.No</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Chit Value</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Installment</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Members</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Auctions</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Progress</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chitGroups.map((group, idx) => {
                const filledCount = group.auctions.length;
                const isCompleted = filledCount >= group.durationMonths;
                const progress = group.durationMonths > 0 ? Math.round((filledCount / group.durationMonths) * 100) : 0;
                return (
                  <tr key={group.id} className="border-b border-slate-50 hover:bg-orange-50/40 transition">
                    <td className="px-5 py-4 font-black text-slate-400">{idx + 1}</td>
                    <td className="px-5 py-4 font-black text-slate-800 uppercase italic tracking-tight">{group.name}</td>
                    <td className="px-5 py-4 font-black text-slate-700">₹{group.totalValue.toLocaleString()}</td>
                    <td className="px-5 py-4 font-black text-slate-700">₹{group.monthlyInstallment.toLocaleString()}</td>
                    <td className="px-5 py-4 font-black text-slate-700">{group.members.length}</td>
                    <td className="px-5 py-4 font-black text-orange-600">{filledCount} / {group.durationMonths}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-orange-500 h-full rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span className="font-black text-slate-500 text-[10px]">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-widest ${
                        isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {isCompleted ? 'Completed' : 'Active'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedGroupId(group.id)} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline">Ledger</button>
                        <button onClick={() => setShowAuctionTableGroupId(group.id)} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:underline">Auctions</button>
                        {currentUser?.permissions.canEdit && (
                          <button onClick={() => openEdit(group)} className="text-slate-300 hover:text-indigo-600 transition"><i className="fas fa-pen"></i></button>
                        )}
                        {currentUser?.permissions.canDelete && (
                          <button onClick={async () => {
                            if (!confirm(`Are you sure you want to delete "${group.name}"? This will also delete all related invoices. This cannot be undone.`)) return;
                            try {
                              const auctionIds = new Set(group.auctions.map(a => a.id));
                              const linkedInvoiceIds = invoices
                                .filter(inv => inv.relatedAuctionId && auctionIds.has(inv.relatedAuctionId))
                                .map(inv => inv.id);
                              if (linkedInvoiceIds.length > 0) {
                                await invoiceAPI.bulkDelete(linkedInvoiceIds);
                                if (setInvoices) setInvoices(prev => prev.filter(inv => !linkedInvoiceIds.includes(inv.id)));
                              }
                              await chitAPI.delete(group.id);
                              const freshGroups = await chitAPI.getAll();
                              setChitGroups(freshGroups);
                            } catch (error) {
                              console.error('Failed to delete chit group:', error);
                              alert('Failed to delete chit group. Please try again.');
                            }
                          }} className="text-slate-300 hover:text-red-500 transition"><i className="fas fa-trash-can"></i></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={3} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Groups: {chitGroups.length}</td>
                <td className="px-5 py-4 font-black text-slate-800">₹{chitGroups.reduce((s, g) => s + g.monthlyInstallment, 0).toLocaleString()}</td>
                <td className="px-5 py-4 font-black text-slate-800">{chitGroups.reduce((s, g) => s + g.members.length, 0)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewMode === 'card' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {chitGroups.map(group => {
          const filledCount = group.auctions.length;
          const isCompleted = filledCount >= group.durationMonths;

          return (
            <div key={group.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group hover:border-orange-200 transition-all transform hover:-translate-y-2">
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="h-14 w-14 rounded-3xl flex items-center justify-center shadow-lg bg-orange-50 text-orange-500">
                    <i className="fas fa-users-viewfinder text-2xl"></i>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest ${isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                     {isCompleted ? 'Completed' : `Auctions: ${filledCount}/${group.durationMonths}`}
                  </span>
                </div>
                <h3 className="font-black text-slate-800 text-xl uppercase leading-none mb-2 italic tracking-tighter">{group.name}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Valuation: ₹{group.totalValue.toLocaleString()}</p>
                
                <div className="space-y-4">
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Installment</span>
                      <span className="font-black text-slate-800">₹{group.monthlyInstallment.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-400 uppercase tracking-widest">Total Slots</span>
                      <span className="font-black text-orange-600">{group.members.length} Seats committed</span>
                   </div>
                   <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-orange-500 h-full transition-all duration-1000" style={{ width: `${(filledCount/group.durationMonths)*100}%` }}></div>
                   </div>
                </div>
              </div>
              {group.auctions.length > 0 && (() => {
                const totalVasool = group.auctions.reduce((s, a) => s + group.members.length * (group.monthlyInstallment - a.dividendPerMember), 0);
                const totalCompany = group.auctions.reduce((s, a) => s + a.commissionAmount, 0);
                const totalHands = group.auctions.reduce((s, a) => s + a.winnerHand, 0);
                return (
                  <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50 divide-x divide-slate-100">
                    <div className="px-4 py-3 text-center">
                      <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Total Vasool</div>
                      <div className="text-[11px] font-black text-emerald-600 mt-0.5">₹{totalVasool.toLocaleString()}</div>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Company Amt</div>
                      <div className="text-[11px] font-black text-indigo-600 mt-0.5">₹{totalCompany.toLocaleString()}</div>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Total Hands</div>
                      <div className="text-[11px] font-black text-orange-600 mt-0.5">₹{totalHands.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })()}
              <div className="mt-auto bg-slate-50 p-6 border-t flex justify-between items-center group-hover:bg-orange-50 transition">
                 <div className="flex gap-4">
                    <button onClick={() => setSelectedGroupId(group.id)} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline">View Ledger</button>
                    <button onClick={() => setShowAuctionTableGroupId(group.id)} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:underline">Auction Table</button>
                 </div>
                 <div className="flex gap-3">
                    {currentUser?.permissions.canEdit && (
                       <button onClick={() => openEdit(group)} className="text-slate-300 hover:text-indigo-600 transition"><i className="fas fa-pen"></i></button>
                    )}
                    {currentUser?.permissions.canDelete && (
                       <button onClick={async () => {
                          if (!confirm(`Are you sure you want to delete "${group.name}"? This will also delete all related invoices. This cannot be undone.`)) return;
                          try {
                            // 1. Cascade-delete all invoices linked to this chit group's auctions
                            const auctionIds = new Set(group.auctions.map(a => a.id));
                            const linkedInvoiceIds = invoices
                              .filter(inv => inv.relatedAuctionId && auctionIds.has(inv.relatedAuctionId))
                              .map(inv => inv.id);
                            if (linkedInvoiceIds.length > 0) {
                              await invoiceAPI.bulkDelete(linkedInvoiceIds);
                              if (setInvoices) setInvoices(prev => prev.filter(inv => !linkedInvoiceIds.includes(inv.id)));
                            }
                            // 2. Delete the chit group itself
                            await chitAPI.delete(group.id);
                            // 3. Reload from server to confirm deletion persisted
                            const freshGroups = await chitAPI.getAll();
                            setChitGroups(freshGroups);
                          } catch (error) {
                            console.error('Failed to delete chit group:', error);
                            alert('Failed to delete chit group. Please try again.');
                          }
                       }} className="text-slate-300 hover:text-red-500 transition"><i className="fas fa-trash-can"></i></button>
                    )}
                 </div>
              </div>
            </div>
          );
        })}
      </div>}

      {/* --- MODAL: CREATE / EDIT CHIT GROUP --- */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-95 flex items-center justify-center z-[500] p-4 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-scaleUp border-8 border-slate-50">
              <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">{isEditing ? 'Configure Group' : 'New Chit Group'}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Setup Value & Seat Allocation</p>
                 </div>
                 <button onClick={() => setShowForm(false)} className="h-12 w-12 bg-white rounded-full flex items-center justify-center shadow-md hover:text-red-500 transition"><i className="fas fa-times text-xl"></i></button>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
                 <div className="w-full lg:w-1/3 p-8 overflow-y-auto space-y-6 border-r border-slate-100 custom-scrollbar">
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Group Identity</label>
                       <input required className="w-full p-4 bg-slate-50 rounded-2xl font-black uppercase text-xs outline-none focus:border-orange-400 border-2 border-transparent transition" placeholder="E.G. G-5L-2024" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} />
                    </div>
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Duration (Months)</label>
                       <input required type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-black text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.durationMonths || ''} onChange={e => setFormData({...formData, durationMonths: Number(e.target.value)})} />
                       <p className="text-[9px] font-bold text-orange-400 mt-2">* Defines total slots (e.g., 20)</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Chit Value (₹)</label>
                          <input required type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-black text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.totalValue || ''} onChange={e => setFormData({...formData, totalValue: Number(e.target.value)})} />
                       </div>
                       <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Installment (₹)</label>
                          <input required type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-black text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.monthlyInstallment || ''} onChange={e => setFormData({...formData, monthlyInstallment: Number(e.target.value)})} />
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Commission (%)</label>
                          <input required type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-black text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.commissionPercentage || ''} onChange={e => setFormData({...formData, commissionPercentage: Number(e.target.value)})} />
                       </div>
                       <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest italic">Start Date</label>
                          <input required type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-black text-xs outline-none" value={new Date(formData.startDate).toISOString().split('T')[0]} onChange={e => setFormData({...formData, startDate: new Date(e.target.value).getTime()})} />
                       </div>
                    </div>
                 </div>

                 <div className="flex-1 p-8 bg-slate-50/50 flex flex-col overflow-hidden relative min-h-0">
                    {!showMemberSelector ? (
                      <>
                        <div className="flex-shrink-0 flex justify-between items-center mb-3">
                           <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Seat Allocation Matrix</h4>
                           <span className="bg-white px-3 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm">
                             {formData.members.length} / {formData.durationMonths} Filled
                           </span>
                        </div>

                        {/* QUICK SELECTION TOOLBAR */}
                        <div className="flex-shrink-0 bg-white rounded-2xl border-2 border-slate-200 p-3 mb-3 shadow-sm">
                          <div className="flex flex-col gap-2">
                            {/* Quick Fill - Customer + Seats Input */}
                            <div className="flex items-center gap-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Quick Fill:</label>
                              <select 
                                id="quickFillCustomer"
                                className="flex-1 text-xs font-bold bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-orange-400"
                                defaultValue=""
                              >
                                <option value="" disabled>Select customer...</option>
                                {customers.filter(c => c.isChit).map(customer => (
                                  <option key={customer.id} value={customer.id}>
                                    {customer.name}
                                  </option>
                                ))}
                              </select>
                              <input 
                                id="quickFillSeats"
                                type="number" 
                                min="1" 
                                max={formData.durationMonths - formData.members.length}
                                placeholder="Seats"
                                className="w-24 text-xs font-bold bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const customerSelect = document.getElementById('quickFillCustomer') as HTMLSelectElement;
                                  const seatsInput = document.getElementById('quickFillSeats') as HTMLInputElement;
                                  const customerId = customerSelect?.value;
                                  const seats = parseInt(seatsInput?.value || '0');
                                  
                                  if (customerId && seats > 0) {
                                    handleQuickFill(customerId, seats);
                                    customerSelect.value = '';
                                    seatsInput.value = '';
                                  }
                                }}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition whitespace-nowrap"
                              >
                                <i className="fas fa-plus-circle mr-1"></i> Fill
                              </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleFillRemaining}
                                disabled={formData.members.length >= formData.durationMonths}
                                className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition"
                              >
                                <i className="fas fa-magic mr-1"></i> Auto-Fill Remaining
                              </button>
                              <button
                                type="button"
                                onClick={handleClearAll}
                                disabled={formData.members.length === 0}
                                className="flex-1 py-1.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition"
                              >
                                <i className="fas fa-eraser mr-1"></i> Clear All
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowMemberSelector(true)}
                                className="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition"
                              >
                                <i className="fas fa-hand-pointer mr-1"></i> Manual Select
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                           <div className="grid grid-cols-4 md:grid-cols-5 gap-3">
                              {Array.from({ length: formData.durationMonths }).map((_, i) => {
                                 const memberId = formData.members[i];
                                 const member = customers.find(c => c.id === memberId);
                                 const isFilled = !!memberId;
                                 return (
                                    <div 
                                       key={i} 
                                       onClick={() => { if (!isFilled) setShowMemberSelector(true); }}
                                       className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-2 relative group transition-all duration-300 ${isFilled ? 'bg-white border-orange-200 shadow-md' : 'bg-slate-100 border-dashed border-slate-300 cursor-pointer hover:bg-white hover:border-orange-400'}`}
                                    >
                                       <span className="absolute top-2 left-2 text-[8px] font-black text-slate-300 uppercase">#{i + 1}</span>
                                       {isFilled ? (
                                          <>
                                             <div className="h-8 w-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-[10px] font-black mb-1">{member?.name.charAt(0)}</div>
                                             <div className="text-[9px] font-black text-slate-800 uppercase text-center leading-tight line-clamp-2">{member?.name || 'Unknown'}</div>
                                             <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveMemberAtIndex(i); }} className="absolute -top-2 -right-2 h-6 w-6 bg-white rounded-full shadow-md text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 scale-75">
                                                <i className="fas fa-times text-[10px]"></i>
                                             </button>
                                          </>
                                       ) : (
                                          <>
                                             <i className="fas fa-plus text-slate-300 text-lg mb-1 group-hover:text-orange-400 transition-colors"></i>
                                             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-orange-400">Add</span>
                                          </>
                                       )}
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex flex-col animate-fadeIn">
                         <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                            <h4 className="text-sm font-black text-slate-800 uppercase italic">Select Member</h4>
                            <button onClick={() => setShowMemberSelector(false)} className="text-[10px] font-black bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-rose-100">Cancel Selection</button>
                         </div>
                         <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
                            {customers.filter(c => c.isChit).map(c => {
                               const currentSlots = formData.members.filter(m => m === c.id).length;
                               return (
                                 <button key={c.id} onClick={() => handleAddMember(c.id)} className="text-left p-3 rounded-xl border border-slate-100 hover:border-orange-400 hover:bg-orange-50 bg-white transition group">
                                    <div className="text-[10px] font-black text-slate-800 uppercase mb-0.5 group-hover:text-orange-700">{c.name}</div>
                                    <div className="flex justify-between items-center">
                                       <div className="text-[8px] font-bold text-slate-400">{c.phone}</div>
                                       {currentSlots > 0 && <span className="text-[8px] font-black text-white bg-orange-400 px-1.5 py-0.5 rounded-md">{currentSlots}</span>}
                                    </div>
                                 </button>
                               );
                            })}
                         </div>
                      </div>
                    )}
                 </div>
                 
                 <div className="lg:hidden p-4 bg-white border-t border-slate-100">
                    <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : 'Save Group'}</button>
                 </div>
                 <div className="hidden lg:flex p-4 border-t border-slate-100 items-center justify-end bg-white w-full lg:w-auto lg:absolute lg:bottom-0 lg:right-0 lg:left-0 pointer-events-none">
                    <button type="submit" disabled={isSubmitting} className="w-full lg:w-auto px-12 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100">{isSubmitting ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : 'Commit Configuration'}</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* --- NEW LEDGER VIEW --- */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-95 flex items-center justify-center z-[500] p-4 backdrop-blur-xl">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden animate-scaleUp border border-slate-800 relative">
              
              {/* LEDGER HEADER */}
              <div className="bg-slate-900 text-white p-8 pb-10 shadow-xl relative overflow-hidden flex-shrink-0">
                 <div className="absolute top-0 right-0 opacity-10 pointer-events-none"><i className="fas fa-users-viewfinder text-[10rem] -mr-10 -mt-10"></i></div>
                 
                 <div className="flex justify-between items-start relative z-10">
                    <div>
                       <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 bg-orange-500 text-white text-[9px] font-black uppercase rounded-lg tracking-widest">Active Group</span>
                          <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">ID: {selectedGroup.id}</span>
                       </div>
                       <h3 className="text-4xl font-black italic tracking-tighter text-white mb-1">{selectedGroup.name}</h3>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">{selectedGroup.totalValue.toLocaleString()} VALUATION • {selectedGroup.durationMonths} MONTHS</p>
                    </div>
                    <button onClick={() => setSelectedGroupId(null)} className="h-12 w-12 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition"><i className="fas fa-times text-lg"></i></button>
                 </div>

                 <div className="grid grid-cols-4 gap-4 mt-8">
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Monthly Installment</div>
                       <div className="text-xl font-black text-white tabular-nums">₹{selectedGroup.monthlyInstallment.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Commission Rate</div>
                       <div className="text-xl font-black text-orange-400 tabular-nums">{selectedGroup.commissionPercentage}%</div>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Auctions Conducted</div>
                       <div className="text-xl font-black text-emerald-400 tabular-nums">{selectedGroup.auctions.length} / {selectedGroup.durationMonths}</div>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                       <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Members</div>
                       <div className="text-xl font-black text-white tabular-nums">{selectedGroup.members.length} Accounts</div>
                    </div>
                 </div>
              </div>
              
              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-slate-50">
                 {/* LEFT: AUCTION TIMELINE */}
                 <div className="lg:col-span-7 p-8 overflow-y-auto custom-scrollbar">
                    <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-6 flex items-center gap-2"><i className="fas fa-gavel"></i> Auction Timeline (Desc)</h4>
                    <div className="space-y-4">
                       {/* SORTED BY DATE DESCENDING */}
                       {selectedGroup.auctions.length > 0 ? [...selectedGroup.auctions].sort((a,b) => b.month - a.month).map((auc, index) => (
                          <div key={auc.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6 relative overflow-hidden group">
                             <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 group-hover:bg-orange-500 transition-colors"></div>
                             
                             <div className="text-center min-w-[70px]">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Date</div>
                                <div className="text-xs font-black text-slate-800">{new Date(auc.date).toLocaleDateString()}</div>
                                <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Month {auc.month}</div>
                             </div>

                             <div className="flex-1 border-l border-slate-100 pl-6">
                                <div className="text-[10px] font-black text-indigo-600 uppercase mb-1">{auc.winnerName}</div>
                                <div className="text-xs font-bold text-slate-500">Won Pot: <span className="text-slate-800 font-black">₹{auc.winnerHand.toLocaleString()}</span></div>
                             </div>
                             <div className="text-right flex flex-col items-end">
                                <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Bid Amount</div>
                                <div className="text-lg font-black text-rose-600">₹{auc.bidAmount.toLocaleString()}</div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => handleAddToSavings(auc, selectedGroup)} className="text-[8px] font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1 rounded hover:bg-orange-500 transition">
                                        <i className="fas fa-arrow-right-to-bracket mr-1"></i> To Savings
                                    </button>
                                    {/* DELETE BUTTON: Only show for the Latest Auction (Index 0 in Descending List) AND if user has permission */}
                                    {index === 0 && currentUser?.permissions.canDelete && (
                                       <button 
                                          type="button"
                                          disabled={isRevertingAuction === auc.id}
                                          onClick={(e) => { 
                                              e.preventDefault();
                                              e.stopPropagation(); 
                                              handleRevertAuction(selectedGroup.id, auc.id); 
                                          }} 
                                          className="text-[8px] font-black uppercase tracking-widest bg-rose-100 text-rose-600 px-3 py-1 rounded hover:bg-rose-500 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
                                          title="Revert Latest Auction & Delete Associated Invoices"
                                       >
                                          {isRevertingAuction === auc.id
                                            ? <><i className="fas fa-spinner fa-spin mr-1"></i> Deleting...</>
                                            : <><i className="fas fa-trash-alt mr-1"></i> Delete</>}
                                       </button>
                                    )}
                                </div>
                             </div>
                          </div>
                       )) : (
                          <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No auctions recorded yet</p>
                          </div>
                       )}
                    </div>
                 </div>

                 {/* RIGHT: MEMBER LIST (CLICKABLE) */}
                 <div className="lg:col-span-5 bg-white border-l border-slate-200 p-8 overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-6">
                       <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><i className="fas fa-user-clock"></i> Member Passbook</h4>
                       <span className="text-[9px] font-bold text-slate-300">Click to view details</span>
                    </div>
                    <div className="space-y-3">
                       {selectedGroup.members.map((memberId, idx) => {
                          const cust = customers.find(c => c.id === memberId);
                          
                          // Determine if this specific instance of the member is prized
                          // Logic: Total wins for this member vs their seat count up to this point
                          const totalWinsForMember = selectedGroup.auctions.filter(a => a.winnerId === memberId).length;
                          const instanceCount = selectedGroup.members.slice(0, idx + 1).filter(m => m === memberId).length;
                          const isPrized = instanceCount <= totalWinsForMember;
                          
                          return (
                            <div key={`${memberId}-${idx}`} className="p-4 rounded-2xl border border-slate-100 bg-white hover:border-orange-400 hover:bg-orange-50 transition flex justify-between items-center group">
                               <div className="flex items-center gap-3">
                                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black text-white transition ${isPrized ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                     {idx + 1}
                                  </div>
                                  <div>
                                     <div className="text-[10px] font-black uppercase text-slate-700 group-hover:text-orange-700">{cust?.name || 'Unknown'}</div>
                                     <div className="text-[8px] font-bold text-slate-400">{cust?.phone}</div>
                                  </div>
                                </div>
                               <div className="flex gap-2">
                                  {isPrized ? (
                                     <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg">Prized</span>
                                  ) : (
                                     <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">Saver</span>
                                  )}
                                  <button onClick={() => setViewPassbookContext({ memberId, seatIndex: idx })} className="px-3 py-1 bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-orange-500 transition">
                                     Passbook
                                  </button>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>

              {/* --- PASSBOOK OVERLAY --- */}
              {viewPassbookContext && (
                 <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-xl z-50 flex items-center justify-center p-8 animate-fadeIn">
                    <div className="bg-white w-full max-w-4xl h-full rounded-[2.5rem] overflow-hidden flex flex-col relative shadow-2xl">
                       <button onClick={() => setViewPassbookContext(null)} className="absolute top-6 right-6 h-10 w-10 bg-slate-100 hover:bg-rose-500 hover:text-white rounded-full flex items-center justify-center transition z-10">
                          <i className="fas fa-times"></i>
                       </button>

                       {(() => {
                          const stats = getMemberPassbook(selectedGroup, viewPassbookContext.memberId, viewPassbookContext.seatIndex);
                          return (
                             <div className="flex-1 flex flex-col md:flex-row h-full">
                                {/* LEFT: SUMMARY CARD */}
                                <div className="w-full md:w-1/3 bg-slate-50 p-8 border-r border-slate-100 flex flex-col justify-center">
                                   <div className="text-center mb-8">
                                      <div className="h-20 w-20 bg-orange-500 text-white rounded-3xl mx-auto flex items-center justify-center text-3xl mb-4 shadow-lg shadow-orange-200">
                                         <span className="font-black text-2xl">#{stats.seatNumber}</span>
                                      </div>
                                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Holder</div>
                                      <h3 className="text-xl font-black text-slate-900 uppercase italic">{stats.memberName}</h3>
                                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 inline-block ${stats.isPrized ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                         {stats.isPrized ? 'Borrower (Prized)' : 'Saver (Non-Prized)'}
                                      </span>
                                   </div>

                                   <div className="space-y-4">
                                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Winning Chit Number</div>
                                         <div className="text-xl font-black text-slate-800">
                                            {stats.isPrized ? `Chit #${stats.winningDetails!.month}` : 'Not yet won'}
                                         </div>
                                         {stats.isPrized && <div className="text-[8px] font-bold text-slate-400">Received on Month {stats.winningDetails!.month}</div>}
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Dividend/Profit</div>
                                         <div className="text-xl font-black text-emerald-600">₹{stats.totalDividendEarned.toLocaleString()}</div>
                                         <div className="text-[8px] font-bold text-slate-400">Total discount earned</div>
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Amount Paid</div>
                                         <div className="text-xl font-black text-slate-800">₹{stats.totalAmountPaid.toLocaleString()}</div>
                                         <div className="text-[8px] font-bold text-slate-400">Actual cash outflow</div>
                                      </div>
                                   </div>
                                </div>

                                {/* RIGHT: TRANSACTION HISTORY */}
                                <div className="flex-1 p-8 bg-white overflow-y-auto custom-scrollbar">
                                   <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-100">
                                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Detailed Ledger (Seat #{stats.seatNumber})</h4>
                                      <div className="text-right">
                                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Installment</div>
                                         <div className="text-xs font-bold">₹{selectedGroup.monthlyInstallment.toLocaleString()}</div>
                                      </div>
                                   </div>
                                   <table className="w-full text-left">
                                      <thead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                         <tr>
                                            <th className="pb-4">Month</th>
                                            <th className="pb-4">Date</th>
                                            <th className="pb-4 text-right">Installment</th>
                                            <th className="pb-4 text-right text-emerald-500">Dividend</th>
                                            <th className="pb-4 text-right text-slate-900">Net Payable</th>
                                            <th className="pb-4 text-right">Status</th>
                                         </tr>
                                      </thead>
                                      <tbody className="text-xs font-bold text-slate-600">
                                         {stats.history.map((row) => (
                                            <tr key={row.month} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 ${row.status === 'FUTURE' ? 'opacity-50' : ''}`}>
                                               <td className="py-3">#{row.month}</td>
                                               <td className="py-3 text-slate-500">{new Date(row.date).toLocaleDateString()}</td>
                                               <td className="py-3 text-right text-slate-400">₹{row.installment.toLocaleString()}</td>
                                               <td className="py-3 text-right text-emerald-600">
                                                  {row.dividend > 0 ? `₹${row.dividend.toLocaleString()}` : '-'}
                                               </td>
                                               <td className="py-3 text-right text-slate-900 font-black">₹{row.netPaid.toLocaleString()}</td>
                                               <td className="py-3 text-right">
                                                  <span className={`px-2 py-1 rounded text-[8px] uppercase tracking-widest ${
                                                     row.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 
                                                     row.status === 'DUE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                                                  }`}>
                                                     {row.status}
                                                  </span>
                                               </td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                </div>
                             </div>
                          );
                       })()}
                    </div>
                 </div>
              )}

           </div>
        </div>
      )}
      {/* --- AUCTION SUMMARY TABLE MODAL --- */}
      {auctionTableGroup && (
        <div className="fixed inset-0 bg-slate-900/95 flex items-start justify-center z-[600] p-4 backdrop-blur-xl overflow-y-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-7xl my-6 flex flex-col overflow-hidden animate-scaleUp border border-slate-200">
            {/* Header */}
            <div className="bg-slate-900 text-white px-8 py-6 flex justify-between items-center flex-shrink-0">
              <div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Auction Summary</div>
                <h3 className="text-2xl font-black italic tracking-tighter text-white">{auctionTableGroup.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">₹{auctionTableGroup.totalValue.toLocaleString()} Valuation • {auctionTableGroup.auctions.length} Auctions Conducted</p>
              </div>
              <button onClick={() => setShowAuctionTableGroupId(null)} className="h-11 w-11 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition"><i className="fas fa-times text-lg"></i></button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto p-6">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-600 text-white">
                    {['TID','Chit Name','Chit Taken By','Month','Chit Value','Chit Amount','Company Amt','Kasar','Payable/Member','To Hand','Total Vasool','Date'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...auctionTableGroup.auctions].sort((a,b) => b.month - a.month).map((auc, idx) => {
                    const payablePerMember = auctionTableGroup.monthlyInstallment - auc.dividendPerMember;
                    const totalVasool = auctionTableGroup.members.length * payablePerMember;
                    const customer = customers.find(c => c.id === auc.winnerId);
                    const takenBy = customer ? `${customer.phone}-${customer.name}-C` : auc.winnerName;
                    const monthStr = new Date(auc.date).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit' }).replace('/', '-');
                    return (
                      <tr key={auc.id} className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 rounded-full bg-emerald-500 text-white text-[9px] font-black">#{auc.month}</span>
                        </td>
                        <td className="px-3 py-3 font-black text-slate-800">{auctionTableGroup.name}</td>
                        <td className="px-3 py-3 font-bold text-slate-700 max-w-[160px] truncate">{takenBy}</td>
                        <td className="px-3 py-3 font-bold text-slate-600">{monthStr}</td>
                        <td className="px-3 py-3 font-bold text-slate-800 tabular-nums">₹{auctionTableGroup.totalValue.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-orange-600 tabular-nums">₹{auc.bidAmount.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-slate-700 tabular-nums">₹{auc.commissionAmount.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-indigo-600 tabular-nums">₹{auc.dividendPerMember.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-slate-800 tabular-nums">₹{payablePerMember.toLocaleString()}</td>
                        <td className="px-3 py-3 font-black text-emerald-700 tabular-nums">₹{auc.winnerHand.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-slate-700 tabular-nums">₹{totalVasool.toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-slate-500 whitespace-nowrap">{new Date(auc.date).toLocaleDateString('en-IN')}</td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  {(() => {
                    const totals = auctionTableGroup.auctions.reduce((acc, auc) => {
                      const payable = auctionTableGroup.monthlyInstallment - auc.dividendPerMember;
                      return {
                        chitValue: acc.chitValue + auctionTableGroup.totalValue,
                        chitAmount: acc.chitAmount + auc.bidAmount,
                        companyAmt: acc.companyAmt + auc.commissionAmount,
                        kasar: acc.kasar + auc.dividendPerMember,
                        payable: acc.payable + payable,
                        toHand: acc.toHand + auc.winnerHand,
                        vasool: acc.vasool + auctionTableGroup.members.length * payable,
                      };
                    }, { chitValue:0, chitAmount:0, companyAmt:0, kasar:0, payable:0, toHand:0, vasool:0 });
                    return (
                      <tr className="bg-emerald-50 border-t-2 border-emerald-300 font-black text-slate-900">
                        <td className="px-3 py-3 text-[10px] uppercase tracking-widest" colSpan={4}>Total <span className="text-emerald-700">({auctionTableGroup.auctions.length} auctions)</span></td>
                        <td className="px-3 py-3 tabular-nums">₹{totals.chitValue.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums text-orange-700">₹{totals.chitAmount.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums">₹{totals.companyAmt.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums text-indigo-700">₹{totals.kasar.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums">₹{totals.payable.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums text-emerald-700">₹{totals.toHand.toLocaleString()}</td>
                        <td className="px-3 py-3 tabular-nums">₹{totals.vasool.toLocaleString()}</td>
                        <td className="px-3 py-3"></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Members who haven't taken (not won) */}
            {(() => {
              const wonIds = new Set(auctionTableGroup.auctions.map(a => a.winnerId));
              const notTakenMembers = [...new Set(auctionTableGroup.members)]
                .map(id => customers.find(c => c.id === id))
                .filter(c => c && !wonIds.has(c.id)) as Customer[];
              if (notTakenMembers.length === 0) return null;
              return (
                <div className="px-6 pb-6">
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-4 flex items-center gap-2">
                      <i className="fas fa-clock"></i> Not Yet Taken ({notTakenMembers.length} members)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-rose-100 text-rose-700">
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">#</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Member Name</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Phone</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Seats Held</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notTakenMembers.map((c, i) => {
                            const seats = auctionTableGroup.members.filter(m => m === c.id).length;
                            return (
                              <tr key={c.id} className="border-b border-rose-100 hover:bg-rose-50">
                                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                                <td className="px-3 py-2 font-black text-slate-800">{c.name}</td>
                                <td className="px-3 py-2 text-slate-600">{c.phone}</td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[9px] font-black">{seats} seat{seats > 1 ? 's' : ''}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px] font-black uppercase">Pending</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChitList;
