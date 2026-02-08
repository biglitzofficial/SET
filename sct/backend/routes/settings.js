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

// Clear all data (DANGEROUS - OWNER only)
router.delete('/clear-all-data', [
  authenticate,
  authorize('OWNER')
], async (req, res) => {
  try {
    const { confirmationText } = req.body;
    
    // Require confirmation text to prevent accidental deletion
    if (confirmationText !== 'DELETE ALL DATA') {
      return res.status(400).json({ 
        error: { message: 'Invalid confirmation text. Must be exactly: DELETE ALL DATA' } 
      });
    }

    // Log this critical action BEFORE deletion
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CLEAR_ALL_DATA',
      entityType: 'SYSTEM',
      description: `User ${req.user.name} (${req.user.username}) cleared all system data`,
      performedBy: req.user.role,
      userId: req.user.id,
      critical: true
    });

    // Delete collections in batch
    const collectionsToDelete = [
      COLLECTIONS.CUSTOMERS,
      COLLECTIONS.INVOICES,
      COLLECTIONS.PAYMENTS,
      COLLECTIONS.LIABILITIES,
      COLLECTIONS.INVESTMENTS,
      COLLECTIONS.CHIT_GROUPS
      // Note: NOT deleting USERS, SETTINGS, BANK_ACCOUNTS, or current AUDIT_LOGS
    ];

    let totalDeleted = 0;

    for (const collectionName of collectionsToDelete) {
      const snapshot = await db.collection(collectionName).get();
      
      // Delete in batches of 500 (Firestore limit)
      const batches = [];
      let batch = db.batch();
      let count = 0;

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
        totalDeleted++;

        if (count === 500) {
          batches.push(batch.commit());
          batch = db.batch();
          count = 0;
        }
      });

      // Commit remaining batch
      if (count > 0) {
        batches.push(batch.commit());
      }

      await Promise.all(batches);
    }

    // Log completion
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CLEAR_ALL_DATA_COMPLETE',
      entityType: 'SYSTEM',
      description: `Data clearing completed. ${totalDeleted} documents deleted`,
      performedBy: req.user.role,
      userId: req.user.id,
      deletedCount: totalDeleted
    });

    res.json({ 
      message: 'All data cleared successfully',
      deletedCount: totalDeleted,
      collections: collectionsToDelete
    });

  } catch (error) {
    console.error('Clear all data error:', error);
    
    // Log the failure
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CLEAR_ALL_DATA_FAILED',
      entityType: 'SYSTEM',
      description: `Data clearing failed: ${error.message}`,
      performedBy: req.user.role,
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({ error: { message: 'Failed to clear data' } });
  }
});

export default router;
