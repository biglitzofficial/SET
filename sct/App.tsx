
import React, { useState, useMemo, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Customer, Invoice, Payment, Liability, UserRole, 
  DashboardStats, ChitGroup, Investment, AuditLog, StaffUser, BankAccount 
} from './types';
import { 
  SAMPLE_CUSTOMERS, SAMPLE_BANK_LOANS, 
  SAMPLE_INVOICES, SAMPLE_PAYMENTS, SAMPLE_CHIT_GROUPS,
  OPENING_BALANCES, SAMPLE_INVESTMENTS
} from './constants';
import { customerAPI, invoiceAPI, paymentAPI, reportsAPI, settingsAPI, chitAPI, liabilityAPI, investmentAPI } from './services/api';

// Views - Lazy Loaded
import Login from './views/Login';
const Dashboard = React.lazy(() => import('./views/Dashboard'));
const CustomerList = React.lazy(() => import('./views/CustomerList'));
const InvoiceList = React.lazy(() => import('./views/InvoiceList'));
const AccountsManager = React.lazy(() => import('./views/AccountsManager'));
const LoanList = React.lazy(() => import('./views/LoanList'));
const ReportCenter = React.lazy(() => import('./views/ReportCenter'));
const Settings = React.lazy(() => import('./views/Settings'));
const InvestmentList = React.lazy(() => import('./views/InvestmentList'));
const ChitList = React.lazy(() => import('./views/ChitList'));

// --- COMPONENTS ---

