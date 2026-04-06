const express = require('express');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List received messages with pagination
router.get('/', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const total = db.prepare(
      `SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND direction = 'incoming'`
    ).get(req.tenant.id).cnt;

    const messages = db.prepare(
      `SELECT m.*, c.name as contact_name, c.phone as contact_phone
       FROM messages m
       LEFT JOIN contacts c ON m.contact_id = c.id
       WHERE m.tenant_id = ? AND m.direction = 'incoming'
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`
    ).all(req.tenant.id, limit, offset);

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('List received messages error:', err);
    res.status(500).json({ error: 'Failed to list received messages' });
  }
});

// Export all received messages as JSON
router.get('/export', authMiddleware, (req, res) => {
  try {
    const messages = db.prepare(
      `SELECT m.*, c.name as contact_name, c.phone as contact_phone
       FROM messages m
       LEFT JOIN contacts c ON m.contact_id = c.id
       WHERE m.tenant_id = ? AND m.direction = 'incoming'
       ORDER BY m.timestamp DESC`
    ).all(req.tenant.id);

    res.json({ messages });
  } catch (err) {
    console.error('Export received messages error:', err);
    res.status(500).json({ error: 'Failed to export received messages' });
  }
});

// Clear all received messages
router.delete('/', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
      `DELETE FROM messages WHERE tenant_id = ? AND direction = 'incoming'`
    ).run(req.tenant.id);

    res.json({ deleted: result.changes });
  } catch (err) {
    console.error('Clear received messages error:', err);
    res.status(500).json({ error: 'Failed to clear received messages' });
  }
});

module.exports = router;
