const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { getConnection } = require('../services/whatsapp');

const router = express.Router();

// List all groups for a connected WhatsApp device
router.get('/groups', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    // Verify device belongs to tenant
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(deviceId, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const conn = getConnection(deviceId);
    if (!conn || !conn.sock || conn.status !== 'connected') {
      return res.status(400).json({ error: 'Device is not connected' });
    }

    const groups = await conn.sock.groupFetchAllParticipating();
    const groupList = Object.values(groups).map(g => ({
      id: g.id,
      subject: g.subject,
      owner: g.owner,
      creation: g.creation,
      size: g.size || (g.participants ? g.participants.length : 0),
      desc: g.desc || '',
    }));

    res.json({ groups: groupList });
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get members of a specific group
router.get('/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(deviceId, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const conn = getConnection(deviceId);
    if (!conn || !conn.sock || conn.status !== 'connected') {
      return res.status(400).json({ error: 'Device is not connected' });
    }

    const groupId = req.params.groupId;
    const metadata = await conn.sock.groupMetadata(groupId);

    const members = metadata.participants.map(p => ({
      jid: p.id,
      number: p.id.replace('@s.whatsapp.net', ''),
      name: p.notify || p.id.replace('@s.whatsapp.net', ''),
      role: p.admin || 'member',
    }));

    res.json({
      groupId: metadata.id,
      subject: metadata.subject,
      members,
    });
  } catch (err) {
    console.error('Get group members error:', err);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

// Export group members as JSON
router.post('/export', authMiddleware, async (req, res) => {
  try {
    const { deviceId, groupId } = req.body;
    if (!deviceId || !groupId) return res.status(400).json({ error: 'deviceId and groupId are required' });

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(deviceId, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const conn = getConnection(deviceId);
    if (!conn || !conn.sock || conn.status !== 'connected') {
      return res.status(400).json({ error: 'Device is not connected' });
    }

    const metadata = await conn.sock.groupMetadata(groupId);

    const members = metadata.participants.map(p => ({
      name: p.notify || p.id.replace('@s.whatsapp.net', ''),
      number: p.id.replace('@s.whatsapp.net', ''),
      jid: p.id,
      role: p.admin || 'member',
    }));

    res.json({ members });
  } catch (err) {
    console.error('Export group members error:', err);
    res.status(500).json({ error: 'Failed to export group members' });
  }
});

// Add group members to contacts table
router.post('/add-to-contacts', authMiddleware, async (req, res) => {
  try {
    const { deviceId, groupId } = req.body;
    if (!deviceId || !groupId) return res.status(400).json({ error: 'deviceId and groupId are required' });

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(deviceId, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const conn = getConnection(deviceId);
    if (!conn || !conn.sock || conn.status !== 'connected') {
      return res.status(400).json({ error: 'Device is not connected' });
    }

    const metadata = await conn.sock.groupMetadata(groupId);

    let added = 0;
    let skipped = 0;

    const insertStmt = db.prepare(
      `INSERT INTO contacts (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)`
    );
    const checkStmt = db.prepare(
      `SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?`
    );

    for (const p of metadata.participants) {
      const phone = p.id.replace('@s.whatsapp.net', '');
      const name = p.notify || phone;

      const existing = checkStmt.get(req.tenant.id, phone);
      if (existing) {
        skipped++;
        continue;
      }

      insertStmt.run(uuidv4(), req.tenant.id, phone, name);
      added++;
    }

    res.json({ added, skipped, total: metadata.participants.length });
  } catch (err) {
    console.error('Add to contacts error:', err);
    res.status(500).json({ error: 'Failed to add group members to contacts' });
  }
});

module.exports = router;