const Sidebar = ({ role, onLogout, user }: { role: UserRole, onLogout: () => void, user: StaffUser | null }) => {
  const location = useLocation();
  
  const NavItem = ({ to, icon, label, exact = false }: { to: string, icon: string, label: string, exact?: boolean }) => {
    const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
    return (
      <Link 
        to={to} 
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
        className={`group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
          isActive 
            ? 'bg-brand-500 text-white shadow-glow shadow-brand-500/30' 
            : 'text-slate-400 hover:bg-white/10 hover:text-white'
        }`}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isActive ? 'bg-white/20' : 'bg-slate-800 group-hover:bg-slate-700'}`}>
           <i className={`fas ${icon} text-sm`}></i>
        </div>
        <span className="text-sm font-semibold tracking-wide">{label}</span>
        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-glow"></div>}
      </Link>
    );
  };

  return (
    <aside className="w-72 h-[96%] my-auto ml-4 rounded-[2.5rem] bg-brand-950 flex flex-col shadow-2xl relative overflow-hidden hidden lg:flex">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand-500 rounded-full blur-[100px] opacity-20"></div>
         <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-brand-950 to-transparent"></div>
      </div>

      {/* Brand */}
      <div className="h-28 flex flex-col justify-center px-8 relative z-10">
        <div className="flex items-center gap-3 mb-1">
           <img src="/logo.png" alt="Sri Chendur Traders" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shadow-lg" />
           <span className="text-white font-display font-bold text-xl tracking-tight">Sri Chendur</span>
        </div>
        <div className="text-[10px] text-slate-400 font-medium tracking-[0.2em] pl-11 uppercase">Finance OS</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-1 custom-scrollbar px-4 pb-4 relative z-10">
        <div className="px-4 mb-2 mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Overview</div>
        <NavItem to="/" icon="fa-chart-pie" label="Dashboard" exact={true} />
        
        <div className="px-4 mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">Operations</div>
        <NavItem to="/accounts" icon="fa-file-invoice-dollar" label="Vouchers" />
        <NavItem to="/invoices" icon="fa-file-invoice" label="Billing" />
        <NavItem to="/customers" icon="fa-address-book" label="Registry" />
        
        <div className="px-4 mb-2 mt-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Assets & Liab</div>
        <NavItem to="/savings" icon="fa-piggy-bank" label="Savings Hub" />
        <NavItem to="/loans" icon="fa-hand-holding-dollar" label="Credit Mgr" />
        <NavItem to="/chits" icon="fa-users-viewfinder" label="Chit Funds" />
        
        <div className="px-4 mb-2 mt-6 text-[10px] font-black uppercase tracking-widest text-slate-500">System</div>
        <NavItem to="/reports/ledger" icon="fa-chart-line" label="Analytics" />
        <NavItem to="/settings" icon="fa-sliders" label="Settings" />
      </nav>

      {/* Profile/Logout */}
      <div className="p-4 relative z-10">
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-colors cursor-pointer">
           <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-brand-400 to-accent-violet flex items-center justify-center text-white font-bold text-xs shadow-md">
                {user?.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">{user?.name}</div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{user?.role}</div>
              </div>
           </div>
           <button onClick={onLogout} data-testid="btn-logout" className="text-slate-400 hover:text-rose-400 transition">
             <i className="fas fa-power-off text-sm"></i>
           </button>
        </div>
      </div>
    </aside>
  );
};

const MobileMenu = ({ isOpen, onClose, role, onLogout, user }: any) => {
  const location = useLocation();
  
  if (!isOpen) return null;
  
  const MobileNavItem = ({ to, icon, label, onClick }: { to: string, icon: string, label: string, onClick?: () => void }) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + '/');
    return (
      <Link 
        to={to} 
        onClick={() => { onClose(); onClick?.(); }}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
          isActive 
            ? 'bg-brand-500 text-white' 
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <i className={`fas ${icon} w-5`}></i>
        <span className="font-medium">{label}</span>
      </Link>
    );
  };
  
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-brand-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="absolute left-0 top-0 bottom-0 w-3/4 max-w-xs bg-brand-950 shadow-2xl overflow-y-auto">
         <div className="p-6">
           {/* Header */}
           <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Sri Chendur Traders" className="h-10 w-10 rounded-xl object-contain bg-white p-0.5 shadow-lg" />
                <span className="text-white font-bold text-lg">Menu</span>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                <i className="fas fa-times text-xl"></i>
              </button>
           </div>

           {/* User Info */}
           {user && (
             <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
               <div className="text-sm font-semibold text-white">{user.name || user.username}</div>
               <div className="text-xs text-slate-400 mt-1">{user.role}</div>
             </div>
           )}

           {/* Navigation */}
           <div className="space-y-2">
              <MobileNavItem to="/" icon="fa-chart-line" label="Dashboard" />
              <MobileNavItem to="/customers" icon="fa-users" label="Customers" />
              <MobileNavItem to="/invoices" icon="fa-file-invoice" label="Invoices" />
              <MobileNavItem to="/accounts" icon="fa-receipt" label="Vouchers" />
              <MobileNavItem to="/savings" icon="fa-piggy-bank" label="Savings" />
              <MobileNavItem to="/loans" icon="fa-hand-holding-usd" label="Loans" />
              <MobileNavItem to="/chits" icon="fa-coins" label="Chit Groups" />
              <MobileNavItem to="/reports" icon="fa-chart-bar" label="Reports" />
              {role === 'OWNER' && (
                <MobileNavItem to="/settings" icon="fa-cog" label="Settings" />
              )}
           </div>

           {/* Logout */}
           <div className="mt-8 pt-6 border-t border-white/10">
             <button 
               onClick={() => { onClose(); onLogout(); }} 
               className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition"
             >
               <i className="fas fa-power-off w-5"></i>
               <span className="font-medium">Sign Out</span>
             </button>
           </div>
         </div>
      </div>
    </div>
  )
}

const Header = ({ onMenuToggle }: { onMenuToggle: () => void }) => (
  <header className="h-20 flex items-center justify-between px-8 flex-shrink-0 z-10">
    <div className="flex items-center gap-4">
       {/* Mobile Menu Button */}
       <button onClick={onMenuToggle} className="lg:hidden text-slate-500 hover:text-brand-600 bg-white p-2 rounded-xl shadow-sm">
         <i className="fas fa-bars text-lg"></i>
       </button>
       
       <div className="hidden md:flex items-center gap-3 bg-white/60 backdrop-blur-md border border-white/50 px-4 py-2 rounded-2xl shadow-sm">
         <div className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
         </div>
         <span className="text-xs font-semibold text-slate-600 tracking-wide">System Operational</span>
       </div>
    </div>

    <div className="flex items-center gap-4">
       <div className="hidden md:block text-right">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today</div>
          <div className="text-xs font-bold text-slate-700">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
       </div>
       <button className="h-10 w-10 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm hover:text-brand-600 hover:shadow-md transition-all">
          <i className="fas fa-bell"></i>
       </button>
    </div>
  </header>
);

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const savedAuth = localStorage.getItem('isAuthenticated');
    return savedAuth === 'true';
  });
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Core Data State
  const [role, setRole] = useState<UserRole>(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser).role : 'OWNER';
  });
  const [expenseCategories, setExpenseCategories] = useState(['Office Rent', 'Staff Salary', 'Transport', 'Electricity', 'Packaging']);
  const [savingCategories, setSavingCategories] = useState(['LIC', 'SIP', 'CHIT_SAVINGS', 'GOLD_SAVINGS', 'FIXED_DEPOSIT']);
  
  const [otherBusinesses, setOtherBusinesses] = useState(['FITO6', 'FITOBOWL', 'TRANSPORT_DIV']);
  const [incomeCategories, setIncomeCategories] = useState(['Salary', 'Commission', 'Incentives']);

  // --- UPDATED STAFF USERS WITH PERMISSIONS ---
  // staffUsers is populated from the backend — no hardcoded credentials
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [openingBalances, setOpeningBalances] = useState(OPENING_BALANCES);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    { id: 'CUB', name: 'CUB', openingBalance: OPENING_BALANCES.CUB, status: 'ACTIVE' },
    { id: 'KVB', name: 'KVB', openingBalance: OPENING_BALANCES.KVB, status: 'ACTIVE' }
  ]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [chitGroups, setChitGroups] = useState<ChitGroup[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Load data from backend after login
  useEffect(() => {
    if (isAuthenticated) {
      loadDataFromBackend();
    }
  }, [isAuthenticated]);

  const loadDataFromBackend = async () => {
    setLoading(true);
    setLoadError(null);

    // Use allSettled so one failing endpoint does NOT blank out everything else
    const [
      customersResult,
      invoicesResult,
      paymentsResult,
      liabilitiesResult,
      chitGroupsResult,
      investmentsResult,
      settingsResult
    ] = await Promise.allSettled([
      customerAPI.getAll(),
      invoiceAPI.getAll(),
      paymentAPI.getAll(),
      liabilityAPI.getAll(),
      chitAPI.getAll(),
      investmentAPI.getAll(),
      settingsAPI.get()
    ]);

    if (customersResult.status === 'fulfilled') setCustomers(customersResult.value);
    if (invoicesResult.status === 'fulfilled') setInvoices(invoicesResult.value);
    if (paymentsResult.status === 'fulfilled') setPayments(paymentsResult.value);
    if (liabilitiesResult.status === 'fulfilled') setLiabilities(liabilitiesResult.value);
    if (chitGroupsResult.status === 'fulfilled') setChitGroups(chitGroupsResult.value);
    if (investmentsResult.status === 'fulfilled') setInvestments(investmentsResult.value);

    if (settingsResult.status === 'fulfilled' && settingsResult.value) {
      const s = settingsResult.value;
      if (s.expenseCategories) setExpenseCategories(s.expenseCategories);
      if (s.savingCategories) setSavingCategories(s.savingCategories);
      if (s.otherBusinesses) setOtherBusinesses(s.otherBusinesses);
      if (s.incomeCategories) setIncomeCategories(s.incomeCategories);
      if (s.bankAccounts) setBankAccounts(s.bankAccounts);
    }

    // Load users and audit logs
    const [usersResult, auditLogsResult] = await Promise.allSettled([
      settingsAPI.getUsers(),
      settingsAPI.getAuditLogs()
    ]);
    if (usersResult.status === 'fulfilled') setStaffUsers(usersResult.value);
    if (auditLogsResult.status === 'fulfilled') setAuditLogs(auditLogsResult.value);

    // If ALL core endpoints failed, the backend is unreachable — show error with retry
    const allCoreFailed = [customersResult, invoicesResult, paymentsResult, liabilitiesResult]
      .every(r => r.status === 'rejected');

    if (allCoreFailed) {
      const firstError = (customersResult as PromiseRejectedResult).reason;
      setLoadError(
        (firstError?.message || 'Could not connect to the server.') +
        ' Please check your connection and try again.'
      );
    }

    setLoading(false);
  };

  // Statistics Calculation (Unchanged logic, just keeping it here)
  const stats: DashboardStats = useMemo(() => {
    const safePayments = payments || [];
    const safeInvoices = invoices.filter(inv => !inv.isVoid);
    const safeCustomers = customers || [];
    const safeInvestments = investments || [];
    const safeLiabilities = liabilities || [];

    const cashInHand = safePayments.reduce((acc, p) => {
        if (p.mode === 'CASH') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
        if (p.voucherType === 'CONTRA' && p.targetMode === 'CASH') return acc + p.amount;
        return acc;
    }, openingBalances.CASH);

    let bankCUB = 0; 
    let bankKVB = 0;

    const cubAccount = bankAccounts.find(b => b.id === 'CUB');
    if (cubAccount) {
        bankCUB = safePayments.reduce((acc, p) => {
            if (p.mode === 'CUB') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
            if (p.voucherType === 'CONTRA' && p.targetMode === 'CUB') return acc + p.amount;
            return acc;
        }, cubAccount.openingBalance);
    }

    const kvbAccount = bankAccounts.find(b => b.id === 'KVB');
    if (kvbAccount) {
        bankKVB = safePayments.reduce((acc, p) => {
            if (p.mode === 'KVB') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
            if (p.voucherType === 'CONTRA' && p.targetMode === 'KVB') return acc + p.amount;
            return acc;
        }, kvbAccount.openingBalance);
    }
    
    const customerBalances = safeCustomers.map(cust => {
        const totalInvoiced = safeInvoices.filter(inv => inv.customerId === cust.id).reduce((acc, inv) => acc + inv.amount, 0);
        const totalPaid = safePayments.filter(p => p.sourceId === cust.id && p.type === 'IN' && p.category !== 'PRINCIPAL_RECOVERY').reduce((acc, p) => acc + p.amount, 0);
        return totalInvoiced - totalPaid;
    });

    const receivableOutstanding = customerBalances.filter(b => b > 0).reduce((acc, b) => acc + b, 0);
    const advancesOwed = Math.abs(customerBalances.filter(b => b < 0).reduce((acc, b) => acc + b, 0));
    const payableOutstanding = safeLiabilities.reduce((acc, l) => acc + l.principal, 0);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthInvoices = safeInvoices.filter(inv => {
      const d = new Date(inv.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const royaltyIncomeMonth = currentMonthInvoices.filter(i => i.type === 'ROYALTY').reduce((acc, i) => acc + i.amount, 0);
    const interestIncomeMonth = currentMonthInvoices.filter(i => i.type === 'INTEREST').reduce((acc, i) => acc + i.amount, 0);
    const chitIncomeMonth = currentMonthInvoices.filter(i => i.type === 'CHIT').reduce((acc, i) => acc + i.amount, 0);

    const expensesMonth = safePayments
      .filter(p => {
        const d = new Date(p.date);
        return p.type === 'OUT' && 
               p.voucherType === 'PAYMENT' &&
               d.getMonth() === currentMonth && d.getFullYear() === currentYear && 
               p.category !== 'LOAN_REPAYMENT';
      })
      .reduce((acc, p) => acc + p.amount, 0);

    const netProfitMonth = (royaltyIncomeMonth + interestIncomeMonth + chitIncomeMonth) - expensesMonth;
    
    const totalInvestments = safeInvestments.reduce((acc, inv) => {
        if (inv.contributionType === 'MONTHLY' || inv.type === 'CHIT_SAVINGS') {
            const totalPaid = inv.transactions?.reduce((sum, t) => sum + t.amountPaid, 0) || 0;
            return acc + totalPaid;
        }
        return acc + (inv.currentValue || inv.amountInvested || 0);
    }, 0);

    return {
      cashInHand, bankCUB, bankKVB, receivableOutstanding, payableOutstanding,
      royaltyIncomeMonth, interestIncomeMonth, chitIncomeMonth, expensesMonth, netProfitMonth,
      totalInvestments, advancesOwed 
    };
  }, [invoices, payments, customers, investments, openingBalances, liabilities, bankAccounts]);

  const handleLogin = (user: StaffUser) => {
    setCurrentUser(user);
    setRole(user.role);
    setIsAuthenticated(true);
    // Persist to localStorage
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('currentUser', JSON.stringify(user));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    // Clear localStorage
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('currentUser');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} staffUsers={staffUsers} />;
  }

  // Full-screen loading while initial data is fetched from backend
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-6">
        <div className="w-14 h-14 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-700">Loading your data...</div>
          <div className="text-xs text-slate-400 mt-1">Please wait while we sync with the server.</div>
        </div>
      </div>
    );
  }

  // Full-screen error with retry if backend was completely unreachable
  if (loadError) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
          <i className="fas fa-plug-circle-xmark text-rose-500 text-2xl"></i>
        </div>
        <div className="text-center max-w-sm">
          <div className="text-lg font-bold text-slate-800">Could not reach the server</div>
          <div className="text-sm text-slate-500 mt-2">{loadError}</div>
        </div>
        <button
          onClick={loadDataFromBackend}
          className="px-6 py-3 bg-brand-600 text-white rounded-2xl font-semibold text-sm hover:bg-brand-700 transition shadow-md"
        >
          <i className="fas fa-rotate-right mr-2"></i>Retry
        </button>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 transition underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="flex h-screen bg-[#F3F4F6] text-slate-800 font-sans overflow-hidden">
        
        <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} role={role} onLogout={handleLogout} user={currentUser} />

        <Sidebar role={role} onLogout={handleLogout} user={currentUser} />
        
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <Header onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
          <main className="flex-1 overflow-y-auto px-4 md:px-8 pb-8 custom-scrollbar scroll-smooth">
            <Suspense fallback={
              <div className="h-full w-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading...</div>
                </div>
              </div>
            }>
              <Routes>
                <Route path="/" element={<Dashboard stats={stats} invoices={invoices} payments={payments} role={role} setRole={setRole} customers={customers} liabilities={liabilities} openingBalances={openingBalances} bankAccounts={bankAccounts} expenseCategories={expenseCategories} otherBusinesses={otherBusinesses} incomeCategories={incomeCategories} />} />
                <Route path="/customers" element={<CustomerList customers={customers} setCustomers={setCustomers} invoices={invoices} payments={payments} setAuditLogs={setAuditLogs} currentUser={currentUser} />} />
                <Route path="/invoices" element={<InvoiceList 
                  invoices={invoices} setInvoices={setInvoices} 
                  customers={customers} chitGroups={chitGroups} 
                  setChitGroups={setChitGroups} liabilities={liabilities}
                  role={role} setAuditLogs={setAuditLogs}
                  currentUser={currentUser} 
                />} />
                <Route path="/accounts" element={<AccountsManager 
                  payments={payments} setPayments={setPayments} 
                  customers={customers} setCustomers={setCustomers}
                  invoices={invoices} setInvoices={setInvoices} 
                  expenseCategories={expenseCategories}
                  otherBusinesses={otherBusinesses}
                  incomeCategories={incomeCategories}
                  role={role}
                  setAuditLogs={setAuditLogs}
                  liabilities={liabilities}
                  setLiabilities={setLiabilities}
                  investments={investments}
                  setInvestments={setInvestments}
                  currentUser={currentUser}
                  openingBalances={openingBalances}
                  setOpeningBalances={setOpeningBalances}
                  bankAccounts={bankAccounts}
                  setBankAccounts={setBankAccounts}
                />} />
                <Route path="/reports/*" element={<ReportCenter 
                  payments={payments} invoices={invoices} customers={customers} 
                  liabilities={liabilities} stats={stats} role={role}
                  auditLogs={auditLogs}
                  openingBalances={openingBalances}
                  otherBusinesses={otherBusinesses}
                  investments={investments}
                  bankAccounts={bankAccounts}
                  chitGroups={chitGroups}
                />} />
                <Route path="/savings" element={<InvestmentList 
                  investments={investments} 
                  setInvestments={setInvestments} 
                  savingCategories={savingCategories} 
                  payments={payments} 
                  setPayments={setPayments} 
                />} />
                <Route path="/loans" element={<LoanList liabilities={liabilities} setLiabilities={setLiabilities} customers={customers} setCustomers={setCustomers} invoices={invoices} payments={payments} setPayments={setPayments} />} />
                <Route path="/chits" element={<ChitList chitGroups={chitGroups} setChitGroups={setChitGroups} customers={customers} invoices={invoices} investments={investments} setInvestments={setInvestments} setPayments={setPayments} setInvoices={setInvoices} currentUser={currentUser} />} />
                <Route path="/settings" element={<Settings 
                  expenseCategories={expenseCategories} setExpenseCategories={setExpenseCategories} 
                  savingCategories={savingCategories} setSavingCategories={setSavingCategories}
                  staffUsers={staffUsers} setStaffUsers={setStaffUsers}
                  customers={customers} setCustomers={setCustomers}
                  invoices={invoices} setInvoices={setInvoices}
                  payments={payments} setPayments={setPayments}
                  chitGroups={chitGroups} setChitGroups={setChitGroups}
                  openingBalances={openingBalances} setOpeningBalances={setOpeningBalances}
                  auditLogs={auditLogs} setAuditLogs={setAuditLogs}
                  otherBusinesses={otherBusinesses} setOtherBusinesses={setOtherBusinesses}
                  incomeCategories={incomeCategories} setIncomeCategories={setIncomeCategories}
                  liabilities={liabilities} setLiabilities={setLiabilities}
                  investments={investments} setInvestments={setInvestments}
                  bankAccounts={bankAccounts} setBankAccounts={setBankAccounts}
                  currentUser={currentUser}
                />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </HashRouter>
  );
};

export default App;
