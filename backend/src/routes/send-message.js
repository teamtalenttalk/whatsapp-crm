const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { getConnection, getConnectionByTenant } = require('../services/whatsapp');

const router = express.Router();

// Helper: build Baileys message payload from campaign config
function buildMessagePayload(messageType, { message, buttons, listTitle, listButtonText, listSections, mediaUrl, mediaType, mediaCaption }) {
  switch (messageType) {
    case 'buttons': {
      const baileysButtons = (buttons || []).slice(0, 5).map((btn, i) => ({
        buttonId: `btn_${i}`,
        buttonText: { displayText: btn.text || '' },
        type: 1,
      }));
      return { text: message || '', buttons: baileysButtons, headerType: 1 };
    }
    case 'list': {
      const sections = (listSections || []).map(sec => ({
        title: sec.title || '',
        rows: (sec.rows || []).map((row, i) => ({
          title: row.title || '',
          description: row.description || '',
          rowId: `row_${i}`,
        })),
      }));
      return { text: message || '', buttonText: listButtonText || 'View Options', sections };
    }
    case 'media': {
      const mt = (mediaType || 'image').toLowerCase();
      if (mt === 'video') {
        return { video: { url: mediaUrl }, caption: mediaCaption || '' };
      } else if (mt === 'document') {
        const fileName = mediaUrl ? mediaUrl.split('/').pop() : 'document.pdf';
        return { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName, caption: mediaCaption || '' };
      } else {
        // default image
        return { image: { url: mediaUrl }, caption: mediaCaption || '' };
      }
    }
    default:
      return { text: message || '' };
  }
}

