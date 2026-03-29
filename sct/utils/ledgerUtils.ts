/**
 * Shared ledger calculation utilities.
 * MUST be used everywhere we compute customer/party net balance to ensure consistency.
 *
 * Key rules:
 * - PRINCIPAL_RECOVERY: Excluded from payIN — already reflected in interestPrincipal
 * - LOAN_TAKEN: Excluded from payIN — already reflected in creditPrincipal
 */

export interface PaymentLike {
  sourceId?: string;
  type: string;
  category?: string;
  amount: number;
}

/** Opening balance formula: interestPrincipal + openingBalance - creditPrincipal */
export function computeOpening(cust: {
  interestPrincipal?: number;
  openingBalance?: number;
  creditPrincipal?: number;
}): number {
  return (cust.interestPrincipal || 0) + (cust.openingBalance || 0) - (cust.creditPrincipal || 0);
}

/** Filter for payIN — EXCLUDES PRINCIPAL_RECOVERY and LOAN_TAKEN (already in interestPrincipal/creditPrincipal) */
export const PAYIN_EXCLUDE_CATEGORIES = ['PRINCIPAL_RECOVERY', 'LOAN_TAKEN'] as const;

/**
 * Sum of IN payments for ledger — use for payIN in netLedger formula.
 * Pass payments already filtered by sourceId.
 */
export function sumPaymentsInForLedger(payments: PaymentLike[]): number {
  return payments
    .filter(
      (p) =>
        p.type === 'IN' &&
        !PAYIN_EXCLUDE_CATEGORIES.includes((p.category || '') as any)
    )
    .reduce((s, p) => s + p.amount, 0);
}

/**
 * Net ledger balance formula — MUST match Party Ledger, Registry, OutstandingReports.
 * netLedger = (opening + invIN + payOUT) - (invOUT + payIN)
 * with payIN excluding PRINCIPAL_RECOVERY and LOAN_TAKEN.
 */
export function computeNetLedger(params: {
  opening: number;
  invIN: number;
  invOUT: number;
  payIN: number; // must already exclude PRINCIPAL_RECOVERY and LOAN_TAKEN
  payOUT: number;
}): number {
  const { opening, invIN, invOUT, payIN, payOUT } = params;
  return (opening + invIN + payOUT) - (invOUT + payIN);
}

/** Match OutstandingReports / Party Ledger: same person as customer + liability */
export function normalizePartyName(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s*\(lender\)\s*$/i, '');
}

export function findMatchingLiabilityForCustomer(
  customerName: string,
  liabilities: { id: string; providerName: string; status: string }[]
): { id: string; providerName: string; status: string; principal: number } | undefined {
  const n = normalizePartyName(customerName);
  return liabilities.find(
    (l) => l.status === 'ACTIVE' && normalizePartyName(l.providerName) === n
  ) as any;
}

/** Lender-side loan remaining + interest-out net (same as OutstandingReports merge) */
export function computeLiabilityExposure(
  lia: { id: string; principal: number },
  invoices: { lenderId?: string; type?: string; isVoid?: boolean; amount: number }[],
  payments: PaymentLike[]
): { remaining: number; lenderInterestOutNet: number; liaAmount: number } {
  const paidOut = payments
    .filter((p) => p.type === 'OUT' && p.sourceId === lia.id)
    .reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, lia.principal - paidOut);
  const interestOutAmt = invoices
    .filter((i) => i.lenderId === lia.id && i.type === 'INTEREST_OUT' && !i.isVoid)
    .reduce((s, i) => s + i.amount, 0);
  const interestOutPaid = payments
    .filter((p) => p.sourceId === lia.id && p.type === 'OUT' && p.category === 'LOAN_INTEREST')
    .reduce((s, p) => s + p.amount, 0);
  const lenderInterestOutNet = Math.max(0, interestOutAmt - interestOutPaid);
  return { remaining, lenderInterestOutNet, liaAmount: remaining + lenderInterestOutNet };
}
