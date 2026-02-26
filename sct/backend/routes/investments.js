import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all investments
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, status, contributionType } = req.query;
    
    let query = db.collection(COLLECTIONS.INVESTMENTS);
    
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (contributionType) {
      query = query.where('contributionType', '==', contributionType);
    }

    const snapshot = await query.orderBy('startDate', 'desc').get();
    const investments = snapshot.docs.map(doc => {
      const { id: _ignored, ...data } = doc.data();
      return { id: doc.id, ...data };
    });

    res.json(investments);
  } catch (error) {
    console.error('Get investments error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch investments' } });
  }
});

// Get single investment
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.INVESTMENTS).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Investment not found' } });
    }

    const { id: _ignored, ...docData } = doc.data();
    res.json({ id: doc.id, ...docData });
  } catch (error) {
    console.error('Get investment error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch investment' } });
  }
});

// Create investment
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('name').notEmpty().trim(),
  body('type').notEmpty(),
  body('contributionType').isIn(['MONTHLY', 'LUMP_SUM']),
  body('amountInvested').isFloat({ min: 0 }),
  body('startDate').isInt(),
  body('status').isIn(['ACTIVE', 'MATURED', 'CLOSED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: clientId, ...bodyData } = req.body;

    const investmentData = {
      ...bodyData,
      transactions: bodyData.transactions || [],
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    // Use client-provided ID as Firestore document ID so IDs always match
    const docId = clientId || db.collection(COLLECTIONS.INVESTMENTS).doc().id;
    const docRef = db.collection(COLLECTIONS.INVESTMENTS).doc(docId);
    await docRef.set(investmentData);
    
    res.status(201).json({ 
      id: docId, 
      ...investmentData 
    });
  } catch (error) {
    console.error('Create investment error:', error);
    res.status(500).json({ error: { message: 'Failed to create investment' } });
  }
});

// Update investment
router.put('/:id', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.INVESTMENTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Investment not found' } });
    }

    const { id: _id, ...bodyData } = req.body;

    const updateData = {
      ...bodyData,
      updatedAt: Date.now(),
      updatedBy: req.user.id
    };

    await docRef.set(updateData, { merge: true });

    const { id: _docId, ...existingData } = doc.data();
    res.json({ 
      id: req.params.id, 
      ...existingData,
      ...updateData 
    });
  } catch (error) {
    console.error('Update investment error:', error);
    res.status(500).json({ error: { message: 'Failed to update investment' } });
  }
});

// Add transaction to investment
router.post('/:id/transactions', [
  authenticate,
  checkPermission('canEdit'),
  body('date').isInt(),
  body('month').isInt(),
  body('amountPaid').isFloat({ min: 0 }),
  body('dividend').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const docRef = db.collection(COLLECTIONS.INVESTMENTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Investment not found' } });
    }

    const investment = doc.data();
    const newTransaction = {
      id: Math.random().toString(36).substr(2, 9),
      ...req.body
    };

    const updatedTransactions = [...(investment.transactions || []), newTransaction];

    await docRef.update({
      transactions: updatedTransactions,
      updatedAt: Date.now()
    });

    res.status(201).json(newTransaction);
  } catch (error) {
    console.error('Add transaction error:', error);
    res.status(500).json({ error: { message: 'Failed to add transaction' } });
  }
});

// Delete investment
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.INVESTMENTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Investment not found' } });
    }

    await docRef.delete();

    res.json({ message: 'Investment deleted successfully' });
  } catch (error) {
    console.error('Delete investment error:', error);
    res.status(500).json({ error: { message: 'Failed to delete investment' } });
  }
});

export default router;
