const { db } = require('../database');
const { getConnection, getConnectionByTenant, sendMessage } = require('./whatsapp');

let schedulerInterval = null;
let alertsInterval = null;
let lastAlertCheck = {};  // Track last alert time per tenant to avoid spam

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

  // Alerts & reminders check every 5 minutes
  alertsInterval = setInterval(() => {
    try {
      checkInventoryAlerts();
    } catch (err) {
      console.error('[Scheduler] Inventory alerts error:', err.message);
    }
    try {
      checkMeetingReminders();
    } catch (err) {
      console.error('[Scheduler] Meeting reminders error:', err.message);
    }
  }, 5 * 60 * 1000);

  // Daily summary check every 30 minutes (sends at configured time)
  setInterval(() => {
    try {
      checkDailySummary();
    } catch (err) {
      console.error('[Scheduler] Daily summary error:', err.message);
    }
  }, 30 * 60 * 1000);

  // Run campaign check once immediately
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
  }
  if (alertsInterval) {
    clearInterval(alertsInterval);
    alertsInterval = null;
  }
  console.log('[Scheduler] Stopped');
}

// ─── Campaign Scheduling ──────────────────────────────────────────────────────
function checkScheduledCampaigns() {
  const dueCampaigns = db.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= datetime('now')
    ORDER BY scheduled_at ASC
  `).all();

  for (const campaign of dueCampaigns) {
    console.log(`[Scheduler] Starting scheduled campaign: ${campaign.id} (${campaign.name})`);

    db.prepare(`UPDATE campaigns SET status = 'sending', updated_at = datetime('now') WHERE id = ?`).run(campaign.id);

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

    const { sendCampaignMessages } = require('../routes/send-message');
    const deviceId = campaign.device_id || null;

    sendCampaignMessages(campaign.tenant_id, deviceId, campaign.id, messageType, msgConfig)
      .catch(err => {
        console.error(`[Scheduler] Campaign ${campaign.id} send error:`, err.message);
        db.prepare(`UPDATE campaigns SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(campaign.id);
      });
  }
}

// ─── Smart Inventory Alerts ───────────────────────────────────────────────────
// Sends WhatsApp notification to tenant's own number when products fall below min_stock
function checkInventoryAlerts() {
  // Get all tenants that have settings with inventory alerts enabled
  const tenants = db.prepare('SELECT id FROM tenants').all();

  for (const tenant of tenants) {
    try {
      // Check if tenant has a connected device
      const conn = getConnectionByTenant(tenant.id);
      if (!conn || conn.status !== 'connected') continue;

      // Rate limit: max one alert per tenant per hour
      const lastAlert = lastAlertCheck[tenant.id] || 0;
      if (Date.now() - lastAlert < 60 * 60 * 1000) continue;

      // Find products below min_stock
      const lowStockProducts = db.prepare(`
        SELECT name, sku, stock_qty, min_stock, category
        FROM products
        WHERE tenant_id = ? AND is_active = 1 AND stock_qty <= min_stock
        ORDER BY stock_qty ASC
      `).all(tenant.id);

      if (lowStockProducts.length === 0) continue;

      // Build alert message
      const outOfStock = lowStockProducts.filter(p => p.stock_qty === 0);
      const lowStock = lowStockProducts.filter(p => p.stock_qty > 0);

      let message = `📦 *Inventory Alert*\n\n`;

      if (outOfStock.length > 0) {
        message += `🔴 *Out of Stock (${outOfStock.length}):*\n`;
        outOfStock.forEach(p => {
          message += `  • ${p.name}${p.sku ? ` (${p.sku})` : ''}\n`;
        });
        message += '\n';
      }

      if (lowStock.length > 0) {
        message += `🟡 *Low Stock (${lowStock.length}):*\n`;
        lowStock.forEach(p => {
          message += `  • ${p.name}${p.sku ? ` (${p.sku})` : ''} — ${p.stock_qty}/${p.min_stock} remaining\n`;
        });
      }

      message += `\n_Total ${lowStockProducts.length} product(s) need attention._`;

      // Get tenant's own phone from connected device
      const device = db.prepare(
        "SELECT phone_number FROM devices WHERE tenant_id = ? AND status = 'connected' LIMIT 1"
      ).get(tenant.id);

      if (device && device.phone_number) {
        sendMessage(tenant.id, device.phone_number, message)
          .then(() => {
            console.log(`[Inventory Alert] Sent to tenant ${tenant.id}: ${lowStockProducts.length} products`);
            lastAlertCheck[tenant.id] = Date.now();
          })
          .catch(err => {
            console.error(`[Inventory Alert] Failed for tenant ${tenant.id}:`, err.message);
          });
      }
    } catch (err) {
      console.error(`[Inventory Alert] Error for tenant ${tenant.id}:`, err.message);
    }
  }
}

