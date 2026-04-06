const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { checkNumbers } = require('../services/whatsapp');

const router = express.Router();

// List filter results
router.get('/', authMiddleware, (req, res) => {
  try {
    const { limit = 100, offset = 0, is_whatsapp } = req.query;
    let query = 'SELECT * FROM number_filter_results WHERE tenant_id = ?';
    const params = [req.tenant.id];

    if (is_whatsapp !== undefined) {
      query += ' AND is_whatsapp = ?';
      params.push(parseInt(is_whatsapp));
    }

    query += ' ORDER BY checked_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as cnt FROM number_filter_results WHERE tenant_id = ?').get(req.tenant.id).cnt;
    res.json({ results, total });
  } catch (err) {
    console.error('List filter results error:', err);
    res.status(500).json({ error: 'Failed to list filter results' });
  }
});

// Check a list of phone numbers
router.post('/check', authMiddleware, async (req, res) => {
  try {
    const { phones, device_id } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: 'Array of phone numbers is required' });
    }

    const checkResults = await checkNumbers(req.tenant.id, device_id || null, phones);

    // Save results to DB
    const insert = db.prepare(
      `INSERT INTO number_filter_results (id, tenant_id, phone, name, is_whatsapp, account_type) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const saveAll = db.transaction((items) => {
      for (const item of items) {
        insert.run(uuid(), req.tenant.id, item.phone, item.jid || null, item.exists ? 1 : 0, item.exists ? 'whatsapp' : 'unknown');
      }
    });
    saveAll(checkResults);

    res.json({
      results: checkResults,
      summary: {
        total: checkResults.length,
        whatsapp: checkResults.filter(r => r.exists).length,
        not_whatsapp: checkResults.filter(r => !r.exists).length,
      },
    });
  } catch (err) {
    console.error('Check numbers error:', err);
    res.status(500).json({ error: err.message || 'Failed to check numbers' });
  }
});

// Clear results
router.delete('/', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM number_filter_results WHERE tenant_id = ?').run(req.tenant.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Clear filter results error:', err);
    res.status(500).json({ error: 'Failed to clear filter results' });
  }
});

module.exports = router;
