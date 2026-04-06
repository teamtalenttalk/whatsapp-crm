const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List unsubscribed numbers
router.get('/', authMiddleware, (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const unsubscribes = db.prepare('SELECT * FROM unsubscribes WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(req.tenant.id, parseInt(limit), parseInt(offset));
    const total = db.prepare('SELECT COUNT(*) as cnt FROM unsubscribes WHERE tenant_id = ?').get(req.tenant.id).cnt;
    res.json({ unsubscribes, total });
  } catch (err) {
    console.error('List unsubscribes error:', err);
    res.status(500).json({ error: 'Failed to list unsubscribes' });
  }
});

// Add phone to unsubscribe list
router.post('/', authMiddleware, (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const existing = db.prepare('SELECT id FROM unsubscribes WHERE tenant_id = ? AND phone = ?').get(req.tenant.id, phone);
    if (existing) return res.status(409).json({ error: 'Phone already unsubscribed' });

    const id = uuid();
    db.prepare(`INSERT INTO unsubscribes (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)`).run(id, req.tenant.id, phone, name || null);

    const created = db.prepare('SELECT * FROM unsubscribes WHERE id = ?').get(id);
    res.json(created);
  } catch (err) {
    console.error('Add unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to add unsubscribe' });
  }
});

// Import multiple phones
router.post('/import', authMiddleware, (req, res) => {
  try {
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: 'Array of phones is required' });
    }

    const insert = db.prepare(`INSERT OR IGNORE INTO unsubscribes (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)`);
    const insertMany = db.transaction((items) => {
      let added = 0;
      for (const item of items) {
        const phone = typeof item === 'string' ? item : item.phone;
        const name = typeof item === 'string' ? null : item.name || null;
        if (!phone) continue;
        const result = insert.run(uuid(), req.tenant.id, phone, name);
        if (result.changes > 0) added++;
      }
      return added;
    });

    const added = insertMany(phones);
    res.json({ success: true, added, total: phones.length });
  } catch (err) {
    console.error('Import unsubscribes error:', err);
    res.status(500).json({ error: 'Failed to import unsubscribes' });
  }
});

// Remove from unsubscribe list
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM unsubscribes WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Unsubscribe entry not found' });

    db.prepare('DELETE FROM unsubscribes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to delete unsubscribe' });
  }
});

module.exports = router;
