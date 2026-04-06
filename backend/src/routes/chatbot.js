const express = require('express');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get chatbot config
router.get('/config', authMiddleware, (req, res) => {
  const config = db.prepare('SELECT * FROM chatbot_configs WHERE tenant_id = ?').get(req.tenant.id);
  if (!config) return res.status(404).json({ error: 'No config found' });
  res.json(config);
});

// Update chatbot config
router.put('/config', authMiddleware, (req, res) => {
  const { enabled, welcome_message, ai_enabled, ai_prompt, business_info, auto_reply_delay_ms } = req.body;

  const existing = db.prepare('SELECT * FROM chatbot_configs WHERE tenant_id = ?').get(req.tenant.id);
  if (!existing) return res.status(404).json({ error: 'No config found' });

  db.prepare(`
    UPDATE chatbot_configs SET
      enabled = ?, welcome_message = ?, ai_enabled = ?, ai_prompt = ?,
      business_info = ?, auto_reply_delay_ms = ?, updated_at = datetime('now')
    WHERE tenant_id = ?
  `).run(
    enabled ?? existing.enabled,
    welcome_message || existing.welcome_message,
    ai_enabled ?? existing.ai_enabled,
    ai_prompt || existing.ai_prompt,
    business_info ?? existing.business_info,
    auto_reply_delay_ms || existing.auto_reply_delay_ms,
    req.tenant.id
  );

  const updated = db.prepare('SELECT * FROM chatbot_configs WHERE tenant_id = ?').get(req.tenant.id);
  res.json(updated);
});

module.exports = router;
