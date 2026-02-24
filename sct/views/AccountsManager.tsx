
import React, { useState, useMemo } from 'react';
import { Payment, Customer, Invoice, UserRole, AuditLog, Liability, Investment, InvestmentTransaction, StaffUser, BankAccount } from '../types';
import { paymentAPI } from '../services/api';

interface AccountsManagerProps {
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  expenseCategories: string[];
  otherBusinesses: string[];
  role: UserRole;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  liabilities: Liability[];
  setLiabilities: React.Dispatch<React.SetStateAction<Liability[]>>;
  investments?: Investment[];
  setInvestments?: React.Dispatch<React.SetStateAction<Investment[]>>;
  incomeCategories?: string[]; // Added Income Categories
  currentUser?: StaffUser | null; // Added currentUser for Permissions
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  setOpeningBalances: React.Dispatch<React.SetStateAction<{ CASH: number; CUB: number; KVB: number; CAPITAL: number; }>>;
  bankAccounts: BankAccount[];
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
}

type PurposeType = 'ROYALTY' | 'INTEREST' | 'CHIT' | 'PRINCIPAL_RECOVERY' | 'GENERAL' | 'EXPENSE' | 'TRANSFER' | 'LOAN_INTEREST' | 'LOAN_REPAYMENT' | 'OTHER_BUSINESS' | 'CHIT_SAVINGS' | 'DIRECT_INCOME' | 'SAVINGS';

