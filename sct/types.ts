
export type UserRole = 'OWNER' | 'STAFF';

// Changed from union to string to support dynamic bank names
export type PaymentMode = 'CASH' | 'JOURNAL' | string;

export interface BankAccount {
  id: string;
  name: string;
  openingBalance: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface UserPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  // Portfolio Flags
  isRoyalty: boolean;
  isInterest: boolean; // We Lent (Debit)
  isChit: boolean;
  isGeneral: boolean;  // General/Trader
  isLender: boolean;   // They Gave (Credit)
  
  // Financial Values
  royaltyAmount: number;
  interestPrincipal: number; // Asset Side (Lending)
  creditPrincipal: number;   // Liability Side (Borrowing)
  openingBalance: number;    // General Trade Balance (+ for Receivable, - for Payable)
  interestRate: number;
  
  loanStartDate?: number;
  loanEndDate?: number;
  loanRemarks?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  outstanding: number;
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  email: string; // Added for 2FA
  password?: string;
  role: UserRole;
  permissions: UserPermissions; // New Permissions Object
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InvestmentTransaction {
  id: string;
  date: number;
  month: number;
  amountPaid: number;
  dividend: number;
  totalPayable: number;
  notes?: string;
  paymentId?: string; // voucher ID — used to reliably reverse the ledger on delete
}

export interface Investment {
  id: string;
  name: string;
  type: string; 
  provider: string;
  contributionType: 'MONTHLY' | 'LUMP_SUM';
  amountInvested: number;
  currentValue?: number;
  expectedMaturityValue?: number;
  startDate: number;
  maturityDate?: number;
  status: 'ACTIVE' | 'MATURED' | 'CLOSED';
  notes?: string;
  remarks?: string;
  documentUrl?: string;
  
  // Specific for Chit Funds in Savings Hub
  chitConfig?: {
    chitValue: number;
    durationMonths: number;
    monthlyInstallment: number;
    isPrized?: boolean;
    prizeMonth?: number;
    prizeAmount?: number;
    paymentId?: string | null; // voucher ID of prize receipt — for reliable reversal
  };
  transactions?: InvestmentTransaction[];
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: 'CREATE' | 'EDIT' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT';
  entityType: 'PAYMENT' | 'INVOICE' | 'CUSTOMER' | 'LOAN' | 'CHIT' | 'INVESTMENT' | 'SETTINGS' | 'USER';
  entityId: string;
  description: string;
  performedBy: UserRole;
  userId?: string; // User ID who performed the action
  userName?: string; // User name for display
  oldData?: string;
  newData?: string;
  ipAddress?: string;
  changes?: string; // Summary of what changed
}

export interface ChitAuction {
  id: string;
  month: number;
  winnerId: string;
  winnerName: string;
  bidAmount: number; 
  winnerHand: number; 
  commissionAmount: number;
  dividendPerMember: number;
  date: number;
}

export interface ChitGroup {
  id: string;
  name: string;
  totalValue: number;
  durationMonths: number;
  monthlyInstallment: number;
  commissionPercentage: number;
  startDate: number;
  currentMonth: number;
  members: string[];
  auctions: ChitAuction[];
  status: 'ACTIVE' | 'COMPLETED';
}

export type InvoiceType = 'ROYALTY' | 'INTEREST' | 'CHIT' | 'INTEREST_OUT';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string; 
  lenderId?: string;   
  customerName: string;
  type: InvoiceType;
  direction: 'IN' | 'OUT'; 
  amount: number;
  date: number;
  dueDate?: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  balance: number;
  category?: string;
  notes?: string;
  isVoid?: boolean; // Audit tracking
  relatedAuctionId?: string; // Links this invoice to a specific Chit Auction for cascade delete
}

export type VoucherType = 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL';

export interface Payment {
  id: string;
  type: 'IN' | 'OUT';
  voucherType: VoucherType;
  sourceId: string;
  sourceName: string;
  amount: number;
  mode: PaymentMode;
  targetMode?: PaymentMode;
  date: number;
  invoiceId?: string;
  notes?: string;
  category: string; 
  businessUnit?: string; // For "General Category" tracking (e.g., FITO6, FITOBOWL)
  relatedAuctionId?: string; // Links this payment to a specific Chit Auction if paid directly
}

export interface Liability {
  id: string;
  providerName: string; // Or Bank Name
  bankBranch?: string;
  accountNumber?: string;
  phone?: string;
  type: 'BANK' | 'PRIVATE';
  principal: number;
  interestRate: number; 
  emiAmount?: number;
  startDate: number;
  endDate?: number;
  remarks?: string;
  tenureMonths: number;
  remainingBalance: number;
  status: 'ACTIVE' | 'CLOSED';
}

export interface DashboardStats {
  cashInHand: number;
  bankCUB: number;
  bankKVB: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  royaltyIncomeMonth: number;
  interestIncomeMonth: number;
  chitIncomeMonth: number;
  expensesMonth: number;
  netProfitMonth: number;
  totalInvestments: number; 
  advancesOwed: number;
}
