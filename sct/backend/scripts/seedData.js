// Sample data from frontend constants
export const OPENING_BALANCES = {
  CASH: 0,
  CUB: 0,
  KVB: 0,
  CAPITAL: 0 
};

export const SAMPLE_CUSTOMERS = [
  // Royalty + Interest
  { id: 'C_RAP', name: 'BHARATH-RAPIAPY', phone: '6383135635', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 15000, interestPrincipal: 800000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_B40', name: 'ARUN-B40', phone: '9043699695', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 750000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_B37', name: 'RISHI-B37', phone: '9791872301', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 3000, interestPrincipal: 650000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_B2', name: 'BALAJI-B2', phone: '9698397923', isRoyalty: true, isInterest: true, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 300, interestPrincipal: 500000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_B29', name: 'SURENDHAR-B29', phone: '7867873720', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 500000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // Royalty + Lender
  { id: 'C_B26', name: 'NANDHAKUMAR-B26', phone: '9500908117', isRoyalty: true, isInterest: false, isChit: true, isGeneral: false, isLender: true, royaltyAmount: 10000, interestPrincipal: 0, creditPrincipal: 1500000, openingBalance: 0, interestRate: 1.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // Royalty only
  { id: 'C_B6', name: 'KRISHNA-B6', phone: '9999999999', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // Interest only
  { id: 'C_PREM', name: 'PREM-B30', phone: '8220562721', isRoyalty: false, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 130000, creditPrincipal: 0, openingBalance: 0, interestRate: 3, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // Lenders
  { id: 'C_BOYS', name: 'BOYS FOUNDATION', phone: '9999999999', isRoyalty: false, isInterest: false, isChit: false, isGeneral: false, isLender: true, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 800000, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // Chit only
  { id: 'C_HANV', name: 'HANVIKA', phone: '9999999990', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 }
];

export const SAMPLE_CHIT_GROUPS = [
  {
    name: 'G-5L',
    totalValue: 500000,
    durationMonths: 20,
    monthlyInstallment: 25000,
    commissionPercentage: 5,
    startDate: new Date('2025-04-01').getTime(),
    currentMonth: 10,
    status: 'ACTIVE',
    members: [
      'C_HANV', 'C_B26', 'C_B2', 'C_HANV'
    ],
    auctions: [
      { id: 'AUC_1', month: 1, winnerId: 'C_HANV', winnerName: 'HANVIKA', bidAmount: 25000, winnerHand: 475000, commissionAmount: 25000, dividendPerMember: 0, date: new Date('2025-04-10').getTime() }
    ]
  }
];
