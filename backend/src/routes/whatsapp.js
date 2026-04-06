const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus } = require('../services/whatsapp');

const router = express.Router();

// Get WhatsApp connection status
router.get('/status', authMiddleware, (req, res) => {
  const status = getStatus(req.tenant.id);
  res.json(status);
});

// Connect WhatsApp (generates QR code)
router.post('/connect', authMiddleware, async (req, res) => {
  try {
    const result = await connectWhatsApp(req.tenant.id);
    res.json(result);
  } catch (err) {
    console.error('Connect error:', err);
    res.status(500).json({ error: 'Failed to connect WhatsApp' });
  }
});

// Disconnect WhatsApp
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    await disconnectWhatsApp(req.tenant.id);
    res.json({ status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Send message
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'to and message required' });
    const result = await sendMessage(req.tenant.id, to, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
