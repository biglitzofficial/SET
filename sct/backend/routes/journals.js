import express from 'express';
import { db, COLLECTIONS } from '../config/firebase.js';
import { authenticate, checkPermission, assertStaffCanEditOrDelete } from '../middleware/auth.js';

const router = express.Router();

// Get all journal entries
router.get('/', authenticate, async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.JOURNALS)
      .orderBy('date', 'desc')
      .get();
    const journals = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(journals);
  } catch (error) {
    console.error('Get journals error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch journals' } });
  }
});

// Get single journal entry
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: { message: 'Journal entry not found' } });
    res.json({ ...doc.data(), id: doc.id });
  } catch (error) {
    console.error('Get journal error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch journal entry' } });
  }
});

// Create journal entry
router.post('/', authenticate, checkPermission('canEdit'), async (req, res) => {
  try {
    const data = { ...req.body, createdAt: Date.now() };
    const ref = await db.collection(COLLECTIONS.JOURNALS).add(data);
    res.status(201).json({ ...data, id: ref.id });
  } catch (error) {
    console.error('Create journal error:', error);
    res.status(500).json({ error: { message: 'Failed to create journal entry' } });
  }
});

// Update journal entry
router.put('/:id', authenticate, checkPermission('canEdit'), async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: { message: 'Journal entry not found' } });
    const err = assertStaffCanEditOrDelete(req, doc.data(), 'edit');
    if (err) return res.status(err.status).json({ error: { message: err.message } });

    await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).update(req.body);
    const updated = await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).get();
    res.json({ ...updated.data(), id: updated.id });
  } catch (error) {
    console.error('Update journal error:', error);
    res.status(500).json({ error: { message: 'Failed to update journal entry' } });
  }
});

// Delete journal entry
router.delete('/:id', authenticate, checkPermission('canDelete'), async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: { message: 'Journal entry not found' } });
    const err = assertStaffCanEditOrDelete(req, doc.data(), 'delete');
    if (err) return res.status(err.status).json({ error: { message: err.message } });

    await db.collection(COLLECTIONS.JOURNALS).doc(req.params.id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Delete journal error:', error);
    res.status(500).json({ error: { message: 'Failed to delete journal entry' } });
  }
});

export default router;
