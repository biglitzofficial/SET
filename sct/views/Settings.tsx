
import React, { useState } from 'react';
import { Customer, ChitGroup, Invoice, StaffUser, AuditLog, Payment, Liability, Investment, BankAccount } from '../types';

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
  const [activeTab, setActiveTab] = useState<'FINANCE' | 'ACCESS' | 'DATA'>('FINANCE');
  
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
  
  // --- HELPER LOGIC ---

  const openStaffEdit = (user: StaffUser) => {
    setStaffFormData({ ...user, password: '' }); // Clear password for security
    setIsEditingStaff(true);
    setShowStaffForm(true);
  }

  const openStaffCreate = () => {
    setStaffFormData(initialStaffForm);
    setIsEditingStaff(false);
    setShowStaffForm(true);
  }

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditingStaff && staffFormData.id) {
        setStaffUsers(prev => prev.map(u => {
            if (u.id === staffFormData.id) {
                return {
                    ...u,
                    name: staffFormData.name || u.name,
                    username: staffFormData.username || u.username,
                    role: staffFormData.role || u.role,
                    permissions: staffFormData.permissions || u.permissions,
                    // Update password only if provided
                    password: staffFormData.password && staffFormData.password.length > 0 ? staffFormData.password : u.password
                };
            }
            return u;
        }));
    } else {
        const newUser: StaffUser = {
            ...staffFormData as StaffUser,
            id: Math.random().toString(36).substr(2, 9),
            email: `${staffFormData.username}@srichendur.com`,
            // Default permissions if missing
            permissions: staffFormData.permissions || { canEdit: false, canDelete: false, canManageUsers: false }
        };
        setStaffUsers([...staffUsers, newUser]);
    }
    
    setShowStaffForm(false);
    setStaffFormData(initialStaffForm);
  };

  const handleAddBank = () => {
    if (setBankAccounts) {
      const newId = `BANK_${Date.now()}`;
      setBankAccounts([...bankAccounts, { id: newId, name: 'NEW BANK', openingBalance: 0, status: 'ACTIVE' }]);
    }
  };

  const updateBank = (id: string, field: keyof BankAccount, value: any) => {
    if (setBankAccounts) {
      setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
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

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">System Config</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Advanced Administration</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {['FINANCE', 'ACCESS', 'DATA'].map(tab => (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           
           {/* BANK ACCOUNTS SECTION */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter">Banking Configuration</h3>
                 <button onClick={handleAddBank} className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-indigo-100">+ Add Bank</button>
              </div>
              <div className="space-y-6">
                 <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cash Drawer</label>
                       <span className="text-[9px] font-black text-slate-300 uppercase">Fixed</span>
                    </div>
                    <input type="number" className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 font-bold text-slate-900 outline-none focus:border-indigo-500" value={openingBalances.CASH} onChange={e => setOpeningBalances({...openingBalances, CASH: Number(e.target.value)})} />
                 </div>

                 {bankAccounts.map((bank) => (
                    <div key={bank.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm relative group">
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bank Name</label>
                             <input type="text" className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 font-black uppercase text-xs outline-none focus:ring-2 focus:ring-indigo-100" value={bank.name} onChange={e => updateBank(bank.id, 'name', e.target.value.toUpperCase())} />
                          </div>
                          <div>
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Opening Balance</label>
                             <input type="number" className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-100" value={bank.openingBalance} onChange={e => updateBank(bank.id, 'openingBalance', Number(e.target.value))} />
                          </div>
                       </div>
                       <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <i className="fas fa-university text-slate-200"></i>
                       </div>
                    </div>
                 ))}

                 <div className="pt-4 border-t border-slate-100">
                    <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Owner's Capital (Equity)</label>
                    <input type="number" className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-xl px-4 py-3 font-bold text-emerald-700 outline-none focus:border-emerald-500" value={openingBalances.CAPITAL} onChange={e => setOpeningBalances({...openingBalances, CAPITAL: Number(e.target.value)})} />
                 </div>
              </div>
           </div>

           {/* EXPENSE CATEGORIES */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm h-fit">
              <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter mb-6">Expense Categories</h3>
              <div className="flex flex-wrap gap-2 mb-6">
                 {expenseCategories.map(cat => (
                    <span key={cat} className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {cat}
                       <button onClick={() => setExpenseCategories(prev => prev.filter(c => c !== cat))} className="hover:text-rose-500"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
              </div>
              <div className="flex gap-2">
                 <input id="newCat" type="text" placeholder="NEW CATEGORY" className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none focus:border-indigo-500" />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newCat') as HTMLInputElement;
                      if(input.value) { setExpenseCategories([...expenseCategories, input.value.toUpperCase()]); input.value = ''; }
                   }}
                   className="bg-indigo-600 text-white px-6 rounded-xl font-black text-xs uppercase hover:bg-indigo-700"
                 >
                    Add
                 </button>
              </div>
           </div>

           {/* BUSINESS UNITS (Formerly Income Categories) */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm h-fit">
              <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter mb-2">Business Units</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Other operational divisions</p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                 {(otherBusinesses || []).map(biz => (
                    <span key={biz} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {biz}
                       <button onClick={() => setOtherBusinesses?.(prev => prev.filter(b => b !== biz))} className="hover:text-blue-900"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
                 {(otherBusinesses || []).length === 0 && <span className="text-xs text-slate-400 italic">No business units added.</span>}
              </div>
              <div className="flex gap-2">
                 <input id="newBiz" type="text" placeholder="NEW UNIT (e.g. TRANSPORT)" className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none focus:border-blue-500" />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newBiz') as HTMLInputElement;
                      if(input.value && setOtherBusinesses) { setOtherBusinesses(prev => [...prev, input.value.toUpperCase()]); input.value = ''; }
                   }}
                   className="bg-blue-600 text-white px-6 rounded-xl font-black text-xs uppercase hover:bg-blue-700"
                 >
                    Add
                 </button>
              </div>
           </div>

           {/* DIRECT INCOME CATEGORIES (New) */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm h-fit">
              <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter mb-2">Direct Income Categories</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Salary, Commissions, Incentives</p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                 {(incomeCategories || []).map(inc => (
                    <span key={inc} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       {inc}
                       <button onClick={() => setIncomeCategories?.(prev => prev.filter(i => i !== inc))} className="hover:text-emerald-900"><i className="fas fa-times"></i></button>
                    </span>
                 ))}
                 {(incomeCategories || []).length === 0 && <span className="text-xs text-slate-400 italic">No income categories defined.</span>}
              </div>
              <div className="flex gap-2">
                 <input id="newInc" type="text" placeholder="NEW TYPE (e.g. BONUS)" className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none focus:border-emerald-500" />
                 <button 
                   onClick={() => {
                      const input = document.getElementById('newInc') as HTMLInputElement;
                      if(input.value && setIncomeCategories) { setIncomeCategories(prev => [...prev, input.value.toUpperCase()]); input.value = ''; }
                   }}
                   className="bg-emerald-600 text-white px-6 rounded-xl font-black text-xs uppercase hover:bg-emerald-700"
                 >
                    Add
                 </button>
              </div>
           </div>

        </div>
      )}

      {/* 3. ACCESS (STAFF MANAGEMENT) */}
      {activeTab === 'ACCESS' && (
         <div className="space-y-6">
            <div className="flex justify-between items-end">
               <div>
                  <h3 className="text-lg font-display font-black text-slate-900 uppercase italic tracking-tighter">Staff Access Control</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage Login Credentials & Privileges</p>
               </div>
               {currentUser?.permissions.canManageUsers && (
                  <button onClick={openStaffCreate} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-lg">
                     + Add User
                  </button>
               )}
            </div>
            
            <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-sm overflow-hidden">
               <div className="overflow-x-auto">
               <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                     <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">User Profile</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Username</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Role</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Access Rights</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Action</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {staffUsers.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50">
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-black">
                                    {user.name.charAt(0)}
                                 </div>
                                 <div className="text-sm font-bold text-slate-800">{user.name}</div>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-xs font-bold text-slate-500">{user.username}</td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${user.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                 {user.role}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-center">
                              <div className="flex justify-center gap-1">
                                 {user.permissions?.canEdit && <span title="Edit Rights" className="w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-600 rounded text-[9px]"><i className="fas fa-pen"></i></span>}
                                 {user.permissions?.canDelete && <span title="Delete Rights" className="w-5 h-5 flex items-center justify-center bg-rose-100 text-rose-600 rounded text-[9px]"><i className="fas fa-trash"></i></span>}
                                 {user.permissions?.canManageUsers && <span title="Admin/User Mgmt" className="w-5 h-5 flex items-center justify-center bg-purple-100 text-purple-600 rounded text-[9px]"><i className="fas fa-users-cog"></i></span>}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right">
                              {currentUser?.permissions.canManageUsers && (
                                 <button onClick={() => openStaffEdit(user)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Edit / Reset</button>
                              )}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               </div>
            </div>
         </div>
      )}

      {/* 4. DATA (IMPORT/EXPORT) */}
      {/* ... (Data tab remains mostly unchanged, exporting incomeCategories is handled by App.tsx logic passed down) ... */}
      {activeTab === 'DATA' && (
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

           {/* CSV TOOLS SECTION */}
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter mb-6">Bulk Data Tools (CSV)</h3>
              <div className="grid grid-cols-2 gap-4">
                 {['CUSTOMERS', 'PAYMENTS', 'CHIT_GROUPS', 'LIABILITIES', 'INVOICES'].map(type => (
                    <button 
                       key={type}
                       onClick={() => { setImportType(type as any); setShowImportModal(true); }}
                       className="p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 text-left transition-all group"
                    >
                       <div className="text-[9px] font-black text-slate-400 group-hover:text-blue-400 uppercase tracking-widest mb-1">Import</div>
                       <div className="text-xs font-black text-slate-800 uppercase">{type.replace('_', ' ')}</div>
                    </button>
                 ))}
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
                     <button type="button" onClick={() => setShowStaffForm(false)} className="flex-1 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                     <button type="submit" className="flex-1 py-3 bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800">
                        {isEditingStaff ? 'Update User' : 'Create User'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}
      
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg animate-scaleUp overflow-hidden">
              <div className="p-8 border-b border-slate-100 bg-slate-50">
                 <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Import {importType?.replace('_', ' ')}</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CSV Data Upload</p>
              </div>
              <div className="p-8 space-y-6">
                 <p className="text-xs text-slate-500">Please paste your CSV data below. Ensure headers match the template.</p>
                 <textarea className="w-full h-40 border-2 border-slate-100 rounded-xl p-4 text-xs font-mono bg-slate-50 outline-none focus:border-indigo-500" placeholder="PASTE CSV CONTENT HERE..." value={importText} onChange={e => setImportText(e.target.value)}></textarea>
                 <div className="flex gap-4">
                    <button onClick={() => setShowImportModal(false)} className="flex-1 py-3 text-slate-400 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                    <button disabled className="flex-1 py-3 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg opacity-50 cursor-not-allowed">Process Import</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
