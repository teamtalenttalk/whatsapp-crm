const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// GET /api/campaigns/:id/analytics — Detailed campaign analytics
router.get('/:id/analytics', authMiddleware, (req, res) => {
  try {
    const campaign = db.prepare(
      "SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?"
    ).get(req.params.id, req.tenant.id);

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Message status breakdown
    const statusBreakdown = db.prepare(`
      SELECT status, COUNT(*) AS cnt
      FROM campaign_messages
      WHERE campaign_id = ?
      GROUP BY status
    `).all(req.params.id);

    // Delivery rate
    const total = campaign.total_recipients || 0;
    const sent = campaign.sent_count || 0;
    const delivered = campaign.delivered_count || 0;
    const read = campaign.read_count || 0;
    const failed = campaign.failed_count || 0;

    // Response rate (incoming messages from campaign recipients after campaign started)
    let responseCount = 0;
    if (campaign.started_at) {
      const phones = db.prepare(
        "SELECT DISTINCT phone FROM campaign_messages WHERE campaign_id = ? AND status != 'failed'"
      ).all(req.params.id).map(r => r.phone);

      if (phones.length > 0) {
        const placeholders = phones.map(() => '?').join(',');
        responseCount = db.prepare(`
          SELECT COUNT(DISTINCT remote_jid) AS cnt
          FROM messages
          WHERE tenant_id = ? AND direction = 'incoming'
          AND timestamp >= ?
          AND remote_jid IN (${placeholders})
        `).get(req.tenant.id, campaign.started_at, ...phones)?.cnt || 0;
      }
    }

    // Timeline (messages sent per hour)
    const timeline = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', sent_at) AS hour, COUNT(*) AS cnt
      FROM campaign_messages
      WHERE campaign_id = ? AND sent_at IS NOT NULL
      GROUP BY hour
      ORDER BY hour
    `).all(req.params.id);

    // Error breakdown
    const errors = db.prepare(`
      SELECT error, COUNT(*) AS cnt
      FROM campaign_messages
      WHERE campaign_id = ? AND status = 'failed' AND error IS NOT NULL
      GROUP BY error
      ORDER BY cnt DESC
      LIMIT 10
    `).all(req.params.id);

    res.json({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      status: campaign.status,
      rates: {
        delivery_rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        open_rate: total > 0 ? Math.round((read / total) * 100) : 0,
        response_rate: sent > 0 ? Math.round((responseCount / sent) * 100) : 0,
        failure_rate: total > 0 ? Math.round((failed / total) * 100) : 0,
      },
      counts: {
        total_recipients: total,
        sent,
        delivered,
        read,
        failed,
        responses: responseCount,
      },
      status_breakdown: statusBreakdown,
      timeline,
      top_errors: errors,
      started_at: campaign.started_at,
      completed_at: campaign.completed_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/comparison — Compare multiple campaigns
router.get('/comparison', authMiddleware, (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT id, name, status, total_recipients, sent_count, delivered_count,
             read_count, failed_count, started_at, completed_at, created_at
      FROM campaigns
      WHERE tenant_id = ? AND status IN ('completed', 'running')
      ORDER BY created_at DESC
      LIMIT 20
    `).all(req.tenant.id);

    const comparison = campaigns.map(c => {
      const total = c.total_recipients || 1;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        total_recipients: c.total_recipients,
        delivery_rate: Math.round(((c.delivered_count || 0) / total) * 100),
        open_rate: Math.round(((c.read_count || 0) / total) * 100),
        failure_rate: Math.round(((c.failed_count || 0) / total) * 100),
        started_at: c.started_at,
        completed_at: c.completed_at,
        duration_minutes: c.started_at && c.completed_at
          ? Math.round((new Date(c.completed_at) - new Date(c.started_at)) / 60000)
          : null,
      };
    });

    // Overall averages
    const avgDelivery = comparison.length > 0
      ? Math.round(comparison.reduce((s, c) => s + c.delivery_rate, 0) / comparison.length)
      : 0;
    const avgOpen = comparison.length > 0
      ? Math.round(comparison.reduce((s, c) => s + c.open_rate, 0) / comparison.length)
      : 0;

    res.json({
      campaigns: comparison,
      averages: {
        avg_delivery_rate: avgDelivery,
        avg_open_rate: avgOpen,
      },
      total_campaigns: comparison.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
