const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { sendCampaignMessages, buildMessagePayload } = require('./send-message');

const router = express.Router();

// GET /api/campaigns - List all campaigns with stats
router.get('/', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const campaigns = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'sent') as actual_sent,
        (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'failed') as actual_failed,
        (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'delivered') as delivered_count,
        (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'read') as read_count,
        (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'pending') as pending_count
      FROM campaigns c
      WHERE c.tenant_id = ?
      ORDER BY c.created_at DESC
      LIMIT 100
    `).all(tenantId);

    res.json({ campaigns });
  } catch (err) {
    console.error('List campaigns error:', err);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

// GET /api/campaigns/:id - Get campaign details + per-message status
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const messages = db.prepare(`
      SELECT * FROM campaign_messages WHERE campaign_id = ? ORDER BY created_at
    `).all(req.params.id);

    const stats = {
      total: messages.length,
      pending: messages.filter(m => m.status === 'pending').length,
      sent: messages.filter(m => m.status === 'sent').length,
      delivered: messages.filter(m => m.status === 'delivered').length,
      read: messages.filter(m => m.status === 'read').length,
      failed: messages.filter(m => m.status === 'failed').length,
    };

    res.json({ campaign, messages, stats });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

// POST /api/campaigns/:id/start - Manually start a scheduled/pending campaign
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status !== 'scheduled' && campaign.status !== 'pending' && campaign.status !== 'draft') {
      return res.status(400).json({ error: `Cannot start campaign with status: ${campaign.status}` });
    }

    db.prepare(`UPDATE campaigns SET status = 'sending', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);

    // Determine message config from campaign data
    const messageType = campaign.message_type || 'text';
    const msgConfig = {
      message: campaign.message_template || '',
      buttons: [],
      listTitle: '',
      listButtonText: 'View Options',
      listSections: [],
      mediaUrl: campaign.media_url || '',
      mediaType: '',
      mediaCaption: '',
    };

    // Try to parse buttons/list from campaign data if stored as JSON columns
    try {
      if (campaign.buttons) msgConfig.buttons = JSON.parse(campaign.buttons);
    } catch (e) {}
    try {
      if (campaign.list_config) {
        const lc = JSON.parse(campaign.list_config);
        msgConfig.listTitle = lc.title || '';
        msgConfig.listButtonText = lc.buttonText || 'View Options';
        msgConfig.listSections = lc.sections || [];
      }
    } catch (e) {}

    res.json({ status: 'sending', campaignId: req.params.id });

    // Fire-and-forget sending
    const deviceId = campaign.device_id || null;
    sendCampaignMessages(tenantId, deviceId, req.params.id, messageType, msgConfig)
      .catch(err => console.error(`[Campaign ${req.params.id}] Start error:`, err.message));

  } catch (err) {
    console.error('Start campaign error:', err);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

// POST /api/campaigns/:id/cancel - Cancel a running campaign
router.post('/:id/cancel', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    db.prepare(`UPDATE campaigns SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    res.json({ success: true, status: 'cancelled' });
  } catch (err) {
    console.error('Cancel campaign error:', err);
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
});

// DELETE /api/campaigns/:id - Delete campaign and its messages
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    db.prepare('DELETE FROM campaign_messages WHERE campaign_id = ?').run(req.params.id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

module.exports = router;
