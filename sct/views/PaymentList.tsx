
import React, { useState } from 'react';
import { Payment, Customer, Supplier, Invoice } from '../types';

interface PaymentListProps {
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  customers: Customer[];
  suppliers: Supplier[];
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  expenseCategories: string[];
  otherBusinesses: string[];
}

const PaymentList: React.FC<PaymentListProps> = ({ 
  payments, setPayments, customers, suppliers, invoices, setInvoices, setSuppliers,
  expenseCategories, otherBusinesses
}) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Payment>>({
    type: 'IN',
    amount: 0,
    mode: 'CASH',
    date: Date.now(),
    sourceId: '',
    sourceName: '',
    invoiceId: '',
    notes: '',
    category: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPayment: Payment = {
      ...formData as Payment,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date(formData.date!).getTime()
    };

    if (newPayment.type === 'IN' && newPayment.invoiceId) {
      setInvoices(prev => prev.map(inv => {
        if (inv.id === newPayment.invoiceId) {
          const newBalance = inv.balance - newPayment.amount;
          return {
            ...inv,
            balance: Math.max(0, newBalance),
            status: newBalance <= 0 ? 'PAID' : 'PARTIAL'
          };
        }
        return inv;
      }));
    }

    if (newPayment.type === 'OUT' && formData.sourceId) {
       setSuppliers(prev => prev.map(sup => {
         if (sup.id === formData.sourceId) {
           return { ...sup, outstanding: Math.max(0, sup.outstanding - newPayment.amount) };
         }
         return sup;
       }));
    }

    setPayments([newPayment, ...payments]);
    setShowForm(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Transaction Ledger</h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Movement History</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg font-black text-xs uppercase tracking-widest"
        >
          <i className="fas fa-plus"></i> Record Movement
        </button>
      </div>

      <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-dark-900 text-white">
            <tr>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-80">Date</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-80">Category / Source</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-80">Mode</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-80 text-right">Amount</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-80">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition group">
                <td className="px-6 py-5 text-xs font-bold text-slate-500">{new Date(p.date).toLocaleDateString()}</td>
                <td className="px-6 py-5">
                  <div className="font-bold text-slate-800 text-sm uppercase">{p.sourceName}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.category}</div>
                </td>
                <td className="px-6 py-5">
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase tracking-widest">{p.mode}</span>
                </td>
                <td className={`px-6 py-5 text-right font-display font-black text-lg italic ${p.type === 'IN' ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {p.type === 'IN' ? '+' : '-'} ₹{p.amount.toLocaleString()}
                </td>
                <td className="px-6 py-5 text-xs text-slate-400 truncate max-w-[200px] font-bold">{p.notes || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl animate-scaleUp overflow-hidden">
            <div className="p-8 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Financial Movement</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Input funds transfer</p>
              </div>
              <button 
                onClick={() => setShowForm(false)}
                className="h-10 w-10 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-rose-500 transition"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Direction</label>
                  <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, type: 'IN'})}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition ${formData.type === 'IN' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      In (Cr)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, type: 'OUT'})}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition ${formData.type === 'OUT' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      Out (Dr)
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Account</label>
                  <select className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-xs font-black uppercase outline-none focus:border-indigo-500 transition" value={formData.mode} onChange={e => setFormData({...formData, mode: e.target.value as any})}>
                    <option value="CASH">Cash Drawer</option>
                    <option value="CUB">CUB Bank</option>
                    <option value="KVB">KVB Bank</option>
                  </select>
                </div>
              </div>

              {formData.type === 'IN' ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category / Business</label>
                    <select 
                      className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-xs font-bold outline-none focus:border-indigo-500" 
                      onChange={e => {
                        const val = e.target.value;
                        const cust = customers.find(c => c.id === val);
                        setFormData({...formData, sourceId: val, sourceName: cust ? cust.name : val, category: cust ? 'CUSTOMER_PAYMENT' : val});
                      }}
                    >
                      <option value="">Select Income Source...</option>
                      <optgroup label="Customers">
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                      <optgroup label="Other Businesses">
                        {otherBusinesses.map(b => <option key={b} value={b}>{b}</option>)}
                      </optgroup>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Expense Category</label>
                  <select 
                    className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-xs font-bold outline-none focus:border-indigo-500" 
                    onChange={e => {
                      const val = e.target.value;
                      const sup = suppliers.find(s => s.id === val);
                      setFormData({...formData, sourceId: val, sourceName: sup ? sup.name : val, category: sup ? 'SUPPLIER_PAYMENT' : val});
                    }}
                  >
                    <option value="">Select Expense Type...</option>
                    <optgroup label="Suppliers">
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                    <optgroup label="Operational Expenses">
                      {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </optgroup>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (₹)</label>
                  <input required type="number" className="w-full border-2 border-slate-100 p-3 rounded-2xl text-xl font-display font-black outline-none focus:border-indigo-500 bg-slate-50" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Entry Date</label>
                  <input required type="date" className="w-full border-2 border-slate-100 p-3 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500 bg-slate-50" value={new Date(formData.date!).toISOString().substr(0,10)} onChange={e => setFormData({...formData, date: new Date(e.target.value).getTime()})} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reference / Notes</label>
                <input type="text" className="w-full border-2 border-slate-100 p-3 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500 bg-slate-50" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Bill #, Transaction ID..." />
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-2xl transition">Cancel</button>
                <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-[1.02] transition">Record Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentList;
