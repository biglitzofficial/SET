import express from 'express';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Dashboard stats
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const [customersSnap, invoicesSnap, paymentsSnap, liabilitiesSnap, investmentsSnap, bankAccountsSnap, settingsSnap] = await Promise.all([
      db.collection(COLLECTIONS.CUSTOMERS).get(),
      db.collection(COLLECTIONS.INVOICES).where('isVoid', '==', false).get(),
      db.collection(COLLECTIONS.PAYMENTS).get(),
      db.collection(COLLECTIONS.LIABILITIES).get(),
      db.collection(COLLECTIONS.INVESTMENTS).get(),
      db.collection(COLLECTIONS.BANK_ACCOUNTS).get(),
      db.collection(COLLECTIONS.SETTINGS).doc('app_settings').get()
    ]);

    const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const liabilities = liabilitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const investments = investmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const bankAccounts = bankAccountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const settings = settingsSnap.exists ? settingsSnap.data() : { openingBalances: { CASH: 0, CUB: 0, KVB: 0 } };

    // Calculate stats
    const cashInHand = payments.reduce((acc, p) => {
      if (p.mode === 'CASH') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
      if (p.voucherType === 'CONTRA' && p.targetMode === 'CASH') return acc + p.amount;
      return acc;
    }, settings.openingBalances?.CASH || 0);

    let bankCUB = 0;
    let bankKVB = 0;

    const cubAccount = bankAccounts.find(b => b.id === 'CUB');
    if (cubAccount) {
      bankCUB = payments.reduce((acc, p) => {
        if (p.mode === 'CUB') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
        if (p.voucherType === 'CONTRA' && p.targetMode === 'CUB') return acc + p.amount;
        return acc;
      }, cubAccount.openingBalance);
    }

    const kvbAccount = bankAccounts.find(b => b.id === 'KVB');
    if (kvbAccount) {
      bankKVB = payments.reduce((acc, p) => {
        if (p.mode === 'KVB') return p.type === 'IN' ? acc + p.amount : acc - p.amount;
        if (p.voucherType === 'CONTRA' && p.targetMode === 'KVB') return acc + p.amount;
        return acc;
      }, kvbAccount.openingBalance);
    }

    const customerBalances = customers.map(cust => {
      const totalInvoiced = invoices.filter(inv => inv.customerId === cust.id).reduce((acc, inv) => acc + inv.amount, 0);
      const totalPaid = payments.filter(p => p.sourceId === cust.id && p.type === 'IN' && p.category !== 'PRINCIPAL_RECOVERY').reduce((acc, p) => acc + p.amount, 0);
      return totalInvoiced - totalPaid;
    });

    const receivableOutstanding = customerBalances.filter(b => b > 0).reduce((acc, b) => acc + b, 0);
    const advancesOwed = Math.abs(customerBalances.filter(b => b < 0).reduce((acc, b) => acc + b, 0));
    const payableOutstanding = liabilities.reduce((acc, l) => acc + l.principal, 0);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthInvoices = invoices.filter(inv => {
      const d = new Date(inv.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const royaltyIncomeMonth = currentMonthInvoices.filter(i => i.type === 'ROYALTY').reduce((acc, i) => acc + i.amount, 0);
    const interestIncomeMonth = currentMonthInvoices.filter(i => i.type === 'INTEREST').reduce((acc, i) => acc + i.amount, 0);
    const chitIncomeMonth = currentMonthInvoices.filter(i => i.type === 'CHIT').reduce((acc, i) => acc + i.amount, 0);

    const expensesMonth = payments
      .filter(p => {
        const d = new Date(p.date);
        return p.type === 'OUT' && 
               p.voucherType === 'PAYMENT' &&
               d.getMonth() === currentMonth && d.getFullYear() === currentYear && 
               p.category !== 'LOAN_REPAYMENT';
      })
      .reduce((acc, p) => acc + p.amount, 0);

    const netProfitMonth = (royaltyIncomeMonth + interestIncomeMonth + chitIncomeMonth) - expensesMonth;

    const totalInvestments = investments.reduce((acc, inv) => {
      if (inv.contributionType === 'MONTHLY' || inv.type === 'CHIT_SAVINGS') {
        const totalPaid = inv.transactions?.reduce((sum, t) => sum + t.amountPaid, 0) || 0;
        return acc + totalPaid;
      }
      return acc + (inv.currentValue || inv.amountInvested || 0);
    }, 0);

    res.json({
      cashInHand,
      bankCUB,
      bankKVB,
      receivableOutstanding,
      payableOutstanding,
      royaltyIncomeMonth,
      interestIncomeMonth,
      chitIncomeMonth,
      expensesMonth,
      netProfitMonth,
      totalInvestments,
      advancesOwed
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: { message: 'Failed to generate dashboard stats' } });
  }
});

// General Ledger
router.get('/general-ledger', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, mode } = req.query;
    
    let query = db.collection(COLLECTIONS.PAYMENTS).orderBy('date', 'desc');

    const snapshot = await query.get();
    let payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Apply filters
    if (startDate) {
      payments = payments.filter(p => p.date >= parseInt(startDate));
    }
    if (endDate) {
      payments = payments.filter(p => p.date <= parseInt(endDate));
    }
    if (mode) {
      payments = payments.filter(p => p.mode === mode || p.targetMode === mode);
    }

    res.json(payments);
  } catch (error) {
    console.error('General ledger error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch general ledger' } });
  }
});

// Outstanding reports
router.get('/outstanding', authenticate, async (req, res) => {
  try {
    const { type } = req.query; // 'receivables' or 'payables'
    
    const [customersSnap, invoicesSnap, paymentsSnap, liabilitiesSnap] = await Promise.all([
      db.collection(COLLECTIONS.CUSTOMERS).get(),
      db.collection(COLLECTIONS.INVOICES).where('isVoid', '==', false).get(),
      db.collection(COLLECTIONS.PAYMENTS).get(),
      db.collection(COLLECTIONS.LIABILITIES).where('status', '==', 'ACTIVE').get()
    ]);

    const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const liabilities = liabilitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (type === 'receivables') {
      const receivables = customers.map(cust => {
        const custInvoices = invoices.filter(inv => inv.customerId === cust.id);
        const totalInvoiced = custInvoices.reduce((acc, inv) => acc + inv.amount, 0);
        const totalOutstanding = custInvoices.reduce((acc, inv) => acc + inv.balance, 0);
        const totalPaid = totalInvoiced - totalOutstanding;

        return {
          customerId: cust.id,
          customerName: cust.name,
          phone: cust.phone,
          totalInvoiced,
          totalPaid,
          totalOutstanding: totalOutstanding + (cust.openingBalance || 0)
        };
      }).filter(r => r.totalOutstanding > 0);

      return res.json(receivables);
    }

    if (type === 'payables') {
      const payables = liabilities.map(liability => ({
        id: liability.id,
        providerName: liability.providerName,
        type: liability.type,
        principal: liability.principal,
        remainingBalance: liability.remainingBalance,
        interestRate: liability.interestRate
      }));

      return res.json(payables);
    }

    res.status(400).json({ error: { message: 'Invalid type parameter' } });
  } catch (error) {
    console.error('Outstanding reports error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch outstanding reports' } });
  }
});

export default router;
