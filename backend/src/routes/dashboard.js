const express = require('express');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Dashboard stats
router.get('/stats', authMiddleware, (req, res) => {
  const tid = req.tenant.id;
  const totalContacts = db.prepare('SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ?').get(tid).cnt;
  const newContacts = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ? AND created_at >= datetime('now', '-7 days')").get(tid).cnt;
  const totalMessages = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ?').get(tid).cnt;
  const todayMessages = db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND timestamp >= datetime('now', 'start of day')").get(tid).cnt;
  const incomingToday = db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND direction = 'incoming' AND timestamp >= datetime('now', 'start of day')").get(tid).cnt;
  const outgoingToday = db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND direction = 'outgoing' AND timestamp >= datetime('now', 'start of day')").get(tid).cnt;
  const botReplies = db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND is_bot_reply = 1 AND timestamp >= datetime('now', '-7 days')").get(tid).cnt;

  // Contacts by stage
  const stages = db.prepare("SELECT stage, COUNT(*) as cnt FROM contacts WHERE tenant_id = ? GROUP BY stage").all(tid);

  res.json({
    totalContacts,
    newContacts,
    totalMessages,
    todayMessages,
    incomingToday,
    outgoingToday,
    botReplies,
    stages: stages.reduce((acc, s) => { acc[s.stage] = s.cnt; return acc; }, {}),
  });
});

module.exports = router;
