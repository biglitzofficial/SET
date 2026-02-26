import express from 'express';
import { body, validationResult } from 'express-validator';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Get all payments
router.get('/', authenticate, async (req, res) => {
  try {
    const { sourceId, type, voucherType, mode, startDate, endDate } = req.query;
    
    let query = db.collection(COLLECTIONS.PAYMENTS);
    
    if (sourceId) {
      query = query.where('sourceId', '==', sourceId);
    }
    if (type) {
      query = query.where('type', '==', type);
    }
    if (voucherType) {
      query = query.where('voucherType', '==', voucherType);
    }
    if (mode) {
      query = query.where('mode', '==', mode);
    }

    const snapshot = await query.orderBy('date', 'desc').get();
    let payments = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    // Filter by date range if provided
    if (startDate || endDate) {
      payments = payments.filter(payment => {
        if (startDate && payment.date < parseInt(startDate)) return false;
        if (endDate && payment.date > parseInt(endDate)) return false;
        return true;
      });
    }

    res.json(payments);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payments' } });
  }
});

// Get single payment
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.PAYMENTS).doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Payment not found' } });
    }

    res.json({ ...doc.data(), id: doc.id });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch payment' } });
  }
});

// Create payment
router.post('/', [
  authenticate,
  checkPermission('canEdit'),
  body('type').isIn(['IN', 'OUT']),
  body('voucherType').isIn(['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL']),
  body('sourceName').notEmpty().trim(),
  body('amount').isFloat({ min: 0 }),
  body('mode').notEmpty(),
  body('date').isInt(),
  body('category').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: _clientId, ...bodyData } = req.body;
    const paymentData = {
      ...bodyData,
      createdAt: Date.now(),
      createdBy: req.user.id
    };

    const docRef = await db.collection(COLLECTIONS.PAYMENTS).add(paymentData);
    
    // If payment is linked to an invoice, update invoice balance
    if (req.body.invoiceId && req.body.type === 'IN') {
      const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(req.body.invoiceId);
      const invoiceDoc = await invoiceRef.get();
      
      if (invoiceDoc.exists) {
        const invoice = invoiceDoc.data();
        const newBalance = invoice.balance - req.body.amount;
        let newStatus = 'UNPAID';
        
        if (newBalance <= 0) {
          newStatus = 'PAID';
        } else if (newBalance < invoice.amount) {
          newStatus = 'PARTIAL';
        }

        await invoiceRef.update({
          balance: Math.max(0, newBalance),
          status: newStatus,
          updatedAt: Date.now()
        });
      }
    }

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'CREATE',
      entityType: 'PAYMENT',
      entityId: docRef.id,
      description: `Created ${paymentData.voucherType} payment: ${paymentData.sourceName} - ₹${paymentData.amount}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    // Spread paymentData first, then override id with the real Firestore ID
    // (paymentData may contain a local temp id from the client — we always win)
    res.status(201).json({ 
      ...paymentData,
      id: docRef.id
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: { message: 'Failed to create payment' } });
  }
});

// Update payment
router.put('/:id', [
  authenticate,
  checkPermission('canEdit')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.PAYMENTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Payment not found' } });
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
      entityType: 'PAYMENT',
      entityId: req.params.id,
      description: `Updated payment: ${doc.data().sourceName}`,
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
    console.error('Update payment error:', error);
    res.status(500).json({ error: { message: 'Failed to update payment' } });
  }
});

// Delete payment
router.delete('/:id', [
  authenticate,
  checkPermission('canDelete')
], async (req, res) => {
  try {
    const docRef = db.collection(COLLECTIONS.PAYMENTS).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'Payment not found' } });
    }

    const payment = doc.data();

    // If payment was linked to invoice, restore invoice balance
    if (payment.invoiceId && payment.type === 'IN') {
      const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(payment.invoiceId);
      const invoiceDoc = await invoiceRef.get();
      
      if (invoiceDoc.exists) {
        const invoice = invoiceDoc.data();
        const newBalance = invoice.balance + payment.amount;
        let newStatus = 'UNPAID';
        
        if (newBalance < invoice.amount) {
          newStatus = 'PARTIAL';
        }

        await invoiceRef.update({
          balance: newBalance,
          status: newStatus,
          updatedAt: Date.now()
        });
      }
    }

    await docRef.delete();

    // Log action
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      timestamp: Date.now(),
      action: 'DELETE',
      entityType: 'PAYMENT',
      entityId: req.params.id,
      description: `Deleted payment: ${payment.sourceName}`,
      performedBy: req.user.role,
      userId: req.user.id
    });

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: { message: 'Failed to delete payment' } });
  }
});

export default router;
