const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// GET /api/journeys — List all journeys
router.get('/', authMiddleware, (req, res) => {
  try {
    const journeys = db.prepare(`
      SELECT j.*,
        (SELECT COUNT(*) FROM journey_contacts jc WHERE jc.journey_id = j.id) AS total_contacts,
        (SELECT COUNT(*) FROM journey_contacts jc WHERE jc.journey_id = j.id AND jc.status = 'completed') AS completed_contacts
      FROM journeys j
      WHERE j.tenant_id = ?
      ORDER BY j.created_at DESC
    `).all(req.tenant.id);

    res.json(journeys.map(j => ({
      ...j,
      stages: JSON.parse(j.stages || '[]'),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/journeys — Create a journey
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, description, stages } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!stages || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ error: 'At least one stage is required' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO journeys (id, tenant_id, name, description, stages, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(id, req.tenant.id, name, description || '', JSON.stringify(stages));

    const journey = db.prepare("SELECT * FROM journeys WHERE id = ?").get(id);
    res.json({ ...journey, stages: JSON.parse(journey.stages) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journeys/:id — Get journey details with stage breakdown
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const journey = db.prepare(
      "SELECT * FROM journeys WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);

    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    const stages = JSON.parse(journey.stages || '[]');

    // Count contacts at each stage
    const stageBreakdown = stages.map(stage => {
      const count = db.prepare(
        "SELECT COUNT(*) AS cnt FROM journey_contacts WHERE journey_id = ? AND current_stage = ?"
      ).get(req.params.id, stage.name)?.cnt || 0;

      return { ...stage, contact_count: count };
    });

    // Overall stats
    const totalContacts = db.prepare(
      "SELECT COUNT(*) AS cnt FROM journey_contacts WHERE journey_id = ?"
    ).get(req.params.id)?.cnt || 0;

    const completedContacts = db.prepare(
      "SELECT COUNT(*) AS cnt FROM journey_contacts WHERE journey_id = ? AND status = 'completed'"
    ).get(req.params.id)?.cnt || 0;

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT jc.*, c.name AS contact_name, c.phone AS contact_phone
      FROM journey_contacts jc
      LEFT JOIN contacts c ON c.id = jc.contact_id
      WHERE jc.journey_id = ?
      ORDER BY jc.updated_at DESC
      LIMIT 20
    `).all(req.params.id);

    res.json({
      ...journey,
      stages: stageBreakdown,
      total_contacts: totalContacts,
      completed_contacts: completedContacts,
      completion_rate: totalContacts > 0 ? Math.round((completedContacts / totalContacts) * 100) : 0,
      recent_activity: recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/journeys/:id — Update journey
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name, description, stages, status } = req.body;
    const journey = db.prepare(
      "SELECT * FROM journeys WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);

    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    db.prepare(`
      UPDATE journeys SET name = ?, description = ?, stages = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || journey.name,
      description !== undefined ? description : journey.description,
      stages ? JSON.stringify(stages) : journey.stages,
      status || journey.status,
      req.params.id
    );

    const updated = db.prepare("SELECT * FROM journeys WHERE id = ?").get(req.params.id);
    res.json({ ...updated, stages: JSON.parse(updated.stages) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/journeys/:id — Delete journey
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const journey = db.prepare(
      "SELECT * FROM journeys WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);

    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    db.prepare("DELETE FROM journey_contacts WHERE journey_id = ?").run(req.params.id);
    db.prepare("DELETE FROM journeys WHERE id = ?").run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journeys/:id/contacts — Get contacts in a journey, optionally filtered by stage
router.get('/:id/contacts', authMiddleware, (req, res) => {
  try {
    const { stage, status } = req.query;
    const journey = db.prepare(
      "SELECT * FROM journeys WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);

    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    let sql = `
      SELECT jc.*, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email, c.tags
      FROM journey_contacts jc
      LEFT JOIN contacts c ON c.id = jc.contact_id
      WHERE jc.journey_id = ?
    `;
    const params = [req.params.id];

    if (stage) {
      sql += " AND jc.current_stage = ?";
      params.push(stage);
    }
    if (status) {
      sql += " AND jc.status = ?";
      params.push(status);
    }

    sql += " ORDER BY jc.updated_at DESC";

    const contacts = db.prepare(sql).all(...params);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/journeys/:id/contacts — Add contacts to journey
router.post('/:id/contacts', authMiddleware, (req, res) => {
  try {
    const { contact_ids } = req.body;
    if (!contact_ids || !Array.isArray(contact_ids)) {
      return res.status(400).json({ error: 'contact_ids array required' });
    }

    const journey = db.prepare(
      "SELECT * FROM journeys WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);
    if (!journey) return res.status(404).json({ error: 'Journey not found' });

    const stages = JSON.parse(journey.stages || '[]');
    const firstStage = stages[0]?.name || 'start';

    const insert = db.prepare(`
      INSERT OR IGNORE INTO journey_contacts (id, journey_id, contact_id, current_stage, status, entered_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `);

    let added = 0;
    const insertAll = db.transaction((ids) => {
      for (const cid of ids) {
        const result = insert.run(uuidv4(), req.params.id, cid, firstStage);
        if (result.changes > 0) added++;
      }
    });
    insertAll(contact_ids);

    res.json({ success: true, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
