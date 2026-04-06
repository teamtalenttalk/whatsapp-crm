const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List welcome messages
router.get('/', authMiddleware, (req, res) => {
  try {
    const messages = db.prepare('SELECT * FROM welcome_messages WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenant.id);
    res.json({ welcome_messages: messages });
  } catch (err) {
    console.error('List welcome messages error:', err);
    res.status(500).json({ error: 'Failed to list welcome messages' });
  }
});

// Create welcome message
router.post('/', authMiddleware, (req, res) => {
  try {
    const { message, message_type, buttons, device_id, enabled } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const id = uuid();
    db.prepare(
      `INSERT INTO welcome_messages (id, tenant_id, device_id, enabled, message_type, message, buttons) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.tenant.id, device_id || null, enabled !== undefined ? (enabled ? 1 : 0) : 1, message_type || 'text', message, buttons ? JSON.stringify(buttons) : null);

    const created = db.prepare('SELECT * FROM welcome_messages WHERE id = ?').get(id);
    res.json(created);
  } catch (err) {
    console.error('Create welcome message error:', err);
    res.status(500).json({ error: 'Failed to create welcome message' });
  }
});

// Update welcome message
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Welcome message not found' });

    const { message, message_type, buttons, device_id, enabled } = req.body;
    db.prepare(
      `UPDATE welcome_messages SET message = ?, message_type = ?, buttons = ?, device_id = ?, enabled = ? WHERE id = ?`
    ).run(
      message || existing.message,
      message_type || existing.message_type,
      buttons ? JSON.stringify(buttons) : existing.buttons,
      device_id !== undefined ? device_id : existing.device_id,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM welcome_messages WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update welcome message error:', err);
    res.status(500).json({ error: 'Failed to update welcome message' });
  }
});

// Delete welcome message
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Welcome message not found' });

    db.prepare('DELETE FROM welcome_messages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete welcome message error:', err);
    res.status(500).json({ error: 'Failed to delete welcome message' });
  }
});

module.exports = router;
