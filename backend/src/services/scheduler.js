const { db } = require('../database');
const { getConnection, getConnectionByTenant } = require('./whatsapp');

let schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) return; // already running

  console.log('[Scheduler] Started - checking every 30 seconds for scheduled campaigns');

  schedulerInterval = setInterval(() => {
    try {
      checkScheduledCampaigns();
    } catch (err) {
      console.error('[Scheduler] Error checking campaigns:', err.message);
    }
  }, 30 * 1000);

  // Also run once immediately
  try {
    checkScheduledCampaigns();
  } catch (err) {
    console.error('[Scheduler] Initial check error:', err.message);
  }
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

function checkScheduledCampaigns() {
  // Find campaigns that are scheduled and whose scheduled_at has passed
  const dueCampaigns = db.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= datetime('now')
    ORDER BY scheduled_at ASC
  `).all();

  for (const campaign of dueCampaigns) {
    console.log(`[Scheduler] Starting scheduled campaign: ${campaign.id} (${campaign.name})`);

    // Mark as sending
    db.prepare(`UPDATE campaigns SET status = 'sending', updated_at = datetime('now') WHERE id = ?`).run(campaign.id);

    // Determine message config
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

    // Import sendCampaignMessages dynamically to avoid circular deps
    const { sendCampaignMessages } = require('../routes/send-message');
    const deviceId = campaign.device_id || null;

    sendCampaignMessages(campaign.tenant_id, deviceId, campaign.id, messageType, msgConfig)
      .catch(err => {
        console.error(`[Scheduler] Campaign ${campaign.id} send error:`, err.message);
        db.prepare(`UPDATE campaigns SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(campaign.id);
      });
  }
}

module.exports = { startScheduler, stopScheduler };
