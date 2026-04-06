const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List templates
router.get('/', authMiddleware, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM templates WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenant.id);
    res.json({ templates });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Create template
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, message, message_type, buttons, media_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Template name is required' });
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const id = uuid();
    db.prepare(
      `INSERT INTO templates (id, tenant_id, name, message_type, message, buttons, media_url) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.tenant.id, name, message_type || 'text', message, buttons ? JSON.stringify(buttons) : null, media_url || null);

    const created = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    res.json(created);
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM templates WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { name, message, message_type, buttons, media_url } = req.body;
    db.prepare(
      `UPDATE templates SET name = ?, message = ?, message_type = ?, buttons = ?, media_url = ? WHERE id = ?`
    ).run(
      name || existing.name,
      message || existing.message,
      message_type || existing.message_type,
      buttons ? JSON.stringify(buttons) : existing.buttons,
      media_url !== undefined ? media_url : existing.media_url,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM templates WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
