import express from 'express';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all due dates
router.get('/', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.DUE_DATES).get();
    const dueDates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(dueDates);
  } catch (error) {
    console.error('Get due dates error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch due dates' } });
  }
});

// Upsert a due date (create or update)
router.post('/', authenticate, async (req, res) => {
  try {
    const { id, category, dueDate, amount } = req.body;
    
    console.log('Received due date upsert request:', { id, category, dueDate, amount, userId: req.user.id });

    if (!id || !category || !dueDate || amount === undefined) {
      console.error('Missing required fields:', { id, category, dueDate, amount });
      return res.status(400).json({ 
        error: { message: 'Missing required fields: id, category, dueDate, amount' } 
      });
    }

    // Use composite key: id_category
    const docId = `${id}_${category}`;
    
    const dueDateDoc = {
      id,
      category,
      dueDate,
      amount,
      updatedAt: Date.now(),
      updatedBy: req.user.id
    };
    
    console.log(`Saving due date to Firestore with docId: ${docId}`, dueDateDoc);

    await db.collection(COLLECTIONS.DUE_DATES).doc(docId).set(dueDateDoc, { merge: true });
    
    console.log(`Due date saved successfully: ${docId}`);

    res.json({ 
      message: 'Due date saved successfully',
      data: { id, category, dueDate, amount, docId }
    });
  } catch (error) {
    console.error('Upsert due date error:', error);
    res.status(500).json({ error: { message: 'Failed to save due date' } });
  }
});

// Delete a due date
router.delete('/:id/:category', authenticate, async (req, res) => {
  try {
    const { id, category } = req.params;
    const docId = `${id}_${category}`;

    await db.collection(COLLECTIONS.DUE_DATES).doc(docId).delete();

    res.json({ message: 'Due date deleted successfully' });
  } catch (error) {
    console.error('Delete due date error:', error);
    res.status(500).json({ error: { message: 'Failed to delete due date' } });
  }
});

export default router;
