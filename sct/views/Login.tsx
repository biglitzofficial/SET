
import React, { useState } from 'react';
import { StaffUser } from '../types';
import { authAPI } from '../services/api';

interface LoginProps {
  onLogin: (user: StaffUser) => void;
  staffUsers: StaffUser[];
}

const Login: React.FC<LoginProps> = ({ onLogin, staffUsers }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.login(username, password);
      onLogin(response.user);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-brand-500 rounded-full blur-[120px] opacity-20 animate-pulse"></div>
         <div className="absolute bottom-[20%] right-[20%] w-80 h-80 bg-accent-violet rounded-full blur-[100px] opacity-20"></div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] shadow-soft border border-white/50 p-10 animate-scaleUp">
          
          <div className="flex flex-col items-center mb-10">
             <img src="/logo.png" alt="Sri Chendur Traders" className="h-24 w-24 object-contain mb-4 drop-shadow-lg" />
             <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Sri Chendur Traders</h1>
             <p className="text-xs font-medium text-slate-400 mt-2 uppercase tracking-widest">Finance Operating System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identity</label>
               <input 
                  type="text" 
                  data-testid="input-username"
                  required 
                  className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition outline-none placeholder-slate-300" 
                  placeholder="Enter Username"
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Passkey</label>
               <input 
                  type="password" 
                  data-testid="input-password"
                  required 
                  className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition outline-none placeholder-slate-300" 
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
               />
             </div>
             
             {error && (
               <div className="text-[11px] font-semibold text-rose-500 bg-rose-50 p-3 rounded-xl flex items-center gap-2 animate-shake">
                 <i className="fas fa-circle-exclamation"></i> {error}
               </div>
             )}

             <button 
                data-testid="btn-login"
                disabled={loading} 
                className="w-full bg-brand-950 text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-brand-900 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-80 disabled:cursor-not-allowed disabled:transform-none"
             >
               {loading ? 'Verifying...' : 'Access Terminal'}
             </button>
          </form>
        </div>
        
        <div className="mt-8 text-center">
           <div className="text-[10px] font-semibold text-slate-400">v2.5.0 • Secure Connection</div>
        </div>
      </div>
    </div>
  );
};

export default Login;
