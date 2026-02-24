import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all invoices
router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, type, status, startDate, endDate } = req.query;
    
    let query = db.collection(COLLECTIONS.INVOICES);
    
    if (customerId) {
      query = query.where('customerId', '==', customerId);
    }
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('date', 'desc').get();
    let invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter by date range if provided
    if (startDate || endDate) {
      invoices = invoices.filter(inv => {
        if (startDate && inv.date < parseInt(startDate)) return false;
        if (endDate && inv.date > parseInt(endDate)) return false;
        return true;
      });
    }

    res.json(invoices);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch invoices' } });
  }
});

// Get single invoice
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.INVOICES).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Invoice not found' } });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch invoice' } });
  }
});

// Create invoice
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('customerName').notEmpty().trim(),
  body('type').isIn(['ROYALTY', 'INTEREST', 'CHIT', 'INTEREST_OUT']),
  body('amount').isFloat({ min: 0 }),
  body('date').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Generate invoice number
    const year = new Date().getFullYear();
    const snapshot = await db.collection(COLLECTIONS.INVOICES)
      .where('invoiceNumber', '>=', `INV-${year}`)
      .orderBy('invoiceNumber', 'desc')
      .limit(1)
      .get();

    let nextNumber = 1;
    if (!snapshot.empty) {
      const lastInvoice = snapshot.docs[0].data();
      const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    const invoiceData = {
      ...req.body,
      invoiceNumber: `INV-${year}-${String(nextNumber).padStart(4, '0')}`,
      balance: req.body.amount, // Initially, balance equals amount
      status: 'UNPAID',
      direction: req.body.direction || 'IN',
      isVoid: false,
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.INVOICES).add(invoiceData);
    
    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CREATE',
      entityType: 'INVOICE',
      entityId: docRef.id,
      description: `Created invoice: ${invoiceData.invoiceNumber} for ${invoiceData.customerName}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.status(201).json({ 
      id: docRef.id, 
      ...invoiceData 
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: { message: 'Failed to create invoice' } });
  }
});

// Update invoice
router.put('/:id', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.INVOICES).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Invoice not found' } });
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
      entityType: 'INVOICE',
      entityId: req.params.id,
      description: `Updated invoice: ${doc.data().invoiceNumber}`,
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
    console.error('Update invoice error:', error);
    res.status(500).json({ error: { message: 'Failed to update invoice' } });
  }
});

// Void invoice
router.post('/:id/void', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.INVOICES).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Invoice not found' } });
    }

    await docRef.update({
      isVoid: true,
      voidedAt: Date.now(),
      voidedBy: req.user.id
    });

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'VOID',
      entityType: 'INVOICE',
      entityId: req.params.id,
      description: `Voided invoice: ${doc.data().invoiceNumber}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.json({ message: 'Invoice voided successfully' });
  } catch (error) {
    console.error('Void invoice error:', error);
    res.status(500).json({ error: { message: 'Failed to void invoice' } });
  }
});

// Bulk create invoices (Firestore WriteBatch — single round-trip, much faster than N sequential calls)
router.post('/bulk', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const { invoices } = req.body;
    if (!invoices?.length) {
      return res.status(400).json({ error: { message: 'No invoices provided' } });
    }

    const batch = db.batch();
    const results = [];
    const now = Date.now();

    for (const invoice of invoices) {
      const docRef = db.collection(COLLECTIONS.INVOICES).doc();
      const { id: _id, ...invoiceData } = invoice; // strip any client-side id
      const data = { ...invoiceData, isVoid: false, createdAt: now, createdBy: req.user.id };
      batch.set(docRef, data);
      results.push({ id: docRef.id, ...data });
    }

    await batch.commit();

    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: now,
      action: 'BULK_CREATE',
      entityType: 'INVOICE',
      entityId: 'BATCH',
      description: `Bulk created ${results.length} invoices`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.status(201).json({ invoices: results, count: results.length });
  } catch (error) {
    console.error('Bulk create invoices error:', error);
    res.status(500).json({ error: { message: 'Failed to bulk create invoices' } });
  }
});

// Bulk delete invoices
router.post('/bulk-delete', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) {
      return res.status(400).json({ error: { message: 'No IDs provided' } });
    }

    // Firestore batch max is 500; chunk if needed
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const writeBatch = db.batch();
      for (const id of chunk) {
        writeBatch.delete(db.collection(COLLECTIONS.INVOICES).doc(id));
      }
      await writeBatch.commit();
    }

    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'BULK_DELETE',
      entityType: 'INVOICE',
      entityId: 'BATCH',
      description: `Bulk deleted ${ids.length} invoices`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.json({ message: `Deleted ${ids.length} invoices`, count: ids.length });
  } catch (error) {
    console.error('Bulk delete invoices error:', error);
    res.status(500).json({ error: { message: 'Failed to bulk delete invoices' } });
  }
});

// Delete invoice
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.INVOICES).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Invoice not found' } });
    }

    await docRef.delete();

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'INVOICE',
      entityId: req.params.id,
      description: `Deleted invoice: ${doc.data().invoiceNumber}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: { message: 'Failed to delete invoice' } });
  }
});

export default router;