const AccountsManager: React.FC<AccountsManagerProps> = ({ 
  payments, setPayments, customers, setCustomers, invoices, setInvoices,
  expenseCategories, otherBusinesses, role, setAuditLogs, liabilities, setLiabilities,
  investments = [], setInvestments, incomeCategories = [], currentUser,
  openingBalances, setOpeningBalances, bankAccounts, setBankAccounts
}) => {
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [purpose, setPurpose] = useState<PurposeType>('GENERAL');
  const [accountSearch, setAccountSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Payment>>({
    amount: 0,
    mode: 'CASH',
    targetMode: bankAccounts.find(b => b.status === 'ACTIVE')?.name || 'CASH',
    date: Date.now(),
    sourceId: '',
    sourceName: '',
    notes: '',
    businessUnit: ''
  });

  const selectParty = (party: any) => {
    setSelectedParty(party);
    setFormData({ 
      ...formData, 
      sourceId: party.id, 
      sourceName: party.providerName || party.name, 
      businessUnit: party.partyType === 'BUSINESS_UNIT' ? party.name : undefined 
    });
    setAccountSearch(party.providerName || party.name);
    setShowResults(false);
  };

  const getPartyBalance = (party: any, type: string, currentPurpose: PurposeType) => {
    // 1. CUSTOMER BALANCES (INCOMING)
    if (type === 'CUSTOMER') {
      if (currentPurpose === 'PRINCIPAL_RECOVERY') return party.interestPrincipal || 0;
      
      // For Income types, sum unpaid invoices
      let validTypes: string[] = [];
      if (currentPurpose === 'ROYALTY') validTypes = ['ROYALTY'];
      else if (currentPurpose === 'INTEREST') validTypes = ['INTEREST'];
      else if (currentPurpose === 'CHIT') validTypes = ['CHIT'];
      else validTypes = ['ROYALTY', 'INTEREST', 'CHIT']; // General

      const invoiceDue = invoices
        .filter(i => i.customerId === party.id && !i.isVoid && validTypes.includes(i.type))
        .reduce((sum, i) => sum + i.balance, 0);
      
      // Add general Opening Balance (Assets) to the total receivable
      return invoiceDue + (party.openingBalance || 0);
    } 
    
    // 2. LIABILITY BALANCES (OUTGOING)
    if (type === 'LIABILITY') {
      if (currentPurpose === 'LOAN_REPAYMENT') return party.principal || 0; // Principal outstanding
      if (currentPurpose === 'LOAN_INTEREST') {
         // Check for Interest Out invoices
         return invoices
           .filter(i => i.lenderId === party.id && !i.isVoid && i.type === 'INTEREST_OUT')
           .reduce((sum, i) => sum + i.balance, 0);
      }
    }

    // 3. CHIT INVESTMENT (PAYABLE)
    if (type === 'INVESTMENT' && currentPurpose === 'CHIT_SAVINGS' && party.chitConfig) {
        // Calculate paid vs total duration
        const paidMonths = party.transactions?.length || 0;
        return (party.chitConfig.durationMonths - paidMonths) * party.chitConfig.monthlyInstallment;
    }

    // 4. SAVINGS ASSET VALUE (REFERENCE)
    if (type === 'INVESTMENT' && currentPurpose === 'SAVINGS') {
        if (party.contributionType === 'MONTHLY') {
            return party.transactions?.reduce((sum: number, t: any) => sum + t.amountPaid, 0) || 0;
        }
        return party.amountInvested || 0;
    }
    
    // 3. EXPENSES / OTHERS (Usually 0 or specific logic)
    return 0;
  };

  const availableParties = useMemo(() => {
    const search = accountSearch.toLowerCase();
    let pool: any[] = [];
    
    if (direction === 'IN') {
      // Filter strictly based on Purpose
      if (purpose === 'ROYALTY') {
         pool = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE');
      } else if (purpose === 'INTEREST' || purpose === 'PRINCIPAL_RECOVERY') {
         pool = customers.filter(c => c.isInterest && c.status === 'ACTIVE');
      } else if (purpose === 'CHIT') {
         pool = customers.filter(c => c.isChit && c.status === 'ACTIVE');
      } else if (purpose === 'OTHER_BUSINESS') {
         pool = otherBusinesses.map(b => ({ id: `BIZ_${b}`, name: b, partyType: 'BUSINESS_UNIT' }));
      } else if (purpose === 'DIRECT_INCOME') {
         pool = incomeCategories.map(b => ({ id: `INC_${b}`, name: b, partyType: 'INCOME_CAT' }));
      } else if (purpose === 'CHIT_SAVINGS') {
         // WE WON THE CHIT (Prize Money Receipt)
         pool = investments.filter(inv => inv.type === 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      } else if (purpose === 'SAVINGS') {
         // Maturity/Withdrawal from LIC, SIP, Gold, FD
         pool = investments.filter(inv => inv.type !== 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      } else if (purpose === 'GENERAL') {
        // Only active customers for General receipts
        pool = customers.filter(c => c.status === 'ACTIVE');
      }
      
      // Apply Search & Map to uniform structure with Balance
      return pool
        .filter(p => p.name.toLowerCase().includes(search))
        .map(p => {
            const pType = p.partyType || 'CUSTOMER';
            
            // Calculate Breakdown for Customers
            let breakdown = undefined;
            if (pType === 'CUSTOMER') {
               const custInvoices = invoices.filter(i => i.customerId === p.id && !i.isVoid);
               breakdown = {
                  royalty: custInvoices.filter(i => i.type === 'ROYALTY').reduce((sum, i) => sum + i.balance, 0),
                  interest: custInvoices.filter(i => i.type === 'INTEREST').reduce((sum, i) => sum + i.balance, 0),
                  chit: custInvoices.filter(i => i.type === 'CHIT' && i.direction === 'IN').reduce((sum, i) => sum + i.balance, 0),
                  principal: p.interestPrincipal || 0,
                  opening: Math.max(0, p.openingBalance || 0)
               };
            }

            return { 
                ...p, 
                partyType: pType,
                currentBalance: getPartyBalance(p, pType, purpose),
                breakdown
            };
        });

    } else {
      // OUTGOING
      if (purpose === 'EXPENSE') {
        pool = expenseCategories.map(c => ({ id: c, name: c, partyType: 'EXPENSE_CAT' }));
      } else if (purpose === 'LOAN_REPAYMENT' || purpose === 'LOAN_INTEREST') {
        pool = liabilities.filter(l => l.status === 'ACTIVE').map(l => ({ ...l, name: l.providerName, partyType: 'LIABILITY' }));
      } else if (purpose === 'OTHER_BUSINESS') {
         pool = otherBusinesses.map(b => ({ id: `BIZ_${b}`, name: b, partyType: 'BUSINESS_UNIT' }));
      } else if (purpose === 'CHIT_SAVINGS') {
         // WE PAY THE CHIT INSTALLMENT
         pool = investments.filter(inv => inv.type === 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      } else if (purpose === 'SAVINGS') {
         // Paying Premiums, Buying Gold, FD
         pool = investments.filter(inv => inv.type !== 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      }
      
      return pool
        .filter(p => p.name.toLowerCase().includes(search))
        .map(p => {
             const pType = p.partyType || (purpose === 'EXPENSE' ? 'EXPENSE_CAT' : 'LIABILITY');
             return {
                 ...p,
                 partyType: pType,
                 currentBalance: getPartyBalance(p, pType, purpose)
             };
        });
    }
  }, [accountSearch, direction, purpose, customers, expenseCategories, liabilities, otherBusinesses, invoices, investments, incomeCategories]);

  // REVERSAL LOGIC
  const reverseSideEffects = (payment: Payment) => {
    // 1. Reverse Principal Recovery (Add back to Asset)
    if (payment.category === 'PRINCIPAL_RECOVERY') {
       setCustomers(prev => prev.map(c => c.id === payment.sourceId ? { ...c, interestPrincipal: c.interestPrincipal + payment.amount } : c));
    }
    // 2. Reverse Loan Repayment (Add back to Liability)
    if (payment.category === 'LOAN_REPAYMENT') {
       setLiabilities(prev => prev.map(l => l.id === payment.sourceId ? { ...l, principal: l.principal + payment.amount } : l));
    }
    // 3. Reverse Chit Savings (Remove Transaction from Investment)
    if (payment.category === 'CHIT_SAVINGS' && setInvestments) {
        if (payment.type === 'OUT') {
            setInvestments(prev => prev.map(inv => {
                if (inv.id !== payment.sourceId) return inv;
                const updatedTxns = inv.transactions?.filter(t => !(t.amountPaid === payment.amount && t.date === payment.date)); 
                return { ...inv, transactions: updatedTxns };
            }));
        } else if (payment.type === 'IN') {
            setInvestments(prev => prev.map(inv => inv.id === payment.sourceId ? {
                ...inv,
                chitConfig: { ...inv.chitConfig!, isPrized: false, prizeAmount: 0, prizeMonth: 0 }
            } : inv));
        }
    }
    // 4. Reverse Regular Savings (LIC/SIP/Gold)
    if (payment.category === 'SAVINGS' && setInvestments && payment.type === 'OUT') {
        setInvestments(prev => prev.map(inv => {
            if (inv.id !== payment.sourceId) return inv;
            if (inv.contributionType === 'MONTHLY') {
                const updatedTxns = inv.transactions?.filter(t => !(t.amountPaid === payment.amount && t.date === payment.date));
                return { ...inv, transactions: updatedTxns };
            } else {
                // For Lump Sum, reduce the invested amount
                return { ...inv, amountInvested: Math.max(0, inv.amountInvested - payment.amount) };
            }
        }));
    }
    
    // 5. Reverse Wallet Balance Changes
    if (payment.category === 'TRANSFER') {
      // Reverse CONTRA: Add back to source, Deduct from target
      const sourceMode = payment.mode;
      const targetMode = payment.targetMode;
      
      // Add back to source
      if (sourceMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + payment.amount }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === sourceMode ? { ...b, openingBalance: b.openingBalance + payment.amount } : b
        ));
      }
      
      // Deduct from target
      if (targetMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH - payment.amount }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === targetMode ? { ...b, openingBalance: b.openingBalance - payment.amount } : b
        ));
      }
    } else {
      // Reverse regular Receipt/Payment
      const paymentMode = payment.mode;
      const amountChange = payment.type === 'IN' ? -payment.amount : payment.amount; // Reverse the direction
      
      if (paymentMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + amountChange }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === paymentMode ? { ...b, openingBalance: b.openingBalance + amountChange } : b
        ));
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this voucher? This will reverse related ledger entries.")) {
       const paymentToDelete = payments.find(p => p.id === id);
       if (paymentToDelete) {
          try {
            reverseSideEffects(paymentToDelete);
            await paymentAPI.delete(id);
            setPayments(prev => prev.filter(p => p.id !== id));
          } catch (error) {
            console.error('Failed to delete payment:', error);
            alert('Failed to delete payment. Please try again.');
          }
       }
    }
  };

  const handleEdit = (payment: Payment) => {
    setEditingId(payment.id);
    setDirection(payment.type);
    setPurpose(payment.category as PurposeType);
    setFormData(payment);
    setAccountSearch(payment.sourceName);
    setSelectedParty({ id: payment.sourceId, partyType: 'UNKNOWN' }); // Minimal mock, user should re-select if changing source
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Blur the input to save the value
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.sourceName) return;

    // If Editing, Delete original first (Reverse effects)
    if (editingId) {
       const originalPayment = payments.find(p => p.id === editingId);
       if (originalPayment) reverseSideEffects(originalPayment);
       setPayments(prev => prev.filter(p => p.id !== editingId));
    }

    const newPayment: Payment = {
      ...formData as Payment,
      id: editingId || Math.random().toString(36).substr(2, 9),
      type: direction,
      voucherType: purpose === 'TRANSFER' ? 'CONTRA' : (direction === 'IN' ? 'RECEIPT' : 'PAYMENT'),
      category: purpose === 'EXPENSE' ? formData.sourceId : 
                purpose === 'DIRECT_INCOME' ? formData.sourceId?.replace('INC_', '') : 
                purpose === 'OTHER_BUSINESS' ? formData.businessUnit || formData.sourceName :
                purpose,
      date: new Date(formData.date!).getTime()
    };
    
    console.log('Creating payment:', { purpose, sourceId: formData.sourceId, businessUnit: formData.businessUnit, sourceName: formData.sourceName, category: newPayment.category, type: newPayment.type, voucherType: newPayment.voucherType });

    // --- AUTO-LEDGERING LOGIC (APPLY NEW EFFECTS) ---

    // 1. Principal Recovery -> Reduce Lending Asset
    if (purpose === 'PRINCIPAL_RECOVERY') {
       setCustomers(prev => prev.map(c => c.id === newPayment.sourceId ? { ...c, interestPrincipal: Math.max(0, c.interestPrincipal - newPayment.amount) } : c));
    }
    
    // 2. Loan Repayment -> Reduce Debt Liability
    if (purpose === 'LOAN_REPAYMENT') {
       setLiabilities(prev => prev.map(l => l.id === newPayment.sourceId ? { ...l, principal: Math.max(0, l.principal - newPayment.amount) } : l));
    }

    // 3. Chit Savings -> Update Investment Ledger
    if (purpose === 'CHIT_SAVINGS' && setInvestments) {
        // PAYMENT (OUT): Paying an installment
        if (direction === 'OUT') {
            const currentInv = investments.find(i => i.id === newPayment.sourceId);
            const monthNum = (currentInv?.transactions?.length || 0) + 1;
            
            const transaction: InvestmentTransaction = {
                id: Math.random().toString(36).substr(2, 9),
                date: newPayment.date,
                month: monthNum,
                amountPaid: newPayment.amount,
                dividend: 0, 
                totalPayable: newPayment.amount 
            };
            setInvestments(prev => prev.map(inv => inv.id === newPayment.sourceId ? { ...inv, transactions: [...(inv.transactions || []), transaction] } : inv));
        }
        // RECEIPT (IN): Winning Prize Money
        else if (direction === 'IN') {
            setInvestments(prev => prev.map(inv => inv.id === newPayment.sourceId ? {
                ...inv,
                chitConfig: {
                    ...inv.chitConfig!,
                    isPrized: true,
                    prizeAmount: newPayment.amount,
                    prizeMonth: (inv.transactions?.length || 0) + 1
                }
            } : inv));
        }
    }

    // 4. Regular Savings (LIC, SIP, Gold, FD) -> Update Investment Ledger
    if (purpose === 'SAVINGS' && setInvestments && direction === 'OUT') {
        const currentInv = investments.find(i => i.id === newPayment.sourceId);
        if (currentInv) {
            // If Monthly (LIC/SIP/Gold Scheme)
            if (currentInv.contributionType === 'MONTHLY') {
                const monthNum = (currentInv.transactions?.length || 0) + 1;
                const transaction: InvestmentTransaction = {
                    id: Math.random().toString(36).substr(2, 9),
                    date: newPayment.date,
                    month: monthNum,
                    amountPaid: newPayment.amount,
                    dividend: 0,
                    totalPayable: newPayment.amount
                };
                setInvestments(prev => prev.map(inv => inv.id === newPayment.sourceId ? { ...inv, transactions: [...(inv.transactions || []), transaction] } : inv));
            } 
            // If Lump Sum (FD, Gold Purchase)
            else {
                setInvestments(prev => prev.map(inv => inv.id === newPayment.sourceId ? { ...inv, amountInvested: inv.amountInvested + newPayment.amount } : inv));
            }
        }
    }

    // --- UPDATE WALLET BALANCES ---
    if (purpose === 'TRANSFER') {
      // CONTRA Transfer: Deduct from source, Add to target
      const sourceMode = newPayment.mode;
      const targetMode = newPayment.targetMode;
      
      // Deduct from source
      if (sourceMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH - newPayment.amount }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === sourceMode ? { ...b, openingBalance: b.openingBalance - newPayment.amount } : b
        ));
      }
      
      // Add to target
      if (targetMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + newPayment.amount }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === targetMode ? { ...b, openingBalance: b.openingBalance + newPayment.amount } : b
        ));
      }
    } else {
      // Regular Receipt/Payment: Update the selected mode balance
      const paymentMode = newPayment.mode;
      const amountChange = direction === 'IN' ? newPayment.amount : -newPayment.amount;
      
      if (paymentMode === 'CASH') {
        setOpeningBalances(prev => ({ ...prev, CASH: prev.CASH + amountChange }));
      } else {
        setBankAccounts(prev => prev.map(b => 
          b.name === paymentMode ? { ...b, openingBalance: b.openingBalance + amountChange } : b
        ));
      }
    }

    try {
      // Save or update payment via API
      console.log('=== SAVING PAYMENT TO API ===');
      console.log('Editing ID:', editingId);
      console.log('Payment data:', JSON.stringify(newPayment, null, 2));
      
      if (editingId) {
        const response = await paymentAPI.update(editingId, newPayment);
        console.log('Update API response:', response);
        setPayments(prev => prev.map(p => p.id === editingId ? newPayment : p));
      } else {
        const response = await paymentAPI.create(newPayment);
        console.log('Create API response:', response);
        setPayments(prev => {
          const updated = [newPayment, ...prev];
          console.log('Adding payment to local state. New length:', updated.length);
          return updated;
        });
      }
      
      // Reset Form
      setFormData({ ...formData, amount: 0, notes: '' });
      setAccountSearch('');
      setSelectedParty(null);
      setEditingId(null);
      alert(editingId ? "Voucher Updated Successfully" : "Voucher Saved Successfully");
    } catch (error) {
      console.error('=== PAYMENT SAVE FAILED ===');
      console.error('Error details:', error);
      alert('Failed to save payment. Please try again.');
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-10">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Voucher Entry</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Cashbook & Journals</p>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-200 flex flex-col md:flex-row">
        
        {/* LEFT: CONFIGURATION */}
        <div className="w-full md:w-1/3 bg-slate-50 border-r border-slate-200 p-8 space-y-8">
           
           {/* 1. Transaction Type */}
           <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Flow Direction</label>
              <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
                 <button 
                    onClick={() => { setDirection('IN'); setPurpose('GENERAL'); setAccountSearch(''); setSelectedParty(null); }} 
                    className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${direction === 'IN' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                 >
                    In (Receipt)
                 </button>
                 <button 
                    onClick={() => { setDirection('OUT'); setPurpose('EXPENSE'); setAccountSearch(''); setSelectedParty(null); }} 
                    className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${direction === 'OUT' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                 >
                    Out (Payment)
                 </button>
              </div>
           </div>

           {/* 2. Nature of Transaction */}
           <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Voucher Purpose</label>
              <div className="grid grid-cols-2 gap-2">
                 {direction === 'IN' ? (
                   <>
                     <button onClick={() => { setPurpose('GENERAL'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'GENERAL' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>General / Party</button>
                     <button onClick={() => { setPurpose('DIRECT_INCOME'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'DIRECT_INCOME' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Direct Income</button>
                     <button onClick={() => { setPurpose('OTHER_BUSINESS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OTHER_BUSINESS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Business Unit</button>
                     <button onClick={() => { setPurpose('ROYALTY'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'ROYALTY' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Royalty Income</button>
                     <button onClick={() => { setPurpose('INTEREST'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'INTEREST' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Interest Rec.</button>
                     <button onClick={() => { setPurpose('PRINCIPAL_RECOVERY'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'PRINCIPAL_RECOVERY' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Principal Rec.</button>
                     <button onClick={() => { setPurpose('SAVINGS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'SAVINGS' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Savings & Assets</button>
                     <button onClick={() => { setPurpose('CHIT_SAVINGS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'CHIT_SAVINGS' ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Chit Prize (Won)</button>
                     <button onClick={() => { setDirection('IN'); setPurpose('TRANSFER'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'TRANSFER' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Contra / Transfer</button>
                   </>
                 ) : (
                   <>
                     <button onClick={() => { setPurpose('EXPENSE'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'EXPENSE' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Op. Expense</button>
                     <button onClick={() => { setPurpose('OTHER_BUSINESS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OTHER_BUSINESS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Business Unit</button>
                     <button onClick={() => { setPurpose('LOAN_INTEREST'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'LOAN_INTEREST' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Debt Interest</button>
                     <button onClick={() => { setPurpose('LOAN_REPAYMENT'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'LOAN_REPAYMENT' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Debt Repayment</button>
                     <button onClick={() => { setPurpose('SAVINGS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'SAVINGS' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Savings & Assets</button>
                     <button onClick={() => { setPurpose('CHIT_SAVINGS'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'CHIT_SAVINGS' ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Chit Installment</button>
                     <button onClick={() => { setDirection('IN'); setPurpose('TRANSFER'); setAccountSearch(''); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'TRANSFER' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Contra / Transfer</button>
                   </>
                 )}
              </div>
           </div>

        </div>

        {/* RIGHT: ENTRY FORM */}
        <form onSubmit={handleSubmit} className="flex-1 p-8 bg-white flex flex-col justify-between">
           <div className="space-y-6">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                    {editingId ? 'Edit Voucher' : 'New Transaction'}
                 </h3>
                 {editingId && (
                    <button type="button" onClick={() => { setEditingId(null); setFormData({ amount: 0, mode: 'CASH', date: Date.now() }); }} className="text-xs font-bold text-rose-500 hover:underline">Cancel Edit</button>
                 )}
              </div>
              
              {/* Account Selector */}
              <div className="relative">
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    {direction === 'IN' ? 'Received From' : 'Paid To'} 
                    {purpose === 'OTHER_BUSINESS' && ' (Business Unit)'}
                    {purpose === 'DIRECT_INCOME' && ' (Source Category)'}
                    {purpose === 'CHIT_SAVINGS' && ' (Select Chit Investment)'}
                    {purpose === 'SAVINGS' && ' (Select Asset / Scheme)'}
                 </label>
                 <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                    <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 uppercase"
                      placeholder="SEARCH..." 
                      value={accountSearch}
                      onChange={e => { setAccountSearch(e.target.value); setShowResults(true); }}
                      onFocus={() => setShowResults(true)}
                    />
                 </div>
                 
                 {/* Selected Balance Display */}
                 {selectedParty && (selectedParty.currentBalance > 0 || (selectedParty.breakdown && Object.values(selectedParty.breakdown).some((v: any) => v > 0))) && (
                    <div className="mt-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 animate-fadeIn shadow-sm">
                       <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-200">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             {purpose === 'SAVINGS' ? 'Total Invested' : 'Total Outstanding'}
                          </span>
                          <span className={`text-sm font-black ${purpose === 'SAVINGS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                             ₹{selectedParty.currentBalance.toLocaleString()}
                          </span>
                       </div>
                       
                       {selectedParty.breakdown && (
                          <div className="space-y-2">
                             {selectedParty.breakdown.royalty > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Royalty</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{selectedParty.breakdown.royalty.toLocaleString()}</span>
                                </div>
                             )}
                             {selectedParty.breakdown.interest > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Interest Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{selectedParty.breakdown.interest.toLocaleString()}</span>
                                </div>
                             )}
                             {selectedParty.breakdown.chit > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-orange-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Chit Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{selectedParty.breakdown.chit.toLocaleString()}</span>
                                </div>
                             )}
                             {selectedParty.breakdown.principal > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Principal Lent</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{selectedParty.breakdown.principal.toLocaleString()}</span>
                                </div>
                             )}
                             {selectedParty.breakdown.opening > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">General / Old</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{selectedParty.breakdown.opening.toLocaleString()}</span>
                                </div>
                             )}
                          </div>
                       )}
                    </div>
                 )}

                 {showResults && accountSearch && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto z-20">
                       {availableParties.map((p: any) => (
                          <div 
                             key={p.id} 
                             onClick={() => selectParty(p)} 
                             className="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center group"
                          >
                             <div>
                                <div className="text-xs font-black text-slate-800 uppercase group-hover:text-indigo-600 transition-colors">{p.name}</div>
                                <div className="text-[9px] font-bold text-slate-400">{p.partyType?.replace('_', ' ')} {p.type ? `- ${p.type.replace('_', ' ')}` : ''}</div>
                             </div>
                             {p.currentBalance > 0 && (
                                <div className="text-right">
                                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{purpose === 'SAVINGS' ? 'Current Value' : 'Due'}</div>
                                   <div className={`text-xs font-bold ${purpose === 'SAVINGS' ? 'text-emerald-600' : 'text-rose-500'}`}>₹{p.currentBalance.toLocaleString()}</div>
                                </div>
                             )}
                          </div>
                       ))}
                       {availableParties.length === 0 && <div className="p-4 text-xs text-slate-400 italic">No matches found for {purpose} purpose.</div>}
                    </div>
                 )}
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (₹)</label>
                    <input data-testid="input-amount" required type="number" className="w-full border-2 border-slate-100 p-4 rounded-2xl text-2xl font-display font-black outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Enter amount" value={formData.amount && formData.amount !== 0 ? formData.amount : ''} onChange={e => setFormData({...formData, amount: Number(e.target.value) || 0})} onKeyDown={handleKeyDown} />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Transaction Date</label>
                    <input required type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white" value={new Date(formData.date!).toISOString().substr(0,10)} onChange={e => setFormData({...formData, date: new Date(e.target.value).getTime()})} />
                 </div>
              </div>

              {/* Bank/Cash Mode */}
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Mode</label>
                    <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-white text-xs font-black uppercase outline-none focus:border-indigo-500" value={formData.mode} onChange={e => setFormData({...formData, mode: e.target.value as any})}>
                      <option value="CASH">Cash Drawer</option>
                      {bankAccounts.filter(b => b.status === 'ACTIVE').map(bank => (
                        <option key={bank.id} value={bank.name}>{bank.name}</option>
                      ))}
                    </select>
                 </div>
                 {purpose === 'TRANSFER' && (
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Account</label>
                      <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-white text-xs font-black uppercase outline-none focus:border-indigo-500" value={formData.targetMode} onChange={e => setFormData({...formData, targetMode: e.target.value as any})}>
                        <option value="CASH">Cash Drawer</option>
                        {bankAccounts.filter(b => b.status === 'ACTIVE').map(bank => (
                          <option key={bank.id} value={bank.name}>{bank.name}</option>
                        ))}
                      </select>
                   </div>
                 )}
              </div>

              {/* Notes */}
              <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Narration / Remarks</label>
                 <input className="w-full border-2 border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white" placeholder="OPTIONAL NOTES..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
              </div>

           </div>

           <div className="mt-8 pt-8 border-t border-slate-100">
              <button data-testid="btn-save-voucher" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl hover:scale-[1.01] transition text-sm flex justify-center items-center gap-2">
                 {editingId ? <><i className="fas fa-save"></i> Update Voucher</> : <><i className="fas fa-check-circle"></i> Post Voucher</>}
              </button>
           </div>
        </form>
      </div>

      {/* RECENT VOUCHERS LIST */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
         <div className="p-8 border-b border-slate-100 bg-slate-50">
            <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Recent Vouchers</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History & Corrections</p>
         </div>
         <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-white">
               <tr>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Party / Head</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Mode</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Amount</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
               {payments.slice(0, 15).map(p => (
                     <tr key={p.id} className="hover:bg-slate-50 transition group">
                        <td className="px-8 py-4 text-xs font-bold text-slate-500">{new Date(p.date).toLocaleDateString()}</td>
                        <td className="px-8 py-4">
                           <div className="text-xs font-black text-slate-800 uppercase">{p.sourceName}</div>
                           <div className="text-[9px] font-bold text-slate-400">{p.category}</div>
                        </td>
                        <td className="px-8 py-4">
                           <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase tracking-widest">{p.mode} {p.targetMode ? `→ ${p.targetMode}` : ''}</span>
                        </td>
                        <td className={`px-8 py-4 text-right font-display font-black text-sm ${p.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                           {p.type === 'IN' ? '+' : '-'} ₹{p.amount.toLocaleString()}
                        </td>
                        <td className="px-8 py-4 text-right">
                           <div className="flex justify-end gap-2">
                              {currentUser?.permissions.canEdit && (
                                 <button onClick={() => handleEdit(p)} className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition">
                                    <i className="fas fa-pen text-xs"></i>
                                 </button>
                              )}
                              {currentUser?.permissions.canDelete && (
                                 <button onClick={() => handleDelete(p.id)} className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-600 hover:text-white transition">
                                    <i className="fas fa-trash-alt text-xs"></i>
                                 </button>
                              )}
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
      </div>
    </div>
  );
}

export default AccountsManager;
