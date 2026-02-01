
import React, { useState, useMemo } from 'react';
import { Customer, Invoice, Payment } from '../types';
import { customerAPI } from '../services/api';

interface CustomerListProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  payments: Payment[];
}

type SortKey = 'name' | 'royaltyAmount' | 'interestPrincipal' | 'outstanding' | 'interestRate' | 'interestYield' | 'creditPrincipal';
type ViewType = 'ALL' | 'ROYALTY' | 'INTEREST' | 'CHIT' | 'GENERAL' | 'CREDITOR';

const CustomerList: React.FC<CustomerListProps> = ({ customers, setCustomers, invoices, payments }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Filter & Sort State
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<ViewType>('ALL');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ASC' | 'DESC' }>({ key: 'name', direction: 'ASC' });

  // Form Classification State
  const [formClass, setFormClass] = useState<'DEBTOR' | 'CREDITOR'>('DEBTOR');

  const initialForm: Partial<Customer> = {
    name: '',
    phone: '',
    isRoyalty: false,
    isInterest: false,
    isChit: false,
    isGeneral: false,
    isLender: false,
    royaltyAmount: 0,
    interestPrincipal: 0,
    creditPrincipal: 0,
    openingBalance: 0,
    interestRate: 0,
    status: 'ACTIVE'
  };

  const [formData, setFormData] = useState<Partial<Customer>>(initialForm);

  const getCustomerStats = (cid: string) => {
    const cust = customers.find(c => c.id === cid);
    const custInvoices = invoices.filter(inv => inv.customerId === cid);
    const totalRaised = custInvoices.reduce((acc, inv) => acc + inv.amount, 0);
    const totalOutstanding = custInvoices.reduce((acc, inv) => acc + inv.balance, 0);
    // Add opening balance to total outstanding
    return { totalRaised, totalPaid: totalRaised - totalOutstanding, totalOutstanding: totalOutstanding + (cust?.openingBalance || 0) };
  };

  // 1. Process Data
  const processedCustomers = useMemo(() => {
    let result = customers.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(search.toLowerCase());
      const phoneMatch = c.phone.includes(search);
      const matchesSearch = nameMatch || phoneMatch;
      
      const matchesType = activeView === 'ALL' || 
                         (activeView === 'ROYALTY' && c.isRoyalty) ||
                         (activeView === 'INTEREST' && c.isInterest) ||
                         (activeView === 'CHIT' && c.isChit) ||
                         (activeView === 'GENERAL' && c.isGeneral) ||
                         (activeView === 'CREDITOR' && c.isLender);
      return matchesSearch && matchesType;
    });

    result.sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;

      if (sortConfig.key === 'interestYield') {
        const yieldA = a.isInterest 
            ? a.interestPrincipal * (a.interestRate / 100) 
            : (a.isLender ? -(a.creditPrincipal * (a.interestRate / 100)) : 0);
        const yieldB = b.isInterest 
            ? b.interestPrincipal * (b.interestRate / 100) 
            : (b.isLender ? -(b.creditPrincipal * (b.interestRate / 100)) : 0);
        valA = yieldA;
        valB = yieldB;
      } else if (sortConfig.key === 'outstanding') {
        valA = getCustomerStats(a.id).totalOutstanding;
        valB = getCustomerStats(b.id).totalOutstanding;
      } else {
        // @ts-ignore
        valA = a[sortConfig.key] || 0;
        // @ts-ignore
        valB = b[sortConfig.key] || 0;
      }

      if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
      return 0;
    });

    return result;
  }, [customers, search, activeView, sortConfig, invoices]);

  // 2. Aggregate Totals
  const totals = useMemo(() => {
    return processedCustomers.reduce((acc, c) => {
      acc.royalty += c.royaltyAmount || 0;
      acc.interestYield += c.isInterest ? (c.interestPrincipal * (c.interestRate / 100)) : 0;
      acc.interestPayable += c.isLender ? (c.creditPrincipal * (c.interestRate / 100)) : 0;
      acc.principalLent += c.interestPrincipal || 0;
      acc.principalBorrowed += c.creditPrincipal || 0;
      acc.outstanding += getCustomerStats(c.id).totalOutstanding;
      return acc;
    }, { royalty: 0, interestYield: 0, interestPayable: 0, principalLent: 0, principalBorrowed: 0, outstanding: 0 });
  }, [processedCustomers, invoices]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ASC' ? 'DESC' : 'ASC'
    }));
  };

  const handleOpenForm = (cust?: Customer) => {
    if (cust) {
      setEditingCustomer(cust);
      setFormData(cust);
      setFormClass(cust.isLender ? 'CREDITOR' : 'DEBTOR');
    } else {
      setEditingCustomer(null);
      setFormData(initialForm);
      setFormClass('DEBTOR');
    }
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Ensure flags match the classification
    const cleanData = { ...formData };
    if (formClass === 'CREDITOR') {
      cleanData.isLender = true;
      cleanData.isInterest = false; 
      cleanData.interestPrincipal = 0;
      if (!cleanData.isRoyalty) cleanData.royaltyAmount = 0;
    } else {
      cleanData.isLender = false;
      cleanData.creditPrincipal = 0;
    }

    if (!cleanData.isRoyalty && !cleanData.isInterest && !cleanData.isChit && !cleanData.isLender && !cleanData.isGeneral) {
      alert("Please select at least one role for this account.");
      return;
    }

    try {
      if (editingCustomer) {
        // Update existing customer
        const updated = await customerAPI.update(editingCustomer.id, cleanData);
        setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? updated : c));
      } else {
        // Create new customer
        const newCustomer = await customerAPI.create(cleanData);
        setCustomers([...customers, newCustomer]);
      }
      
      setShowForm(false);
      setFormData(initialForm);
      setEditingCustomer(null);
    } catch (error) {
      console.error('Failed to save customer:', error);
      alert('Failed to save customer. Please try again.');
    }
  };

  // Helper to render icons
  const RoleIcon = ({ icon, color, active }: { icon: string, color: string, active: boolean }) => {
    if (!active) return null;
    return (
      <div className={`h-6 w-6 rounded-full flex items-center justify-center bg-${color}-50 text-${color}-600 border border-${color}-100 shadow-sm`} title={color}>
        <i className={`fas ${icon} text-[10px]`}></i>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* TOP HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="w-full md:w-auto flex-1">
           <div className="relative w-full max-w-md">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
              <input 
                 type="text" 
                 placeholder="Search registry..." 
                 className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 outline-none font-bold text-sm text-slate-700 shadow-sm focus:border-indigo-500"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
              />
           </div>
        </div>
        <button 
          data-testid="btn-add-customer"
          onClick={() => handleOpenForm()}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all flex items-center gap-2"
        >
          <i className="fas fa-plus"></i> Add Account
        </button>
      </div>

      {/* VIEW SELECTOR TABS */}
      <div className="flex justify-center">
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 inline-flex shadow-sm gap-1 overflow-x-auto max-w-full">
          {[
            { id: 'ALL', label: 'All', icon: 'fa-layer-group' },
            { id: 'ROYALTY', label: 'Royalty', icon: 'fa-crown' },
            { id: 'INTEREST', label: 'Lending', icon: 'fa-hand-holding-dollar' },
            { id: 'CREDITOR', label: 'Creditors', icon: 'fa-building-columns' },
            { id: 'CHIT', label: 'Chit', icon: 'fa-users-viewfinder' },
            { id: 'GENERAL', label: 'General', icon: 'fa-briefcase' },
          ].map(view => (
            <button 
              key={view.id} 
              onClick={() => setActiveView(view.id as ViewType)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                activeView === view.id 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <i className={`fas ${view.icon}`}></i> {view.label}
            </button>
          ))}
        </div>
      </div>

      {/* DATA GRID */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
              <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer" onClick={() => handleSort('name')}>Account Identity</th>
              
              {/* DYNAMIC COLUMNS */}
              {(activeView === 'ALL' || activeView === 'ROYALTY') && (
                <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-purple-400 cursor-pointer" onClick={() => handleSort('royaltyAmount')}>Royalty</th>
              )}
              
              {(activeView === 'ALL' || activeView === 'INTEREST') && (
                <>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-emerald-600 cursor-pointer" onClick={() => handleSort('interestPrincipal')}>Principal Lent</th>
                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Rate</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-emerald-600 cursor-pointer" onClick={() => handleSort('interestYield')}>Yield</th>
                </>
              )}

              {(activeView === 'CREDITOR') && (
                <>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-rose-500 cursor-pointer" onClick={() => handleSort('creditPrincipal')}>Borrowed Principal</th>
                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Rate</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-rose-500 cursor-pointer" onClick={() => handleSort('interestYield')}>Interest Payable</th>
                </>
              )}

              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer" onClick={() => handleSort('outstanding')}>Net Outstanding</th>
              <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
              <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {processedCustomers.map((customer, index) => {
              const stats = getCustomerStats(customer.id);
              const interestRec = customer.isInterest ? customer.interestPrincipal * (customer.interestRate / 100) : 0;
              const interestPay = customer.isLender ? customer.creditPrincipal * (customer.interestRate / 100) : 0;
              
              return (
                <tr 
                  key={customer.id} 
                  className="hover:bg-slate-50 transition-colors cursor-pointer group" 
                  onClick={() => handleOpenForm(customer)}
                >
                  <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-slate-400">{index + 1}</td>
                  
                  {/* IDENTITY COLUMN WITH ICONS */}
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                       <div>
                          <div className="text-sm font-bold text-slate-800 uppercase">{customer.name}</div>
                          <div className="text-[10px] font-bold text-slate-400">{customer.phone}</div>
                       </div>
                       {/* Role Icons Grid */}
                       <div className="flex gap-1">
                          <RoleIcon icon="fa-crown" color="purple" active={customer.isRoyalty} />
                          <RoleIcon icon="fa-hand-holding-dollar" color="emerald" active={customer.isInterest} />
                          <RoleIcon icon="fa-building-columns" color="rose" active={customer.isLender} />
                          <RoleIcon icon="fa-users-viewfinder" color="yellow" active={customer.isChit} />
                          <RoleIcon icon="fa-briefcase" color="blue" active={customer.isGeneral} />
                       </div>
                    </div>
                  </td>

                  {/* DYNAMIC DATA CELLS */}
                  {(activeView === 'ALL' || activeView === 'ROYALTY') && (
                    <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-display font-bold text-purple-700">
                      {customer.isRoyalty ? `₹${customer.royaltyAmount.toLocaleString()}` : <span className="text-slate-200">-</span>}
                    </td>
                  )}

                  {(activeView === 'ALL' || activeView === 'INTEREST') && (
                    <>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-display font-black text-emerald-600">
                        {customer.isInterest && customer.interestPrincipal > 0 ? `₹${customer.interestPrincipal.toLocaleString()}` : <span className="text-slate-200">-</span>}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-center text-xs font-bold text-slate-500">
                        {customer.isInterest && customer.interestRate > 0 ? `${customer.interestRate}%` : <span className="text-slate-200">-</span>}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-display font-black text-emerald-600">
                        {interestRec > 0 ? `₹${interestRec.toLocaleString()}` : <span className="text-slate-200">-</span>}
                      </td>
                    </>
                  )}

                  {(activeView === 'CREDITOR') && (
                    <>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-display font-black text-rose-600">
                        {customer.creditPrincipal > 0 ? `₹${customer.creditPrincipal.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-center text-xs font-bold text-slate-500">
                        {customer.interestRate > 0 ? `${customer.interestRate}%` : '-'}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-display font-black text-rose-600">
                        {interestPay > 0 ? `₹${interestPay.toLocaleString()}` : '-'}
                      </td>
                    </>
                  )}

                  <td className={`px-6 py-5 whitespace-nowrap text-right text-sm font-display font-black italic ${stats.totalOutstanding > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                    {stats.totalOutstanding !== 0 ? `₹${Math.abs(stats.totalOutstanding).toLocaleString()}` : '-'}
                  </td>
                  
                  <td className="px-6 py-5 whitespace-nowrap text-center">
                    <div className={`h-2 w-2 rounded-full mx-auto ${customer.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  </td>
                  
                  <td className="px-6 py-5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                     <button 
                       onClick={() => handleOpenForm(customer)} 
                       className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                       title="Edit customer"
                     >
                       <i className="fas fa-pen"></i>
                     </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          
          {/* DYNAMIC FOOTER */}
          <tfoot className="bg-slate-900 text-white">
             <tr>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Section Totals</td>
                
                {(activeView === 'ALL' || activeView === 'ROYALTY') && (
                   <td className="px-6 py-4 text-right text-sm font-display font-black text-purple-400">₹{totals.royalty.toLocaleString()}</td>
                )}

                {(activeView === 'ALL' || activeView === 'INTEREST') && (
                   <>
                      <td className="px-6 py-4 text-right text-sm font-display font-black text-emerald-400">₹{totals.principalLent.toLocaleString()}</td>
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-right text-sm font-display font-black text-emerald-400">₹{totals.interestYield.toLocaleString()}</td>
                   </>
                )}

                {(activeView === 'CREDITOR') && (
                   <>
                      <td className="px-6 py-4 text-right text-sm font-display font-black text-rose-400">₹{totals.principalBorrowed.toLocaleString()}</td>
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-right text-sm font-display font-black text-rose-400">₹{totals.interestPayable.toLocaleString()}</td>
                   </>
                )}

                <td className="px-6 py-4 text-right text-sm font-display font-black text-rose-400">₹{totals.outstanding.toLocaleString()}</td>
                <td></td>
                <td></td>
             </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {/* MODAL FORM (UNCHANGED LOGIC, JUST RE-RENDERED FOR CONTEXT) */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[200] p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl my-8 overflow-hidden animate-scaleUp">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
               <div>
                  <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">{editingCustomer ? 'Modify Account' : 'Create New Account'}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Classification & Details</p>
               </div>
               <button onClick={() => setShowForm(false)} className="h-10 w-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
              
              {/* CLASSIFICATION TOGGLE */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                 <button 
                   type="button" 
                   onClick={() => setFormClass('DEBTOR')} 
                   className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${formClass === 'DEBTOR' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Client / Debtor
                 </button>
                 <button 
                   type="button" 
                   onClick={() => setFormClass('CREDITOR')} 
                   className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${formClass === 'CREDITOR' ? 'bg-white shadow-md text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Creditor / Lender
                 </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                  <input data-testid="input-cust-name" required className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none transition" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
                  <input 
                    data-testid="input-cust-phone" 
                    type="tel" 
                    required 
                    pattern="[0-9]{10}" 
                    maxLength={10}
                    title="Please enter exactly 10 digits"
                    className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none transition" 
                    value={formData.phone} 
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData({...formData, phone: value});
                    }} 
                    placeholder="10 digits only"
                  />
                </div>
              </div>

              {/* DYNAMIC FIELDS BASED ON CLASS */}
              {formClass === 'DEBTOR' ? (
                <div className="space-y-6 animate-fadeIn">
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Client Subscriptions</label>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <label className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer transition-all ${formData.isGeneral ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-100 hover:bg-slate-50 text-slate-500'}`}>
                          <input type="checkbox" className="hidden" checked={formData.isGeneral || false} onChange={e => setFormData({...formData, isGeneral: e.target.checked})} />
                          <i className="fas fa-briefcase text-xl mb-2"></i>
                          <span className="font-black text-[10px] uppercase tracking-widest text-center">General / Trader</span>
                        </label>
                        <label className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer transition-all ${formData.isRoyalty ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-slate-100 hover:bg-slate-50 text-slate-500'}`}>
                          <input type="checkbox" className="hidden" checked={formData.isRoyalty || false} onChange={e => setFormData({...formData, isRoyalty: e.target.checked})} />
                          <i className="fas fa-crown text-xl mb-2"></i>
                          <span className="font-black text-[10px] uppercase tracking-widest text-center">Royalty</span>
                        </label>
                        <label className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer transition-all ${formData.isInterest ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-100 hover:bg-slate-50 text-slate-500'}`}>
                          <input type="checkbox" className="hidden" checked={formData.isInterest || false} onChange={e => setFormData({...formData, isInterest: e.target.checked})} />
                          <i className="fas fa-hand-holding-dollar text-xl mb-2"></i>
                          <span className="font-black text-[10px] uppercase tracking-widest text-center">Lending</span>
                        </label>
                        <label className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer transition-all ${formData.isChit ? 'border-yellow-200 bg-yellow-50 text-yellow-700' : 'border-slate-100 hover:bg-slate-50 text-slate-500'}`}>
                          <input type="checkbox" className="hidden" checked={formData.isChit || false} onChange={e => setFormData({...formData, isChit: e.target.checked})} />
                          <i className="fas fa-users-viewfinder text-xl mb-2"></i>
                          <span className="font-black text-[10px] uppercase tracking-widest text-center">Chit Fund</span>
                        </label>
                      </div>
                   </div>
                   
                   {/* OPENING BALANCE FOR GENERAL */}
                   {formData.isGeneral && (
                     <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                       <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Opening Receivable (Trade Due)</label>
                       <input type="number" className="w-full bg-white rounded-lg p-2 font-black text-blue-900 outline-none" placeholder="0" value={formData.openingBalance || ''} onChange={e => setFormData({...formData, openingBalance: Number(e.target.value)})} />
                       <p className="text-[9px] font-bold text-blue-400 mt-1">Starting balance for non-interest trade.</p>
                     </div>
                   )}

                   {formData.isRoyalty && (
                     <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                       <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">Royalty Amount (₹)</label>
                       <input type="number" className="w-full bg-white rounded-lg p-2 font-black text-purple-900 outline-none" value={formData.royaltyAmount} onChange={e => setFormData({...formData, royaltyAmount: Number(e.target.value)})} />
                     </div>
                   )}

                   {formData.isInterest && (
                     <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 grid grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Principal Lent (Asset)</label>
                         <input type="number" className="w-full bg-white rounded-lg p-2 font-black text-emerald-900 outline-none" value={formData.interestPrincipal} onChange={e => setFormData({...formData, interestPrincipal: Number(e.target.value)})} />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Interest Rate (%)</label>
                         <input type="number" step="0.1" className="w-full bg-white rounded-lg p-2 font-black text-emerald-900 outline-none" value={formData.interestRate} onChange={e => setFormData({...formData, interestRate: Number(e.target.value)})} />
                       </div>
                     </div>
                   )}
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn">
                   <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                      <div className="flex items-center gap-3 mb-4">
                         <div className="h-10 w-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center"><i className="fas fa-building-columns"></i></div>
                         <div>
                            <h4 className="text-sm font-black text-rose-900 uppercase">Creditor Configuration</h4>
                            <p className="text-[10px] font-bold text-rose-400 uppercase">Liability Details</p>
                         </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Principal Borrowed (Liability)</label>
                            <input type="number" className="w-full bg-white border border-rose-200 rounded-xl p-3 font-display font-black text-lg text-rose-600 outline-none" value={formData.creditPrincipal} onChange={e => setFormData({...formData, creditPrincipal: Number(e.target.value)})} />
                         </div>
                         <div>
                            <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Interest Rate (%)</label>
                            <input type="number" step="0.1" className="w-full bg-white border border-rose-200 rounded-xl p-3 font-display font-black text-lg text-rose-600 outline-none" value={formData.interestRate} onChange={e => setFormData({...formData, interestRate: Number(e.target.value)})} />
                         </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-rose-200/50">
                         <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Opening Payable (Trade/Other)</label>
                         <input type="number" className="w-full bg-white border border-rose-200 rounded-xl p-3 font-display font-black text-lg text-rose-600 outline-none" placeholder="0" value={Math.abs(formData.openingBalance || 0)} onChange={e => setFormData({...formData, openingBalance: -Math.abs(Number(e.target.value))})} />
                         <p className="text-[9px] font-bold text-rose-400 mt-1">Starting balance for non-loan trade payables.</p>
                      </div>
                   </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                 <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50">Cancel</button>
                 <button data-testid="btn-save-customer" type="submit" className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-lg hover:scale-105 transition-all">Save Account</button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerList;
