const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// GET /api/segments — List all segments
router.get('/', authMiddleware, (req, res) => {
  try {
    const segments = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM segment_contacts sc WHERE sc.segment_id = s.id) AS contact_count
      FROM segments s
      WHERE s.tenant_id = ?
      ORDER BY s.created_at DESC
    `).all(req.tenant.id);

    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/segments — Create segment
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, description, rules } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO segments (id, tenant_id, name, description, rules, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, req.tenant.id, name, description || '', JSON.stringify(rules || {}));

    // Auto-populate contacts matching the rules
    const matchedCount = applySegmentRules(id, req.tenant.id, rules || {});

    const segment = db.prepare("SELECT * FROM segments WHERE id = ?").get(id);
    res.json({ ...segment, contact_count: matchedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/segments/:id — Update segment
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name, description, rules } = req.body;
    const segment = db.prepare("SELECT * FROM segments WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    db.prepare(`
      UPDATE segments SET name = ?, description = ?, rules = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      name || segment.name,
      description !== undefined ? description : segment.description,
      rules ? JSON.stringify(rules) : segment.rules,
      req.params.id,
      req.tenant.id
    );

    // Re-apply rules if updated
    if (rules) {
      db.prepare("DELETE FROM segment_contacts WHERE segment_id = ?").run(req.params.id);
      applySegmentRules(req.params.id, req.tenant.id, rules);
    }

    const updated = db.prepare("SELECT * FROM segments WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/segments/:id — Delete segment
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const segment = db.prepare("SELECT * FROM segments WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    db.prepare("DELETE FROM segment_contacts WHERE segment_id = ?").run(req.params.id);
    db.prepare("DELETE FROM segments WHERE id = ?").run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/segments/:id/contacts — Get contacts in a segment
router.get('/:id/contacts', authMiddleware, (req, res) => {
  try {
    const segment = db.prepare("SELECT * FROM segments WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    const contacts = db.prepare(`
      SELECT c.* FROM contacts c
      JOIN segment_contacts sc ON sc.contact_id = c.id
      WHERE sc.segment_id = ?
      ORDER BY c.name
    `).all(req.params.id);

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/segments/:id/contacts — Manually add contacts to segment
router.post('/:id/contacts', authMiddleware, (req, res) => {
  try {
    const { contact_ids } = req.body;
    if (!contact_ids || !Array.isArray(contact_ids)) {
      return res.status(400).json({ error: 'contact_ids array required' });
    }

    const segment = db.prepare("SELECT * FROM segments WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO segment_contacts (segment_id, contact_id) VALUES (?, ?)
    `);

    const addMany = db.transaction((ids) => {
      let added = 0;
      for (const cid of ids) {
        const result = insert.run(req.params.id, cid);
        if (result.changes > 0) added++;
      }
      return added;
    });

    const added = addMany(contact_ids);
    res.json({ success: true, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Apply segment rules to find matching contacts
 * Rules: { tags: ['vip'], stage: 'lead', min_messages: 5, min_purchases: 1, created_after: '2024-01-01' }
 */
function applySegmentRules(segmentId, tenantId, rules) {
  let sql = 'SELECT id FROM contacts WHERE tenant_id = ?';
  const params = [tenantId];

  if (rules.tags && Array.isArray(rules.tags) && rules.tags.length > 0) {
    for (const tag of rules.tags) {
      sql += " AND tags LIKE ?";
      params.push(`%${tag}%`);
    }
  }

  if (rules.stage) {
    sql += " AND stage = ?";
    params.push(rules.stage);
  }

  if (rules.created_after) {
    sql += " AND created_at >= ?";
    params.push(rules.created_after);
  }

  if (rules.created_before) {
    sql += " AND created_at <= ?";
    params.push(rules.created_before);
  }

  if (rules.has_email) {
    sql += " AND email IS NOT NULL AND email != ''";
  }

  const contacts = db.prepare(sql).all(...params);

  // Filter by message count if specified
  let filteredContacts = contacts;
  if (rules.min_messages) {
    filteredContacts = filteredContacts.filter(c => {
      const cnt = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE contact_id = ?").get(c.id)?.cnt || 0;
      return cnt >= rules.min_messages;
    });
  }

  // Filter by purchase count if specified
  if (rules.min_purchases) {
    filteredContacts = filteredContacts.filter(c => {
      const contact = db.prepare("SELECT phone FROM contacts WHERE id = ?").get(c.id);
      if (!contact) return false;
      const cnt = db.prepare("SELECT COUNT(*) AS cnt FROM sales WHERE customer_phone = ? AND tenant_id = ?").get(contact.phone, tenantId)?.cnt || 0;
      return cnt >= rules.min_purchases;
    });
  }

  // Insert matches
  const insert = db.prepare("INSERT OR IGNORE INTO segment_contacts (segment_id, contact_id) VALUES (?, ?)");
  const insertAll = db.transaction((items) => {
    for (const c of items) {
      insert.run(segmentId, c.id);
    }
  });
  insertAll(filteredContacts);

  return filteredContacts.length;
}

module.exports = router;
