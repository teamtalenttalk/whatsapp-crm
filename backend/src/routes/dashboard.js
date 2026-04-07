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

  // Campaign breakdown stats
  const activeCampaigns = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ? AND status = 'sending'`).get(tid).cnt;
  const completedCampaigns = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ? AND status = 'completed'`).get(tid).cnt;
  const scheduledCampaigns = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ? AND status = 'scheduled'`).get(tid).cnt;
  const failedCampaigns = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ? AND status = 'failed'`).get(tid).cnt;

  // Delivery stats from campaign_messages
  const cmTotal = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ?`).get(tid).cnt;
  const cmSent = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ? AND status = 'sent'`).get(tid).cnt;
  const cmDelivered = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ? AND status = 'delivered'`).get(tid).cnt;
  const cmRead = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ? AND status = 'read'`).get(tid).cnt;
  const cmFailed = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ? AND status = 'failed'`).get(tid).cnt;
  const cmPending = db.prepare(`SELECT COUNT(*) as cnt FROM campaign_messages WHERE tenant_id = ? AND status = 'pending'`).get(tid).cnt;

  // Per-campaign breakdown (last 10 campaigns)
  const recentCampaigns = db.prepare(`
    SELECT c.id, c.name, c.status, c.total_recipients, c.sent_count, c.failed_count, c.created_at, c.scheduled_at,
      (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'delivered') as delivered,
      (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'read') as read_count
    FROM campaigns c
    WHERE c.tenant_id = ?
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all(tid);

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
    campaignStats: {
      total: totalCampaigns,
      active: activeCampaigns,
      completed: completedCampaigns,
      scheduled: scheduledCampaigns,
      failed: failedCampaigns,
    },
    deliveryStats: {
      total: cmTotal,
      sent: cmSent,
      delivered: cmDelivered,
      read: cmRead,
      failed: cmFailed,
      pending: cmPending,
      sentPercent: cmTotal > 0 ? Math.round((cmSent / cmTotal) * 100) : 0,
      deliveredPercent: cmTotal > 0 ? Math.round((cmDelivered / cmTotal) * 100) : 0,
      readPercent: cmTotal > 0 ? Math.round((cmRead / cmTotal) * 100) : 0,
      failedPercent: cmTotal > 0 ? Math.round((cmFailed / cmTotal) * 100) : 0,
    },
    recentCampaigns,
  });
});

module.exports = router;
