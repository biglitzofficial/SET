import express from 'express';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all settings
router.get('/', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.SETTINGS).doc('app_settings').get();
    
    if (!doc.exists) {
      // Return default settings
      return res.json({
        expenseCategories: ['Office Rent', 'Staff Salary', 'Transport', 'Electricity', 'Packaging'],
        savingCategories: ['LIC', 'SIP', 'CHIT_SAVINGS', 'GOLD_SAVINGS', 'FIXED_DEPOSIT'],
        otherBusinesses: ['FITO6', 'FITOBOWL', 'TRANSPORT_DIV'],
        incomeCategories: ['Salary', 'Commission', 'Incentives'],
        openingBalances: { CASH: 0, CUB: 0, KVB: 0, CAPITAL: 0 }
      });
    }

    res.json(doc.data());
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch settings' } });
  }
});

// Update settings
router.put('/', [
  authenticate,
  authorize('OWNER')
], async (req, res) => {
  try {
    const settingsRef = db.collection(COLLECTIONS.SETTINGS).doc('app_settings');
    
    await settingsRef.set({
      ...req.body,
      updatedAt: Date.now(),
      updatedBy: req.user.id
    }, { merge: true });

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: { message: 'Failed to update settings' } });
  }
});

// Get all users (staff)
router.get('/users', [
  authenticate,
  authorize('OWNER')
], async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.USERS).get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      delete data.password; // Don't send passwords
      return { id: doc.id, ...data };
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch users' } });
  }
});

// Get bank accounts
router.get('/bank-accounts', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.BANK_ACCOUNTS).get();
    const bankAccounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(bankAccounts);
  } catch (error) {
    console.error('Get bank accounts error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch bank accounts' } });
  }
});

// Update bank account
router.put('/bank-accounts/:id', [
  authenticate,
  authorize('OWNER')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.BANK_ACCOUNTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Bank account not found' } });
    }

    await docRef.update({
      ...req.body,
      updatedAt: Date.now()
    });

    res.json({ message: 'Bank account updated successfully' });
  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({ error: { message: 'Failed to update bank account' } });
  }
});

// Get audit logs
router.get('/audit-logs', authenticate, async (req, res) => {
  try {
    const { limit = 100, entityType, action } = req.query;
    
    let query = db.collection(COLLECTIONS.AUDIT_LOGS)
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit));

    if (entityType) {
      query = query.where('entityType', '==', entityType);
    }
    if (action) {
      query = query.where('action', '==', action);
    }

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch audit logs' } });
  }
});

export default router;
