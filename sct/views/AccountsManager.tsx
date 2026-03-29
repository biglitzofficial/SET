import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Payment, Customer, Invoice, UserRole, AuditLog, Liability, Investment, InvestmentTransaction, StaffUser, BankAccount } from '../types';
import { paymentAPI, invoiceAPI, liabilityAPI, investmentAPI } from '../services/api';
import { canStaffEditRecord, canStaffDeleteRecord, isRecordFromToday } from '../utils/authHelpers';
import {
  computeOpening,
  sumPaymentsInForLedger,
  findMatchingLiabilityForCustomer,
  computeLiabilityExposure,
} from '../utils/ledgerUtils';

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

/** Quick Payment split: category nets + merged Interest Out & loan payable (matches Outstanding merge) */
function buildQuickPaymentBreakdown(
  p: Customer,
  invoices: Invoice[],
  payments: Payment[],
  liabilities: Liability[]
) {
  const custInvoices = invoices.filter((i) => i.customerId === p.id && !i.isVoid);
  const custPay = payments.filter((pay) => pay.sourceId === p.id);
  const custPaymentsIn = custPay.filter((pay) => pay.type === 'IN');
  const custPaymentsOut = custPay.filter((pay) => pay.type === 'OUT');
  const opening = computeOpening(p);
  const invIN = custInvoices.filter((i) => i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
  const invOUT = custInvoices.filter((i) => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
  const payIN = sumPaymentsInForLedger(custPaymentsIn);
  const payOUT = custPaymentsOut.reduce((s, pay) => s + pay.amount, 0);
  const netLedger = (opening + invIN + payOUT) - (invOUT + payIN);

  const chitInvoices = custInvoices.filter((i) => i.type === 'CHIT');
  const chitNet =
    chitInvoices.filter((i) => i.direction !== 'OUT').reduce((sum, i) => sum + i.amount, 0) -
    chitInvoices.filter((i) => i.direction === 'OUT').reduce((sum, i) => sum + i.amount, 0) -
    custPaymentsIn.filter((pay) => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0) +
    custPaymentsOut.filter((pay) => pay.category === 'CHIT' || pay.category === 'CHIT_FUND').reduce((sum, pay) => sum + pay.amount, 0);

  const royaltyNet =
    custInvoices.filter((i) => i.type === 'ROYALTY').reduce((sum, i) => sum + i.amount, 0) -
    custPaymentsIn.filter((pay) => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0) +
    custPaymentsOut.filter((pay) => pay.category === 'ROYALTY').reduce((sum, pay) => sum + pay.amount, 0);

  const interestNet =
    custInvoices.filter((i) => i.type === 'INTEREST').reduce((sum, i) => sum + i.amount, 0) -
    custPaymentsIn.filter((pay) => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0) +
    custPaymentsOut.filter((pay) => pay.category === 'INTEREST').reduce((sum, pay) => sum + pay.amount, 0);

  const interestOutAmt = custInvoices.filter((i) => i.type === 'INTEREST_OUT' && !i.isVoid).reduce((s, i) => s + i.amount, 0);
  const interestOutPaid = custPaymentsOut.filter((pay) => pay.category === 'LOAN_INTEREST').reduce((s, pay) => s + pay.amount, 0);
  const interestOutNet = Math.max(0, interestOutAmt - interestOutPaid);

  const matchLia = findMatchingLiabilityForCustomer(p.name, liabilities);
  let lenderInterestOutNet = 0;
  let loanRemaining = 0;
  if (matchLia) {
    const exp = computeLiabilityExposure(matchLia, invoices, payments);
    lenderInterestOutNet = exp.lenderInterestOutNet;
    loanRemaining = exp.remaining;
  }
  const mergedInterestOutNet = interestOutNet + lenderInterestOutNet;

  const openingGeneral =
    netLedger -
    chitNet -
    royaltyNet -
    interestNet -
    interestOutNet -
    (p.interestPrincipal || 0) +
    (p.creditPrincipal || 0);

  return {
    royalty: royaltyNet,
    interest: interestNet,
    chit: chitNet,
    principal: p.interestPrincipal || 0,
    interestOut: mergedInterestOutNet > 0 ? -mergedInterestOutNet : 0,
    loanPayable: loanRemaining > 0 ? -loanRemaining : 0,
    opening: openingGeneral,
  };
}

const AccountsManager: React.FC<AccountsManagerProps> = ({ 
  payments, setPayments, customers, setCustomers, invoices, setInvoices,
  expenseCategories, otherBusinesses, role, setAuditLogs, liabilities, setLiabilities,
  investments = [], setInvestments, incomeCategories = [], currentUser,
  openingBalances, setOpeningBalances, bankAccounts, setBankAccounts
}) => {
  const location = useLocation();
  const isContraRoute = location.pathname === '/contra';
  const initDirection: 'IN' | 'OUT' = isContraRoute ? 'IN' : ((location.state as any)?.direction || 'IN');
  const initPurpose: PurposeType = isContraRoute ? 'TRANSFER' : ((location.state as any)?.purpose || 'OVERALL');
  const [direction, setDirection] = useState<'IN' | 'OUT'>(initDirection);
  const [purpose, setPurpose] = useState<PurposeType>(initPurpose);
  type EntryMode = 'RECEIPT' | 'PAYMENT' | 'INCOME' | 'EXPENSE';
  const [entryMode, setEntryMode] = useState<EntryMode>(initDirection === 'IN' ? 'RECEIPT' : 'PAYMENT');

  // Re-apply defaults when switching between /accounts and /contra
  useEffect(() => {
    if (location.pathname === '/contra') {
      setDirection('IN');
      setPurpose('TRANSFER');
    } else {
      const stateDir = (location.state as any)?.direction;
      const statePurp = (location.state as any)?.purpose;
      if (stateDir) setDirection(stateDir);
      if (statePurp) setPurpose(statePurp);
    }
  }, [location.pathname]);

  const setReceiptMode = () => {
    setEntryMode('RECEIPT');
    setDirection('IN');
    setPurpose('OVERALL');
    setAccountSearch('');
    setSelectedParty(null);
  };
  const setPaymentMode = () => {
    setEntryMode('PAYMENT');
    setDirection('OUT');
    setPurpose('OVERALL');
    setAccountSearch('');
    setSelectedParty(null);
  };
  const setIncomeMode = () => {
    setEntryMode('INCOME');
    setDirection('IN');
    setPurpose('DIRECT_INCOME');
    setAccountSearch('');
    setSelectedParty(null);
  };
  const setExpenseMode = () => {
    setEntryMode('EXPENSE');
    setDirection('OUT');
    setPurpose('EXPENSE');
    setAccountSearch('');
    setSelectedParty(null);
  };

  const [accountSearch, setAccountSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editFormRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Voucher filter & pagination
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [voucherCatFilter, setVoucherCatFilter] = useState<string>('ALL');
  const [voucherSearch, setVoucherSearch] = useState<string>('');
  const [voucherPage, setVoucherPage] = useState<number>(1);
  const [voucherDateFrom, setVoucherDateFrom] = useState<string>('');
  const [voucherDateTo, setVoucherDateTo] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const VOUCHER_PAGE_SIZE = 15;

  // Inline quick-post state (IN receipt only — one entry per breakdown category)
  const [inlineEntry, setInlineEntry] = useState<Record<string, { open: boolean; amount: string; mode: string; notes: string }>>({});
  const [inlinePosting, setInlinePosting] = useState<Record<string, boolean>>({});

  const toggleInlineEntry = (catKey: string, defaultAmount: number) => {
    setInlineEntry(prev => ({
      ...prev,
      [catKey]: prev[catKey]?.open
        ? { ...prev[catKey], open: false }
        : { open: true, amount: defaultAmount > 0 ? String(defaultAmount) : '', mode: formData.mode || 'CASH', notes: '' }
    }));
  };
  
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

  // Safe date formatter for inputs (YYYY-MM-DD) — prevents RangeError on invalid dates
  const safeDateToInput = (ts: number | undefined | null): string => {
    if (ts == null || !Number.isFinite(ts)) return new Date().toISOString().slice(0, 10);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  };
  const safeFormatDate = (ts: number | undefined | null): string => {
    if (ts == null || !Number.isFinite(ts)) return '—';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  // --- VOUCHER / RECEIPT NUMBER GENERATOR ---
  const generateVoucherNumber = (date: number, type: 'VCH' | 'RCT'): string => {
    const d = new Date(Number.isFinite(date) ? date : Date.now());
    if (isNaN(d.getTime())) return `${type}-${new Date().toISOString().slice(0, 7).replace('-', '')}-001`;
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pattern = new RegExp(`^${type}-${ym}-(\\d+)$`);
    let max = 0;
    payments.forEach(p => {
      const field = type === 'RCT' ? p.receiptNumber : p.voucherNumber;
      const m = field?.match(pattern);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    });
    return `${type}-${ym}-${String(max + 1).padStart(3, '0')}`;
  };

  // Purposes that operate on the customer pool — party should be preserved when switching between these
  const CUSTOMER_PURPOSES: PurposeType[] = ['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'GENERAL', 'PRINCIPAL_RECOVERY', 'OVERALL'];

  const changePurpose = (newPurpose: PurposeType) => {
    const currentIsCustomer = CUSTOMER_PURPOSES.includes(purpose) && selectedParty?.partyType === 'CUSTOMER';
    const newIsCustomer = CUSTOMER_PURPOSES.includes(newPurpose);
    setPurpose(newPurpose);
    // Preserve selected party when switching to TRANSFER (Contra) so the search/name stays visible
    if (newPurpose === 'TRANSFER') return;
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
    // Auto-detect purpose from party type so the correct form/bottom fields appear
    if (!party.partyType || party.partyType === 'CUSTOMER') {
      setPurpose('OVERALL');
    } else if (party.partyType === 'INCOME_CAT') {
      setPurpose('DIRECT_INCOME');
    } else if (party.partyType === 'EXPENSE_CAT') {
      setPurpose('EXPENSE');
    } else if (party.partyType === 'LIABILITY') {
      setPurpose('LOAN_REPAYMENT');
    } else if (party.partyType === 'BUSINESS_UNIT') {
      setPurpose('OTHER_BUSINESS');
    } else if (party.partyType === 'INVESTMENT') {
      setPurpose(party.type === 'CHIT_SAVINGS' ? 'CHIT_SAVINGS' : 'SAVINGS');
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
        // Shows only accrued interest invoices minus interest payments received.
        // Principal recovery is tracked separately under PRINCIPAL_RECOVERY purpose.
        validInvoiceTypes = ['INTEREST'];
        validPaymentCats = ['INTEREST'];
      } else if (currentPurpose === 'CHIT' || currentPurpose === 'CHIT_FUND') {
        validInvoiceTypes = ['CHIT'];
        validPaymentCats = ['CHIT', 'CHIT_FUND'];
      } else {
        // GENERAL / OVERALL: use ledger formula (same as Party Ledger / CustomerList) for consistency
        validInvoiceTypes = ['ROYALTY', 'INTEREST', 'CHIT', 'GENERAL'];
        validPaymentCats = ['ROYALTY', 'INTEREST', 'CHIT', 'CHIT_FUND', 'PRINCIPAL_RECOVERY', 'GENERAL'];
      }

      // OVERALL: shared ledger + merge matching liability (same as Outstanding Reports overall row)
      if (currentPurpose === 'OVERALL' && type === 'CUSTOMER') {
        const custPay = payments.filter(p => p.sourceId === party.id);
        const opening = computeOpening(party);
        const invIN = invoices.filter(i => i.customerId === party.id && !i.isVoid && i.direction === 'IN').reduce((s, i) => s + i.amount, 0);
        const invOUT = invoices.filter(i => i.customerId === party.id && !i.isVoid && i.direction === 'OUT').reduce((s, i) => s + i.amount, 0);
        const payIN = sumPaymentsInForLedger(custPay);
        const payOUT = custPay.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
        let net = (opening + invIN + payOUT) - (invOUT + payIN);
        const matchLia = findMatchingLiabilityForCustomer(party.name, liabilities);
        if (matchLia) {
          const { liaAmount } = computeLiabilityExposure(matchLia, invoices, payments);
          net -= liaAmount;
        }
        return signed ? net : Math.max(0, net);
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
      // GENERAL = openingBalance only
      // INTEREST = 0 — shows only accrued interest invoices minus payments (principal tracked separately under PRINCIPAL_RECOVERY)
      const openingAdj = currentPurpose === 'GENERAL'
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
    
    // INCOME mode: only direct income categories (no parties)
    if (entryMode === 'INCOME') {
      return incomeCategories
        .filter(b => b.toLowerCase().includes(search))
        .map(b => ({ id: `INC_${b}`, name: b, partyType: 'INCOME_CAT' as const, currentBalance: 0 }));
    }
    // EXPENSE mode: only expense categories (no parties)
    if (entryMode === 'EXPENSE') {
      return expenseCategories
        .filter(c => c.toLowerCase().includes(search))
        .map(c => ({ id: c, name: c, partyType: 'EXPENSE_CAT' as const, currentBalance: 0 }));
    }
    
    if (direction === 'IN') {
      // RECEIPT: parties only — never show income categories
      if (purpose === 'OVERALL') {
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
         // Only in INCOME mode; RECEIPT never reaches here
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
               breakdown = buildQuickPaymentBreakdown(p, invoices, payments, liabilities);
            }

            return { 
                ...p, 
                partyType: pType,
                currentBalance: getPartyBalance(p, pType, purpose),
                breakdown
            };
        });

    } else {
      // OUTGOING — PAYMENT mode: parties only, no expense categories
      if (purpose === 'OVERALL') {
        const customerPool = customers.filter(c => c.status === 'ACTIVE');
        const liabilityPool = liabilities.filter((l: any) => l.status === 'ACTIVE').map((l: any) => ({ ...l, name: l.providerName, partyType: 'LIABILITY' }));
        const bizPool = otherBusinesses.map(b => ({ id: `BIZ_${b}`, name: b, partyType: 'BUSINESS_UNIT' }));
        const investPool = investments.map(inv => ({ ...inv, partyType: 'INVESTMENT' }));
        pool = [...customerPool, ...liabilityPool, ...bizPool, ...investPool];
      } else if (purpose === 'EXPENSE') {
        pool = []; // Expense categories shown only in EXPENSE mode (we return early there)
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
               breakdown = buildQuickPaymentBreakdown(p, invoices, payments, liabilities);
             }

             return {
                 ...p,
                 partyType: pType,
                 currentBalance: getPartyBalance(p, pType, purpose),
                 breakdown
             };
        });
    }
  }, [accountSearch, direction, purpose, entryMode, customers, expenseCategories, liabilities, otherBusinesses, invoices, investments, incomeCategories, payments]);

  // Refresh selected party with latest data so balance & breakdown update after voucher posting
  const selectedPartyFresh = useMemo(() => {
    if (!selectedParty?.id) return null;
    if (selectedParty.partyType === 'CUSTOMER') {
      const c = customers.find(x => x.id === selectedParty.id);
      if (!c) return selectedParty;
      const breakdown = buildQuickPaymentBreakdown(c, invoices, payments, liabilities);
      return { ...selectedParty, ...c, breakdown };
    }
    if (selectedParty.partyType === 'LIABILITY') {
      const l = liabilities.find((x: any) => x.id === selectedParty.id);
      return l ? { ...selectedParty, ...l } : selectedParty;
    }
    if (selectedParty.partyType === 'INVESTMENT') {
      const inv = investments.find((x: any) => x.id === selectedParty.id);
      return inv ? { ...selectedParty, ...inv } : selectedParty;
    }
    return selectedParty;
  }, [selectedParty, customers, invoices, payments, liabilities, investments]);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected voucher${selectedIds.size > 1 ? 's' : ''}? This will reverse all related ledger entries.`)) return;
    setIsBulkDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        const p = payments.find(pay => pay.id === id);
        if (!p) continue;
        reverseSideEffects(p);
        await paymentAPI.delete(id);
      }
      const fresh = await paymentAPI.getAll();
      setPayments(fresh);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Some vouchers could not be deleted. Please refresh and try again.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleEdit = (payment: Payment) => {
    setEditingId(payment.id);
    setDirection(payment.type);
    setPurpose(payment.category as PurposeType);
    setFormData(payment);
    setAccountSearch(payment.sourceName || '');
    // Resolve party type so balance display works
    let partyType: string = 'CUSTOMER';
    if (customers.some(c => c.id === payment.sourceId)) partyType = 'CUSTOMER';
    else if (liabilities.some(l => l.id === payment.sourceId)) partyType = 'LIABILITY';
    else if (investments?.some(i => i.id === payment.sourceId)) partyType = 'INVESTMENT';
    else if (incomeCategories.includes(payment.sourceId?.replace?.('INC_', '') || '')) partyType = 'INCOME_CAT';
    else if (expenseCategories.includes(payment.sourceId || '')) partyType = 'EXPENSE_CAT';
    setSelectedParty({ ...payment, id: payment.sourceId, partyType, name: payment.sourceName });
    // Switch to correct tab (RECEIPT/PAYMENT/INCOME/EXPENSE)
    if (payment.type === 'IN' && !incomeCategories.includes(payment.category?.replace?.('INC_', '') || '')) {
      setEntryMode('RECEIPT');
    } else if (payment.type === 'OUT' && !expenseCategories.includes(payment.category || '')) {
      setEntryMode('PAYMENT');
    } else if (incomeCategories.includes(payment.category?.replace?.('INC_', '') || '') || payment.category === 'DIRECT_INCOME') {
      setEntryMode('INCOME');
    } else if (expenseCategories.includes(payment.category || '')) {
      setEntryMode('EXPENSE');
    } else {
      setEntryMode(payment.type === 'IN' ? 'RECEIPT' : 'PAYMENT');
    }
  };

  // Auto-scroll to edit form when entering edit mode
  useEffect(() => {
    if (editingId && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Blur the input to save the value
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TRANSFER (Contra) doesn't need a party — just amount + modes
    if (purpose === 'TRANSFER') {
      if (!formData.amount) return;
      if (!formData.sourceName) {
        formData.sourceName = `${formData.mode || 'CASH'} → ${formData.targetMode || 'BANK'}`;
      }
    } else {
      if (!formData.amount || !formData.sourceName) return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    // If Editing: capture original before any state changes (needed for voucher numbers)
    const originalPayment = editingId ? payments.find(p => p.id === editingId) : null;
    if (editingId && originalPayment) {
       reverseSideEffects(originalPayment);
       setPayments(prev => prev.filter(p => p.id !== editingId));
    }

    const paymentDate = (formData.date != null && Number.isFinite(formData.date) ? new Date(formData.date).getTime() : Date.now()) || Date.now();
    // Preserve existing numbers on edit; generate new ones on create
    const voucherNumber = originalPayment
      ? (originalPayment.voucherNumber || generateVoucherNumber(paymentDate, 'VCH'))
      : generateVoucherNumber(paymentDate, 'VCH');
    const receiptNumber = direction === 'IN' && purpose !== 'TRANSFER'
      ? (originalPayment?.receiptNumber || generateVoucherNumber(paymentDate, 'RCT'))
      : undefined;

    const newPayment: Payment = {
      ...formData as Payment,
      id: editingId || Math.random().toString(36).substr(2, 9),
      type: direction,
      voucherType: purpose === 'TRANSFER' ? 'CONTRA' : (direction === 'IN' ? 'RECEIPT' : 'PAYMENT'),
      voucherNumber,
      receiptNumber,
      category: purpose === 'EXPENSE' ? formData.sourceId : 
                purpose === 'DIRECT_INCOME' ? formData.sourceId?.replace('INC_', '') : 
                purpose === 'OTHER_BUSINESS' ? formData.businessUnit || formData.sourceName :
                purpose,
      date: paymentDate
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
        setPayments(prev => [newPayment, ...prev.filter(p => p.id !== editingId)]);
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

  // --- QUICK POST: inline receipt/payment from OVERALL breakdown row (IN or OUT) ---
  const handleQuickPost = async (catKey: string, catPurpose: PurposeType, amount: number, mode: string, notes: string, dir: 'IN' | 'OUT') => {
    if (!selectedParty || !amount || inlinePosting[catKey]) return;
    setInlinePosting(prev => ({ ...prev, [catKey]: true }));

    const paymentDate = Date.now();
    const voucherNumber = generateVoucherNumber(paymentDate, 'VCH');
    const receiptNumber = dir === 'IN' ? generateVoucherNumber(paymentDate, 'RCT') : undefined;

    const newPayment: Payment = {
      id: Math.random().toString(36).substr(2, 9),
      type: dir,
      voucherType: dir === 'IN' ? 'RECEIPT' : 'PAYMENT',
      voucherNumber,
      receiptNumber,
      category: catPurpose,
      sourceId: selectedParty.id,
      sourceName: selectedParty.providerName || selectedParty.name,
      amount,
      mode: mode as any,
      date: paymentDate,
      notes,
    };

    // IN only: Principal Recovery → reduce lending asset
    if (dir === 'IN' && catPurpose === 'PRINCIPAL_RECOVERY') {
      setCustomers(prev => prev.map(c =>
        c.id === newPayment.sourceId ? { ...c, interestPrincipal: Math.max(0, c.interestPrincipal - amount) } : c
      ));
    }

    // IN only: allocate receipt against invoices (FIFO)
    if (dir === 'IN') {
      const invoiceTypeMap: Record<string, string[]> = {
        ROYALTY: ['ROYALTY'], INTEREST: ['INTEREST'], CHIT_FUND: ['CHIT'], GENERAL: ['ROYALTY', 'INTEREST', 'CHIT'],
      };
      const matchTypes = invoiceTypeMap[catPurpose];
      if (matchTypes && newPayment.sourceId) {
        let remaining = amount;
        const custInv = invoices
          .filter(inv => inv.customerId === newPayment.sourceId && !inv.isVoid && inv.balance > 0 && matchTypes.includes(inv.type))
          .sort((a, b) => a.date - b.date);
        const toUpdate: typeof invoices = [];
        for (const inv of custInv) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, inv.balance);
          remaining -= deduct;
          const newBal = Math.max(0, inv.balance - deduct);
          toUpdate.push({ ...inv, balance: newBal, status: (newBal <= 0 ? 'PAID' : 'PARTIAL') as any });
        }
        if (toUpdate.length > 0) {
          setInvoices(prev => prev.map(inv => toUpdate.find(u => u.id === inv.id) || inv));
          for (const inv of toUpdate) {
            invoiceAPI.update(inv.id, { balance: inv.balance, status: inv.status, updatedAt: Date.now() }).catch(console.error);
          }
        }
      }
    }

    try {
      const { id: _id, ...toSend } = newPayment;
      const resp = await paymentAPI.create(toSend);
      const saved: Payment = { ...newPayment, id: resp.id || newPayment.id };
      setPayments(prev => [saved, ...prev]);
      setInlineEntry(prev => ({ ...prev, [catKey]: { open: false, amount: '', mode: 'CASH', notes: '' } }));
    } catch (err) {
      console.error('Quick post failed:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setInlinePosting(prev => ({ ...prev, [catKey]: false }));
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-10">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Voucher Entry</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Cashbook & Journals</p>
      </div>

      {/* Entry mode toggle — Receipt / Payment (parties only) | Income / Expense (categories only) */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex bg-slate-100 rounded-2xl p-1">
            <button
              onClick={setReceiptMode}
              className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'RECEIPT' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
            >
              In (Receipt)
            </button>
            <button
              onClick={setPaymentMode}
              className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'PAYMENT' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
            >
              Out (Payment)
            </button>
          </div>
          <div className="flex bg-slate-100 rounded-2xl p-1">
            <button
              onClick={setIncomeMode}
              className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'INCOME' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
            >
              Income
            </button>
            <button
              onClick={setExpenseMode}
              className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${entryMode === 'EXPENSE' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
            >
              Expense
            </button>
          </div>
        </div>
        <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wide">
          {entryMode === 'RECEIPT' && 'Search parties (customers, etc.)'}
          {entryMode === 'PAYMENT' && 'Search parties (customers, loans, etc.)'}
          {entryMode === 'INCOME' && 'Select income category'}
          {entryMode === 'EXPENSE' && 'Select expense category'}
        </p>
      </div>

      {/* Full-width card — no left panel for either direction */}
      <div ref={editFormRef} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200" style={{overflow: 'visible'}}>

        <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-6">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                 {editingId ? 'Edit Voucher' : entryMode === 'INCOME' ? 'Quick Income Entry' : entryMode === 'EXPENSE' ? 'Quick Expense Entry' : direction === 'IN' ? 'Quick Receipt Entry' : 'Quick Payment Entry'}
              </h3>
              {editingId && (
                 <button type="button" onClick={() => { setEditingId(null); setFormData({ amount: 0, mode: 'CASH', date: Date.now() }); setAccountSearch(''); setSelectedParty(null); }} className="text-xs font-bold text-rose-500 hover:underline">Cancel Edit</button>
              )}
           </div>


           <div className="space-y-6">
              
              {/* Account Selector */}
              <div className="relative z-10" ref={searchWrapperRef}>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    {entryMode === 'INCOME' ? 'Income Category' : entryMode === 'EXPENSE' ? 'Expense Category' : direction === 'IN' ? 'Received From' : 'Paid To'} 
                    {purpose === 'OTHER_BUSINESS' && entryMode === 'PAYMENT' && ' (Business Unit)'}
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
                        if (selectedParty) {
                          setSelectedParty(null);
                          if (entryMode === 'PAYMENT') setPurpose('OVERALL');
                        }
                      }}
                      onFocus={() => {
                        setShowResults(true);
                        if (!accountSearch && purpose !== 'TRANSFER' && !['INCOME', 'EXPENSE'].includes(entryMode))
                          setPurpose('OVERALL');
                      }}
                    />
                 </div>
                 
                 {/* Selected Balance Display — always shown when a party is selected */}
                 {selectedPartyFresh && (['CUSTOMER', 'LIABILITY', 'INVESTMENT'].includes(selectedPartyFresh.partyType)) && (() => {
                    // Use fresh party so balance/breakdown update after voucher posting
                    const signedBalance = getPartyBalance(selectedPartyFresh, selectedPartyFresh.partyType || 'CUSTOMER', purpose, true);
                    const bd = selectedPartyFresh.breakdown;
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
                                {signedBalance === 0 ? '✓ Nil' : `${absBalance.toLocaleString()}`}
                             </span>
                          </div>
                       </div>

                       {/* OVERALL MODE: category-wise breakdown with inline quick-post for IN */}
                       {purpose === 'OVERALL' && bd && (() => {
                          const purposeMap: Record<string, PurposeType> = {
                            chit: 'CHIT_FUND', royalty: 'ROYALTY', interest: 'INTEREST',
                            principal: 'PRINCIPAL_RECOVERY', opening: 'GENERAL',
                            interestOut: 'LOAN_INTEREST', loanPayable: 'LOAN_REPAYMENT',
                          };
                          const cats = [
                            { key: 'chit',      label: 'Chit Fund',      dot: 'bg-orange-500', labelCls: 'text-orange-700', rowBg: 'bg-orange-50 border-orange-100',  btnCls: 'bg-orange-500 hover:bg-orange-600' },
                            { key: 'royalty',   label: 'Royalty',        dot: 'bg-purple-500', labelCls: 'text-purple-700', rowBg: 'bg-purple-50 border-purple-100',  btnCls: 'bg-purple-500 hover:bg-purple-600' },
                            { key: 'interest',  label: 'Interest',       dot: 'bg-emerald-500',labelCls: 'text-emerald-700',rowBg: 'bg-emerald-50 border-emerald-100', btnCls: 'bg-emerald-500 hover:bg-emerald-600' },
                            { key: 'principal', label: 'Principal Lent', dot: 'bg-blue-500',   labelCls: 'text-blue-700',   rowBg: 'bg-blue-50 border-blue-100',       btnCls: 'bg-blue-500 hover:bg-blue-600' },
                            { key: 'interestOut', label: 'Interest Out (Loan)', dot: 'bg-rose-500', labelCls: 'text-rose-700', rowBg: 'bg-rose-50 border-rose-100', btnCls: 'bg-rose-500 hover:bg-rose-600' },
                            { key: 'loanPayable', label: 'Loan Principal', dot: 'bg-amber-500', labelCls: 'text-amber-800', rowBg: 'bg-amber-50 border-amber-100', btnCls: 'bg-amber-600 hover:bg-amber-700' },
                            { key: 'opening',   label: 'General / Old',  dot: 'bg-slate-400',  labelCls: 'text-slate-600',  rowBg: 'bg-slate-50 border-slate-100',     btnCls: 'bg-slate-600 hover:bg-slate-700' },
                          ];
                          return (
                            <div className="space-y-2 mt-1">
                              <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest mb-2">
                                Click + on any row to post a {direction === 'IN' ? 'receipt' : 'payment'}
                              </p>
                              {cats.map(c => {
                                const val = bd[c.key] || 0;
                                const ie = inlineEntry[c.key];
                                const catPurpose = purposeMap[c.key];
                                return (
                                  <div key={c.key} className={`rounded-xl border ${c.rowBg} overflow-hidden`}>
                                    {/* Main row */}
                                    <div className="flex justify-between items-center px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`h-2 w-2 rounded-full ${c.dot}`}></div>
                                        <span className={`text-[10px] font-black uppercase tracking-wide ${c.labelCls}`}>{c.label}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black ${val === 0 ? 'text-slate-400' : val > 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                          {val === 0 ? '— Nil' : val > 0 ? `${val.toLocaleString()} Dr` : `${Math.abs(val).toLocaleString()} Cr`}
                                        </span>
                                        {/* + button for ALL categories, both IN and OUT */}
                                        <button
                                          type="button"
                                          onClick={() => toggleInlineEntry(c.key, Math.abs(val))}
                                          className={`w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center transition ${ie?.open ? 'bg-slate-400 hover:bg-slate-500' : c.btnCls}`}
                                          title={ie?.open ? 'Cancel' : direction === 'IN' ? 'Post receipt' : 'Post payment'}
                                        >
                                          <i className={`fas ${ie?.open ? 'fa-times' : 'fa-plus'}`}></i>
                                        </button>
                                      </div>
                                    </div>
                                    {/* Inline quick-entry form — shown for both IN and OUT */}
                                    {ie?.open && (
                                      <div className="px-3 pb-3 pt-2 border-t border-slate-200 bg-white space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount</label>
                                            <input
                                              type="number"
                                              className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm font-black outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                              placeholder="0"
                                              value={ie.amount}
                                              onChange={e => setInlineEntry(prev => ({ ...prev, [c.key]: { ...prev[c.key], amount: e.target.value } }))}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mode</label>
                                            <select
                                              className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs font-black uppercase outline-none focus:border-indigo-500 bg-white"
                                              value={ie.mode}
                                              onChange={e => setInlineEntry(prev => ({ ...prev, [c.key]: { ...prev[c.key], mode: e.target.value } }))}
                                            >
                                              <option value="CASH">Cash</option>
                                              {bankAccounts.filter(b => b.status === 'ACTIVE').map(bank => (
                                                <option key={bank.id} value={bank.name}>{bank.name}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                        <input
                                          type="text"
                                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-indigo-500 bg-white"
                                          placeholder="Notes (optional)..."
                                          value={ie.notes}
                                          onChange={e => setInlineEntry(prev => ({ ...prev, [c.key]: { ...prev[c.key], notes: e.target.value } }))}
                                        />
                                        <button
                                          type="button"
                                          disabled={!ie.amount || inlinePosting[c.key]}
                                          onClick={() => handleQuickPost(c.key, catPurpose, Number(ie.amount), ie.mode, ie.notes, direction)}
                                          className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition ${direction === 'OUT' ? 'bg-rose-500 hover:bg-rose-600' : c.btnCls} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                                        >
                                          {inlinePosting[c.key]
                                            ? <><i className="fas fa-spinner fa-spin"></i> Posting...</>
                                            : <><i className="fas fa-check-circle"></i> Post {c.label} {direction === 'IN' ? 'Receipt' : 'Payment'}</>}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                       })()}

                       {/* SPECIFIC CATEGORY: just show the balance with a note if Cr */}
                       {purpose !== 'OVERALL' && isCr && (
                          <p className="text-[10px] text-amber-700 font-semibold">
                             You owe this party {absBalance.toLocaleString()} — use OUT (Payment) to settle it
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
                                   <span className="text-[10px] font-black text-slate-800">{bd.royalty.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.interest > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Interest Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">{bd.interest.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.chit > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-orange-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Chit Due</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">{bd.chit.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.principal > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Principal Lent</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">{bd.principal.toLocaleString()}</span>
                                </div>
                             )}
                             {bd.opening > 0 && (
                                <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">General / Old</span>
                                   </div>
                                   <span className="text-[10px] font-black text-slate-800">{bd.opening.toLocaleString()}</span>
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
                          if (direction === 'OUT') {
                            // Priority: "You Owe Them" (negative) first → most negative first
                            // Then zero, then "They Owe You" (positive) last
                            const grpA = bA < 0 ? 0 : bA === 0 ? 1 : 2;
                            const grpB = bB < 0 ? 0 : bB === 0 ? 1 : 2;
                            if (grpA !== grpB) return grpA - grpB;
                            return bA - bB; // within same group: most negative / lowest first
                          }
                          // IN Receipt: highest "They Owe You" (positive) first
                          return bB - bA;
                        });
                    if (sorted.length === 0 && !isSearching) return null;
                    return (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-72 overflow-y-auto z-50">
                       {/* Header */}
                       <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl sticky top-0">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                             {isSearching ? `${sorted.length} result${sorted.length !== 1 ? 's' : ''} for "${accountSearch}"` : direction === 'OUT' ? `Priority · Payable First` : `All · Sorted by Outstanding`}
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
                                   <div className="flex items-center gap-1.5 mt-0.5">
                                     {p.partyType === 'INCOME_CAT' && <span className="text-[8px] font-black bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">INCOME</span>}
                                     {p.partyType === 'EXPENSE_CAT' && <span className="text-[8px] font-black bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">EXPENSE</span>}
                                     {p.partyType === 'LIABILITY' && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">LOAN</span>}
                                     {p.partyType === 'BUSINESS_UNIT' && <span className="text-[8px] font-black bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">BUSINESS</span>}
                                     {p.partyType === 'INVESTMENT' && <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">INVESTMENT</span>}
                                     {(p.partyType === 'CUSTOMER' || !p.partyType) && <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">CUSTOMER</span>}
                                     {p.type && <span className="text-[9px] font-bold text-slate-400">{p.type.replace(/_/g, ' ')}</span>}
                                   </div>
                                </div>
                             </div>
                             <div className="text-right shrink-0 ml-4">
                                <div className="flex items-center gap-1 justify-end">
                                   {isCr && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">You Owe</span>}
                                   {isDr && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">Owes You</span>}
                                   <span className={`text-xs font-black ${isCr ? 'text-amber-700' : isDr ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {isNil ? '—' : `${absBal.toLocaleString()}`}
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

              {/* Amount, Mode, Notes — shown for Income, Expense, OUT non-OVERALL, OR when editing a voucher */}
              {((direction === 'OUT' && purpose !== 'OVERALL') || (direction === 'IN' && purpose === 'DIRECT_INCOME') || editingId) && (
              <>
                <div className="grid grid-cols-2 gap-6">
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount ()</label>
                      <input data-testid="input-amount" required type="number" className="w-full border-2 border-slate-100 p-4 rounded-2xl text-2xl font-display font-black outline-none focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Enter amount" value={formData.amount && formData.amount !== 0 ? formData.amount : ''} onChange={e => setFormData({...formData, amount: Number(e.target.value) || 0})} onKeyDown={handleKeyDown} />
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Transaction Date</label>
                      <input required type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 bg-white" value={safeDateToInput(formData.date)} onChange={e => { const val = e.target.value; const ts = val ? new Date(val).getTime() : Date.now(); if (Number.isFinite(ts)) setFormData({...formData, date: ts}); }} />
                   </div>
                </div>

                {/* Bank/Cash Mode */}
                <div className="grid grid-cols-2 gap-6">
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{direction === 'IN' && purpose === 'DIRECT_INCOME' ? 'Receipt Mode' : 'Payment Mode'}</label>
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
                {/* Exclude from P&L — for OUT (expense) vouchers */}
                {direction === 'OUT' && purpose !== 'OVERALL' && purpose !== 'TRANSFER' && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <input type="checkbox" id="excludeFromPL" checked={!!formData.excludeFromPL} onChange={e => setFormData({...formData, excludeFromPL: e.target.checked})}
                      className="w-4 h-4 rounded accent-amber-600 cursor-pointer" />
                    <label htmlFor="excludeFromPL" className="text-xs font-bold text-amber-800 cursor-pointer">
                      Exclude from P&amp;L / Balance Sheet — this expense will not affect net profit or retained earnings
                    </label>
                  </div>
                )}
              </>
              )}

           </div>{/* end space-y-6 */}

           {/* Submit button — for Income, Expense, OUT non-OVERALL, OR when editing */}
           {((direction === 'OUT' && purpose !== 'OVERALL') || (direction === 'IN' && purpose === 'DIRECT_INCOME') || editingId) && (
           <div className="pt-4 border-t border-slate-100">
              <button data-testid="btn-save-voucher" disabled={isSubmitting} className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.01] transition text-sm flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 ${entryMode === 'INCOME' ? 'bg-indigo-500 text-white hover:bg-indigo-600' : entryMode === 'EXPENSE' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-rose-500 text-white hover:bg-rose-600'}`}>
                {isSubmitting ? <><i className="fas fa-spinner fa-spin"></i> Processing...</> : editingId ? <><i className="fas fa-save"></i> Update Voucher</> : entryMode === 'INCOME' ? <><i className="fas fa-check-circle"></i> Post Income</> : entryMode === 'EXPENSE' ? <><i className="fas fa-check-circle"></i> Post Expense</> : <><i className="fas fa-check-circle"></i> Post Payment</>}
              </button>
           </div>
           )}
        </form>
      </div>

      {/* RECENT VOUCHERS LIST */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
         <div className="p-8 border-b border-slate-100 bg-slate-50">
            {/* Title row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
               <div>
                  <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Recent Vouchers</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History &amp; Corrections</p>
               </div>
               <input
                  value={voucherSearch}
                  onChange={e => { setVoucherSearch(e.target.value); setVoucherPage(1); setSelectedIds(new Set()); }}
                  placeholder="Search party / head..."
                  className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
               />
            </div>
            {/* Filter row */}
            <div className="flex flex-wrap gap-2 items-center">
               {/* IN / OUT toggle */}
               <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  {(['ALL','IN','OUT'] as const).map(t => (
                     <button key={t} onClick={() => { setVoucherTypeFilter(t); setVoucherPage(1); setSelectedIds(new Set()); }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                           voucherTypeFilter === t
                              ? t === 'IN' ? 'bg-emerald-500 text-white shadow'
                              : t === 'OUT' ? 'bg-rose-500 text-white shadow'
                              : 'bg-slate-900 text-white shadow'
                              : 'text-slate-400 hover:text-slate-600'
                        }`}>{t === 'ALL' ? 'All' : t === 'IN' ? '+ IN' : '– OUT'}</button>
                  ))}
               </div>
               {/* Category */}
               <select
                  value={voucherCatFilter}
                  onChange={e => { setVoucherCatFilter(e.target.value); setVoucherPage(1); setSelectedIds(new Set()); }}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
               >
                  <option value="ALL">All Categories</option>
                  {Array.from(new Set(payments.map(p => p.category))).sort().map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                  ))}
               </select>
               {/* Date From */}
               <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                  <i className="fas fa-calendar-day text-slate-400 text-[9px]"></i>
                  <input
                     type="date"
                     value={voucherDateFrom}
                     onChange={e => { setVoucherDateFrom(e.target.value); setVoucherPage(1); setSelectedIds(new Set()); }}
                     className="text-[9px] font-black text-slate-600 focus:outline-none bg-transparent w-28"
                  />
               </div>
               <span className="text-[9px] font-black text-slate-400">TO</span>
               {/* Date To */}
               <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                  <i className="fas fa-calendar-day text-slate-400 text-[9px]"></i>
                  <input
                     type="date"
                     value={voucherDateTo}
                     onChange={e => { setVoucherDateTo(e.target.value); setVoucherPage(1); setSelectedIds(new Set()); }}
                     className="text-[9px] font-black text-slate-600 focus:outline-none bg-transparent w-28"
                  />
               </div>
               {/* Clear dates */}
               {(voucherDateFrom || voucherDateTo) && (
                  <button onClick={() => { setVoucherDateFrom(''); setVoucherDateTo(''); setVoucherPage(1); }}
                     className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest transition">
                     <i className="fas fa-times-circle mr-1"></i>Clear
                  </button>
               )}
            </div>
            {/* Bulk delete bar — shown when items are selected */}
            {selectedIds.size > 0 && (currentUser?.role === 'OWNER' || currentUser?.permissions?.canDelete) && (
               <div className="mt-4 flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
                  <i className="fas fa-check-square text-rose-500"></i>
                  <span className="text-xs font-black text-rose-700">{selectedIds.size} voucher{selectedIds.size > 1 ? 's' : ''} selected</span>
                  <button
                     onClick={handleBulkDelete}
                     disabled={isBulkDeleting}
                     className="ml-auto flex items-center gap-2 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-rose-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                     {isBulkDeleting ? <><i className="fas fa-spinner fa-spin"></i> Deleting…</> : <><i className="fas fa-trash-alt"></i> Delete Selected</>}
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-[9px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest transition">
                     Cancel
                  </button>
               </div>
            )}
         </div>
         {(() => {
            const fromD = voucherDateFrom ? new Date(voucherDateFrom) : null;
            const toD   = voucherDateTo   ? new Date(voucherDateTo)   : null;
            const fromTs = fromD && !isNaN(fromD.getTime()) ? fromD.setHours(0,0,0,0) : null;
            const toTs   = toD   && !isNaN(toD.getTime())   ? toD.setHours(23,59,59,999) : null;
            const filtered = payments
               .filter(p => voucherTypeFilter === 'ALL' || p.type === voucherTypeFilter)
               .filter(p => voucherCatFilter === 'ALL' || p.category === voucherCatFilter)
               .filter(p => !voucherSearch || p.sourceName?.toLowerCase().includes(voucherSearch.toLowerCase()) || p.category?.toLowerCase().includes(voucherSearch.toLowerCase()))
               .filter(p => !fromTs || p.date >= fromTs)
               .filter(p => !toTs   || p.date <= toTs);
            const totalPages = Math.max(1, Math.ceil(filtered.length / VOUCHER_PAGE_SIZE));
            const safePage = Math.min(voucherPage, totalPages);
            const paginated = filtered.slice((safePage - 1) * VOUCHER_PAGE_SIZE, safePage * VOUCHER_PAGE_SIZE);
            const pageIds = new Set(paginated.map(p => p.id));
            const allPageSelected = pageIds.size > 0 && [...pageIds].every(id => selectedIds.has(id));

            const isStaffRestricted = currentUser?.role !== 'OWNER' && currentUser?.permissions?.canDelete;
            const todayPageIds = isStaffRestricted ? new Set(paginated.filter(p => isRecordFromToday(p)).map(p => p.id)) : pageIds;
            const allTodaySelected = isStaffRestricted && todayPageIds.size > 0 && [...todayPageIds].every(id => selectedIds.has(id));

            const toggleRow = (id: string) => {
               if (isStaffRestricted) {
                  const p = paginated.find(x => x.id === id);
                  if (p && !isRecordFromToday(p)) return;
               }
               setSelectedIds(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
               });
            };
            const toggleAll = () => {
               const idsToUse = isStaffRestricted ? todayPageIds : pageIds;
               if ((isStaffRestricted ? allTodaySelected : allPageSelected)) {
                  setSelectedIds(prev => { const next = new Set(prev); idsToUse.forEach(id => next.delete(id)); return next; });
               } else {
                  setSelectedIds(prev => { const next = new Set(prev); idsToUse.forEach(id => next.add(id)); return next; });
               }
            };

            // Build visible page numbers (max 7 shown, with ellipsis)
            const visiblePages = (() => {
               if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
               const pages: (number | '…')[] = [1];
               if (safePage > 3) pages.push('…');
               for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
               if (safePage < totalPages - 2) pages.push('…');
               pages.push(totalPages);
               return pages;
            })();

            return (<>
         {(() => {
                  const totalIn  = filtered.filter(p => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
                  const totalOut = filtered.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
                  const net = totalIn - totalOut;
                  const colSpan = (currentUser?.role === 'OWNER' || currentUser?.permissions?.canDelete) ? 7 : 6;
                  return (
                    <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold">
                      <span className="text-slate-400 uppercase tracking-widest">{filtered.length} records</span>
                      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
                        <i className="fas fa-arrow-down text-emerald-500 text-[10px]"></i>
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total IN</span>
                        <span className="text-sm font-black text-emerald-700 ml-1">{totalIn.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                        <i className="fas fa-arrow-up text-rose-500 text-[10px]"></i>
                        <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Total OUT</span>
                        <span className="text-sm font-black text-rose-700 ml-1">{totalOut.toLocaleString()}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${net >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'}`}>
                        <i className={`fas fa-equals text-[10px] ${net >= 0 ? 'text-indigo-500' : 'text-amber-500'}`}></i>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${net >= 0 ? 'text-indigo-600' : 'text-amber-600'}`}>Net</span>
                        <span className={`text-sm font-black ml-1 ${net >= 0 ? 'text-indigo-700' : 'text-amber-700'}`}>{net < 0 ? '-' : ''}{Math.abs(net).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}
         <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-white">
               <tr>
                  {(currentUser?.role === 'OWNER' || currentUser?.permissions?.canDelete) && (
                     <th className="pl-6 pr-2 py-4 w-8">
                        <input type="checkbox" checked={isStaffRestricted ? allTodaySelected : allPageSelected} onChange={toggleAll}
                           className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                           title={currentUser?.role !== 'OWNER' ? 'Staff can only select vouchers dated today for bulk delete' : undefined} />
                     </th>
                  )}
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Voucher No</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Party / Head</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Mode</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Amount</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
               {paginated.length === 0 && (
                  <tr><td colSpan={(currentUser?.role === 'OWNER' || currentUser?.permissions?.canDelete) ? 7 : 6} className="px-8 py-10 text-center text-xs font-bold text-slate-400">No vouchers match the current filters.</td></tr>
               )}
               {paginated.map(p => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                     <tr key={p.id} className={`hover:bg-slate-50 transition group ${isSelected ? 'bg-indigo-50/60' : ''}`}>
                        {(currentUser?.role === 'OWNER' || currentUser?.permissions?.canDelete) && (
                           <td className="pl-6 pr-2 py-4 w-8">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleRow(p.id)}
                                 disabled={isStaffRestricted && !isRecordFromToday(p)}
                                 className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                           </td>
                        )}
                        <td className="px-6 py-4 text-xs font-bold text-slate-500">{safeFormatDate(p.date)}</td>
                        <td className="px-6 py-4">
                           {p.voucherNumber
                             ? <div className="text-[10px] font-black text-slate-600 font-mono">{p.voucherNumber}</div>
                             : <div className="text-[10px] text-slate-300 font-mono">—</div>}
                           {p.receiptNumber && (
                             <div className="text-[9px] font-black text-emerald-600 font-mono mt-0.5">{p.receiptNumber}</div>
                           )}
                        </td>
                        <td className="px-6 py-4">
                           <div className="text-xs font-black text-slate-800 uppercase">{p.sourceName}</div>
                           <div className="text-[9px] font-bold text-slate-400">{p.category}</div>
                           {p.excludeFromPL && <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded">Excluded from P&L</span>}
                        </td>
                        <td className="px-6 py-4">
                           <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase tracking-widest">{p.mode} {p.targetMode ? `→ ${p.targetMode}` : ''}</span>
                        </td>
                        <td className={`px-6 py-4 text-right font-display font-black text-sm ${p.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                           {p.type === 'IN' ? '+' : '-'} {p.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-2">
                              {canStaffEditRecord(currentUser, p) && (
                                 <button onClick={() => handleEdit(p)} className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition">
                                    <i className="fas fa-pen text-xs"></i>
                                 </button>
                              )}
                              {canStaffDeleteRecord(currentUser, p) && (
                                 <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
                                    {deletingId === p.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}
                                 </button>
                              )}
                           </div>
                        </td>
                     </tr>
                  );
               })}
               </tbody>
            </table>
            {/* Pagination */}
            <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-slate-50">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {filtered.length === 0 ? '0 records' : `${((safePage-1)*VOUCHER_PAGE_SIZE)+1}–${Math.min(safePage*VOUCHER_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
               </span>
               {totalPages > 1 && (
                  <div className="flex gap-1.5 items-center">
                     <button disabled={safePage === 1} onClick={() => setVoucherPage(safePage - 1)}
                        className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition">
                        <i className="fas fa-chevron-left"></i>
                     </button>
                     {visiblePages.map((pg, idx) =>
                        pg === '…'
                           ? <span key={`e${idx}`} className="h-8 w-6 flex items-center justify-center text-slate-400 text-xs font-black">…</span>
                           : <button key={pg} onClick={() => setVoucherPage(pg as number)}
                                className={`h-8 w-8 rounded-lg text-xs font-black transition ${
                                   pg === safePage ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}>{pg}</button>
                     )}
                     <button disabled={safePage === totalPages} onClick={() => setVoucherPage(safePage + 1)}
                        className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition">
                        <i className="fas fa-chevron-right"></i>
                     </button>
                  </div>
               )}
            </div>
            </>);
         })()}
      </div>
    </div>
  );
}

export default AccountsManager;

