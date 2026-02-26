import React, { useState, useMemo } from 'react';
import { Payment, Customer, Invoice, UserRole, AuditLog, Liability, Investment, InvestmentTransaction, StaffUser, BankAccount } from '../types';
import { paymentAPI, invoiceAPI, liabilityAPI, investmentAPI } from '../services/api';

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

type PurposeType = 'ROYALTY' | 'INTEREST' | 'CHIT' | 'PRINCIPAL_RECOVERY' | 'GENERAL' | 'EXPENSE' | 'TRANSFER' | 'LOAN_INTEREST' | 'LOAN_REPAYMENT' | 'OTHER_BUSINESS' | 'CHIT_SAVINGS' | 'DIRECT_INCOME' | 'SAVINGS' | 'CHIT_FUND' | 'OVERALL';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Voucher filter & pagination
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [voucherCatFilter, setVoucherCatFilter] = useState<string>('ALL');
  const [voucherSearch, setVoucherSearch] = useState<string>('');
  const [voucherPage, setVoucherPage] = useState<number>(1);
  const VOUCHER_PAGE_SIZE = 30;
  
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

  // Purposes that operate on the customer pool — party should be preserved when switching between these
  const CUSTOMER_PURPOSES: PurposeType[] = ['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'GENERAL', 'PRINCIPAL_RECOVERY', 'OVERALL'];

  const changePurpose = (newPurpose: PurposeType) => {
    const currentIsCustomer = CUSTOMER_PURPOSES.includes(purpose) && selectedParty?.partyType === 'CUSTOMER';
    const newIsCustomer = CUSTOMER_PURPOSES.includes(newPurpose);
    setPurpose(newPurpose);
    // Only clear the selected party & search when switching to a completely different pool type
    if (!currentIsCustomer || !newIsCustomer) {
      setAccountSearch('');
      setSelectedParty(null);
    }
  };

  const getOutstandingCategory = (breakdown: any, party?: any): PurposeType => {
    const categories = ['chit', 'royalty', 'interest', 'principal'] as const;
    let maxCat: string = 'GENERAL';
    let maxVal = 0;
    if (breakdown) {
      for (const cat of categories) {
        if (breakdown[cat] && breakdown[cat] > maxVal) {
          maxVal = breakdown[cat];
          maxCat = cat.toUpperCase();
        }
      }
    }
    // Map category key to purpose type
    if (maxCat === 'CHIT') return 'CHIT_FUND';
    if (maxCat === 'ROYALTY') return 'ROYALTY';
    if (maxCat === 'INTEREST') return 'INTEREST';
    // Fallback: use customer portfolio flags when all outstanding is zero
    if (party?.isChit) return 'CHIT_FUND';
    if (party?.isRoyalty) return 'ROYALTY';
    if (party?.isInterest) return 'INTEREST';
    return 'GENERAL';
  };

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
    // Always show OVERALL summary first so the user sees all category outstandings.
    // They can then click a specific category button to post.
    if (party.partyType === 'CUSTOMER' || !party.partyType) {
      setPurpose('OVERALL');
    }
  };

  const getPartyBalance = (party: any, type: string, currentPurpose: PurposeType, signed = false) => {
    // 1. CUSTOMER BALANCES (INCOMING)
    if (type === 'CUSTOMER') {
      if (currentPurpose === 'PRINCIPAL_RECOVERY') return party.interestPrincipal || 0;
      
      // Separate invoice-type filter from payment-category filter so CHIT_FUND payments
      // (which reference CHIT invoices) are correctly counted.
      let validInvoiceTypes: string[] = [];
      let validPaymentCats: string[] = [];
      if (currentPurpose === 'ROYALTY') {
        validInvoiceTypes = ['ROYALTY'];
        validPaymentCats = ['ROYALTY'];
      } else if (currentPurpose === 'INTEREST') {
        // Interest ledger mirrors party ledger: includes the lending principal as opening
        // and PRINCIPAL_RECOVERY repayments reduce the outstanding balance
        validInvoiceTypes = ['INTEREST'];
        validPaymentCats = ['INTEREST', 'PRINCIPAL_RECOVERY'];
      } else if (currentPurpose === 'CHIT' || currentPurpose === 'CHIT_FUND') {
        validInvoiceTypes = ['CHIT'];
        validPaymentCats = ['CHIT', 'CHIT_FUND'];
      } else {
        // GENERAL / OVERALL: all categories combined
        validInvoiceTypes = ['ROYALTY', 'INTEREST', 'CHIT'];
        validPaymentCats = ['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'PRINCIPAL_RECOVERY', 'GENERAL'];
      }

      // DR invoices (receivable — member owes us installments/fees)
      const totalDR = invoices
        .filter(i => i.customerId === party.id && !i.isVoid && validInvoiceTypes.includes(i.type) && i.direction !== 'OUT')
        .reduce((sum, i) => sum + i.amount, 0);

      // CR invoices (payouts we owe the member, e.g. chit prize)
      const totalCRInvoice = invoices
        .filter(i => i.customerId === party.id && !i.isVoid && validInvoiceTypes.includes(i.type) && i.direction === 'OUT')
        .reduce((sum, i) => sum + i.amount, 0);

      // Cash receipts already received (IN payments reduce what party owes us)
      const totalCRPayment = payments
        .filter(p => p.sourceId === party.id && p.type === 'IN' && validPaymentCats.includes(p.category))
        .reduce((sum, p) => sum + p.amount, 0);

      // OUT payments we made to the party (reduce what we owe them — DR side in ledger)
      const totalOutPayment = payments
        .filter(p => p.sourceId === party.id && p.type === 'OUT' && validPaymentCats.includes(p.category))
        .reduce((sum, p) => sum + p.amount, 0);

      // Opening balance per category:
      // OVERALL = openingBalance + interestPrincipal (full combined picture)
      // GENERAL = openingBalance only
      // INTEREST = 0 — shows only accrued interest invoices minus payments (principal tracked separately under PRINCIPAL_RECOVERY)
      const openingAdj = currentPurpose === 'OVERALL'
        ? (party.openingBalance || 0) + (party.interestPrincipal || 0)
        : currentPurpose === 'GENERAL'
          ? (party.openingBalance || 0)
          : 0;

      const net = totalDR - totalCRInvoice - totalCRPayment + totalOutPayment + openingAdj;
      return signed ? net : Math.max(0, net);
    } 
    
    // 2. LIABILITY BALANCES (OUTGOING)
    if (type === 'LIABILITY') {
      if (currentPurpose === 'LOAN_REPAYMENT') return party.principal || 0;
      if (currentPurpose === 'LOAN_INTEREST') {
         return invoices
           .filter(i => i.lenderId === party.id && !i.isVoid && i.type === 'INTEREST_OUT')
           .reduce((sum, i) => sum + i.amount, 0)
           - payments.filter(p => p.sourceId === party.id && p.type === 'OUT' && p.category === 'LOAN_INTEREST').reduce((sum, p) => sum + p.amount, 0);
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

  const getCustomerStats = (cid: string) => {
    const cust = customers.find(c => c.id === cid);
    const custInvoices = invoices.filter(inv => inv.customerId === cid);
    const totalRaised = custInvoices.reduce((acc, inv) => acc + inv.amount, 0);
    const totalOutstanding = custInvoices.reduce((acc, inv) => acc + inv.balance, 0);
    // Add opening balance to total outstanding
    return { totalRaised, totalPaid: totalRaised - totalOutstanding, totalOutstanding: totalOutstanding + (cust?.openingBalance || 0) };
  };

  const availableParties = useMemo(() => {
    const search = accountSearch.toLowerCase();
    let pool: any[] = [];
    
    if (direction === 'IN') {
      // Filter strictly based on Purpose
      if (purpose === 'OVERALL') {
         // Overview mode: all active customers, shows full category breakdown
         pool = customers.filter(c => c.status === 'ACTIVE');
      } else if (purpose === 'ROYALTY') {
         pool = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE');
      } else if (purpose === 'INTEREST' || purpose === 'PRINCIPAL_RECOVERY') {
         pool = customers.filter(c => c.isInterest && c.status === 'ACTIVE');
      } else if (purpose === 'CHIT') {
         pool = customers.filter(c => c.isChit && c.status === 'ACTIVE');
      } else if (purpose === 'CHIT_FUND') {
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
            let breakdown = undefined;
            if (pType === 'CUSTOMER') {
               const custInvoices = invoices.filter(i => i.customerId === p.id && !i.isVoid);
               const custPaymentsIn  = payments.filter(pay => pay.sourceId === p.id && pay.type === 'IN');
               const custPaymentsOut = payments.filter(pay => pay.sourceId === p.id && pay.type === 'OUT');
               // Chit net = (CHIT IN installments) - (CHIT OUT payouts) - (IN receipts) + (OUT payments we made)
               const chitInvoices = custInvoices.filter(i => i.type === 'CHIT');
               const chitNet =
                  chitInvoices.filter(i => i.direction !== 'OUT').reduce((sum, i) => sum + i.amount, 0)
                  - chitInvoices.filter(i => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0)
                  - custPaymentsIn.filter(pay => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0)
                  + custPaymentsOut.filter(pay => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0);
               breakdown = {
                  royalty: custInvoices.filter(i => i.type === 'ROYALTY').reduce((sum, i) => sum + i.amount, 0)
                             - custPaymentsIn.filter(pay => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0)
                             + custPaymentsOut.filter(pay => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0),
                  interest: custInvoices.filter(i => i.type === 'INTEREST').reduce((sum, i) => sum + i.amount, 0)
                              - custPaymentsIn.filter(pay => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0)
                              + custPaymentsOut.filter(pay => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0),
                  chit: chitNet,
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
      if (purpose === 'OVERALL') {
        pool = customers.filter(c => c.status === 'ACTIVE');
      } else if (purpose === 'EXPENSE') {
        pool = expenseCategories.map(c => ({ id: c, name: c, partyType: 'EXPENSE_CAT' }));
      } else if (purpose === 'GENERAL') {
        pool = customers.filter(c => c.status === 'ACTIVE');
      } else if (purpose === 'CHIT_FUND') {
        // OUT CHIT_FUND: paying chit prize / settlement to a chit member
        pool = customers.filter(c => c.isChit && c.status === 'ACTIVE');
      } else if (purpose === 'ROYALTY') {
        // OUT ROYALTY: refund or adjustment to a royalty member
        pool = customers.filter(c => c.isRoyalty && c.status === 'ACTIVE');
      } else if (purpose === 'INTEREST') {
        // OUT INTEREST: repayment or adjustment for interest/lending customers
        pool = customers.filter(c => c.isInterest && c.status === 'ACTIVE');
      } else if (purpose === 'LOAN_REPAYMENT' || purpose === 'LOAN_INTEREST') {
        pool = liabilities.filter(l => l.status === 'ACTIVE').map(l => ({ ...l, name: l.providerName, partyType: 'LIABILITY' }));
      } else if (purpose === 'OTHER_BUSINESS') {
         pool = otherBusinesses.map(b => ({ id: `BIZ_${b}`, name: b, partyType: 'BUSINESS_UNIT' }));
      } else if (purpose === 'CHIT_SAVINGS') {
         pool = investments.filter(inv => inv.type === 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      } else if (purpose === 'SAVINGS') {
         pool = investments.filter(inv => inv.type !== 'CHIT_SAVINGS').map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
      }

      const isCustomerPurpose = ['GENERAL', 'CHIT_FUND', 'ROYALTY', 'INTEREST', 'OVERALL'].includes(purpose);
      
      return pool
        .filter(p => p.name.toLowerCase().includes(search))
        .map(p => {
             const pType = p.partyType || (
               purpose === 'EXPENSE' ? 'EXPENSE_CAT' :
               isCustomerPurpose ? 'CUSTOMER' :
               'LIABILITY'
             );

             // Compute per-category breakdown for customer entries in OUT direction
             let breakdown = undefined;
             if (pType === 'CUSTOMER') {
               const custInvoices = invoices.filter(i => i.customerId === p.id && !i.isVoid);
               const custPaymentsIn  = payments.filter(pay => pay.sourceId === p.id && pay.type === 'IN');
               const custPaymentsOut = payments.filter(pay => pay.sourceId === p.id && pay.type === 'OUT');
               const chitInvoices = custInvoices.filter(i => i.type === 'CHIT');
               const chitNet =
                  chitInvoices.filter(i => i.direction !== 'OUT').reduce((sum, i) => sum + i.amount, 0)
                  - chitInvoices.filter(i => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0)
                  - custPaymentsIn.filter(pay => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0)
                  + custPaymentsOut.filter(pay => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0);
               breakdown = {
                  royalty: custInvoices.filter(i => i.type === 'ROYALTY').reduce((sum, i) => sum + i.amount, 0)
                             - custPaymentsIn.filter(pay => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0)
                             + custPaymentsOut.filter(pay => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0),
                  interest: custInvoices.filter(i => i.type === 'INTEREST').reduce((sum, i) => sum + i.amount, 0)
                              - custPaymentsIn.filter(pay => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0)
                              + custPaymentsOut.filter(pay => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0),
                  chit: chitNet,
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
    }
  }, [accountSearch, direction, purpose, customers, expenseCategories, liabilities, otherBusinesses, invoices, investments, incomeCategories, payments]);

  // REVERSAL LOGIC
  const reverseSideEffects = (payment: Payment) => {
    // 0. Restore invoice balances (ROYALTY / INTEREST / CHIT / CHIT_FUND / GENERAL receipts)
    if (['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'GENERAL'].includes(payment.category) && payment.type === 'IN' && payment.sourceId) {
      const typeMap: Record<string, string[]> = {
        'ROYALTY': ['ROYALTY'],
        'INTEREST': ['INTEREST'],
        'CHIT': ['CHIT'],
        'CHIT_FUND': ['CHIT'],
        'GENERAL': ['ROYALTY', 'INTEREST', 'CHIT'],
      };
      const matchTypes = typeMap[payment.category] || [];
      let remaining = payment.amount;

      // Re-add the amount back to invoices that were reduced (LIFO - most recently settled first, i.e. newest paid/partial first)
      const customerInvoices = invoices
        .filter(inv =>
          inv.customerId === payment.sourceId &&
          !inv.isVoid &&
          inv.balance < inv.amount && // only invoices with some amount paid off
          matchTypes.includes(inv.type)
        )
        .sort((a, b) => b.date - a.date); // Newest first (reverse FIFO)

      const invoicesToRestore: typeof invoices = [];
      for (const inv of customerInvoices) {
        if (remaining <= 0) break;
        const restore = Math.min(remaining, inv.amount - inv.balance);
        const newBalance = inv.balance + restore;
        const newStatus = newBalance >= inv.amount ? 'UNPAID' : 'PARTIAL';
        remaining -= restore;
        invoicesToRestore.push({ ...inv, balance: newBalance, status: newStatus as any });
      }

      if (invoicesToRestore.length > 0) {
        setInvoices(prev =>
          prev.map(inv => {
            const restored = invoicesToRestore.find(u => u.id === inv.id);
            return restored || inv;
          })
        );
        for (const inv of invoicesToRestore) {
          invoiceAPI.update(inv.id, { balance: inv.balance, status: inv.status, updatedAt: Date.now() })
            .catch(e => console.error('Invoice balance restore failed:', e));
        }
      }
    }

    // 1. Reverse Principal Recovery (Add back to Asset)
    if (payment.category === 'PRINCIPAL_RECOVERY') {
       setCustomers(prev => prev.map(c => c.id === payment.sourceId ? { ...c, interestPrincipal: c.interestPrincipal + payment.amount } : c));
    }
    // 2. Reverse Loan Repayment (Add back to Liability)
    if (payment.category === 'LOAN_REPAYMENT') {
       setLiabilities(prev => prev.map(l => l.id === payment.sourceId ? { ...l, principal: l.principal + payment.amount } : l));
    }
    // 3. Reverse Chit Savings (Remove Transaction from Investment)
    if ((payment.category === 'CHIT_SAVINGS' || payment.category === 'INVESTMENT_CHIT_SAVINGS') && setInvestments) {
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
    if (deletingId) return;
    if (!window.confirm("Are you sure you want to delete this voucher? This will reverse related ledger entries.")) return;
    const paymentToDelete = payments.find(p => p.id === id);
    if (!paymentToDelete) return;
    setDeletingId(id);
    try {
      reverseSideEffects(paymentToDelete);
      await paymentAPI.delete(id);

      // Persist CHIT_SAVINGS investment ledger removal to backend
      if ((paymentToDelete.category === 'CHIT_SAVINGS' || paymentToDelete.category === 'INVESTMENT_CHIT_SAVINGS') && paymentToDelete.sourceId && setInvestments) {
        // Fetch FRESH from Firestore — avoids stale closure
        const freshInvAll = await investmentAPI.getAll();
        const targetInv = freshInvAll.find((i: any) => i.id === paymentToDelete.sourceId);
        if (targetInv) {
          let updatedInv = targetInv;
          if (paymentToDelete.type === 'OUT') {
            // Match by paymentId first (most reliable), then fall back to amount+date
            const updatedTxns = (targetInv.transactions || []).filter(
              (t: any) => {
                if (t.paymentId) return t.paymentId !== id;
                // fallback for older transactions without paymentId
                return !(t.amountPaid === paymentToDelete.amount && t.date === paymentToDelete.date);
              }
            );
            updatedInv = { ...targetInv, transactions: updatedTxns };
          } else if (paymentToDelete.type === 'IN') {
            // Prize money reversal — clear chitConfig.isPrized
            const cfg = targetInv.chitConfig || {};
            // Match by paymentId if stored, otherwise just clear if amounts match
            const shouldClear = !cfg.paymentId || cfg.paymentId === id;
            if (shouldClear) {
              updatedInv = { ...targetInv, chitConfig: { ...cfg, isPrized: false, prizeAmount: 0, prizeMonth: 0, paymentId: null } };
            }
          }
          await investmentAPI.update(targetInv.id, updatedInv);
          const refreshed = await investmentAPI.getAll();
          setInvestments(refreshed);
        }
      }

      // Reload payments from server to confirm deletion persisted
      const fresh = await paymentAPI.getAll();
      setPayments(fresh);
    } catch (error) {
      console.error('Failed to delete payment:', error);
      alert('Failed to delete payment. Please try again.');
    } finally {
      setDeletingId(null);
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
    if (isSubmitting) return;
    setIsSubmitting(true);

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
       const targetLiability = liabilities.find(l => l.id === newPayment.sourceId);
       if (targetLiability) {
         const newPrincipal = Math.max(0, targetLiability.principal - newPayment.amount);
         setLiabilities(prev => prev.map(l => l.id === newPayment.sourceId ? { ...l, principal: newPrincipal } : l));
         // Persist to backend
         liabilityAPI.update(newPayment.sourceId, { principal: newPrincipal, updatedAt: Date.now() })
           .catch(e => console.error('Liability principal update failed:', e));
       }
    }

    // 3. Chit Savings -> will be persisted in try block below (avoids duplicate transactions)

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

    // --- ALLOCATE PAYMENT AGAINST INVOICE BALANCES (ROYALTY / INTEREST / CHIT / CHIT_FUND / GENERAL) ---
    // This is the core ledger logic: a receipt reduces the matching unpaid invoices (FIFO - oldest first)
    if (['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'GENERAL'].includes(purpose) && direction === 'IN' && newPayment.sourceId) {
      const typeMap: Record<string, string[]> = {
        'ROYALTY': ['ROYALTY'],
        'INTEREST': ['INTEREST'],
        'CHIT': ['CHIT'],
        'CHIT_FUND': ['CHIT'],
        'GENERAL': ['ROYALTY', 'INTEREST', 'CHIT'],
      };
      const matchTypes = typeMap[purpose] || [];
      let remaining = newPayment.amount;

      // Find matching unpaid invoices for this customer, oldest first
      const customerInvoices = invoices
        .filter(inv =>
          inv.customerId === newPayment.sourceId &&
          !inv.isVoid &&
          inv.balance > 0 &&
          matchTypes.includes(inv.type)
        )
        .sort((a, b) => a.date - b.date); // FIFO

      const invoicesToUpdate: typeof invoices = [];
      for (const inv of customerInvoices) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, inv.balance);
        const newBalance = Math.max(0, inv.balance - deduct);
        const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
        remaining -= deduct;
        invoicesToUpdate.push({ ...inv, balance: newBalance, status: newStatus as any });
      }

      if (invoicesToUpdate.length > 0) {
        // Update UI immediately
        setInvoices(prev =>
          prev.map(inv => {
            const updated = invoicesToUpdate.find(u => u.id === inv.id);
            return updated || inv;
          })
        );
        // Persist to backend (non-blocking)
        for (const inv of invoicesToUpdate) {
          invoiceAPI.update(inv.id, { balance: inv.balance, status: inv.status, updatedAt: Date.now() })
            .catch(e => console.error('Invoice balance update failed:', e));
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
      // Regular Receipt/Payment: wallet balance is computed dynamically via stats in App.tsx
      // No need to update opening balances here - avoids double-counting
    }

    try {
      // Save or update payment via API
      console.log('=== SAVING PAYMENT TO API ===');
      console.log('Editing ID:', editingId);
      console.log('Payment data:', JSON.stringify(newPayment, null, 2));
      
      let response: any;
      if (editingId) {
        response = await paymentAPI.update(editingId, newPayment);
        console.log('Update API response:', response);
        setPayments(prev => prev.map(p => p.id === editingId ? newPayment : p));
      } else {
        // Strip local temp id before sending — backend assigns the real Firestore ID
        const { id: _localId, ...paymentToSend } = newPayment;
        response = await paymentAPI.create(paymentToSend);
        console.log('Create API response:', response);
        // Use the server-assigned Firestore ID; fallback to local only if somehow missing
        const savedPayment: Payment = { ...newPayment, id: response.id || newPayment.id };
        setPayments(prev => [savedPayment, ...prev]);
      }

      // Persist CHIT_SAVINGS investment ledger changes to backend
      if (purpose === 'CHIT_SAVINGS' && setInvestments && newPayment.sourceId) {
        // Always fetch fresh from Firestore to avoid stale closure state
        const freshInvAll = await investmentAPI.getAll();
        const targetInv = freshInvAll.find((i: any) => i.id === newPayment.sourceId);
        if (targetInv) {
          let updatedInv = targetInv;
          const savedId = response?.id || newPayment.id; // reliable payment ID from server
          if (direction === 'OUT') {
            const monthNum = (targetInv.transactions?.length || 0) + 1;
            const newTxn: InvestmentTransaction = {
              id: Math.random().toString(36).substr(2, 9),
              paymentId: savedId, // key for reliable delete
              date: newPayment.date,
              month: monthNum,
              amountPaid: newPayment.amount,
              dividend: 0,
              totalPayable: newPayment.amount
            };
            updatedInv = { ...targetInv, transactions: [...(targetInv.transactions || []), newTxn] };
          } else if (direction === 'IN') {
            updatedInv = { ...targetInv, chitConfig: { ...targetInv.chitConfig, isPrized: true, prizeAmount: newPayment.amount, prizeMonth: (targetInv.transactions?.length || 0) + 1, paymentId: savedId } };
          }
          await investmentAPI.update(targetInv.id, updatedInv);
          const refreshed = await investmentAPI.getAll();
          setInvestments(refreshed);
        }
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
    } finally {
      setIsSubmitting(false);
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
                     {/* OVERALL: summary view showing all category outstandings — always first */}
                     <button onClick={() => changePurpose('OVERALL')} className={`col-span-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OVERALL' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}>
                       ⊞ Overall Outstanding
                     </button>
                     {/* Primary collection categories */}
                     <button onClick={() => changePurpose('ROYALTY')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'ROYALTY' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Royalty Income</button>
                     <button onClick={() => changePurpose('INTEREST')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'INTEREST' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Interest Rec.</button>
                     <button onClick={() => changePurpose('CHIT_FUND')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'CHIT_FUND' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Chit Fund</button>
                     <button onClick={() => changePurpose('SAVINGS')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'SAVINGS' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Savings & Assets</button>
                     {/* Other categories */}
                     <button onClick={() => changePurpose('GENERAL')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'GENERAL' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>General / Party</button>
                     <button onClick={() => changePurpose('DIRECT_INCOME')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'DIRECT_INCOME' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Direct Income</button>
                     <button onClick={() => changePurpose('OTHER_BUSINESS')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OTHER_BUSINESS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Business Unit</button>
                     <button onClick={() => changePurpose('PRINCIPAL_RECOVERY')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'PRINCIPAL_RECOVERY' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Principal Rec.</button>
                     <button onClick={() => { setDirection('IN'); changePurpose('TRANSFER'); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'TRANSFER' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Contra / Transfer</button>
                   </>
                 ) : (
                   <>
                     {/* OVERALL: summary view for OUT direction too */}
                     <button onClick={() => changePurpose('OVERALL')} className={`col-span-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OVERALL' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}>
                       ⊞ Overall Outstanding
                     </button>
                     <button onClick={() => changePurpose('CHIT_SAVINGS')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'CHIT_SAVINGS' ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Chit Prize (Won)</button>
                     <button onClick={() => changePurpose('GENERAL')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'GENERAL' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>General / Party</button>
                     <button onClick={() => changePurpose('EXPENSE')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'EXPENSE' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Op. Expense</button>
                     <button onClick={() => changePurpose('OTHER_BUSINESS')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'OTHER_BUSINESS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Business Unit</button>
                     <button onClick={() => changePurpose('LOAN_INTEREST')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'LOAN_INTEREST' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Debt Interest</button>
                     <button onClick={() => changePurpose('LOAN_REPAYMENT')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'LOAN_REPAYMENT' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Debt Repayment</button>
                     <button onClick={() => changePurpose('SAVINGS')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'SAVINGS' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Savings & Assets</button>
                     <button onClick={() => changePurpose('CHIT_FUND')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'CHIT_FUND' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 bg-white'}`}>Chit Fund</button>
                     <button onClick={() => { setDirection('IN'); changePurpose('TRANSFER'); }} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition ${purpose === 'TRANSFER' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 bg-white'}`}>Contra / Transfer</button>
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
                      onChange={e => {
                        setAccountSearch(e.target.value);
                        setShowResults(true);
                        // Clear the selected party as soon as the user types a new search
                        // so the balance panel doesn't block the dropdown results
                        if (selectedParty) setSelectedParty(null);
                      }}
                      onFocus={() => {
                        setShowResults(true);
                        // Always auto-switch to OVERALL when the search box is empty (fresh search)
                        // so all parties sorted by outstanding are immediately visible.
                        // If the user has already typed something (e.g. searching expenses), keep current purpose.
                        if (!accountSearch) setPurpose('OVERALL');
                      }}
                    />
                 </div>
                 
                 {/* Selected Balance Display — always shown when a party is selected */}
                 {selectedParty && (['CUSTOMER', 'LIABILITY', 'INVESTMENT'].includes(selectedParty.partyType)) && (() => {
                    // signed = true gives actual net (can be negative = Cr/Payable)
                    const signedBalance = getPartyBalance(selectedParty, selectedParty.partyType || 'CUSTOMER', purpose, true);
                    const bd = selectedParty.breakdown;
                    const isCr = signedBalance < 0;   // company owes the party
                    const isDr = signedBalance > 0;   // party owes the company
                    const absBalance = Math.abs(signedBalance);
                    const purposeLabel: Record<string, string> = {
                      CHIT_FUND: 'Chit Balance',
                      ROYALTY:   'Royalty Balance',
                      INTEREST:  'Interest Balance',
                      SAVINGS:   'Total Invested',
                    };
                    return (
                    <div className={`mt-4 p-5 rounded-2xl border animate-fadeIn shadow-sm ${purpose === 'OVERALL' ? 'bg-indigo-50 border-indigo-200' : isCr ? 'bg-amber-50 border-amber-200' : isDr ? 'bg-slate-50 border-slate-100' : 'bg-emerald-50 border-emerald-100'}`}>
                       <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             {purpose === 'OVERALL' ? 'Overall Outstanding' : (purposeLabel[purpose] || 'Account Balance')}
                          </span>
                          <div className="flex items-center gap-2">
                             {purpose !== 'OVERALL' && isCr && (
                                <span className="text-[9px] font-black bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded uppercase tracking-wide">You Owe Them</span>
                             )}
                             {purpose !== 'OVERALL' && isDr && (
                                <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded uppercase tracking-wide">They Owe You</span>
                             )}
                             <span className={`text-sm font-black ${purpose === 'OVERALL' ? 'text-indigo-700' : isCr ? 'text-amber-700' : isDr ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {signedBalance === 0 ? '✓ Nil' : `₹${absBalance.toLocaleString()}`}
                             </span>
                          </div>
                       </div>

                       {/* OVERALL MODE: always show category-wise breakdown */}
                       {purpose === 'OVERALL' && bd && (() => {
                          const cats = [
                            { key: 'chit',      label: 'Chit Fund',      dot: 'bg-orange-500', labelCls: 'text-orange-700', rowBg: 'bg-orange-50 border-orange-100' },
                            { key: 'royalty',   label: 'Royalty',        dot: 'bg-purple-500', labelCls: 'text-purple-700', rowBg: 'bg-purple-50 border-purple-100' },
                            { key: 'interest',  label: 'Interest',       dot: 'bg-emerald-500',labelCls: 'text-emerald-700',rowBg: 'bg-emerald-50 border-emerald-100' },
                            { key: 'principal', label: 'Principal Lent', dot: 'bg-blue-500',   labelCls: 'text-blue-700',   rowBg: 'bg-blue-50 border-blue-100' },
                            { key: 'opening',   label: 'General / Old',  dot: 'bg-slate-400',  labelCls: 'text-slate-600',  rowBg: 'bg-slate-50 border-slate-100' },
                          ];
                          const hasAny = cats.some(c => (bd[c.key] || 0) !== 0);
                          return (
                            <div className="space-y-1.5 mt-1">
                              <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest mb-2">
                                Select a category below to post a voucher
                              </p>
                              {cats.map(c => {
                                const val = bd[c.key] || 0;
                                if (!hasAny || true) { // show all rows so user sees Nil too
                                  return (
                                    <div key={c.key} className={`flex justify-between items-center px-3 py-2 rounded-xl border ${c.rowBg}`}>
                                      <div className="flex items-center gap-2">
                                        <div className={`h-2 w-2 rounded-full ${c.dot}`}></div>
                                        <span className={`text-[10px] font-black uppercase tracking-wide ${c.labelCls}`}>{c.label}</span>
                                      </div>
                                      <span className={`text-[10px] font-black ${val === 0 ? 'text-slate-400' : val > 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                        {val === 0 ? '— Nil' : val > 0 ? `₹${val.toLocaleString()} Dr` : `₹${Math.abs(val).toLocaleString()} Cr`}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          );
                       })()}

                       {/* SPECIFIC CATEGORY: just show the balance with a note if Cr */}
                       {purpose !== 'OVERALL' && isCr && (
                          <p className="text-[10px] text-amber-700 font-semibold">
                             You owe this party ₹{absBalance.toLocaleString()} — use OUT (Payment) to settle it
                          </p>
                       )}
                       {/* GENERAL: full breakdown lines */}
                       {bd && isDr && purpose === 'GENERAL' && (
                          <div className="space-y-1.5 mt-2">
                             {bd.royalty > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Royalty</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{bd.royalty.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.interest > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Interest Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{bd.interest.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.chit > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-orange-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Chit Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{bd.chit.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.principal > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Principal Lent</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{bd.principal.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.opening > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">General / Old</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">₹{bd.opening.toLocaleString()}</span>
                                </div>
                             )}
                          </div>
                       )}
                    </div>
                    );
                 })()}

                 {/* Smart Search Dropdown — shows on focus even without typing, sorted by outstanding */}
                 {showResults && (() => {
                    const isSearching = accountSearch.trim().length > 0;
                    // Sort by signed outstanding descending (highest Dr first, Cr last) when not searching
                    const sorted = isSearching
                      ? availableParties
                      : [...availableParties].sort((a, b) => {
                          const bA = a.partyType === 'CUSTOMER' ? getPartyBalance(a, 'CUSTOMER', purpose, true) : (a.currentBalance || 0);
                          const bB = b.partyType === 'CUSTOMER' ? getPartyBalance(b, 'CUSTOMER', purpose, true) : (b.currentBalance || 0);
                          // IN Receipt: highest "They Owe You" (Dr / positive) first
                          // OUT Payment: highest "You Owe Them" (Cr / most negative) first
                          return direction === 'OUT' ? bA - bB : bB - bA;
                        });
                    if (sorted.length === 0 && !isSearching) return null;
                    return (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-72 overflow-y-auto z-20">
                       {/* Header */}
                       <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl sticky top-0">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                             {isSearching ? `${sorted.length} result${sorted.length !== 1 ? 's' : ''} for "${accountSearch}"` : `All · Sorted by Outstanding`}
                          </span>
                          {!isSearching && sorted.length > 0 && (
                            <span className="text-[9px] font-bold text-slate-400">{sorted.length} parties</span>
                          )}
                       </div>
                       {sorted.map((p: any) => {
                          const isCust = p.partyType === 'CUSTOMER';
                          const signedBal = isCust
                            ? getPartyBalance(p, 'CUSTOMER', purpose, true)
                            : p.currentBalance;
                          const absBal = Math.abs(signedBal);
                          const isCr = isCust && signedBal < 0;
                          const isDr = signedBal > 0;
                          const isNil = signedBal === 0;
                          return (
                          <div 
                             key={p.id} 
                             onClick={() => selectParty(p)} 
                             className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center group transition-colors"
                          >
                             <div className="flex items-center gap-3 min-w-0">
                                {/* Color dot: rose=owes us, amber=we owe, slate=nil */}
                                <div className={`h-2 w-2 rounded-full shrink-0 ${isDr ? 'bg-rose-400' : isCr ? 'bg-amber-400' : 'bg-slate-300'}`}></div>
                                <div className="min-w-0">
                                   <div className="text-xs font-black text-slate-800 uppercase group-hover:text-indigo-600 transition-colors truncate">{p.name}</div>
                                   <div className="text-[9px] font-bold text-slate-400">{p.partyType?.replace(/_/g, ' ')} {p.type ? `· ${p.type.replace(/_/g, ' ')}` : ''}</div>
                                </div>
                             </div>
                             <div className="text-right shrink-0 ml-4">
                                <div className="flex items-center gap-1 justify-end">
                                   {isCr && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">You Owe</span>}
                                   {isDr && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">Owes You</span>}
                                   <span className={`text-xs font-black ${isCr ? 'text-amber-700' : isDr ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {isNil ? '—' : `₹${absBal.toLocaleString()}`}
                                   </span>
                                </div>
                             </div>
                          </div>
                          );
                       })}
                       {sorted.length === 0 && (
                         <div className="p-6 text-center">
                           <div className="text-xs font-black text-slate-300 uppercase tracking-widest">No matches for "{accountSearch}"</div>
                         </div>
                       )}
                    </div>
                    );
                 })()}
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

           {/* Block IN receipt when party already has a Cr (You Owe Them) balance */}
           {(() => {
              if (!selectedParty || selectedParty.partyType !== 'CUSTOMER' || direction !== 'IN') return null;
              const signedBal = getPartyBalance(selectedParty, 'CUSTOMER', purpose, true);
              if (signedBal >= 0) return null;
              return (
                <div className="mt-6 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <i className="fas fa-exclamation-triangle text-red-500 mt-0.5 text-lg"></i>
                    <div>
                      <div className="text-sm font-black text-red-700 uppercase tracking-wide mb-1">Cannot Post IN Receipt</div>
                      <div className="text-xs text-red-600 font-semibold leading-relaxed">
                        You already owe this party <span className="font-black">₹{Math.abs(signedBal).toLocaleString()}</span>. Posting another IN receipt will increase what you owe them further.
                      </div>
                      <div className="text-xs text-red-500 mt-2 font-bold">
                        → To fix: Delete duplicate receipts in Recent Vouchers below, or switch to <span className="underline">OUT (Payment)</span> to pay them back.
                      </div>
                    </div>
                  </div>
                </div>
              );
           })()}

           <div className="mt-8 pt-8 border-t border-slate-100">
              {purpose === 'OVERALL' ? (
                <div className="w-full bg-indigo-50 border-2 border-indigo-200 text-indigo-600 py-5 rounded-2xl font-black uppercase tracking-widest text-sm flex justify-center items-center gap-2 cursor-not-allowed select-none">
                  <i className="fas fa-info-circle"></i> Select a Category Above to Post
                </div>
              ) : (
                <button data-testid="btn-save-voucher" disabled={isSubmitting} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl hover:scale-[1.01] transition text-sm flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100">
                  {isSubmitting ? <><i className="fas fa-spinner fa-spin"></i> Processing...</> : editingId ? <><i className="fas fa-save"></i> Update Voucher</> : <><i className="fas fa-check-circle"></i> Post Voucher</>}
                </button>
              )}
           </div>
        </form>
      </div>

      {/* RECENT VOUCHERS LIST */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
         <div className="p-8 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
               <div>
                  <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Recent Vouchers</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History &amp; Corrections</p>
               </div>
               <input
                  value={voucherSearch}
                  onChange={e => { setVoucherSearch(e.target.value); setVoucherPage(1); }}
                  placeholder="Search party / head..."
                  className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
               />
            </div>
            <div className="flex flex-wrap gap-2">
               <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  {(['ALL','IN','OUT'] as const).map(t => (
                     <button key={t} onClick={() => { setVoucherTypeFilter(t); setVoucherPage(1); }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                           voucherTypeFilter === t
                              ? t === 'IN' ? 'bg-emerald-500 text-white shadow'
                              : t === 'OUT' ? 'bg-rose-500 text-white shadow'
                              : 'bg-slate-900 text-white shadow'
                              : 'text-slate-400 hover:text-slate-600'
                        }`}>{t === 'ALL' ? 'All' : t === 'IN' ? '+ IN' : '– OUT'}</button>
                  ))}
               </div>
               <select
                  value={voucherCatFilter}
                  onChange={e => { setVoucherCatFilter(e.target.value); setVoucherPage(1); }}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
               >
                  <option value="ALL">All Categories</option>
                  {Array.from(new Set(payments.map(p => p.category))).sort().map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                  ))}
               </select>
            </div>
         </div>
         {(() => {
            const filtered = payments
               .filter(p => voucherTypeFilter === 'ALL' || p.type === voucherTypeFilter)
               .filter(p => voucherCatFilter === 'ALL' || p.category === voucherCatFilter)
               .filter(p => !voucherSearch || p.sourceName?.toLowerCase().includes(voucherSearch.toLowerCase()) || p.category?.toLowerCase().includes(voucherSearch.toLowerCase()));
            const totalPages = Math.max(1, Math.ceil(filtered.length / VOUCHER_PAGE_SIZE));
            const paginated = filtered.slice((voucherPage - 1) * VOUCHER_PAGE_SIZE, voucherPage * VOUCHER_PAGE_SIZE);
            return (<>
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
               {paginated.length === 0 && (
                  <tr><td colSpan={5} className="px-8 py-10 text-center text-xs font-bold text-slate-400">No vouchers match the current filters.</td></tr>
               )}
               {paginated.map(p => (
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
                                 <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
                                    {deletingId === p.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}
                                 </button>
                              )}
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
            {/* Pagination */}
            {totalPages > 1 && (
               <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     Showing {((voucherPage-1)*VOUCHER_PAGE_SIZE)+1}–{Math.min(voucherPage*VOUCHER_PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex gap-2">
                     <button disabled={voucherPage === 1} onClick={() => setVoucherPage(p => p - 1)}
                        className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition">
                        <i className="fas fa-chevron-left"></i>
                     </button>
                     {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                        <button key={pg} onClick={() => setVoucherPage(pg)}
                           className={`h-8 w-8 rounded-lg text-xs font-black transition ${
                              pg === voucherPage ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                           }`}>{pg}</button>
                     ))}
                     <button disabled={voucherPage === totalPages} onClick={() => setVoucherPage(p => p + 1)}
                        className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition">
                        <i className="fas fa-chevron-right"></i>
                     </button>
                  </div>
               </div>
            )}
            </>);
         })()}
      </div>
    </div>
  );
}

export default AccountsManager;
