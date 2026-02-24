import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all chit groups
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = db.collection(COLLECTIONS.CHIT_GROUPS);
    
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('startDate', 'desc').get();
    const chitGroups = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(chitGroups);
  } catch (error) {
    console.error('Get chit groups error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch chit groups' } });
  }
});

// Get single chit group
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.CHIT_GROUPS).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Chit group not found' } });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Get chit group error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch chit group' } });
  }
});

// Create chit group
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('name').notEmpty().trim(),
  body('totalValue').isFloat({ min: 0 }),
  body('durationMonths').isInt({ min: 1 }),
  body('monthlyInstallment').isFloat({ min: 0 }),
  body('commissionPercentage').isFloat({ min: 0, max: 100 }),
  body('startDate').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Remove any client-provided ID to avoid conflicts
    const { id, ...requestData } = req.body;

    const chitGroupData = {
      ...requestData,
      currentMonth: 0,
      members: requestData.members || [],
      auctions: [],
      status: 'ACTIVE',
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.CHIT_GROUPS).add(chitGroupData);
    
    console.log('Created chit group with Firebase ID:', docRef.id);
    
    res.status(201).json({ 
      ...chitGroupData,
      id: docRef.id  // Set Firebase-generated ID last so it can't be overwritten
    });
  } catch (error) {
    console.error('Create chit group error:', error);
    res.status(500).json({ error: { message: 'Failed to create chit group' } });
  }
});

// Update chit group
router.put('/:id', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.CHIT_GROUPS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Chit group not found' } });
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
    console.error('Update chit group error:', error);
    res.status(500).json({ error: { message: 'Failed to update chit group' } });
  }
});

// Add auction to chit group
router.post('/:id/auctions', [
  authenticate,
  checkPermission('canEdit'),
  body('month').isInt({ min: 1 }),
  body('winnerId').notEmpty(),
  body('winnerName').notEmpty().trim(),
  body('bidAmount').isFloat({ min: 0 }),
  body('winnerHand').isFloat({ min: 0 }),
  body('date').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const docRef = db.collection(COLLECTIONS.CHIT_GROUPS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Chit group not found' } });
    }

    const chitGroup = doc.data();
    const newAuction = {
      id: `AUC_${Date.now()}`,
      ...req.body
    };

    const updatedAuctions = [...chitGroup.auctions, newAuction];
    const newCurrentMonth = chitGroup.currentMonth + 1;

    await docRef.update({
      auctions: updatedAuctions,
      currentMonth: newCurrentMonth,
      updatedAt: Date.now()
    });

    res.status(201).json(newAuction);
  } catch (error) {
    console.error('Add auction error:', error);
    res.status(500).json({ error: { message: 'Failed to add auction' } });
  }
});

// Delete chit group
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.CHIT_GROUPS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Chit group not found' } });
    }

    await docRef.delete();

    res.json({ message: 'Chit group deleted successfully' });
  } catch (error) {
    console.error('Delete chit group error:', error);
    res.status(500).json({ error: { message: 'Failed to delete chit group' } });
  }
});

export default router;
