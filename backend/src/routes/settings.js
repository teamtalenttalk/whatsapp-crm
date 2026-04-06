const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all settings for tenant (auto-create defaults if none exist)
router.get('/', authMiddleware, (req, res) => {
  try {
    let settings = db.prepare(
      `SELECT * FROM settings WHERE tenant_id = ?`
    ).get(req.tenant.id);

    if (!settings) {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO settings (id, tenant_id) VALUES (?, ?)`
      ).run(id, req.tenant.id);
      settings = db.prepare(`SELECT * FROM settings WHERE id = ?`).get(id);
    }

    res.json({ settings });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings for tenant
router.put('/', authMiddleware, (req, res) => {
  try {
    // Ensure settings row exists
    let settings = db.prepare(
      `SELECT * FROM settings WHERE tenant_id = ?`
    ).get(req.tenant.id);

    if (!settings) {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO settings (id, tenant_id) VALUES (?, ?)`
      ).run(id, req.tenant.id);
    }

    const allowedFields = [
      'delay_enabled', 'delay_min', 'delay_max',
      'sleep_enabled', 'sleep_after_messages', 'sleep_min', 'sleep_max',
      'switch_account_after',
      'welcome_message_enabled', 'welcome_message_duration',
      'send_parallel', 'show_notification', 'auto_reply_enabled', 'auto_read', 'send_media_first',
      'unsubscribe_enabled', 'unsubscribe_keyword',
      'auto_reject_calls',
      'webhook_url', 'webhook_events',
      'default_country_code', 'language',
    ];

    const booleanFields = [
      'delay_enabled', 'sleep_enabled', 'welcome_message_enabled',
      'send_parallel', 'show_notification', 'auto_reply_enabled', 'auto_read', 'send_media_first',
      'unsubscribe_enabled', 'auto_reject_calls',
    ];

    const setClauses = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        if (booleanFields.includes(field)) {
          values.push(req.body[field] ? 1 : 0);
        } else {
          values.push(req.body[field]);
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = datetime('now')`);
    values.push(req.tenant.id);

    db.prepare(
      `UPDATE settings SET ${setClauses.join(', ')} WHERE tenant_id = ?`
    ).run(...values);

    const updated = db.prepare(
      `SELECT * FROM settings WHERE tenant_id = ?`
    ).get(req.tenant.id);

    res.json({ settings: updated });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
