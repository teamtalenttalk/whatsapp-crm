const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { connectWhatsApp, disconnectWhatsApp, getConnection, getStatus } = require('../services/whatsapp');

const router = express.Router();

// List devices for tenant
router.get('/', authMiddleware, (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenant.id);
    // Enrich with live connection status
    const enriched = devices.map(d => {
      const conn = getConnection(d.id);
      return {
        ...d,
        live_status: conn ? conn.status : d.status,
      };
    });
    res.json({ devices: enriched });
  } catch (err) {
    console.error('List devices error:', err);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

// Create device
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Device name is required' });

    // Check max 10 per tenant
    const count = db.prepare('SELECT COUNT(*) as cnt FROM devices WHERE tenant_id = ?').get(req.tenant.id).cnt;
    if (count >= 10) return res.status(400).json({ error: 'Maximum 10 devices per account' });

    const id = uuid();
    db.prepare(`INSERT INTO devices (id, tenant_id, name) VALUES (?, ?, ?)`).run(id, req.tenant.id, name);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    res.json(device);
  } catch (err) {
    console.error('Create device error:', err);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// Update device name
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    db.prepare(`UPDATE devices SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name || device.name, req.params.id);
    const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update device error:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Disconnect if connected
    try {
      await disconnectWhatsApp(req.tenant.id, req.params.id);
    } catch (e) { /* ignore disconnect errors */ }

    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete device error:', err);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Connect a specific device (generates QR)
router.post('/:id/connect', authMiddleware, async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const result = await connectWhatsApp(req.tenant.id, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Connect device error:', err);
    res.status(500).json({ error: 'Failed to connect device' });
  }
});

// Disconnect a specific device
router.post('/:id/disconnect', authMiddleware, async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    await disconnectWhatsApp(req.tenant.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect device error:', err);
    res.status(500).json({ error: 'Failed to disconnect device' });
  }
});

// Get device status + QR code
router.get('/:id/status', authMiddleware, (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const status = getStatus(req.tenant.id, req.params.id);
    res.json(status);
  } catch (err) {
    console.error('Device status error:', err);
    res.status(500).json({ error: 'Failed to get device status' });
  }
});

module.exports = router;