// Helper: get delay settings for tenant
function getDelay(tenantId) {
  const settings = db.prepare('SELECT * FROM settings WHERE tenant_id = ?').get(tenantId);
  if (!settings || !settings.delay_enabled) return 0;
  const min = (settings.delay_min || 3) * 1000;
  const max = (settings.delay_max || 5) * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /api/send-message/send
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const {
      deviceId,
      messageType = 'text',
      message = '',
      buttons = [],
      listTitle = '',
      listButtonText = 'View Options',
      listSections = [],
      mediaUrl = '',
      mediaType = '',
      mediaCaption = '',
      phones = [],
      excludeUnsubscribed = false,
      templateId,
      scheduledAt,
      campaignName = '',
    } = req.body;

    if (!phones || phones.length === 0) {
      return res.status(400).json({ error: 'No phone numbers provided' });
    }

    // If templateId provided, load template data
    let finalMessage = message;
    let finalButtons = buttons;
    let finalMediaUrl = mediaUrl;
    let finalMediaType = mediaType;
    let finalMediaCaption = mediaCaption;

    if (templateId) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ? AND tenant_id = ?').get(templateId, tenantId);
      if (template) {
        finalMessage = template.message || finalMessage;
        finalButtons = template.buttons ? JSON.parse(template.buttons) : finalButtons;
        finalMediaUrl = template.media_url || finalMediaUrl;
      }
    }

    // Filter out unsubscribed numbers if requested
    let targetPhones = [...phones];
    if (excludeUnsubscribed) {
      const unsubs = db.prepare('SELECT phone FROM unsubscribes WHERE tenant_id = ?').all(tenantId).map(u => u.phone);
      targetPhones = targetPhones.filter(p => !unsubs.includes(p));
    }

    // Create campaign record
    const campaignId = uuid();
    db.prepare(`INSERT INTO campaigns (id, tenant_id, name, message_template, media_url, status, total_recipients, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      campaignId, tenantId, campaignName || `Campaign ${new Date().toISOString().slice(0, 16)}`,
      finalMessage, finalMediaUrl,
      scheduledAt ? 'scheduled' : 'sending',
      targetPhones.length,
      scheduledAt || null
    );

    // Create campaign_messages records for each phone
    const insertMsg = db.prepare(`INSERT INTO campaign_messages (id, campaign_id, tenant_id, phone, status, created_at) VALUES (?, ?, ?, ?, 'pending', datetime('now'))`);
    const insertMany = db.transaction((phoneList) => {
      for (const phone of phoneList) {
        insertMsg.run(uuid(), campaignId, tenantId, phone);
      }
    });
    insertMany(targetPhones);

    // If scheduled, just save and return
    if (scheduledAt) {
      return res.json({
        campaignId,
        status: 'scheduled',
        scheduledAt,
        totalRecipients: targetPhones.length,
      });
    }

    // Send immediately (async, respond right away)
    res.json({
      campaignId,
      status: 'sending',
      totalRecipients: targetPhones.length,
    });

    // Fire-and-forget sending loop
    sendCampaignMessages(tenantId, deviceId, campaignId, messageType, {
      message: finalMessage, buttons: finalButtons, listTitle, listButtonText, listSections,
      mediaUrl: finalMediaUrl, mediaType: finalMediaType, mediaCaption: finalMediaCaption,
    }).catch(err => console.error(`[Campaign ${campaignId}] Send error:`, err.message));

  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

// Internal: send campaign messages with delay
async function sendCampaignMessages(tenantId, deviceId, campaignId, messageType, msgConfig) {
  const conn = deviceId ? getConnection(deviceId) : getConnectionByTenant(tenantId);
  if (!conn || !conn.sock || conn.status !== 'connected') {
    db.prepare(`UPDATE campaigns SET status = 'failed' WHERE id = ?`).run(campaignId);
    db.prepare(`UPDATE campaign_messages SET status = 'failed', error = 'Device not connected' WHERE campaign_id = ? AND status = 'pending'`).run(campaignId);
    return;
  }

  const sock = conn.sock;
  const payload = buildMessagePayload(messageType, msgConfig);
  const pendingMessages = db.prepare(`SELECT * FROM campaign_messages WHERE campaign_id = ? AND status = 'pending' ORDER BY created_at`).all(campaignId);

  let sentCount = 0;
  let failedCount = 0;

  for (const cm of pendingMessages) {
    // Check if campaign was cancelled
    const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
    if (campaign && campaign.status === 'cancelled') break;

    const jid = cm.phone.includes('@') ? cm.phone : `${cm.phone}@s.whatsapp.net`;

    try {
      const result = await sock.sendMessage(jid, payload);
      const waMessageId = result?.key?.id || null;

      db.prepare(`UPDATE campaign_messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).run(cm.id);
      sentCount++;

      // Also save to messages table for chat history
      const phone = cm.phone.replace('@s.whatsapp.net', '');
      let contact = db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(tenantId, phone);
      if (!contact) {
        const contactId = uuid();
        db.prepare('INSERT INTO contacts (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)').run(contactId, tenantId, phone, phone);
        contact = { id: contactId };
      }
      const msgId = uuid();
      db.prepare(`INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, message_type, content, wa_message_id, delivery_status, timestamp) VALUES (?, ?, ?, ?, 'outgoing', ?, ?, ?, 'sent', datetime('now'))`).run(
        msgId, tenantId, contact.id, jid, messageType, msgConfig.message || '', waMessageId
      );

      // Update campaign counts
      db.prepare(`UPDATE campaigns SET sent_count = ?, updated_at = datetime('now') WHERE id = ?`).run(sentCount, campaignId);

    } catch (err) {
      db.prepare(`UPDATE campaign_messages SET status = 'failed', error = ? WHERE id = ?`).run(err.message, cm.id);
      failedCount++;
      db.prepare(`UPDATE campaigns SET failed_count = ?, updated_at = datetime('now') WHERE id = ?`).run(failedCount, campaignId);
    }

    // Delay between messages
    const delay = getDelay(tenantId);
    if (delay > 0) await sleep(delay);
  }

  // Mark campaign complete
  db.prepare(`UPDATE campaigns SET status = 'completed', sent_count = ?, failed_count = ?, updated_at = datetime('now') WHERE id = ?`).run(sentCount, failedCount, campaignId);
}

module.exports = router;
module.exports.sendCampaignMessages = sendCampaignMessages;
module.exports.buildMessagePayload = buildMessagePayload;
