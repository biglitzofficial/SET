import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all liabilities
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, status } = req.query;
    
    let query = db.collection(COLLECTIONS.LIABILITIES);
    
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('startDate', 'desc').get();
    const liabilities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(liabilities);
  } catch (error) {
    console.error('Get liabilities error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch liabilities' } });
  }
});

// Get single liability
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.LIABILITIES).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Liability not found' } });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Get liability error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch liability' } });
  }
});

// Create liability
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('providerName').notEmpty().trim(),
  body('type').isIn(['BANK', 'PRIVATE']),
  body('principal').isFloat({ min: 0 }),
  body('interestRate').isFloat({ min: 0 }),
  body('startDate').isInt(),
  body('status').isIn(['ACTIVE', 'CLOSED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const liabilityData = {
      ...req.body,
      remainingBalance: req.body.principal,
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.LIABILITIES).add(liabilityData);
    
    res.status(201).json({ 
      id: docRef.id, 
      ...liabilityData 
    });
  } catch (error) {
    console.error('Create liability error:', error);
    res.status(500).json({ error: { message: 'Failed to create liability' } });
  }
});

// Update liability
router.put('/:id', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.LIABILITIES).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Liability not found' } });
    }

    const updateData = {
      ...req.body,
      updatedAt: Date.now(),
      updatedBy: req.user.id
    };

    await docRef.update(updateData);

    res.json({ 
      id: req.params.id, 
      ...doc.data(),
      ...updateData 
    });
  } catch (error) {
    console.error('Update liability error:', error);
    res.status(500).json({ error: { message: 'Failed to update liability' } });
  }
});

// Delete liability
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.LIABILITIES).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Liability not found' } });
    }

    await docRef.delete();

    res.json({ message: 'Liability deleted successfully' });
  } catch (error) {
    console.error('Delete liability error:', error);
    res.status(500).json({ error: { message: 'Failed to delete liability' } });
  }
});

export default router;
