const express = require('express');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get messages for a contact (chat history)
router.get('/:contactId', authMiddleware, (req, res) => {
  const { limit = 50, before } = req.query;
  let query = 'SELECT * FROM messages WHERE tenant_id = ? AND contact_id = ?';
  const params = [req.tenant.id, req.params.contactId];

  if (before) {
    query += ' AND timestamp < ?';
    params.push(before);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  const messages = db.prepare(query).all(...params).reverse();
  res.json(messages);
});

// Get all conversations (latest message per contact)
router.get('/', authMiddleware, (req, res) => {
  const conversations = db.prepare(`
    SELECT c.id as contact_id, c.name, c.phone, c.stage,
      m.content as last_message, m.direction as last_direction, m.timestamp as last_at,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND direction = 'incoming' AND status != 'read') as unread
    FROM contacts c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE contact_id = c.id ORDER BY timestamp DESC LIMIT 1
    )
    WHERE c.tenant_id = ?
    ORDER BY m.timestamp DESC NULLS LAST
    LIMIT 100
  `).all(req.tenant.id);

  res.json(conversations);
});

module.exports = router;
