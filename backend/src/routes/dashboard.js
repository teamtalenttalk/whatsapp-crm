const express = require('express');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Dashboard stats
router.get('/stats', authMiddleware, (req, res) => {
  const tid = req.tenant.id;
  const totalContacts = db.prepare('SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ?').get(tid).cnt;
  const newContacts = db.prepare(`SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ? AND created_at >= datetime('now', '-7 days')`).get(tid).cnt;
  const totalMessages = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ?').get(tid).cnt;
  const todayMessages = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND timestamp >= datetime('now', 'start of day')`).get(tid).cnt;
  const incomingToday = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND direction = 'incoming' AND timestamp >= datetime('now', 'start of day')`).get(tid).cnt;
  const outgoingToday = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND direction = 'outgoing' AND timestamp >= datetime('now', 'start of day')`).get(tid).cnt;
  const botReplies = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND is_bot_reply = 1 AND timestamp >= datetime('now', '-7 days')`).get(tid).cnt;

  // Contacts by stage
  const stages = db.prepare('SELECT stage, COUNT(*) as cnt FROM contacts WHERE tenant_id = ? GROUP BY stage').all(tid);

  // New stats: devices
  const totalDevices = db.prepare('SELECT COUNT(*) as cnt FROM devices WHERE tenant_id = ?').get(tid).cnt;
  const connectedDevices = db.prepare(`SELECT COUNT(*) as cnt FROM devices WHERE tenant_id = ? AND status = 'connected'`).get(tid).cnt;

  // Campaigns
  const totalCampaigns = db.prepare('SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ?').get(tid).cnt;

  // Templates
  const totalTemplates = db.prepare('SELECT COUNT(*) as cnt FROM templates WHERE tenant_id = ?').get(tid).cnt;

  // Auto replies
  const totalAutoReplies = db.prepare('SELECT COUNT(*) as cnt FROM auto_replies WHERE tenant_id = ?').get(tid).cnt;

  // Message analytics breakdown
  const pendingMessages = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = ?) AND status = 'pending'`).get(tid).cnt;
  const deliveredMessages = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = ?) AND status = 'sent'`).get(tid).cnt;
  const pausedCampaigns = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ? AND status = 'paused'`).get(tid).cnt;
  const autoReplyMessages = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND is_bot_reply = 1`).get(tid).cnt;
  const welcomeMessageCount = db.prepare('SELECT COUNT(*) as cnt FROM welcome_messages WHERE tenant_id = ? AND enabled = 1').get(tid).cnt;

  res.json({
    totalContacts,
    newContacts,
    totalMessages,
    todayMessages,
    incomingToday,
    outgoingToday,
    botReplies,
    stages: stages.reduce((acc, s) => { acc[s.stage] = s.cnt; return acc; }, {}),
    totalDevices,
    connectedDevices,
    totalCampaigns,
    totalTemplates,
    totalAutoReplies,
    messageAnalytics: {
      pending: pendingMessages,
      delivered: deliveredMessages,
      paused: pausedCampaigns,
      auto_reply: autoReplyMessages,
      welcome: welcomeMessageCount,
    },
  });
});

module.exports = router;
