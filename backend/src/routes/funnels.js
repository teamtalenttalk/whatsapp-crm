const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// GET /api/funnels/conversion — Message-to-sale conversion funnel
router.get('/conversion', authMiddleware, (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.tenant.id;

    let dateFilter = '';
    const params = [tenantId];
    if (from) {
      dateFilter += ' AND c.created_at >= ?';
      params.push(from);
    }
    if (to) {
      dateFilter += ' AND c.created_at <= ?';
      params.push(to);
    }

    // Stage 1: Total contacts
    const totalContacts = db.prepare(
      `SELECT COUNT(*) AS cnt FROM contacts WHERE tenant_id = ?${dateFilter.replace(/c\./g, '')}`
    ).get(...params)?.cnt || 0;

    // Stage 2: Contacts with messages (engaged)
    const engaged = db.prepare(`
      SELECT COUNT(DISTINCT c.id) AS cnt FROM contacts c
      JOIN messages m ON m.contact_id = c.id
      WHERE c.tenant_id = ?${dateFilter}
    `).get(...params)?.cnt || 0;

    // Stage 3: Contacts with 2-way conversations (responded)
    const responded = db.prepare(`
      SELECT COUNT(DISTINCT c.id) AS cnt FROM contacts c
      WHERE c.tenant_id = ?${dateFilter}
      AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outgoing')
      AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'incoming')
    `).get(...params)?.cnt || 0;

    // Stage 4: Contacts who made a purchase
    const purchased = db.prepare(`
      SELECT COUNT(DISTINCT c.id) AS cnt FROM contacts c
      JOIN sales s ON s.customer_phone = c.phone AND s.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?${dateFilter}
    `).get(...params)?.cnt || 0;

    // Stage 5: Repeat customers (2+ purchases)
    const repeat = db.prepare(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT c.id FROM contacts c
        JOIN sales s ON s.customer_phone = c.phone AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?${dateFilter}
        GROUP BY c.id
        HAVING COUNT(s.id) >= 2
      )
    `).get(...params)?.cnt || 0;

    const funnel = [
      { stage: 'Total Contacts', count: totalContacts, rate: 100 },
      { stage: 'Engaged (Messaged)', count: engaged, rate: totalContacts > 0 ? Math.round((engaged / totalContacts) * 100) : 0 },
      { stage: 'Responded (2-way)', count: responded, rate: totalContacts > 0 ? Math.round((responded / totalContacts) * 100) : 0 },
      { stage: 'Purchased', count: purchased, rate: totalContacts > 0 ? Math.round((purchased / totalContacts) * 100) : 0 },
      { stage: 'Repeat Customer', count: repeat, rate: totalContacts > 0 ? Math.round((repeat / totalContacts) * 100) : 0 },
    ];

    // Overall conversion
    const overallConversion = totalContacts > 0 ? Math.round((purchased / totalContacts) * 100) : 0;

    res.json({
      funnel,
      overall_conversion_rate: overallConversion,
      period: { from: from || 'all-time', to: to || 'now' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/funnels/drop-off — Analyze where contacts drop off
router.get('/drop-off', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;

    // Contacts with no messages (never engaged)
    const neverEngaged = db.prepare(`
      SELECT COUNT(*) AS cnt FROM contacts c
      WHERE c.tenant_id = ?
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id)
    `).get(tenantId)?.cnt || 0;

    // Contacts messaged but never responded
    const noResponse = db.prepare(`
      SELECT COUNT(*) AS cnt FROM contacts c
      WHERE c.tenant_id = ?
      AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outgoing')
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'incoming')
    `).get(tenantId)?.cnt || 0;

    // Contacts who responded but never purchased
    const respondedNoPurchase = db.prepare(`
      SELECT COUNT(*) AS cnt FROM contacts c
      WHERE c.tenant_id = ?
      AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'incoming')
      AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_phone = c.phone AND s.tenant_id = ?)
    `).get(tenantId, tenantId)?.cnt || 0;

    // Contacts who purchased once but not again (last 30 days)
    const singlePurchase = db.prepare(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT c.id FROM contacts c
        JOIN sales s ON s.customer_phone = c.phone AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
        GROUP BY c.id
        HAVING COUNT(s.id) = 1
      )
    `).get(tenantId)?.cnt || 0;

    // Stale contacts (no activity in 30 days)
    const stale = db.prepare(`
      SELECT COUNT(*) AS cnt FROM contacts c
      WHERE c.tenant_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM messages m WHERE m.contact_id = c.id
        AND m.timestamp >= datetime('now', '-30 days')
      )
    `).get(tenantId)?.cnt || 0;

    // Unsubscribed contacts
    const unsubscribed = db.prepare(
      "SELECT COUNT(*) AS cnt FROM unsubscribes WHERE tenant_id = ?"
    ).get(tenantId)?.cnt || 0;

    const dropOff = [
      { reason: 'Never Engaged', count: neverEngaged, action: 'Send initial outreach campaign' },
      { reason: 'No Response', count: noResponse, action: 'Try different message type or timing' },
      { reason: 'Responded but No Purchase', count: respondedNoPurchase, action: 'Send product catalog or special offer' },
      { reason: 'Single Purchase Only', count: singlePurchase, action: 'Send loyalty offer or follow-up' },
      { reason: 'Stale (30+ days inactive)', count: stale, action: 'Re-engagement campaign' },
      { reason: 'Unsubscribed', count: unsubscribed, action: 'Respect opt-out, improve content quality' },
    ];

    res.json({
      drop_off_analysis: dropOff,
      total_contacts: db.prepare("SELECT COUNT(*) AS cnt FROM contacts WHERE tenant_id = ?").get(tenantId)?.cnt || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
