
import React, { useState } from 'react';
import { Supplier, Payment } from '../types';

interface SupplierListProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  payments: Payment[];
}

const SupplierList: React.FC<SupplierListProps> = ({ suppliers, setSuppliers, payments }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({ name: '', phone: '', outstanding: 0 });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setSuppliers([...suppliers, { ...formData as Supplier, id: Math.random().toString(36).substr(2, 9) }]);
    setShowForm(false);
    setFormData({ name: '', phone: '', outstanding: 0 });
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Suppliers & Payables</h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Vendor Management</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl hover:bg-slate-800 transition flex items-center gap-2 shadow-lg font-black text-xs uppercase tracking-widest">
          <i className="fas fa-plus"></i> Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {suppliers.map(sup => (
          <div key={sup.id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start mb-6">
              <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <i className="fas fa-truck-field text-2xl"></i>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Outstanding</div>
                <div className="text-2xl font-display font-black text-rose-600 italic tracking-tighter">₹{sup.outstanding.toLocaleString()}</div>
              </div>
            </div>
            <h3 className="font-display font-black text-slate-900 text-xl uppercase italic tracking-tighter mb-1">{sup.name}</h3>
            <p className="text-xs font-bold text-slate-400 mb-6">{sup.phone}</p>
            <div className="flex gap-3">
              <button className="flex-1 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-100 transition">Pay Now</button>
              <button className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition">History</button>
            </div>
          </div>
        ))}
      </div>

       {showForm && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-md animate-scaleUp">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-display font-black text-slate-900 uppercase italic tracking-tighter">Add Supplier</h3>
               <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-rose-500"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Company/Name</label>
                <input required type="text" className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-sm font-bold outline-none focus:border-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Phone</label>
                <input required type="text" className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-sm font-bold outline-none focus:border-indigo-500" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Opening Outstanding (₹)</label>
                <input type="number" className="w-full border-2 border-slate-100 p-3 rounded-2xl bg-slate-50 text-xl font-display font-black text-rose-600 outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={formData.outstanding} onChange={e => setFormData({...formData, outstanding: Number(e.target.value)})} />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">Cancel</button>
                <button type="submit" className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-lg">Save Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierList;
