const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List auto replies
router.get('/', authMiddleware, (req, res) => {
  try {
    const replies = db.prepare('SELECT * FROM auto_replies WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenant.id);
    res.json({ auto_replies: replies });
  } catch (err) {
    console.error('List auto replies error:', err);
    res.status(500).json({ error: 'Failed to list auto replies' });
  }
});

// Create auto reply
router.post('/', authMiddleware, (req, res) => {
  try {
    const { keyword, match_type, message, message_type, buttons, device_id, enabled } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const id = uuid();
    db.prepare(
      `INSERT INTO auto_replies (id, tenant_id, device_id, enabled, keyword, match_type, message_type, message, buttons) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, req.tenant.id, device_id || null,
      enabled !== undefined ? (enabled ? 1 : 0) : 1,
      keyword, match_type || 'contains', message_type || 'text', message,
      buttons ? JSON.stringify(buttons) : null
    );

    const created = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(id);
    res.json(created);
  } catch (err) {
    console.error('Create auto reply error:', err);
    res.status(500).json({ error: 'Failed to create auto reply' });
  }
});

// Update auto reply
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Auto reply not found' });

    const { keyword, match_type, message, message_type, buttons, device_id, enabled } = req.body;
    db.prepare(
      `UPDATE auto_replies SET keyword = ?, match_type = ?, message = ?, message_type = ?, buttons = ?, device_id = ?, enabled = ? WHERE id = ?`
    ).run(
      keyword || existing.keyword,
      match_type || existing.match_type,
      message || existing.message,
      message_type || existing.message_type,
      buttons ? JSON.stringify(buttons) : existing.buttons,
      device_id !== undefined ? device_id : existing.device_id,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update auto reply error:', err);
    res.status(500).json({ error: 'Failed to update auto reply' });
  }
});

// Delete auto reply
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Auto reply not found' });

    db.prepare('DELETE FROM auto_replies WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete auto reply error:', err);
    res.status(500).json({ error: 'Failed to delete auto reply' });
  }
});

module.exports = router;
