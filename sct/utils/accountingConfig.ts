/**
 * Accounting configuration: Journal account head mapping to Balance Sheet / P&L categories.
 * Used to integrate Journal entries into financial reports.
 */

import { JournalLine } from '../types';

export type JournalAccountType = 
  | 'CASH' 
  | 'BANK' 
  | 'CAPITAL' 
  | 'DRAWINGS'
  | 'RETAINED_EARNINGS'
  | 'INCOME_ROYALTY' 
  | 'INCOME_INTEREST' 
  | 'INCOME_CHIT' 
  | 'INCOME_DIRECT'
  | 'EXPENSE_OPERATING'
  | 'EXPENSE_SALARY'
  | 'EXPENSE_OFFICE'
  | 'EXPENSE_TRAVEL'
  | 'EXPENSE_INTEREST'
  | 'LIABILITY_CREDITOR'
  | 'LIABILITY_INTEREST_PAYABLE'
  | 'ASSET_RECEIVABLE'
  | 'ASSET_PRINCIPAL_LENT'
  | 'OTHER';

// Map Journal account head names (case-insensitive match) to account type
const ACCOUNT_HEAD_MAP: Record<string, JournalAccountType> = {
  'cash': 'CASH',
  'bank - cub': 'BANK',
  'bank - kvb': 'BANK',
  'capital account': 'CAPITAL',
  'royalty receivable': 'ASSET_RECEIVABLE',
  'interest receivable': 'ASSET_RECEIVABLE',
  'chit receivable': 'ASSET_RECEIVABLE',
  'general receivable': 'ASSET_RECEIVABLE',
  'royalty income': 'INCOME_ROYALTY',
  'interest income': 'INCOME_INTEREST',
  'chit income': 'INCOME_CHIT',
  'direct income': 'INCOME_DIRECT',
  'operating expense': 'EXPENSE_OPERATING',
  'staff salary': 'EXPENSE_SALARY',
  'office expense': 'EXPENSE_OFFICE',
  'travel expense': 'EXPENSE_TRAVEL',
  'interest payable': 'LIABILITY_INTEREST_PAYABLE',
  'creditor account': 'LIABILITY_CREDITOR',
  'debtor account': 'ASSET_RECEIVABLE',
  'principal lent': 'ASSET_PRINCIPAL_LENT',
  'principal received': 'LIABILITY_CREDITOR',
  'suspense account': 'OTHER',
  'profit & loss': 'RETAINED_EARNINGS',
  'drawings': 'DRAWINGS',
  'owner drawings': 'DRAWINGS',
};

// Bank name extraction from account head (e.g. "Bank - CUB" -> "CUB")
const BANK_HEAD_PATTERN = /^bank\s*[-–]\s*(.+)$/i;

export function getJournalAccountType(head: string): { type: JournalAccountType; bankName?: string } {
  const normalized = (head || '').trim().toLowerCase();
  const mapped = ACCOUNT_HEAD_MAP[normalized];
  if (mapped) {
    if (mapped === 'BANK') {
      const match = normalized.match(BANK_HEAD_PATTERN);
      return { type: mapped, bankName: match ? match[1].trim().toUpperCase() : 'CUB' };
    }
    return { type: mapped };
  }
  // Fallback: check if it's a bank account (dynamic banks)
  const bankMatch = normalized.match(BANK_HEAD_PATTERN);
  if (bankMatch) {
    return { type: 'BANK', bankName: bankMatch[1].trim() };
  }
  return { type: 'OTHER' };
}

export interface JournalEffects {
  cash: number;
  bankBalances: Record<string, number>;
  capital: number;
  drawings: number;
  retainedEarnings: number;
  incomeRoyalty: number;
  incomeInterest: number;
  incomeChit: number;
  incomeDirect: number;
  expenseOperating: number;
  expenseSalary: number;
  expenseOffice: number;
  expenseTravel: number;
  expenseInterest: number;
  receivable: number;
  principalLent: number;
  liabilityCreditor: number;
  liabilityInterestPayable: number;
}

export function computeJournalEffects(journals: { lines: JournalLine[] }[]): JournalEffects {
  const effects: JournalEffects = {
    cash: 0,
    bankBalances: {},
    capital: 0,
    drawings: 0,
    retainedEarnings: 0,
    incomeRoyalty: 0,
    incomeInterest: 0,
    incomeChit: 0,
    incomeDirect: 0,
    expenseOperating: 0,
    expenseSalary: 0,
    expenseOffice: 0,
    expenseTravel: 0,
    expenseInterest: 0,
    receivable: 0,
    principalLent: 0,
    liabilityCreditor: 0,
    liabilityInterestPayable: 0,
  };

  for (const entry of journals) {
    for (const line of entry.lines || []) {
      const dr = line.debit || 0;
      const cr = line.credit || 0;
      const net = dr - cr;
      const { type, bankName } = getJournalAccountType(line.accountHead || '');

      switch (type) {
        case 'CASH': effects.cash += net; break;
        case 'BANK':
          if (bankName) {
            effects.bankBalances[bankName] = (effects.bankBalances[bankName] || 0) + net;
          }
          break;
        case 'CAPITAL': effects.capital += cr - dr; break;
        case 'INCOME_ROYALTY': effects.incomeRoyalty += cr - dr; break;
        case 'INCOME_INTEREST': effects.incomeInterest += cr - dr; break;
        case 'INCOME_CHIT': effects.incomeChit += cr - dr; break;
        case 'INCOME_DIRECT': effects.incomeDirect += cr - dr; break;
        case 'EXPENSE_OPERATING': effects.expenseOperating += dr - cr; break;
        case 'EXPENSE_SALARY': effects.expenseSalary += dr - cr; break;
        case 'EXPENSE_OFFICE': effects.expenseOffice += dr - cr; break;
        case 'EXPENSE_TRAVEL': effects.expenseTravel += dr - cr; break;
        case 'EXPENSE_INTEREST': effects.expenseInterest += dr - cr; break;
        case 'ASSET_RECEIVABLE': effects.receivable += dr - cr; break;
        case 'ASSET_PRINCIPAL_LENT': effects.principalLent += dr - cr; break;
        case 'LIABILITY_CREDITOR': effects.liabilityCreditor += cr - dr; break;
        case 'LIABILITY_INTEREST_PAYABLE': effects.liabilityInterestPayable += cr - dr; break;
        case 'RETAINED_EARNINGS': effects.retainedEarnings += cr - dr; break;
        case 'DRAWINGS': effects.drawings += dr - cr; break;
        default: break;
      }
    }
  }

  return effects;
}
