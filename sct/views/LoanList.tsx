
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Liability, Customer, Invoice, Payment, StaffUser } from '../types';
import { liabilityAPI, paymentAPI, customerAPI } from '../services/api';
import { canStaffDeleteRecord } from '../utils/authHelpers';

interface BankAccount { id: string; name: string; status?: string; openingBalance?: number }

interface LoanListProps {
  liabilities: Liability[];
  setLiabilities: React.Dispatch<React.SetStateAction<Liability[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  bankAccounts?: BankAccount[];
  currentUser?: StaffUser | null;
}

const LoanList: React.FC<LoanListProps> = ({ liabilities, setLiabilities, customers, setCustomers, invoices, payments, setPayments, bankAccounts = [], currentUser }) => {
  const [showAddModal, setShowAddModal] = useState<'BANK' | 'PRIVATE' | 'GIVE' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refined action state to handle both Liability object and Customer object
  const [liabilityAction, setLiabilityAction] = useState<{ item: Liability | Customer, itemType: 'LIABILITY' | 'CUSTOMER', type: 'INTEREST' | 'PRINCIPAL' } | null>(null);
  
  const [liabilityPayAmount, setLiabilityPayAmount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'BANK' | 'PRIVATE' | 'LENT'>('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<'name' | 'date' | 'principal' | 'rate' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Search & Date Filter (like Billing page)
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setShowDateDropdown(false);
      }
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(e.target as Node)) {
        setShowPartyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initialForm = { 
    providerName: '', 
    bankBranch: '', 
    accountNumber: '',
    principal: 0, 
    interestRate: 0, 
    emiAmount: 0,
    startDate: Date.now(), 
    tenureMonths: 12,
    sourceAccount: 'CASH' as string
  };
  const [formData, setFormData] = useState(initialForm);

  // Wallet options: Cash Drawer + active banks (for Loan Taken & Loan Given)
  const walletOptions = useMemo(() => {
    const opts: { id: string; name: string; label: string }[] = [
      { id: 'CASH', name: 'CASH', label: 'Cash Drawer' }
    ];
    (bankAccounts || []).filter((b: BankAccount) => b.status === 'ACTIVE').forEach((b: BankAccount) => {
      opts.push({ id: b.name, name: b.name, label: b.name });
    });
    return opts;
  }, [bankAccounts]);

  const generateVoucherNumber = (dateMs: number, type: 'VCH' | 'RCT') => {
    const d = new Date(dateMs);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const pattern = new RegExp(`^${type}-${ym}-(\\d+)$`);
    let max = 0;
    payments.forEach((p: Payment) => {
      const field = type === 'RCT' ? p.receiptNumber : p.voucherNumber;
      const m = field?.match(pattern);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    });
    return `${type}-${ym}-${String(max + 1).padStart(3, '0')}`;
  };

  // Party options from registry (customers) — for Loan Given & Loan Taken
  const partyOptions = useMemo(() => {
    const names = new Set<string>();
    (customers ?? []).forEach(c => names.add(c.name.trim()));
    if (showAddModal === 'BANK') {
      (liabilities ?? []).filter(l => l.type === 'BANK').forEach(l => names.add(l.providerName?.trim() || ''));
    }
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [customers, liabilities, showAddModal]);

  // Consolidated Totals + Weighted Avg %
  const totals = useMemo(() => {
    // 1. Bank Debt (From Liabilities)
    const bankItems = liabilities.filter(l => l.type === 'BANK');
    const bankDebt = bankItems.reduce((acc, l) => acc + l.principal, 0);
    const bankSumRatePrincipal = bankItems.reduce((acc, l) => acc + (l.interestRate || 0) * l.principal, 0);
    const bankAvgPct = bankDebt > 0 ? bankSumRatePrincipal / bankDebt : 0;

    // 2. Private Debt (Liabilities + Creditor Customers)
    const privateLiabs = liabilities.filter(l => l.type === 'PRIVATE');
    const creditorCusts = customers.filter(c => c.isLender && (c.creditPrincipal || 0) > 0);
    const totalPrivateDebt = privateLiabs.reduce((acc, l) => acc + l.principal, 0) +
      creditorCusts.reduce((acc, c) => acc + (c.creditPrincipal || 0), 0);
    const privateSumRatePrincipal = privateLiabs.reduce((acc, l) => acc + (l.interestRate || 0) * l.principal, 0) +
      creditorCusts.reduce((acc, c) => acc + (c.interestRate || 0) * (c.creditPrincipal || 0), 0);
    const privateAvgPct = totalPrivateDebt > 0 ? privateSumRatePrincipal / totalPrivateDebt : 0;

    // 3. Capital Lent (Assets)
    const lentCusts = customers.filter(c => c.isInterest && (c.interestPrincipal || 0) > 0);
    const lentCapital = lentCusts.reduce((acc, c) => acc + (c.interestPrincipal || 0), 0);
    const lentSumRatePrincipal = lentCusts.reduce((acc, c) => acc + (c.interestRate || 0) * (c.interestPrincipal || 0), 0);
    const lentAvgPct = lentCapital > 0 ? lentSumRatePrincipal / lentCapital : 0;

    return {
      bank: bankDebt,
      private: totalPrivateDebt,
      lent: lentCapital,
      bankAvgPct,
      privateAvgPct,
      lentAvgPct
    };
  }, [liabilities, customers]);

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const amount = Number(formData.principal);
    const mode = (formData.sourceAccount || 'CASH') as string;
    const paymentDate = Date.now();
    const voucherNumber = generateVoucherNumber(paymentDate, 'VCH');

    if (showAddModal === 'GIVE') {
       // Adding Lending Asset — money goes OUT from our wallet
       const targetCust = customers.find(c => c.name.toLowerCase() === formData.providerName.toLowerCase());
       let custId: string;
       if (targetCust) {
         setCustomers(prev => prev.map(c => c.id === targetCust.id ? { ...c, isInterest: true, interestPrincipal: (c.interestPrincipal || 0) + amount, interestRate: Number(formData.interestRate) } : c));
         custId = targetCust.id;
       } else {
         const newCust: Customer = {
            id: Math.random().toString(36).substr(2, 9),
            name: formData.providerName.toUpperCase(),
            phone: '',
            isRoyalty: false,
            isInterest: true,
            isChit: false,
            isGeneral: false,
            isLender: false,
            royaltyAmount: 0,
            interestPrincipal: amount,
            creditPrincipal: 0,
            openingBalance: 0,
            interestRate: Number(formData.interestRate),
            status: 'ACTIVE',
            createdAt: Date.now()
         };
         setCustomers(prev => [...prev, newCust]);
         custId = newCust.id;
       }
       // Create OUT payment to reflect wallet deduction
       const loanGivenPayment: Payment = {
         id: Math.random().toString(36).substr(2, 9),
         type: 'OUT',
         voucherType: 'PAYMENT',
         voucherNumber,
         sourceId: custId,
         sourceName: formData.providerName.toUpperCase(),
         amount,
         mode: mode as any,
         date: paymentDate,
         category: 'LOAN_GIVEN'
       };
       try {
         const created = await paymentAPI.create(loanGivenPayment);
         setPayments(prev => [created, ...prev]);
       } catch (err) {
         console.error('Failed to create loan-given payment:', err);
       }
    } else if (showAddModal === 'PRIVATE') {
        // Loan Taken — add to existing Liability/Customer if same party, else create new
        const normName = formData.providerName.trim().toUpperCase();
        const existingLiability = liabilities.find(l =>
          (l.providerName || '').trim().toUpperCase() === normName && l.type === 'PRIVATE'
        );
        const existingCustomer = !existingLiability && customers.find(c =>
          (c.name || '').trim().toUpperCase() === normName && c.isLender
        );

        if (existingLiability) {
          // Add to existing liability — prevent duplicate entries for same person
          const newPrincipal = existingLiability.principal + amount;
          try {
            await liabilityAPI.update(existingLiability.id, { principal: newPrincipal, remainingBalance: newPrincipal });
            setLiabilities(prev => prev.map(l => l.id === existingLiability.id ? { ...l, principal: newPrincipal, remainingBalance: newPrincipal } : l));
            const loanTakenPayment: Payment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'IN',
              voucherType: 'RECEIPT',
              voucherNumber,
              receiptNumber: generateVoucherNumber(paymentDate, 'RCT'),
              sourceId: existingLiability.id,
              sourceName: formData.providerName.toUpperCase(),
              amount,
              mode: mode as any,
              date: paymentDate,
              category: 'LOAN_TAKEN'
            };
            const payCreated = await paymentAPI.create(loanTakenPayment);
            setPayments(prev => [payCreated, ...prev]);
          } catch (err) {
            console.error('Failed to update liability or create payment:', err);
            alert('Failed to add loan. Please try again.');
          }
        } else if (existingCustomer) {
          // Add to existing customer creditor (isLender)
          const newCredit = (existingCustomer.creditPrincipal || 0) + amount;
          try {
            await customerAPI.update(existingCustomer.id, { creditPrincipal: newCredit });
            setCustomers(prev => prev.map(c => c.id === existingCustomer.id ? { ...c, creditPrincipal: newCredit } : c));
            const loanTakenPayment: Payment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'IN',
              voucherType: 'RECEIPT',
              voucherNumber,
              receiptNumber: generateVoucherNumber(paymentDate, 'RCT'),
              sourceId: existingCustomer.id,
              sourceName: formData.providerName.toUpperCase(),
              amount,
              mode: mode as any,
              date: paymentDate,
              category: 'LOAN_TAKEN'
            };
            const payCreated = await paymentAPI.create(loanTakenPayment);
            setPayments(prev => [payCreated, ...prev]);
          } catch (err) {
            console.error('Failed to update customer or create payment:', err);
            alert('Failed to add loan. Please try again.');
          }
        } else {
          // Create new Liability
          const startTs = Number(formData.startDate);
          const validStart = !isNaN(startTs) && startTs > 0 ? startTs : Date.now();
          const newLiability: Liability = {
            id: Math.random().toString(36).substr(2, 9),
            providerName: formData.providerName.toUpperCase(),
            bankBranch: formData.bankBranch,
            accountNumber: formData.accountNumber,
            type: 'PRIVATE',
            principal: amount,
            interestRate: Number(formData.interestRate),
            emiAmount: Number(formData.emiAmount),
            startDate: validStart,
            tenureMonths: Number(formData.tenureMonths) || 0,
            remainingBalance: amount,
            status: 'ACTIVE'
          };
          try {
            const created = await liabilityAPI.create(newLiability);
            setLiabilities([...liabilities, created]);
            const loanTakenPayment: Payment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'IN',
              voucherType: 'RECEIPT',
              voucherNumber,
              receiptNumber: generateVoucherNumber(paymentDate, 'RCT'),
              sourceId: created.id,
              sourceName: formData.providerName.toUpperCase(),
              amount,
              mode: mode as any,
              date: paymentDate,
              category: 'LOAN_TAKEN'
            };
            const payCreated = await paymentAPI.create(loanTakenPayment);
            setPayments(prev => [payCreated, ...prev]);
          } catch (error) {
            console.error('Failed to create liability:', error);
            alert('Failed to create liability. Please try again.');
            setIsSubmitting(false);
            return;
          }
        }
    } else {
        // BANK Loan — no wallet impact (bank loan is drawn directly, not from our cash drawer)
        const startTs = Number(formData.startDate);
        const validStart = !isNaN(startTs) && startTs > 0 ? startTs : Date.now();
        const newLiability: Liability = {
          id: Math.random().toString(36).substr(2, 9),
          providerName: formData.providerName.toUpperCase(),
          bankBranch: formData.bankBranch,
          accountNumber: formData.accountNumber,
          type: 'BANK',
          principal: amount,
          interestRate: Number(formData.interestRate),
          emiAmount: Number(formData.emiAmount),
          startDate: validStart,
          tenureMonths: Number(formData.tenureMonths) || 0,
          remainingBalance: amount,
          status: 'ACTIVE'
        };
        try {
          const created = await liabilityAPI.create(newLiability);
          setLiabilities([...liabilities, created]);
        } catch (error) {
          console.error('Failed to create liability:', error);
          alert('Failed to create liability. Please try again.');
          setIsSubmitting(false);
          return;
        }
    }
    setShowAddModal(null);
    setFormData(initialForm);
    setIsSubmitting(false);
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (liabilityAction && liabilityPayAmount > 0) {
       const { item, itemType, type } = liabilityAction;
       const name = itemType === 'LIABILITY' ? (item as Liability).providerName : (item as Customer).name;
       
       const newPayment: Payment = {
         id: Math.random().toString(36).substr(2, 9),
         type: 'OUT',
         voucherType: 'PAYMENT',
         amount: liabilityPayAmount,
         mode: 'CASH',
         date: Date.now(),
         sourceId: item.id,
         sourceName: name,
         category: type === 'INTEREST' ? 'LOAN_INTEREST' : 'LOAN_REPAYMENT'
       };
       setPayments(prev => [newPayment, ...prev]);

       // Update Balance
       if (type === 'PRINCIPAL') {
         if (itemType === 'LIABILITY') {
            setLiabilities(prev => prev.map(l => l.id === item.id ? { ...l, principal: Math.max(0, l.principal - liabilityPayAmount) } : l));
         } else {
            setCustomers(prev => prev.map(c => c.id === item.id ? { ...c, creditPrincipal: Math.max(0, c.creditPrincipal - liabilityPayAmount) } : c));
         }
       }
       setLiabilityAction(null);
       setLiabilityPayAmount(0);
    }
  };

  const handleDelete = async (row: any) => {
    const label = row.sourceType === 'LIABILITY' ? row.name : `${row.name} (${row.type})`;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      if (row.sourceType === 'LIABILITY') {
        await liabilityAPI.delete(row.id);
        setLiabilities(prev => prev.filter(l => l.id !== row.id));
      } else {
        // Customer-based lent/lender row — clear the relevant flags/amounts
        if (row.isLent) {
          setCustomers(prev => prev.map(c => c.id === row.id
            ? { ...c, isInterest: false, interestPrincipal: 0 }
            : c));
        } else {
          setCustomers(prev => prev.map(c => c.id === row.id
            ? { ...c, isLender: false, creditPrincipal: 0 }
            : c));
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Date range for filtering (same logic as Billing)
  const activeDateRange = useMemo(() => {
    const fmt = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    if (dateFilter === 'ALL') return { label: 'All Time', start: 0, end: Number.MAX_SAFE_INTEGER };
    if (dateFilter === 'TODAY') return { label: fmt(todayStart), start: todayStart, end: todayEnd };
    if (dateFilter === 'YESTERDAY') {
      const s = todayStart - 86400000; const e = todayStart - 1;
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'LAST_7') {
      const s = todayStart - 6 * 86400000;
      return { label: `${fmt(s)} to ${fmt(todayEnd)}`, start: s, end: todayEnd };
    }
    if (dateFilter === 'THIS_MONTH') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'LAST_MONTH') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      return { label: `${fmt(s)} to ${fmt(e)}`, start: s, end: e };
    }
    if (dateFilter === 'CUSTOM') {
      const s = customStartDate ? (() => { const t = new Date(customStartDate).getTime(); return isNaN(t) ? 0 : t; })() : 0;
      const e = customEndDate ? (() => { const d = new Date(customEndDate); if (isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER; d.setHours(23, 59, 59, 999); return d.getTime(); })() : Number.MAX_SAFE_INTEGER;
      const lbl = customStartDate && customEndDate ? `${customStartDate} to ${customEndDate}` : customStartDate ? `From ${customStartDate}` : 'Custom Range';
      return { label: lbl, start: s, end: e };
    }
    return { label: 'All Time', start: 0, end: Number.MAX_SAFE_INTEGER };
  }, [dateFilter, customStartDate, customEndDate]);

  // Unified Rows for Display
  const displayRows = useMemo(() => {
    let rows: any[] = [];

    // 1. LIABILITIES (Bank & Manual Private) — consolidate by providerName to avoid duplicate rows for same person
    const liabilityMap = new Map<string, { id: string; name: string; type: string; principal: number; rate: number; date: number; isLent: boolean; sourceType: string; raw: Liability }>();
    liabilities.forEach(l => {
      const key = (l.providerName || '').trim().toUpperCase();
      if (!key) return;
      const existing = liabilityMap.get(key);
      if (existing) {
        existing.principal += l.principal;
        existing.raw = { ...existing.raw, principal: existing.principal };
      } else {
        liabilityMap.set(key, {
          id: l.id,
          name: l.providerName || '',
          type: l.type,
          principal: l.principal,
          rate: l.interestRate || 0,
          date: l.startDate || 0,
          isLent: false,
          sourceType: 'LIABILITY',
          raw: l
        });
      }
    });
    const liabilityRows = Array.from(liabilityMap.values());

    // 2. CUSTOMERS (Lenders & Debtors)
    const customerRows = customers
      .filter(c => (c.isLender && c.creditPrincipal > 0) || (c.isInterest && c.interestPrincipal > 0))
      .map(c => {
         // Debt
         if (c.isLender && c.creditPrincipal > 0) {
             return {
                 id: c.id,
                 name: c.name,
                 type: 'PRIVATE', // Treat as Private Debt
                 principal: c.creditPrincipal,
                 rate: c.interestRate,
                 date: c.createdAt || 0,
                 isLent: false,
                 sourceType: 'CUSTOMER',
                 raw: c
             };
         }
         // Asset
         if (c.isInterest && c.interestPrincipal > 0) {
             return {
                 id: c.id,
                 name: c.name,
                 type: 'LENT',
                 principal: c.interestPrincipal,
                 rate: c.interestRate,
                 date: c.createdAt || 0,
                 isLent: true,
                 sourceType: 'CUSTOMER',
                 raw: c
             };
         }
         return null;
      })
      .filter(Boolean);

    rows = [...liabilityRows, ...customerRows];

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => r.name.toLowerCase().includes(q));
    }

    // Date filter
    if (activeDateRange.start > 0 || activeDateRange.end < Number.MAX_SAFE_INTEGER) {
      rows = rows.filter(r => {
        const d = r.date || 0;
        return d >= activeDateRange.start && d <= activeDateRange.end;
      });
    }

    // Category filter
    if (activeFilter === 'LENT') rows = rows.filter(r => r.isLent);
    else if (activeFilter === 'BANK') rows = rows.filter(r => r.type === 'BANK');
    else if (activeFilter === 'PRIVATE') rows = rows.filter(r => r.type === 'PRIVATE');

    // Sort (ascending / descending)
    if (sortColumn) {
      const dir = sortDirection === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        let va: string | number = a[sortColumn] ?? '';
        let vb: string | number = b[sortColumn] ?? '';
        if (sortColumn === 'name') {
          return dir * String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
        }
        if (sortColumn === 'date') {
          return dir * ((va as number) - (vb as number));
        }
        if (sortColumn === 'principal' || sortColumn === 'rate') {
          return dir * ((Number(va) || 0) - (Number(vb) || 0));
        }
        return 0;
      });
    }

    return rows;
  }, [activeFilter, liabilities, customers, search, activeDateRange, sortColumn, sortDirection]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Credit Manager</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Debt Obligations & Lending Portfolio</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowAddModal('BANK')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition">+ Bank Loan</button>
          <button onClick={() => setShowAddModal('PRIVATE')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition">+ Loan Taken</button>
          <button onClick={() => setShowAddModal('GIVE')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg transition">+ Loan Given</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Debt</div>
           <div className="text-3xl font-display font-black italic text-slate-900 tracking-tighter">{totals.bank.toLocaleString()}</div>
           {totals.bank > 0 && <div className="text-[10px] font-black text-slate-500 mt-1">Avg {totals.bankAvgPct.toFixed(1)}%</div>}
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Loan Taken</div>
           <div className="text-3xl font-display font-black italic text-rose-600 tracking-tighter">{totals.private.toLocaleString()}</div>
           {totals.private > 0 && <div className="text-[10px] font-black text-rose-500 mt-1">Avg {totals.privateAvgPct.toFixed(1)}%</div>}
        </div>
        <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 shadow-sm">
           <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Loan Given</div>
           <div className="text-3xl font-display font-black italic text-emerald-700 tracking-tighter">{totals.lent.toLocaleString()}</div>
           {totals.lent > 0 && <div className="text-[10px] font-black text-emerald-600 mt-1">Avg {totals.lentAvgPct.toFixed(1)}%</div>}
        </div>
      </div>

      {/* FILTERS (like Billing page) */}
      <div className="bg-white p-3 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-center">
        {/* SEARCH */}
        <div className="flex-1 relative w-full">
          <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-lg"></i>
          <input
            type="text"
            placeholder="Search by party or institution..."
            className="w-full pl-14 pr-6 py-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* DATE FILTER DROPDOWN */}
        <div ref={dateDropdownRef} className="relative w-full lg:w-auto">
          <button
            onClick={() => setShowDateDropdown(v => !v)}
            className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-400 transition-all whitespace-nowrap w-full lg:w-auto"
          >
            <i className="fas fa-calendar-alt text-indigo-500"></i>
            <span className="flex-1 text-left">{activeDateRange.label}</span>
            <i className={`fas fa-chevron-down text-slate-400 text-[10px] transition-transform ${showDateDropdown ? 'rotate-180' : ''}`}></i>
          </button>
          {showDateDropdown && (
            <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-30 overflow-hidden animate-fadeIn flex">
              <div className="min-w-[180px]">
                {([
                  { key: 'TODAY' as const,      label: 'Today' },
                  { key: 'YESTERDAY' as const,  label: 'Yesterday' },
                  { key: 'LAST_7' as const,     label: 'Last 7 Days' },
                  { key: 'THIS_MONTH' as const, label: 'This Month' },
                  { key: 'LAST_MONTH' as const, label: 'Last Month' },
                  { key: 'ALL' as const,        label: 'All Time' },
                  { key: 'CUSTOM' as const,     label: 'Custom Range' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setDateFilter(opt.key); if (opt.key !== 'CUSTOM') setShowDateDropdown(false); setPage(1); }}
                    className={`w-full text-left px-5 py-3 text-xs font-bold transition-colors flex items-center justify-between gap-3 ${dateFilter === opt.key ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                    {opt.key === 'CUSTOM' && <i className={`fas fa-chevron-right text-[9px] ${dateFilter === 'CUSTOM' ? 'text-white' : 'text-slate-300'}`}></i>}
                  </button>
                ))}
              </div>
              {dateFilter === 'CUSTOM' && (
                <div className="px-4 py-4 space-y-3 border-l border-slate-100 bg-slate-50 min-w-[190px] flex flex-col justify-center">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">From</label>
                    <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">To</label>
                    <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                  </div>
                  <button onClick={() => setShowDateDropdown(false)} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition">Apply</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TYPE TABS */}
        <div className="flex gap-2 px-2 overflow-x-auto w-full lg:w-auto">
          {(['ALL', 'BANK', 'PRIVATE', 'LENT'] as const).map(f => (
            <button key={f} onClick={() => { setActiveFilter(f); setPage(1); }} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeFilter === f ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 border-2 border-slate-100'}`}>{f === 'PRIVATE' ? 'Loan Taken' : f === 'LENT' ? 'Loan Given' : f}</button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-4 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80 w-12">#</th>
              <th
                className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80 cursor-pointer hover:opacity-100 select-none"
                onClick={() => { const c = 'name'; setSortColumn(c); setSortDirection(sortColumn === c ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'); }}
              >
                <span>Party / Institution</span>
                {sortColumn === 'name' && <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 opacity-70`}></i>}
              </th>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80">Type</th>
              <th
                className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest opacity-80 cursor-pointer hover:opacity-100 select-none"
                onClick={() => { const c = 'date'; setSortColumn(c); setSortDirection(sortColumn === c ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'); }}
              >
                <span>Date</span>
                {sortColumn === 'date' && <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 opacity-70`}></i>}
              </th>
              <th
                className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80 cursor-pointer hover:opacity-100 select-none"
                onClick={() => { const c = 'principal'; setSortColumn(c); setSortDirection(sortColumn === c ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'); }}
              >
                <span>Principal</span>
                {sortColumn === 'principal' && <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 opacity-70`}></i>}
              </th>
              <th
                className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest opacity-80 cursor-pointer hover:opacity-100 select-none"
                onClick={() => { const c = 'rate'; setSortColumn(c); setSortDirection(sortColumn === c ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'); }}
              >
                <span>Rate</span>
                {sortColumn === 'rate' && <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 opacity-70`}></i>}
              </th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest opacity-80">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, idx) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-5 text-center text-xs font-black text-slate-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-6 py-5 text-sm font-bold text-slate-800 uppercase">{row.name}</td>
                <td className="px-6 py-5">
                   <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest ${row.isLent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {row.type === 'PRIVATE' ? 'Loan Taken' : row.type === 'LENT' ? 'Loan Given' : row.type}
                   </span>
                </td>
                <td className="px-6 py-5 text-xs font-bold text-slate-500">
                  {row.date && !isNaN(new Date(row.date).getTime()) ? new Date(row.date).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-5 text-right text-sm font-bold text-slate-900">{row.principal.toLocaleString()}</td>
                <td className="px-6 py-5 text-center text-sm font-bold text-slate-500">{row.rate}%</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end items-center gap-2">
                    {!row.isLent && (
                      <button
                        onClick={() => { setLiabilityAction({ item: row.raw, itemType: row.sourceType, type: 'PRINCIPAL' }); setLiabilityPayAmount(0); }}
                        className="text-rose-600 hover:text-rose-800 text-xs font-black uppercase tracking-wide bg-rose-50 px-3 py-1 rounded hover:bg-rose-100 transition"
                      >
                        Repay
                      </button>
                    )}
                    {row.isLent && (
                      <span className="text-emerald-600 text-xs font-black uppercase tracking-wide">Asset</span>
                    )}
                    {canStaffDeleteRecord(currentUser, row) && (
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={deletingId === row.id}
                      className="h-7 w-7 rounded-lg bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === row.id
                        ? <i className="fas fa-spinner fa-spin text-xs"></i>
                        : <i className="fas fa-trash-alt text-xs"></i>}
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {displayRows.length === 0 && (
                <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No records found for this category</td>
                </tr>
            )}
          </tbody>
          {displayRows.length > 0 && (() => {
            const totalPrincipal = displayRows.reduce((s, r) => s + r.principal, 0);
            const debtTotal  = displayRows.filter(r => !r.isLent).reduce((s, r) => s + r.principal, 0);
            const lentTotal  = displayRows.filter(r => r.isLent).reduce((s, r) => s + r.principal, 0);
            const sumRatePrincipal = displayRows.reduce((s, r) => s + (r.rate || 0) * r.principal, 0);
            const displayAvgPct = totalPrincipal > 0 ? sumRatePrincipal / totalPrincipal : 0;
            return (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={4} className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Total ({displayRows.length} records)
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-base font-black text-slate-900 font-display">{totalPrincipal.toLocaleString()}</div>
                    <div className="flex justify-end gap-3 mt-0.5 flex-wrap">
                      {displayAvgPct > 0 && <span className="text-[9px] font-black text-indigo-600">Avg {displayAvgPct.toFixed(1)}%</span>}
                      {debtTotal > 0 && <span className="text-[9px] font-black text-rose-500">Loan Taken: {debtTotal.toLocaleString()}</span>}
                      {lentTotal > 0 && <span className="text-[9px] font-black text-emerald-600">Loan Given: {lentTotal.toLocaleString()}</span>}
                    </div>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
        </div>
        {/* Pagination */}
        {displayRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, displayRows.length)} of {displayRows.length}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition"
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              {Array.from({ length: Math.ceil(displayRows.length / PAGE_SIZE) }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`h-8 w-8 rounded-lg text-xs font-black transition ${pg === page ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                >{pg}</button>
              ))}
              <button
                disabled={page === Math.ceil(displayRows.length / PAGE_SIZE)}
                onClick={() => setPage(p => p + 1)}
                className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-black disabled:opacity-30 hover:bg-slate-100 transition"
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-scaleUp">
              <h3 className="text-2xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-1">{showAddModal === 'GIVE' ? 'Loan Given' : 'Add Debt'}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Create new financial obligation</p>
              
              <form onSubmit={handleAddAction} className="space-y-4">
                 <div ref={partyDropdownRef} className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Party / Bank Name</label>
                    <input
                      required
                      autoComplete="off"
                      placeholder={(showAddModal === 'GIVE' || showAddModal === 'PRIVATE') ? 'Type or select from registry...' : 'Type or select...'}
                      className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500"
                      value={formData.providerName}
                      onChange={e => setFormData({...formData, providerName: e.target.value.toUpperCase()})}
                      onFocus={() => setShowPartyDropdown(true)}
                      onBlur={() => setTimeout(() => setShowPartyDropdown(false), 150)}
                    />
                    {showPartyDropdown && (showAddModal === 'GIVE' || showAddModal === 'PRIVATE' || showAddModal === 'BANK') && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border-2 border-slate-200 rounded-xl shadow-xl z-50">
                        {partyOptions
                          .filter(n => !formData.providerName || n.toUpperCase().includes(formData.providerName.toUpperCase()))
                          .slice(0, 50)
                          .map(name => (
                            <button
                              key={name}
                              type="button"
                              className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition first:rounded-t-xl last:rounded-b-xl"
                              onMouseDown={e => { e.preventDefault(); setFormData({...formData, providerName: name}); setShowPartyDropdown(false); }}
                            >
                              {name}
                            </button>
                          ))}
                        {partyOptions.filter(n => !formData.providerName || n.toUpperCase().includes(formData.providerName.toUpperCase())).length === 0 && (
                          <div className="px-4 py-3 text-xs text-slate-400 italic">No matches in registry. Type to add new.</div>
                        )}
                      </div>
                    )}
                 </div>
                 {showAddModal === 'BANK' && (
                    <div className="grid grid-cols-2 gap-4">
                       <input className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" placeholder="BRANCH" value={formData.bankBranch} onChange={e => setFormData({...formData, bankBranch: e.target.value})} />
                       <input className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" placeholder="ACC NO." value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
                    </div>
                 )}
                 {(showAddModal === 'PRIVATE' || showAddModal === 'GIVE') && (
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{showAddModal === 'PRIVATE' ? 'Receive Into' : 'Pay From'}</label>
                       <select className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={formData.sourceAccount || 'CASH'} onChange={e => setFormData({ ...formData, sourceAccount: e.target.value })}>
                          {walletOptions.map(w => (
                            <option key={w.id} value={w.id}>{w.label}</option>
                          ))}
                       </select>
                       <p className="text-[9px] text-slate-400 mt-1">Reflects in wallet balance</p>
                    </div>
                 )}
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Principal ()</label>
                       <input required type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.principal || ''} onChange={e => setFormData({...formData, principal: Number(e.target.value)})} />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rate (%)</label>
                       <input required type="number" step="0.1" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.interestRate || ''} onChange={e => setFormData({...formData, interestRate: Number(e.target.value)})} />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Start Date</label>
                        <input type="date" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={(() => { const d = new Date(formData.startDate); return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10); })()} onChange={e => { const val = e.target.value; const ts = val ? new Date(val).getTime() : Date.now(); if (!isNaN(ts)) setFormData({ ...formData, startDate: ts }); }} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tenure (Months)</label>
                        <input type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.tenureMonths || ''} onChange={e => setFormData({...formData, tenureMonths: Number(e.target.value)})} />
                    </div>
                 </div>
                 <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : 'Create'}</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* REPAYMENT MODAL */}
      {liabilityAction && (
         <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-scaleUp">
               <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-4">Repay Principal</h3>
               <form onSubmit={handlePayment} className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Repayment Amount</label>
                     <input autoFocus required type="number" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={liabilityPayAmount || ''} onChange={e => setLiabilityPayAmount(Number(e.target.value))} />
                  </div>
                  <div className="flex gap-3 pt-2">
                     <button type="button" onClick={() => setLiabilityAction(null)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                     <button type="submit" className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 shadow-lg">Confirm Payment</button>
                  </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};

export default LoanList;

