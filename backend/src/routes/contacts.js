const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// List contacts
router.get('/', authMiddleware, (req, res) => {
  const { search, stage, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT c.*, (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND direction = "incoming" AND status != "read") as unread_count, (SELECT content FROM messages WHERE contact_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message, (SELECT timestamp FROM messages WHERE contact_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_at FROM contacts c WHERE c.tenant_id = ?';
  const params = [req.tenant.id];

  if (search) {
    query += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (stage) {
    query += ' AND c.stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY last_message_at DESC NULLS LAST LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const contacts = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ?').get(req.tenant.id);
  res.json({ contacts, total: total.cnt });
});

// Get single contact
router.get('/:id', authMiddleware, (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact);
});

// Create contact
router.post('/', authMiddleware, (req, res) => {
  const { phone, name, email, tags, notes, stage } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const existing = db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(req.tenant.id, phone);
  if (existing) return res.status(409).json({ error: 'Contact already exists' });

  const id = uuid();
  db.prepare('INSERT INTO contacts (id, tenant_id, phone, name, email, tags, notes, stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, req.tenant.id, phone, name || phone, email || null, JSON.stringify(tags || []), notes || null, stage || 'new'
  );
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  res.json(contact);
});

// Update contact
router.put('/:id', authMiddleware, (req, res) => {
  const { name, email, tags, notes, stage } = req.body;
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  db.prepare('UPDATE contacts SET name = ?, email = ?, tags = ?, notes = ?, stage = ?, updated_at = datetime("now") WHERE id = ?').run(
    name || contact.name, email || contact.email, JSON.stringify(tags || JSON.parse(contact.tags || '[]')), notes ?? contact.notes, stage || contact.stage, req.params.id
  );
  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete contact
router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE contact_id = ? AND tenant_id = ?').run(req.params.id, req.tenant.id);
  db.prepare('DELETE FROM contacts WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant.id);
  res.json({ success: true });
});

module.exports = router;