// ─── Meeting Reminders ────────────────────────────────────────────────────────
// Sends WhatsApp reminder to contacts 1 day before their meeting
function checkMeetingReminders() {
  const tenants = db.prepare('SELECT id FROM tenants').all();

  for (const tenant of tenants) {
    try {
      const conn = getConnectionByTenant(tenant.id);
      if (!conn || conn.status !== 'connected') continue;

      // Find meetings scheduled for tomorrow that haven't been reminded yet
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const meetings = db.prepare(`
        SELECT id, contact_phone, contact_name, date, time, service, notes, duration_minutes, location, meeting_link
        FROM appointments
        WHERE tenant_id = ? AND date = ? AND status = 'pending' AND reminder_sent = 0
      `).all(tenant.id, tomorrowStr);

      for (const meeting of meetings) {
        if (!meeting.contact_phone) continue;

        let message = `📅 *Meeting Reminder*\n\n`;
        message += `Hi${meeting.contact_name ? ` ${meeting.contact_name}` : ''},\n\n`;
        message += `This is a reminder about your meeting tomorrow:\n\n`;
        message += `🕐 *Time:* ${meeting.time}`;
        if (meeting.duration_minutes) message += ` (${meeting.duration_minutes} min)`;
        message += '\n';
        if (meeting.service) message += `📋 *Service:* ${meeting.service}\n`;
        if (meeting.location) message += `📍 *Location:* ${meeting.location}\n`;
        if (meeting.meeting_link) message += `🔗 *Link:* ${meeting.meeting_link}\n`;
        message += `\nPlease let us know if you need to reschedule. See you tomorrow!`;

        sendMessage(tenant.id, meeting.contact_phone, message)
          .then(() => {
            // Mark as reminded
            db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(meeting.id);
            console.log(`[Meeting Reminder] Sent to ${meeting.contact_phone} for meeting ${meeting.id}`);
          })
          .catch(err => {
            console.error(`[Meeting Reminder] Failed for meeting ${meeting.id}:`, err.message);
          });
      }
    } catch (err) {
      console.error(`[Meeting Reminder] Error for tenant ${tenant.id}:`, err.message);
    }
  }
}

// ─── AI Daily Summary ─────────────────────────────────────────────────────────
// Sends end-of-day summary of meetings and sales via WhatsApp
let lastSummaryDate = {};

function checkDailySummary() {
  const now = new Date();
  const hour = now.getHours();

  // Send daily summary between 8 PM and 9 PM
  if (hour < 20 || hour >= 21) return;

  const todayStr = now.toISOString().slice(0, 10);
  const tenants = db.prepare('SELECT id FROM tenants').all();

  for (const tenant of tenants) {
    try {
      // Only send once per day per tenant
      if (lastSummaryDate[tenant.id] === todayStr) continue;

      const conn = getConnectionByTenant(tenant.id);
      if (!conn || conn.status !== 'connected') continue;

      // Get today's sales stats
      const salesStats = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
        FROM sales WHERE tenant_id = ? AND date(created_at) = ?
      `).get(tenant.id, todayStr);

      // Get today's meetings
      const meetingStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM appointments WHERE tenant_id = ? AND date = ?
      `).get(tenant.id, todayStr);

      // Get top sold products today
      const topProducts = db.prepare(`
        SELECT p.name, SUM(si.quantity) as qty, SUM(si.total) as revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE s.tenant_id = ? AND date(s.created_at) = ?
        GROUP BY si.product_id
        ORDER BY revenue DESC LIMIT 5
      `).all(tenant.id, todayStr);

      // Get inventory alerts count
      const lowStockCount = db.prepare(`
        SELECT COUNT(*) as count FROM products
        WHERE tenant_id = ? AND is_active = 1 AND stock_qty <= min_stock
      `).get(tenant.id);

      // Skip if nothing happened today
      if (salesStats.count === 0 && meetingStats.total === 0) continue;

      // Build summary message
      let message = `📊 *Daily Summary — ${todayStr}*\n\n`;

      // Sales section
      message += `💰 *Sales*\n`;
      if (salesStats.count > 0) {
        message += `  • Orders: ${salesStats.count}\n`;
        message += `  • Revenue: $${Number(salesStats.revenue).toFixed(2)}\n`;
        if (topProducts.length > 0) {
          message += `  • Top products:\n`;
          topProducts.forEach(p => {
            message += `    - ${p.name}: ${p.qty} sold ($${Number(p.revenue).toFixed(2)})\n`;
          });
        }
      } else {
        message += `  No sales today.\n`;
      }

      message += '\n';

      // Meetings section
      message += `📅 *Meetings*\n`;
      if (meetingStats.total > 0) {
        message += `  • Total: ${meetingStats.total}\n`;
        if (meetingStats.completed > 0) message += `  • Completed: ${meetingStats.completed} ✅\n`;
        if (meetingStats.cancelled > 0) message += `  • Cancelled: ${meetingStats.cancelled} ❌\n`;
        if (meetingStats.pending > 0) message += `  • Still pending: ${meetingStats.pending} ⏳\n`;
      } else {
        message += `  No meetings today.\n`;
      }

      // Inventory warnings
      if (lowStockCount.count > 0) {
        message += `\n⚠️ *Inventory:* ${lowStockCount.count} product(s) need restocking.\n`;
      }

      message += `\n_Have a great evening!_ 🌙`;

      // Send to tenant's own phone
      const device = db.prepare(
        "SELECT phone_number FROM devices WHERE tenant_id = ? AND status = 'connected' LIMIT 1"
      ).get(tenant.id);

      if (device && device.phone_number) {
        sendMessage(tenant.id, device.phone_number, message)
          .then(() => {
            lastSummaryDate[tenant.id] = todayStr;
            console.log(`[Daily Summary] Sent to tenant ${tenant.id}`);
          })
          .catch(err => {
            console.error(`[Daily Summary] Failed for tenant ${tenant.id}:`, err.message);
          });
      }
    } catch (err) {
      console.error(`[Daily Summary] Error for tenant ${tenant.id}:`, err.message);
    }
  }
}

module.exports = { startScheduler, stopScheduler };
