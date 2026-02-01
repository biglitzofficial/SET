
import { Customer, Supplier, Liability, Invoice, Payment, ChitGroup, Investment } from './types';

export const OPENING_BALANCES = {
  CASH: 0,
  CUB: 0,
  KVB: 0,
  CAPITAL: 0 
};

/**
 * MASTER REGISTRY - SRI CHENDUR TRADERS
 * Updated to match Screenshot Data: Total Royalty = 165,900
 */
export const SAMPLE_CUSTOMERS: Customer[] = [
  // 1. BHARATH-RAPIAPY (15,000)
  { id: 'C_RAP', name: 'BHARATH-RAPIAPY', phone: '6383135635', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 15000, interestPrincipal: 800000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 2. ARUN-B40 (5,000)
  { id: 'C_B40', name: 'ARUN-B40', phone: '9043699695', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 750000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 3. RISHI-B37 (3,000)
  { id: 'C_B37', name: 'RISHI-B37', phone: '9791872301', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 3000, interestPrincipal: 650000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 4. BALAJI-B2 (300)
  { id: 'C_B2', name: 'BALAJI-B2', phone: '9698397923', isRoyalty: true, isInterest: true, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 300, interestPrincipal: 500000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 5. SURENDHAR-B29 (5,000)
  { id: 'C_B29', name: 'SURENDHAR-B29', phone: '7867873720', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 500000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 6. VENKATESH-B9 (20,000)
  { id: 'C_B9', name: 'VENKATESH-B9', phone: '9698737640', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 20000, interestPrincipal: 200000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 7. SABAPATHI-B14 (12,000)
  { id: 'C_B14', name: 'SABAPATHI-B14', phone: '8428645712', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 12000, interestPrincipal: 200000, creditPrincipal: 0, openingBalance: 0, interestRate: 3, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 8. BHARATH-B8 (12,000)
  { id: 'C_B8', name: 'BHARATH-B8', phone: '6383135635', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 12000, interestPrincipal: 100000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 9. MURUGAVEL-B12 (3,000)
  { id: 'C_B12', name: 'MURUGAVEL-B12', phone: '8675111625', isRoyalty: true, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 3000, interestPrincipal: 100000, creditPrincipal: 0, openingBalance: 0, interestRate: 2.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 10. NANDHAKUMAR-B26 (10,000) - CREDITOR
  { id: 'C_B26', name: 'NANDHAKUMAR-B26', phone: '9500908117', isRoyalty: true, isInterest: false, isChit: true, isGeneral: false, isLender: true, royaltyAmount: 10000, interestPrincipal: 0, creditPrincipal: 1500000, openingBalance: 0, interestRate: 1.5, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 11. KRISHNA-B6 (5,000)
  { id: 'C_B6', name: 'KRISHNA-B6', phone: '9999999999', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 12. VISWESWARAN (12,000)
  { id: 'C_VISW', name: 'VISWESWARAN', phone: '8438481202', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 12000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 13. MUGESHWARAN (12,000)
  { id: 'C_MUG', name: 'MUGESHWARAN', phone: '8531070758', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 12000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 14. ARAVIND-B30 (5,000)
  { id: 'C_B30', name: 'ARAVIND-B30', phone: '9080354783', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 15. PRADEEP-B7 (5,000)
  { id: 'C_B7', name: 'PRADEEP-B7', phone: '7904074652', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 16. GURU-B4 (14,600)
  { id: 'C_B4', name: 'GURU-B4', phone: '9600718985', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 14600, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 17. MANIDURAI-B5 (9,000)
  { id: 'C_B5', name: 'MANIDURAI-B5', phone: '9042252332', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 9000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 18. SABAPATHI-B38 (10,000)
  { id: 'C_B38', name: 'SABAPATHI-B38', phone: '8428645712', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 10000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 19. GOWTHAM-B20 (3,000)
  { id: 'C_B20', name: 'GOWTHAM-B20', phone: '7200325713', isRoyalty: true, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 3000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // 20. BHARATH-B1 (5,000)
  { id: 'C_B1', name: 'BHARATH-B1', phone: '6383135635', isRoyalty: true, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 5000, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },

  // --- INTEREST ONLY (Lending Portfolio) ---
  { id: 'C_PREM', name: 'PREM-B30', phone: '8220562721', isRoyalty: false, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 130000, creditPrincipal: 0, openingBalance: 0, interestRate: 3, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_B43', name: 'THIYAGU-B43', phone: '9659439417', isRoyalty: false, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 280000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_MANI', name: 'MANIKANDAN', phone: '7373462849', isRoyalty: false, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 200000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_DILIP', name: 'DILIP', phone: '9363606045', isRoyalty: false, isInterest: true, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 140000, creditPrincipal: 0, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  
  // --- PRIVATE DEBT / CREDITORS ---
  { id: 'C_BOYS', name: 'BOYS FOUNDATION', phone: '9999999999', isRoyalty: false, isInterest: false, isChit: false, isGeneral: false, isLender: true, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 800000, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_PSAI', name: 'PRAKASH SAIESWAR', phone: '7337333386', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: true, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 500000, openingBalance: 0, interestRate: 2, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_GOKUL', name: 'GOKULRAJ', phone: '9790056223', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: true, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 200000, openingBalance: 0, interestRate: 1, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_FRND', name: 'FRIENDS FOUNDATION', phone: '9999999999', isRoyalty: false, isInterest: false, isChit: false, isGeneral: false, isLender: true, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 100000, openingBalance: 0, interestRate: 1, status: 'ACTIVE', createdAt: 1712707200000 },

  // --- PRIMARY CREDITORS ---
  { id: 'C_GOKL', name: 'GOKULRAJ-LENDER', phone: '9000000006', isRoyalty: false, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },

  // --- CHIT ONLY PARTNERS ---
  { id: 'C_HANV', name: 'HANVIKA', phone: '9999999990', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_REALM', name: 'VISWANATHAN-REALME', phone: '9150000790', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_SIRPI', name: 'SIRPIKAA PRADEEP', phone: '9047044199', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_RKSR', name: 'RANJITH-KSR', phone: '9942460722', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_PYEF', name: 'PRASANTH-YEF', phone: '9500812541', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_DVICK', name: 'DINESH VICKEY', phone: '9500800000', isRoyalty: false, isInterest: false, isChit: false, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_SWELL', name: 'SABARI WELLKNOWN', phone: '8428645712', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_KRISN', name: 'KRISHNAN FUND', phone: '9994330006', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_PALLA', name: 'PRAKASH PALLADAM', phone: '9842837444', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },
  { id: 'C_MOUN', name: 'MOUNITH', phone: '9999999999', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: 1712707200000 },

  // --- NEWLY IMPORTED MEMBERS ---
  { id: 'C_AGENT', name: 'AGENT', phone: '9999999999', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: Date.now() },
  { id: 'C_PKAD', name: 'PRAKASH-KADESWARA', phone: '9940976811', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: Date.now() },
  { id: 'C_DFLEX', name: 'DINESH VICKEY FLEX', phone: '7871029999', isRoyalty: false, isInterest: false, isChit: true, isGeneral: false, isLender: false, royaltyAmount: 0, interestPrincipal: 0, creditPrincipal: 0, openingBalance: 0, interestRate: 0, status: 'ACTIVE', createdAt: Date.now() },
];

export const SAMPLE_CHIT_GROUPS: ChitGroup[] = [
  {
    id: 'G_5L',
    name: 'G-5L',
    totalValue: 500000,
    durationMonths: 20,
    monthlyInstallment: 25000,
    commissionPercentage: 5,
    startDate: new Date('2025-04-01').getTime(), // Assumed based on data
    currentMonth: 11, // Up to Jan 2026 is Month 10
    status: 'ACTIVE',
    members: [
      'C_HANV',   // 1
      'C_REALM',  // 2
      'C_B26',    // 3
      'C_PKAD',   // 4
      'C_PKAD',   // 5
      'C_SIRPI',  // 6
      'C_B2',     // 7
      'C_RKSR',   // 8
      'C_B1',     // 9
      'C_AGENT',  // 10
      'C_PSAI',   // 11
      'C_PYEF',   // 12
      'C_DFLEX',  // 13
      'C_SWELL',  // 14
      'C_GOKUL',  // 15
      'C_KRISN',  // 16
      'C_PALLA',  // 17
      'C_HANV',   // 18
      'C_MOUN',   // 19
      'C_MOUN'    // 20
    ],
    auctions: [
      { id: 'AUC_1', month: 1, winnerId: 'C_AGENT', winnerName: 'AGENT', bidAmount: 25000, winnerHand: 475000, commissionAmount: 25000, dividendPerMember: 0, date: new Date('2025-04-10').getTime() },
      { id: 'AUC_2', month: 2, winnerId: 'C_B1', winnerName: 'BHARATH-B1', bidAmount: 153000, winnerHand: 347000, commissionAmount: 25000, dividendPerMember: 6400, date: new Date('2025-05-11').getTime() },
      { id: 'AUC_3', month: 3, winnerId: 'C_RKSR', winnerName: 'RANJITH-KSR', bidAmount: 155000, winnerHand: 345000, commissionAmount: 25000, dividendPerMember: 6500, date: new Date('2025-06-10').getTime() },
      { id: 'AUC_4', month: 4, winnerId: 'C_B2', winnerName: 'BALAJI-B2', bidAmount: 130000, winnerHand: 370000, commissionAmount: 25000, dividendPerMember: 5250, date: new Date('2025-07-10').getTime() },
      { id: 'AUC_5', month: 5, winnerId: 'C_SIRPI', winnerName: 'SIRPIKAA PRADEEP', bidAmount: 116000, winnerHand: 384000, commissionAmount: 25000, dividendPerMember: 4550, date: new Date('2025-08-10').getTime() },
      { id: 'AUC_6', month: 6, winnerId: 'C_PKAD', winnerName: 'PRAKASH-KADESWARA', bidAmount: 128500, winnerHand: 371500, commissionAmount: 25000, dividendPerMember: 5175, date: new Date('2025-09-10').getTime() },
      { id: 'AUC_7', month: 7, winnerId: 'C_PKAD', winnerName: 'PRAKASH-KADESWARA', bidAmount: 144500, winnerHand: 355500, commissionAmount: 25000, dividendPerMember: 5975, date: new Date('2025-10-10').getTime() },
      { id: 'AUC_8', month: 8, winnerId: 'C_B26', winnerName: 'NANDHAKUMAR-B26', bidAmount: 126000, winnerHand: 374000, commissionAmount: 25000, dividendPerMember: 5050, date: new Date('2025-11-10').getTime() },
      { id: 'AUC_9', month: 9, winnerId: 'C_REALM', winnerName: 'VISWANATHAN-REALME', bidAmount: 123000, winnerHand: 377000, commissionAmount: 25000, dividendPerMember: 4900, date: new Date('2025-12-10').getTime() },
      { id: 'AUC_10', month: 10, winnerId: 'C_HANV', winnerName: 'HANVIKA', bidAmount: 96000, winnerHand: 404000, commissionAmount: 25000, dividendPerMember: 3550, date: new Date('2026-01-10').getTime() }
    ]
  }
];

export const SAMPLE_SUPPLIERS: Supplier[] = [];

export const SAMPLE_BANK_LOANS: Liability[] = [];

export const SAMPLE_INVESTMENTS: Investment[] = [];

export const SAMPLE_INVOICES: Invoice[] = [];

export const SAMPLE_PAYMENTS: Payment[] = [];
