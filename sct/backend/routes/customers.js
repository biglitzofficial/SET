import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all customers
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, search, type } = req.query;
    
    let query = db.collection(COLLECTIONS.CUSTOMERS);
    
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    let customers = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    // Filter by type (multiple flags can be true)
    if (type) {
      customers = customers.filter(c => c[`is${type}`] === true);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c => 
        c.name.toLowerCase().includes(searchLower) || 
        c.phone.includes(search)
      );
    }

    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customers' } });
  }
});

// Get single customer
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.CUSTOMERS).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    res.json({ ...doc.data(), id: doc.id });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customer' } });
  }
});

// Create customer
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('name').notEmpty().trim(),
  body('phone').notEmpty().trim(),
  body('status').isIn(['ACTIVE', 'INACTIVE'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: _clientId, ...bodyData } = req.body;
    const customerData = {
      ...bodyData,
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.CUSTOMERS).add(customerData);
    
    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CREATE',
      entityType: 'CUSTOMER',
      entityId: docRef.id,
      description: `Created customer: ${customerData.name}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.status(201).json({ 
      id: docRef.id, 
      ...customerData 
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: { message: 'Failed to create customer' } });
  }
});

// Update customer
router.put('/:id', [
  authenticate,
  checkPermission('canEdit'),
  body('name').optional().notEmpty().trim(),
  body('phone').optional().notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const docRef = db.collection(COLLECTIONS.CUSTOMERS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    const updateData = {
      ...req.body,
      updatedAt: Date.now(),
      updatedBy: req.user.id
    };

    await docRef.update(updateData);

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'EDIT',
      entityType: 'CUSTOMER',
      entityId: req.params.id,
      description: `Updated customer: ${req.body.name || doc.data().name}`,
      performedBy: req.user.role,
      userId: req.user.id,
      oldData: JSON.stringify(doc.data()),
      newData: JSON.stringify(updateData)
    });

    res.json({ 
      id: req.params.id, 
      ...doc.data(),
      ...updateData 
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: { message: 'Failed to update customer' } });
  }
});

// Delete customer
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.CUSTOMERS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    await docRef.delete();

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'CUSTOMER',
      entityId: req.params.id,
      description: `Deleted customer: ${doc.data().name}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: { message: 'Failed to delete customer' } });
  }
});

export default router;
