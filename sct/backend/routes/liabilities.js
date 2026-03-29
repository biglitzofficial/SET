import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission, assertStaffCanEditOrDelete } from '../middleware/auth.js';

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
      ...doc.data(),
      id: doc.id   // Always use Firestore doc ID; ignore any id stored in document
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

    res.json({ ...doc.data(), id: doc.id });
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

    const { id: _clientId, ...bodyRest } = req.body;
    const liabilityData = {
      ...bodyRest,
      remainingBalance: req.body.principal,
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.LIABILITIES).add(liabilityData);
    
    res.status(201).json({ 
      ...liabilityData,
      id: docRef.id   // Always use Firestore doc ID; client-sent id is ignored
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
    const err = assertStaffCanEditOrDelete(req, doc.data(), 'edit');
    if (err) return res.status(err.status).json({ error: { message: err.message } });

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
    const delErr = assertStaffCanEditOrDelete(req, doc.data(), 'delete');
    if (delErr) return res.status(delErr.status).json({ error: { message: delErr.message } });

    await docRef.delete();

    res.json({ message: 'Liability deleted successfully' });
  } catch (error) {
    console.error('Delete liability error:', error);
    res.status(500).json({ error: { message: 'Failed to delete liability' } });
  }
});

export default router;
