
import React, { useState, useEffect } from 'react';
import { Customer, ChitGroup, Invoice, StaffUser, AuditLog, Payment, Liability, Investment, BankAccount } from '../types';
import { settingsAPI, customerAPI, paymentAPI, invoiceAPI, liabilityAPI, chitAPI } from '../services/api';
import * as XLSX from 'xlsx';

interface SettingsProps {
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  savingCategories: string[];
  setSavingCategories: React.Dispatch<React.SetStateAction<string[]>>;
  staffUsers: StaffUser[];
  setStaffUsers: React.Dispatch<React.SetStateAction<StaffUser[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  chitGroups: ChitGroup[];
  setChitGroups: React.Dispatch<React.SetStateAction<ChitGroup[]>>;
  liabilities?: Liability[]; 
  setLiabilities?: React.Dispatch<React.SetStateAction<Liability[]>>;
  investments?: Investment[];
  setInvestments?: React.Dispatch<React.SetStateAction<Investment[]>>;
  openingBalances: { CASH: number; CUB: number; KVB: number; CAPITAL: number; };
  setOpeningBalances: React.Dispatch<React.SetStateAction<{ CASH: number; CUB: number; KVB: number; CAPITAL: number; }>>;
  auditLogs: AuditLog[];
  setAuditLogs?: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  otherBusinesses?: string[];
  setOtherBusinesses?: React.Dispatch<React.SetStateAction<string[]>>;
  incomeCategories?: string[];
  setIncomeCategories?: React.Dispatch<React.SetStateAction<string[]>>;
  bankAccounts?: BankAccount[];
  setBankAccounts?: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  currentUser?: StaffUser | null;
}

const Settings: React.FC<SettingsProps> = ({ 
  expenseCategories, setExpenseCategories, 
  savingCategories, setSavingCategories,
  staffUsers, setStaffUsers,
  customers, setCustomers,
  invoices, setInvoices,
  payments, setPayments,
  chitGroups, setChitGroups,
  liabilities = [], setLiabilities,
  investments = [], setInvestments,
  openingBalances, setOpeningBalances,
  auditLogs, setAuditLogs,
  otherBusinesses = [], setOtherBusinesses,
  incomeCategories = [], setIncomeCategories,
  bankAccounts = [], setBankAccounts,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'FINANCE' | 'ACCESS' | 'DATA' | 'AUDIT'>('FINANCE');
  
  // Clear All Data State
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataConfirmation, setClearDataConfirmation] = useState('');
  const [isClearingData, setIsClearingData] = useState(false);
  
  // Audit Filter State
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'CREATE' | 'EDIT' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT'>('ALL');
  
  // Temporary Banking Configuration State (shows current actual values for editing)
  const [tempBankingConfig, setTempBankingConfig] = useState({
    cash: openingBalances.CASH,
    capital: openingBalances.CAPITAL,
    banks: bankAccounts
  });
  
  // Sync with actual balances when they change
  useEffect(() => {
    setTempBankingConfig({
      cash: openingBalances.CASH,
      capital: openingBalances.CAPITAL,
      banks: bankAccounts
    });
  }, [openingBalances.CASH, openingBalances.CAPITAL, bankAccounts]);
  
  // Auto-save settings to backend when categories change
  useEffect(() => {
    const saveSettings = async () => {
      try {
        await settingsAPI.update({
          expenseCategories,
          savingCategories,
          otherBusinesses,
          incomeCategories,
          bankAccounts
        });
      } catch (error) {
        console.error('Failed to auto-save settings:', error);
      }
    };
    
    // Debounce to avoid too many API calls
    const timeoutId = setTimeout(saveSettings, 500);
    return () => clearTimeout(timeoutId);
  }, [expenseCategories, savingCategories, otherBusinesses, incomeCategories, bankAccounts]);
  
  // STAFF STATE
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const initialStaffForm: Partial<StaffUser> = { 
    name: '', username: '', password: '', role: 'STAFF', status: 'ACTIVE',
    permissions: { canEdit: false, canDelete: false, canManageUsers: false }
  };
  const [staffFormData, setStaffFormData] = useState<Partial<StaffUser>>(initialStaffForm);

  // IMPORT STATE
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState<'CUSTOMERS' | 'PAYMENTS' | 'CHIT_GROUPS' | 'LIABILITIES' | 'INVOICES' | null>(null);
  const [importText, setImportText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{status: 'idle' | 'processing' | 'success' | 'error' | 'manual', message: string, count?: number, data?: any[], headers?: string[]}>({status: 'idle', message: ''});
  
  // --- HELPER LOGIC ---

  const openStaffEdit = (user: StaffUser) => {
    setStaffFormData({ ...user, password: '' }); // Clear password for security
    setIsEditingStaff(true);
    setStaffFormError('');
    setShowStaffForm(true);
  }

  const openStaffCreate = () => {
    setStaffFormData(initialStaffForm);
    setIsEditingStaff(false);
    setStaffFormError('');
    setShowStaffForm(true);
  }

  const [staffFormLoading, setStaffFormLoading] = useState(false);
  const [staffFormError, setStaffFormError] = useState('');

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffFormLoading(true);
    setStaffFormError('');

    try {
      if (isEditingStaff && staffFormData.id) {
        // Build update payload (password only if provided)
        const payload: any = {
          name: staffFormData.name,
          username: staffFormData.username,
          role: staffFormData.role,
          status: staffFormData.status || 'ACTIVE',
          permissions: staffFormData.permissions,
        };
        if (staffFormData.password && staffFormData.password.length > 0) {
          payload.password = staffFormData.password;
        }

        await settingsAPI.updateUser(staffFormData.id, payload);

        setStaffUsers(prev => prev.map(u => {
          if (u.id === staffFormData.id) {
            return {
              ...u,
              name: staffFormData.name || u.name,
              username: staffFormData.username || u.username,
              role: staffFormData.role || u.role,
              status: staffFormData.status || u.status,
              permissions: staffFormData.permissions || u.permissions,
            };
          }
          return u;
        }));
      } else {
        // Create new user — send password to backend to be hashed
        const payload = {
          name: staffFormData.name,
          username: staffFormData.username,
          password: staffFormData.password,
          role: staffFormData.role || 'STAFF',
          permissions: staffFormData.permissions || { canEdit: false, canDelete: false, canManageUsers: false },
        };

        const result = await settingsAPI.createUser(payload);

        const newUser: StaffUser = {
          ...staffFormData as StaffUser,
          id: result.id,
          email: `${staffFormData.username}@srichendur.com`,
          permissions: staffFormData.permissions || { canEdit: false, canDelete: false, canManageUsers: false },
        };
        setStaffUsers([...staffUsers, newUser]);
      }

      setShowStaffForm(false);
      setStaffFormData(initialStaffForm);
    } catch (err: any) {
      setStaffFormError(err.message || 'Failed to save user');
    } finally {
      setStaffFormLoading(false);
    }
  };

  const handleAddBank = () => {
    const newId = `BANK_${Date.now()}`;
    const newBank = { id: newId, name: 'NEW BANK', openingBalance: 0, status: 'ACTIVE' as const };
    
    // Add to actual bank accounts
    if (setBankAccounts) {
      setBankAccounts(prev => [...prev, newBank]);
    }
    
    // Also add to temp config for immediate display
    setTempBankingConfig(prev => ({
      ...prev,
      banks: [...prev.banks, newBank]
    }));
  };

  const updateBank = (id: string, field: keyof BankAccount, value: any) => {
    if (setBankAccounts) {
      setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
    }
  };
  
  // Update temporary bank values (draft mode)
  const updateTempBank = (id: string, field: keyof BankAccount, value: any) => {
    setTempBankingConfig(prev => ({
      ...prev,
      banks: prev.banks.map(b => b.id === id ? { ...b, [field]: value } : b)
    }));
  };
  
  // Save banking configuration (REPLACE actual values with temp values)
  const handleSaveBankingConfig = () => {
    // Replace opening balances with temp values
    setOpeningBalances({
      ...openingBalances,
      CASH: tempBankingConfig.cash,
      CAPITAL: tempBankingConfig.capital
    });
    
    // Replace bank accounts with temp values
    if (setBankAccounts) {
      setBankAccounts(tempBankingConfig.banks);
    }
  };

  // --- FULL EXPORT / IMPORT LOGIC ---

  const handleFullExport = () => {
    const fullData = {
      meta: {
        version: "2.0",
        timestamp: Date.now(),
        exportedBy: "ADMIN"
      },
      data: {
        customers, invoices, payments, liabilities, chitGroups, investments, staffUsers,
        expenseCategories, savingCategories, otherBusinesses, incomeCategories, openingBalances, auditLogs, bankAccounts
      }
    };

    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SCT_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFullImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.data) throw new Error("Invalid Backup Format");

        if (window.confirm("WARNING: This will overwrite ALL current data with the backup file. This action cannot be undone. Proceed?")) {
           const d = json.data;
           if (d.customers) setCustomers(d.customers);
           if (d.invoices) setInvoices(d.invoices);
           if (d.payments) setPayments(d.payments);
           if (d.liabilities && setLiabilities) setLiabilities(d.liabilities);
           if (d.chitGroups) setChitGroups(d.chitGroups);
           if (d.investments && setInvestments) setInvestments(d.investments);
           if (d.staffUsers) setStaffUsers(d.staffUsers);
           if (d.expenseCategories) setExpenseCategories(d.expenseCategories);
           if (d.savingCategories) setSavingCategories(d.savingCategories);
           if (d.otherBusinesses && setOtherBusinesses) setOtherBusinesses(d.otherBusinesses);
           if (d.incomeCategories && setIncomeCategories) setIncomeCategories(d.incomeCategories);
           if (d.openingBalances) setOpeningBalances(d.openingBalances);
           if (d.auditLogs && setAuditLogs) setAuditLogs(d.auditLogs);
           if (d.bankAccounts && setBankAccounts) setBankAccounts(d.bankAccounts);
           
           alert("System successfully restored from backup.");
        }
      } catch (err) {
        alert("Failed to parse backup file. Please ensure it is a valid JSON export.");
        console.error(err);
      }
      // Reset input by ID to avoid Ref issues
      const input = document.getElementById('restoreInput') as HTMLInputElement;
      if (input) input.value = '';
    };
    reader.readAsText(file);
  };

  // --- EXCEL UPLOAD & AUTO-DETECTION LOGIC ---
  
  const parseExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first worksheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON with header row as keys
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1, // Use first row as headers
            defval: '' // Default value for empty cells
          });
          
          if (jsonData.length < 2) {
            resolve([]);
            return;
          }
          
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1) as any[][];
          
          const parsedData = rows.map(row => {
            const obj: any = {};
            headers.forEach((header, i) => {
              const value = row[i] !== undefined ? row[i] : '';
              
              // Type conversion
              if (value === '' || value === null || value === undefined) {
                obj[header] = null;
              } else if (typeof value === 'boolean') {
                obj[header] = value;
              } else if (typeof value === 'number') {
                obj[header] = value;
              } else if (typeof value === 'string') {
                const trimmed = value.toString().trim();
                if (trimmed.toLowerCase() === 'true') {
                  obj[header] = true;
                } else if (trimmed.toLowerCase() === 'false') {
                  obj[header] = false;
                } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
                  obj[header] = Number(trimmed);
                } else {
                  obj[header] = trimmed;
                }
              } else {
                obj[header] = value;
              }
            });
            return obj;
          }).filter(obj => Object.values(obj).some(val => val !== null && val !== '')); // Remove empty rows
          
          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const detectEntityType = (headers: string[]): string | null => {
    const headerSet = new Set(headers.map(h => h.toLowerCase()));
    
    console.log('🔍 Excel Headers Detected:', headers);
    console.log('🔍 Lowercase Headers:', Array.from(headerSet));
    
    // Customer detection - more flexible
    if (headerSet.has('name') || headerSet.has('customer') || headerSet.has('customername')) {
      console.log('✅ Detected: CUSTOMERS');
      return 'CUSTOMERS';
    }
    
    // Payment detection
    if ((headerSet.has('type') || headerSet.has('paymenttype')) && 
        (headerSet.has('amount') || headerSet.has('sourcename'))) {
      console.log('✅ Detected: PAYMENTS');
      return 'PAYMENTS';
    }
    
    // Invoice detection
    if ((headerSet.has('customerid') || headerSet.has('customer')) && 
        (headerSet.has('amount') && (headerSet.has('balance') || headerSet.has('status')))) {
      console.log('✅ Detected: INVOICES');
      return 'INVOICES';
    }
    
    // Liability detection
    if ((headerSet.has('providername') || headerSet.has('provider') || headerSet.has('lender')) && 
        (headerSet.has('principal') || headerSet.has('amount'))) {
      console.log('✅ Detected: LIABILITIES');
      return 'LIABILITIES';
    }
    
    // Chit Group detection
    if ((headerSet.has('groupname') || headerSet.has('chitname') || headerSet.has('group')) && 
        (headerSet.has('totalvalue') || headerSet.has('value') || headerSet.has('amount'))) {
      console.log('✅ Detected: CHIT_GROUPS');
      return 'CHIT_GROUPS';
    }
    
    console.log('❌ No entity type detected for headers:', headers);
    return null;
  };

  const handleExcelUpload = async (file: File) => {
    setUploadProgress({status: 'processing', message: 'Reading Excel file...'});
    
    try {
      const data = await parseExcel(file);
      
      if (data.length === 0) {
        setUploadProgress({status: 'error', message: 'Excel file is empty or invalid format'});
        return;
      }
      
      const headers = Object.keys(data[0]);
      const entityType = detectEntityType(headers);
      
      if (!entityType) {
        const headersList = headers.join(', ');
        setUploadProgress({
          status: 'manual', 
          message: `Auto-detection failed. Found headers: ${headersList}`,
          data: data,
          headers: headers
        });
        return;
      }
      
      setUploadProgress({status: 'processing', message: `Detected: ${entityType}. Importing ${data.length} records...`});
      
      // Map and import data
      await new Promise(resolve => setTimeout(resolve, 500)); // UI feedback delay
      
      await importDataByType(entityType, data);
    } catch (parseError) {
      console.error('Excel parsing error:', parseError);
      setUploadProgress({status: 'error', message: 'Failed to parse Excel file. Please check the format.'});
    }
  };

  const handleManualImport = async (selectedType: string) => {
    if (!uploadProgress.data) return;
    
    setUploadProgress({status: 'processing', message: `Importing ${uploadProgress.data.length} records as ${selectedType}...`});
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      await importDataByType(selectedType, uploadProgress.data);
    } catch (error) {
      console.error('Manual import error:', error);
      setUploadProgress({status: 'error', message: `Failed to import: ${error.message}`});
    }
  };

  const downloadTemplate = (type: string) => {
    const templates: Record<string, { headers: string[]; sample: any[] }> = {
      CUSTOMERS: {
        headers: ['name','phone','isRoyalty','royaltyAmount','isInterest','interestPrincipal','interestRate','isChit','isLender','creditPrincipal','openingBalance','status'],
        sample: [['ARUN-B40','9043699695','TRUE',5000,'TRUE',750000,2.5,'FALSE','FALSE',0,0,'ACTIVE']]
      },
      PAYMENTS: {
        headers: ['sourceName','amount','type','voucherType','mode','category','date','notes'],
        sample: [['ARUN-B40',18750,'IN','RECEIPT','CASH','ROYALTY_COLLECTION','2026-02-24','Feb royalty']]
      },
      LIABILITIES: {
        headers: ['providerName','principal','interestRate','startDate','type','notes'],
        sample: [['BOYS FOUNDATION',800000,2,'2025-04-01','LOAN','Private loan']]
      },
    };
    const t = templates[type];
    if (!t) return;
    const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `template_${type.toLowerCase()}.xlsx`);
  };

  const importDataByType = async (entityType: string, data: any[]) => {
    if (entityType === 'CUSTOMERS') {
      const saved: Customer[] = [];
      let failed = 0;
      for (const row of data) {
        try {
          const payload = {
            name: row.name || row.customerName || '',
            phone: String(row.phone || row.mobile || ''),
            address: row.address || '',
            status: (row.status || 'ACTIVE').toUpperCase(),
            isRoyalty: row.isRoyalty === true || row.isRoyalty === 'TRUE' || row.isRoyalty === 'true' || false,
            royaltyAmount: Number(row.royaltyAmount || 0),
            isInterest: row.isInterest === true || row.isInterest === 'TRUE' || row.isInterest === 'true' || false,
            interestPrincipal: Number(row.interestPrincipal || 0),
            interestRate: Number(row.interestRate || 0),
            isChit: row.isChit === true || row.isChit === 'TRUE' || row.isChit === 'true' || false,
            isGeneral: row.isGeneral === true || row.isGeneral === 'TRUE' || row.isGeneral === 'true' || false,
            isLender: row.isLender === true || row.isLender === 'TRUE' || row.isLender === 'true' || false,
            creditPrincipal: Number(row.creditPrincipal || 0),
            openingBalance: Number(row.openingBalance || 0),
            createdAt: Date.now()
          };
          const created = await customerAPI.create(payload);
          saved.push(created);
        } catch { failed++; }
      }
      setCustomers(prev => [...prev, ...saved]);
      setUploadProgress({status: 'success', message: `Customers saved to database! ${failed > 0 ? `(${failed} failed)` : ''}`, count: saved.length});
    }

    else if (entityType === 'PAYMENTS') {
      const saved: Payment[] = [];
      let failed = 0;
      for (const row of data) {
        try {
          const dateVal = row.date ? (isNaN(Number(row.date)) ? new Date(row.date).getTime() : Number(row.date)) : Date.now();
          const payload = {
            type: (row.type || 'IN').toUpperCase(),
            voucherType: (row.voucherType || 'RECEIPT').toUpperCase(),
            sourceId: row.sourceId || '',
            sourceName: row.sourceName || '',
            amount: Number(row.amount || 0),
            mode: (row.mode || 'CASH').toUpperCase(),
            date: dateVal,
            category: row.category || 'GENERAL',
            notes: row.notes || '',
            businessUnit: row.businessUnit || null,
            createdAt: Date.now()
          };
          const created = await paymentAPI.create(payload);
          saved.push(created);
        } catch { failed++; }
      }
      setPayments(prev => [...prev, ...saved]);
      setUploadProgress({status: 'success', message: `Payments saved to database! ${failed > 0 ? `(${failed} failed)` : ''}`, count: saved.length});
    }

    else if (entityType === 'INVOICES') {
      const saved: Invoice[] = [];
      let failed = 0;
      for (const row of data) {
        try {
          const payload = {
            customerId: row.customerId || '',
            customerName: row.customerName || '',
            type: (row.type || row.invoiceType || 'ROYALTY').toUpperCase(),
            amount: Number(row.amount || 0),
            balance: Number(row.balance !== undefined ? row.balance : row.amount || 0),
            dueDate: row.dueDate || Date.now(),
            status: (row.status || 'UNPAID').toUpperCase(),
            direction: (row.direction || 'IN').toUpperCase(),
            isVoid: false,
            createdAt: Date.now()
          };
          const created = await invoiceAPI.create(payload);
          saved.push(created);
        } catch { failed++; }
      }
      setInvoices(prev => [...prev, ...saved]);
      setUploadProgress({status: 'success', message: `Invoices saved to database! ${failed > 0 ? `(${failed} failed)` : ''}`, count: saved.length});
    }

    else if (entityType === 'LIABILITIES') {
      const saved: Liability[] = [];
      let failed = 0;
      for (const row of data) {
        try {
          const payload = {
            providerName: row.providerName || row.provider || row.lender || '',
            principal: Number(row.principal || row.loanAmount || 0),
            interestRate: Number(row.interestRate || row.rate || 0),
            startDate: row.startDate ? new Date(row.startDate).getTime() : Date.now(),
            status: (row.status || 'ACTIVE').toUpperCase(),
            type: (row.type || 'LOAN').toUpperCase(),
            notes: row.notes || '',
            createdAt: Date.now()
          };
          const created = await liabilityAPI.create(payload);
          saved.push(created);
        } catch { failed++; }
      }
      if (setLiabilities) setLiabilities(prev => [...prev, ...saved]);
      setUploadProgress({status: 'success', message: `Liabilities saved to database! ${failed > 0 ? `(${failed} failed)` : ''}`, count: saved.length});
    }

    else if (entityType === 'CHIT_GROUPS') {
      const saved: ChitGroup[] = [];
      let failed = 0;
      for (const row of data) {
        try {
          const payload = {
            name: row.name || row.groupName || row.chitName || '',
            totalValue: Number(row.totalValue || row.chitValue || 0),
            monthlyInstallment: Number(row.monthlyInstallment || row.installment || 0),
            durationMonths: Number(row.durationMonths || row.duration || 12),
            commissionPercentage: Number(row.commissionPercentage || 5),
            startDate: row.startDate ? new Date(row.startDate).getTime() : Date.now(),
            currentMonth: Number(row.currentMonth || 1),
            status: (row.status || 'ACTIVE').toUpperCase(),
            members: [],
            auctions: [],
            createdAt: Date.now()
          };
          const created = await chitAPI.create(payload);
          saved.push(created);
        } catch { failed++; }
      }
      setChitGroups(prev => [...prev, ...saved]);
      setUploadProgress({status: 'success', message: `Chit Groups saved to database! ${failed > 0 ? `(${failed} failed)` : ''}`, count: saved.length});
    }
  };

  const handleClearAllData = async () => {
    if (clearDataConfirmation !== 'DELETE ALL DATA') {
      alert('Please type exactly: DELETE ALL DATA');
      return;
    }

    if (!window.confirm('⚠️ FINAL WARNING: This will permanently delete all customers, invoices, payments, chits, loans, and investments. This action CANNOT be undone. Are you absolutely sure?')) {
      return;
    }

    setIsClearingData(true);

    try {
      const result = await settingsAPI.clearAllData(clearDataConfirmation);
      
      // Clear local state
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setChitGroups([]);
      if (setLiabilities) setLiabilities([]);
      if (setInvestments) setInvestments([]);
      
      alert(`✅ Success! All data cleared. ${result.deletedCount} records deleted. You can now start with fresh live data.`);
      setShowClearDataModal(false);
      setClearDataConfirmation('');
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Failed to clear data'}`);
    } finally {
      setIsClearingData(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-black text-slate-900 uppercase italic tracking-tighter">System Config</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Advanced Administration</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {['FINANCE', 'ACCESS', 'DATA', 'AUDIT'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`whitespace-nowrap py-4 px-1 border-b-4 text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeTab === tab
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </nav>
      </div>

      {/* 2. FINANCE CONFIG (OPENING BALANCES & BANKS) */}
      {activeTab === 'FINANCE' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           
           {/* BANK ACCOUNTS SECTION */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-display font-black text-slate-900 uppercase italic tracking-tighter">Banking Configuration</h3>
                 <button onClick={handleAddBank} className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg uppercase tracking-widest hover:bg-indigo-100">+ Add</button>
              </div>
              <div className="space-y-3">
                 <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex justify-between items-center mb-1">
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cash Drawer</label>
                       <span className="text-[9px] font-black text-slate-300 uppercase">Fixed</span>
                    </div>
                    <input type="number" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-sm text-slate-900 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={tempBankingConfig.cash} onChange={e => setTempBankingConfig({...tempBankingConfig, cash: Number(e.target.value)})} />
                 </div>

                 {tempBankingConfig.banks.map((bank) => (
                    <div key={bank.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm relative group">
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Bank Name</label>
                             <input type="text" className="w-full bg-slate-50 border-none rounded-lg px-2 py-1.5 font-black uppercase text-xs outline-none focus:ring-1 focus:ring-indigo-100" value={bank.name} onChange={e => updateTempBank(bank.id, 'name', e.target.value.toUpperCase())} />
                          </div>
                          <div>
                             <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Opening Balance</label>
                             <input type="number" className="w-full bg-slate-50 border-none rounded-lg px-2 py-1.5 font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={bank.openingBalance} onChange={e => updateTempBank(bank.id, 'openingBalance', Number(e.target.value))} />
                          </div>
                       </div>
                       <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <i className="fas fa-university text-slate-200"></i>
                       </div>
                    </div>
                 ))}

                 <div className="pt-3 border-t border-slate-100">
                    <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Owner's Capital</label>
                    <input type="number" className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 font-bold text-sm text-emerald-700 outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={tempBankingConfig.capital} onChange={e => setTempBankingConfig({...tempBankingConfig, capital: Number(e.target.value)})} />
                 </div>
                 
                 {/* Okay Button to Save Banking Configuration */}
                 <div className="pt-3">
                    <button onClick={handleSaveBankingConfig} className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-sm">
                       <i className="fas fa-check mr-2"></i>Okay
                    </button>
                 </div>
              </div>
           </div>

           {/* EXPENSE CATEGORIES */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-fit">
              <h3 className="text-sm font-display font-black text-slate-900 uppercase italic tracking-tighter mb-3">Expense Categories</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                 {expenseCategories.filter(cat => cat && cat.trim()).map(cat => (
                    <span key={cat} className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {cat}
                       <button onClick={() => setExpenseCategories(prev => prev.filter(c => c !== cat))} className="hover:text-rose-500"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
              </div>
              <div className="flex gap-2">
                 <input 
                   id="newCat" 
                   type="text" 
                   placeholder="NEW CATEGORY" 
                   className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-black uppercase outline-none focus:border-indigo-500"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       const input = e.currentTarget;
                       const value = input.value.trim().toUpperCase();
                       if(value && !expenseCategories.includes(value)) { 
                         setExpenseCategories([...expenseCategories, value]); 
                         input.value = ''; 
                       } else if (expenseCategories.includes(value)) {
                         alert('This expense category already exists!');
                       }
                     }
                   }}
                 />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newCat') as HTMLInputElement;
                      const value = input.value.trim().toUpperCase();
                      if(value) {
                        if(!expenseCategories.includes(value)) {
                          setExpenseCategories([...expenseCategories, value]); 
                          input.value = '';
                        } else {
                          alert('This expense category already exists!');
                        }
                      }
                   }}
                   className="bg-indigo-600 text-white px-4 rounded-lg font-black text-xs uppercase hover:bg-indigo-700"
                 >
                    Add
                 </button>
              </div>
           </div>

           {/* BUSINESS UNITS (Formerly Income Categories) */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-fit">
              <h3 className="text-sm font-display font-black text-slate-900 uppercase italic tracking-tighter mb-1">Business Units</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Other operational divisions</p>
              
              <div className="flex flex-wrap gap-2 mb-3">
                 {(otherBusinesses || []).filter(biz => biz && biz.trim()).map(biz => (
                    <span key={biz} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {biz}
                       <button onClick={() => setOtherBusinesses?.(prev => prev.filter(b => b !== biz))} className="hover:text-blue-900"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
                 {(otherBusinesses || []).filter(biz => biz && biz.trim()).length === 0 && <span className="text-xs text-slate-400 italic">No business units added.</span>}
              </div>
              <div className="flex gap-2">
                 <input 
                   id="newBiz" 
                   type="text" 
                   placeholder="NEW UNIT (e.g. TRANSPORT)" 
                   className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-black uppercase outline-none focus:border-blue-500"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       const input = e.currentTarget;
                       const value = input.value.trim().toUpperCase();
                       if(value && setOtherBusinesses && !(otherBusinesses || []).includes(value)) { 
                         setOtherBusinesses(prev => [...prev, value]); 
                         input.value = ''; 
                       } else if ((otherBusinesses || []).includes(value)) {
                         alert('This business unit already exists!');
                       }
                     }
                   }}
                 />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newBiz') as HTMLInputElement;
                      const value = input.value.trim().toUpperCase();
                      if(value && setOtherBusinesses) {
                        if(!(otherBusinesses || []).includes(value)) {
                          setOtherBusinesses(prev => [...prev, value]); 
                          input.value = '';
                        } else {
                          alert('This business unit already exists!');
                        }
                      }
                   }}
                   className="bg-blue-600 text-white px-4 rounded-lg font-black text-xs uppercase hover:bg-blue-700"
                 >
                    Add
                 </button>
              </div>
           </div>

           {/* DIRECT INCOME CATEGORIES (New) */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-fit">
              <h3 className="text-sm font-display font-black text-slate-900 uppercase italic tracking-tighter mb-1">Direct Income Categories</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Salary, Commissions, Incentives</p>
              
              <div className="flex flex-wrap gap-2 mb-3">
                 {(incomeCategories || []).filter(inc => inc && inc.trim()).map(inc => (
                    <span key={inc} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {inc}
                       <button onClick={() => setIncomeCategories?.(prev => prev.filter(i => i !== inc))} className="hover:text-emerald-900"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
                 {(incomeCategories || []).filter(inc => inc && inc.trim()).length === 0 && <span className="text-xs text-slate-400 italic">No income categories defined.</span>}
              </div>
              <div className="flex gap-2">
                 <input 
                   id="newInc" 
                   type="text" 
                   placeholder="NEW TYPE (e.g. BONUS)" 
                   className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-black uppercase outline-none focus:border-emerald-500"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       const input = e.currentTarget;
                       const value = input.value.trim().toUpperCase();
                       if(value && setIncomeCategories && !(incomeCategories || []).includes(value)) { 
                         setIncomeCategories(prev => [...prev, value]); 
                         input.value = ''; 
                       } else if ((incomeCategories || []).includes(value)) {
                         alert('This income category already exists!');
                       }
                     }
                   }}
                 />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newInc') as HTMLInputElement;
                      const value = input.value.trim().toUpperCase();
                      if(value && setIncomeCategories) {
                        if(!(incomeCategories || []).includes(value)) {
                          setIncomeCategories(prev => [...prev, value]); 
                          input.value = '';
                        } else {
                          alert('This income category already exists!');
                        }
                      }
                   }}
                   className="bg-emerald-600 text-white px-4 rounded-lg font-black text-xs uppercase hover:bg-emerald-700"
                 >
                    Add
                 </button>
              </div>
           </div>

        </div>
      )}

      {/* 3. ACCESS (STAFF MANAGEMENT) */}
      {activeTab === 'ACCESS' && (
         <div className="space-y-5">
            <div className="flex justify-between items-end">
               <div>
                  <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter">Staff Access Control</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage Login Credentials & Privileges</p>
               </div>
               {currentUser?.permissions.canManageUsers && (
                  <button onClick={openStaffCreate} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-md">
                     + Add User
                  </button>
               )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
               {staffUsers.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No users found</div>
               ) : (
                  <ul className="divide-y divide-slate-100">
                     {staffUsers.map(user => {
                        const isActive = user.status !== 'INACTIVE';
                        const perms = [];
                        if (user.permissions?.canEdit) perms.push('Edit');
                        if (user.permissions?.canDelete) perms.push('Delete');
                        if (user.permissions?.canManageUsers) perms.push('Admin');
                        return (
                           <li key={user.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${!isActive ? 'opacity-50' : ''}`}>
                              {/* Avatar */}
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${user.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                 {user.name.charAt(0).toUpperCase()}
                              </div>

                              {/* Name + username */}
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-slate-800 truncate">{user.name}</span>
                                    <span className="text-[10px] font-bold text-slate-400">@{user.username}</span>
                                 </div>
                                 {perms.length > 0 && (
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                       {perms.map(p => (
                                          <span key={p} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{p}</span>
                                       ))}
                                    </div>
                                 )}
                              </div>

                              {/* Role */}
                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${user.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                 {user.role}
                              </span>

                              {/* Status badge */}
                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                 {isActive ? 'Active' : 'Inactive'}
                              </span>

                              {/* Actions */}
                              {currentUser?.permissions.canManageUsers && (
                                 <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                       onClick={() => openStaffEdit(user)}
                                       className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                                    >
                                       Edit
                                    </button>
                                    <button
                                       onClick={async () => {
                                          try {
                                             const newStatus = isActive ? 'INACTIVE' : 'ACTIVE';
                                             await settingsAPI.updateUser(user.id, { status: newStatus });
                                             setStaffUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
                                          } catch (err: any) {
                                             alert(err.message || 'Failed to update status');
                                          }
                                       }}
                                       className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors ${isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                    >
                                       {isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                    {user.id !== currentUser?.id && (
                                       <button
                                          onClick={async () => {
                                             if (!window.confirm(`Delete "${user.name}" (@${user.username})? This cannot be undone.`)) return;
                                             try {
                                                await settingsAPI.deleteUser(user.id);
                                                setStaffUsers(prev => prev.filter(u => u.id !== user.id));
                                             } catch (err: any) {
                                                alert(err.message || 'Failed to delete user');
                                             }
                                          }}
                                          className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                                       >
                                          Delete
                                       </button>
                                    )}
                                 </div>
                              )}
                           </li>
                        );
                     })}
                  </ul>
               )}
            </div>
         </div>
      )}

      {/* 4. DATA (IMPORT/EXPORT) */}
      {/* ... (Data tab remains mostly unchanged, exporting incomeCategories is handled by App.tsx logic passed down) ... */}
      {activeTab === 'DATA' && (
        <div className="space-y-8">
          
          {/* CLEAR ALL DATA - DANGER ZONE */}
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 p-8 rounded-[2rem] border-2 border-rose-300 shadow-lg">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-xl">
                <i className="fas fa-exclamation-triangle text-2xl"></i>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-black text-rose-900 uppercase italic tracking-tighter mb-2">🚨 Danger Zone: Clear All Data</h3>
                <p className="text-sm text-rose-800 mb-4 leading-relaxed font-semibold">
                  This will <strong className="text-rose-900">permanently delete</strong> all customers, invoices, payments, chit groups, loans, and investments from the database. 
                  This action is <strong className="text-rose-900">irreversible</strong> and should only be used when transitioning from test data to live production data.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/90 rounded-xl p-4 border border-rose-200">
                    <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-2">⛔ Will Be Deleted:</h4>
                    <ul className="text-xs text-rose-900 space-y-1.5 font-semibold">
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Customers ({customers.length})</li>
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Invoices ({invoices.length})</li>
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Payments ({payments.length})</li>
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Chit Groups ({chitGroups.length})</li>
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Loans ({liabilities?.length || 0})</li>
                      <li className="flex items-center gap-2"><i className="fas fa-times-circle text-rose-600"></i> All Investments ({investments?.length || 0})</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-300">
                    <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">✅ Will Be Preserved:</h4>
                    <ul className="text-xs text-emerald-900 space-y-1.5 font-semibold">
                      <li className="flex items-center gap-2"><i className="fas fa-check-circle text-emerald-600"></i> User accounts & passwords</li>
                      <li className="flex items-center gap-2"><i className="fas fa-check-circle text-emerald-600"></i> System settings & config</li>
                      <li className="flex items-center gap-2"><i className="fas fa-check-circle text-emerald-600"></i> Bank account settings</li>
                      <li className="flex items-center gap-2"><i className="fas fa-check-circle text-emerald-600"></i> Audit logs (security)</li>
                    </ul>
                  </div>
                </div>
                {currentUser?.role === 'OWNER' ? (
                  <button
                    onClick={() => setShowClearDataModal(true)}
                    className="px-6 py-3.5 bg-rose-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-rose-700 shadow-lg transition-all hover:shadow-xl hover:scale-105"
                  >
                    <i className="fas fa-trash-alt mr-2"></i>
                    Clear All Data
                  </button>
                ) : (
                  <p className="text-xs text-rose-700 font-bold italic bg-rose-200 px-4 py-2 rounded-lg inline-block">
                    🔒 Only OWNER accounts can perform this operation
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* FULL BACKUP SECTION */}
           <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><i className="fas fa-database text-9xl"></i></div>
              <h3 className="text-xl font-display font-black uppercase italic tracking-tighter mb-2">Total System Backup</h3>
              <p className="text-xs font-bold text-slate-400 mb-8 max-w-xs">Export the entire database (Customers, Ledger, Settings, Chits) into a single JSON file for safekeeping or migration.</p>
              
              <div className="flex flex-col gap-4 relative z-10">
                 <button onClick={handleFullExport} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                    <i className="fas fa-download"></i> Download Full Backup
                 </button>
                 
                 <div className="relative">
                    <input 
                       type="file" 
                       accept=".json"
                       onChange={handleFullImport}
                       className="hidden"
                       id="restoreInput"
                    />
                    <label htmlFor="restoreInput" className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-colors">
                       <i className="fas fa-upload"></i> Restore from File
                    </label>
                 </div>
              </div>
           </div>

           {/* EXCEL DRAG & DROP UPLOAD */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-6">Excel Data Upload</h3>
              <p className="text-xs text-slate-500 mb-4">Drop an Excel file below. The app will automatically detect the data type and import it.</p>
              
              {/* TEMPLATE DOWNLOADS */}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 mb-6">
                <p className="text-xs font-bold text-indigo-700 mb-3"><i className="fas fa-download mr-1"></i> Step 1 — Download the correct template for your data:</p>
                <div className="flex flex-wrap gap-2">
                  {(['CUSTOMERS', 'PAYMENTS', 'LIABILITIES'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => downloadTemplate(type)}
                      className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition shadow-sm"
                    >
                      <i className="fas fa-file-excel mr-1.5"></i>
                      {type.charAt(0) + type.slice(1).toLowerCase()} Template
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-indigo-500 mt-2">Fill in the template, then drop it below (Step 2) to import.</p>
              </div>
              
              <div 
                 className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                    isDragging ? 'border-indigo-500 bg-indigo-50' : 
                    uploadProgress.status === 'processing' ? 'border-blue-400 bg-blue-50' :
                    uploadProgress.status === 'success' ? 'border-emerald-500 bg-emerald-50' :
                    uploadProgress.status === 'error' ? 'border-rose-500 bg-rose-50' :
                    'border-slate-200 hover:border-slate-300 bg-slate-50'
                 }`}
                 onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                 onDragLeave={() => setIsDragging(false)}
                 onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                       handleExcelUpload(file);
                    } else {
                       setUploadProgress({status: 'error', message: 'Please upload an Excel file (.xlsx or .xls)'});
                    }
                 }}
              >
                 <input 
                    type="file" 
                    accept=".xlsx,.xls" 
                    className="hidden" 
                    id="excel-upload"
                    onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) handleExcelUpload(file);
                    }}
                 />
                 
                 {uploadProgress.status === 'idle' && (
                    <label htmlFor="excel-upload" className="cursor-pointer">
                       <div className="text-4xl mb-4 text-slate-300">
                          <i className="fas fa-file-excel"></i>
                       </div>
                       <div className="text-sm font-bold text-slate-700 mb-2">Drop Excel file here or click to browse</div>
                       <div className="text-xs text-slate-400">Auto-detects: Customers, Payments, Invoices, Liabilities, Chit Groups</div>
                    </label>
                 )}
                 
                 {uploadProgress.status === 'processing' && (
                    <div>
                       <div className="animate-spin text-4xl mb-4 text-blue-500">
                          <i className="fas fa-spinner"></i>
                       </div>
                       <div className="text-sm font-bold text-blue-700">Processing Excel...</div>
                       <div className="text-xs text-blue-500 mt-2">{uploadProgress.message}</div>
                    </div>
                 )}
                 
                 {uploadProgress.status === 'success' && (
                    <div>
                       <div className="text-4xl mb-4 text-emerald-500">
                          <i className="fas fa-check-circle"></i>
                       </div>
                       <div className="text-sm font-bold text-emerald-700">Import Successful!</div>
                       <div className="text-xs text-emerald-600 mt-2">{uploadProgress.message}</div>
                       <div className="text-lg font-black text-emerald-800 mt-3">{uploadProgress.count} records imported</div>
                       <button 
                          onClick={() => setUploadProgress({status: 'idle', message: ''})} 
                          className="mt-4 px-6 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                       >
                          Upload Another
                       </button>
                    </div>
                 )}
                 
                 {uploadProgress.status === 'error' && (
                    <div>
                       <div className="text-4xl mb-4 text-rose-500">
                          <i className="fas fa-exclamation-circle"></i>
                       </div>
                       <div className="text-sm font-bold text-rose-700">Import Failed</div>
                       <div className="text-xs text-rose-600 mt-2">{uploadProgress.message}</div>
                       <button 
                          onClick={() => setUploadProgress({status: 'idle', message: ''})} 
                          className="mt-4 px-6 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                       >
                          Try Again
                       </button>
                    </div>
                 )}
                 
                 {uploadProgress.status === 'manual' && (
                    <div>
                       <div className="text-4xl mb-4 text-blue-500">
                          <i className="fas fa-question-circle"></i>
                       </div>
                       <div className="text-sm font-bold text-blue-700 mb-2">Manual Selection Required</div>
                       <div className="text-xs text-blue-600 mb-4">{uploadProgress.message}</div>
                       <div className="text-xs text-slate-600 mb-4">Choose data type:</div>
                       <div className="grid grid-cols-2 gap-2 mb-4">
                          {['CUSTOMERS', 'PAYMENTS', 'INVOICES', 'LIABILITIES', 'CHIT_GROUPS'].map(type => (
                             <button
                                key={type}
                                onClick={() => handleManualImport(type)}
                                className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
                             >
                                {type.replace('_', ' ')}
                             </button>
                          ))}
                       </div>
                       <button 
                          onClick={() => setUploadProgress({status: 'idle', message: ''})} 
                          className="text-xs text-slate-500 hover:text-slate-700"
                       >
                          Cancel
                       </button>
                    </div>
                 )}
              </div>
              
              {/* Supported Formats Info */}
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                 <div className="text-xs font-bold text-slate-700 mb-2">📊 Excel Format Examples:</div>
                 <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-500">
                    <div><span className="font-bold">Customers:</span> name, mobile, email, address, isRoyalty, royaltyAmount...</div>
                    <div><span className="font-bold">Payments:</span> type, voucherType, sourceName, amount, mode, date...</div>
                    <div><span className="font-bold">Invoices:</span> customerId, type, amount, balance, dueDate...</div>
                    <div><span className="font-bold">Liabilities:</span> providerName, principal, interestRate, startDate...</div>
                 </div>
                 <button 
                    onClick={() => setShowImportModal(true)}
                    className="mt-3 w-full py-2 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-200 transition"
                 >
                    📖 View Full Excel Templates
                 </button>
              </div>
           </div>
          </div>
        </div>
      )}

      {/* 5. AUDIT (ACTIVITY LOGS) */}
      {activeTab === 'AUDIT' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter">Activity Logs</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Complete Audit Trail with Timestamps</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-black text-slate-900">{auditLogs.length}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Total Entries</div>
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'CREATE', 'EDIT', 'DELETE', 'VOID', 'LOGIN', 'LOGOUT'] as const).map(filter => {
              const count = filter === 'ALL' 
                ? auditLogs.length 
                : auditLogs.filter(log => log.action === filter).length;
              
              return (
                <button
                  key={filter}
                  onClick={() => setAuditFilter(filter)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    auditFilter === filter
                      ? filter === 'ALL' ? 'bg-slate-900 text-white shadow-lg' :
                        filter === 'CREATE' ? 'bg-emerald-600 text-white shadow-lg' :
                        filter === 'EDIT' ? 'bg-blue-600 text-white shadow-lg' :
                        filter === 'DELETE' ? 'bg-rose-600 text-white shadow-lg' :
                        filter === 'VOID' ? 'bg-orange-600 text-white shadow-lg' :
                        filter === 'LOGIN' ? 'bg-indigo-600 text-white shadow-lg' :
                        'bg-purple-600 text-white shadow-lg'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {filter} <span className="ml-1.5 opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {auditLogs.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-16 text-center">
              <div className="text-6xl text-slate-200 mb-4"><i className="fas fa-clipboard-list"></i></div>
              <h3 className="text-lg font-black text-slate-400 uppercase">No Audit Logs Yet</h3>
              <p className="text-xs text-slate-400 mt-2">Activity logs will appear here when users make changes</p>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">User</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Action</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Entity</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Description</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...auditLogs]
                      .filter(log => auditFilter === 'ALL' || log.action === auditFilter)
                      .reverse()
                      .map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-slate-800">
                            {new Date(log.timestamp).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black ${
                              log.performedBy === 'OWNER' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                              {log.userName ? log.userName.charAt(0).toUpperCase() : log.performedBy.charAt(0)}
                            </div>
                            <div>
                              <div className="text-xs font-black text-slate-800">
                                {log.userName || (log.performedBy === 'OWNER' ? 'Admin' : 'Staff')}
                              </div>
                              <div className="text-[9px] text-slate-400 uppercase">{log.performedBy}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                            log.action === 'CREATE' ? 'bg-emerald-50 text-emerald-600' :
                            log.action === 'EDIT' ? 'bg-blue-50 text-blue-600' :
                            log.action === 'DELETE' ? 'bg-rose-50 text-rose-600' :
                            log.action === 'VOID' ? 'bg-orange-50 text-orange-600' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-slate-700 uppercase">{log.entityType}</div>
                          <div className="text-[9px] text-slate-400 font-mono">{log.entityId ? log.entityId.substring(0, 8) + '...' : 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-slate-700 max-w-md">{log.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          {log.changes ? (
                            <div className="text-[10px] text-slate-500 max-w-xs line-clamp-2">{log.changes}</div>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* No Results Message */}
              {auditFilter !== 'ALL' && auditLogs.filter(log => log.action === auditFilter).length === 0 && (
                <div className="p-12 text-center">
                  <i className="fas fa-filter text-4xl text-slate-200 mb-3"></i>
                  <p className="text-sm font-bold text-slate-400">No {auditFilter} actions found</p>
                  <p className="text-xs text-slate-300 mt-1">Try selecting a different filter</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CLEAR ALL DATA CONFIRMATION MODAL */}
      {showClearDataModal && (
        <div className="fixed inset-0 bg-rose-900 bg-opacity-95 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg animate-scaleUp overflow-hidden">
            <div className="p-8 border-b border-rose-100 bg-rose-50 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-display font-black text-rose-900 uppercase italic tracking-tighter">⚠️ Confirm Data Deletion</h3>
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">This Cannot Be Undone</p>
              </div>
              <button onClick={() => { setShowClearDataModal(false); setClearDataConfirmation(''); }} className="text-rose-400 hover:text-rose-600">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-6">
                <h4 className="text-sm font-black text-rose-900 mb-3">⚠️ YOU ARE ABOUT TO DELETE:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-rose-700">
                    <i className="fas fa-times-circle"></i>
                    <span className="font-bold">{customers.length}</span> Customers
                  </li>
                  <li className="flex items-center gap-2 text-rose-700">
                    <i className="fas fa-times-circle"></i>
                    <span className="font-bold">{invoices.length}</span> Invoices
                  </li>
                  <li className="flex items-center gap-2 text-rose-700">
                    <i className="fas fa-times-circle"></i>
                    <span className="font-bold">{payments.length}</span> Payments
                  </li>
                  <li className="flex items-center gap-2 text-rose-700">
                    <i className="fas fa-times-circle"></i>
                    <span className="font-bold">{chitGroups.length}</span> Chit Groups
                  </li>
                  <li className="flex items-center gap-2 text-rose-700">
                    <i className="fas fa-times-circle"></i>
                    All loans and investments
                  </li>
                </ul>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-800">
                  <i className="fas fa-info-circle mr-2"></i>
                  <strong>Tip:</strong> Consider exporting a backup before proceeding.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Type exactly: <span className="text-rose-600 font-black">DELETE ALL DATA</span>
                </label>
                <input
                  type="text"
                  value={clearDataConfirmation}
                  onChange={(e) => setClearDataConfirmation(e.target.value)}
                  placeholder="Type here to confirm..."
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-rose-500"
                  disabled={isClearingData}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => { setShowClearDataModal(false); setClearDataConfirmation(''); }}
                  className="flex-1 py-3 text-slate-600 font-black uppercase text-xs tracking-widest hover:bg-slate-100 rounded-xl transition"
                  disabled={isClearingData}
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAllData}
                  disabled={clearDataConfirmation !== 'DELETE ALL DATA' || isClearingData}
                  className="flex-1 py-3 bg-rose-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-rose-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {isClearingData ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Deleting...</>
                  ) : (
                    <><i className="fas fa-trash-alt mr-2"></i>Clear All Data</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAFF MODAL */}
      {showStaffForm && (
         <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp">
               <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">{isEditingStaff ? 'Edit User & Permissions' : 'Create New User'}</h3>
                  <button onClick={() => setShowStaffForm(false)} className="text-slate-400 hover:text-rose-500"><i className="fas fa-times"></i></button>
               </div>
               <form onSubmit={handleSaveStaff} className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
                        <input required className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={staffFormData.name} onChange={e => setStaffFormData({...staffFormData, name: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Username</label>
                        <input required className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" value={staffFormData.username} onChange={e => setStaffFormData({...staffFormData, username: e.target.value})} />
                     </div>
                  </div>
                  
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{isEditingStaff ? 'New Password (Optional)' : 'Password'}</label>
                     <input type="password" className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-indigo-500" placeholder={isEditingStaff ? "Leave blank to keep current password" : "Required"} required={!isEditingStaff} value={staffFormData.password} onChange={e => setStaffFormData({...staffFormData, password: e.target.value})} />
                  </div>

                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">System Role</label>
                     <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button type="button" onClick={() => setStaffFormData({...staffFormData, role: 'STAFF'})} className={`flex-1 py-3 text-xs font-bold rounded-lg transition ${staffFormData.role === 'STAFF' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>Staff</button>
                        <button type="button" onClick={() => setStaffFormData({...staffFormData, role: 'OWNER'})} className={`flex-1 py-3 text-xs font-bold rounded-lg transition ${staffFormData.role === 'OWNER' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}>Owner</button>
                     </div>
                  </div>

                  {isEditingStaff && (
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Account Status</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                           <button type="button" onClick={() => setStaffFormData({...staffFormData, status: 'ACTIVE'})} className={`flex-1 py-3 text-xs font-bold rounded-lg transition ${staffFormData.status !== 'INACTIVE' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`}>Active</button>
                           <button type="button" onClick={() => setStaffFormData({...staffFormData, status: 'INACTIVE'})} className={`flex-1 py-3 text-xs font-bold rounded-lg transition ${staffFormData.status === 'INACTIVE' ? 'bg-white shadow text-rose-500' : 'text-slate-400'}`}>Inactive</button>
                        </div>
                     </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Security Clearance</label>
                     <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                           <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={staffFormData.permissions?.canEdit} onChange={e => setStaffFormData({...staffFormData, permissions: { ...staffFormData.permissions!, canEdit: e.target.checked }})} />
                           <span className="text-xs font-bold text-slate-700">Can Edit Transactions & Records</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                           <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500" checked={staffFormData.permissions?.canDelete} onChange={e => setStaffFormData({...staffFormData, permissions: { ...staffFormData.permissions!, canDelete: e.target.checked }})} />
                           <span className="text-xs font-bold text-slate-700">Can Delete Data (Critical)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                           <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500" checked={staffFormData.permissions?.canManageUsers} onChange={e => setStaffFormData({...staffFormData, permissions: { ...staffFormData.permissions!, canManageUsers: e.target.checked }})} />
                           <span className="text-xs font-bold text-slate-700">Manage Users & Passwords</span>
                        </label>
                     </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                     <button type="button" onClick={() => { setShowStaffForm(false); setStaffFormError(''); }} className="flex-1 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                     <button type="submit" disabled={staffFormLoading} className="flex-1 py-3 bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed">
                        {staffFormLoading ? 'Saving...' : (isEditingStaff ? 'Update User' : 'Create User')}
                     </button>
                  </div>
                  {staffFormError && (
                    <div className="text-[11px] font-semibold text-rose-500 bg-rose-50 p-3 rounded-xl flex items-center gap-2 mt-2">
                      <i className="fas fa-circle-exclamation"></i> {staffFormError}
                    </div>
                  )}
               </form>
            </div>
         </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl animate-scaleUp overflow-hidden">
              <div className="p-8 border-b border-slate-100 bg-slate-50">
                 <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Excel Format Templates</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Copy these headers for your Excel files</p>
              </div>
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                 
                 {/* Customers Template */}
                 <div className="border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">📋 CUSTOMERS EXCEL</h4>
                    <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                       <div>name,mobile,email,address,status,isRoyalty,royaltyAmount,isInterest,interestPrincipal,interestRate,isChit,openingBalance</div>
                       <div className="text-slate-500 mt-2">John Doe,9876543210,john@email.com,123 Main St,ACTIVE,true,5000,false,0,0,false,10000</div>
                    </div>
                 </div>
                 
                 {/* Payments Template */}
                 <div className="border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">💳 PAYMENTS EXCEL</h4>
                    <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                       <div>type,voucherType,sourceId,sourceName,amount,mode,date,category,notes,businessUnit</div>
                       <div className="text-slate-500 mt-2">IN,RECEIPT,cust123,John Doe,15000,CASH,1770000000000,ROYALTY,,</div>
                    </div>
                 </div>
                 
                 {/* Invoices Template */}
                 <div className="border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">📄 INVOICES EXCEL</h4>
                    <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                       <div>customerId,customerName,type,amount,balance,dueDate,status,direction,isVoid</div>
                       <div className="text-slate-500 mt-2">cust123,John Doe,ROYALTY,20000,15000,1770000000000,UNPAID,IN,false</div>
                    </div>
                 </div>
                 
                 {/* Liabilities Template */}
                 <div className="border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">💰 LIABILITIES EXCEL</h4>
                    <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                       <div>providerName,principal,interestRate,startDate,status,type,notes</div>
                       <div className="text-slate-500 mt-2">ABC Bank,500000,12.5,1770000000000,ACTIVE,LOAN,Home loan</div>
                    </div>
                 </div>
                 
                 {/* Chit Groups Template */}
                 <div className="border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">🎲 CHIT GROUPS EXCEL</h4>
                    <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                       <div>groupName,totalValue,monthlyInstallment,durationMonths,startDate,status</div>
                       <div className="text-slate-500 mt-2">Chit Fund A,100000,5000,20,1770000000000,ACTIVE</div>
                    </div>
                 </div>
                 
              </div>
              <div className="p-8 border-t border-slate-100 bg-slate-50">
                 <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                       💡 <strong>Tip:</strong> Use these exact headers in your Excel files for auto-detection
                    </div>
                    <button 
                       onClick={() => setShowImportModal(false)} 
                       className="px-6 py-3 bg-slate-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-700 shadow-lg"
                    >
                       Got It
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
