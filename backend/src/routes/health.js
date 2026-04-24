const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET /api/health — comprehensive health check
router.get('/', (req, res) => {
  const checks = {};
  let healthy = true;

  // 1. Database check
  try {
    const row = db.prepare("SELECT COUNT(*) AS cnt FROM tenants").get();
    checks.database = { status: 'ok', tenants: row.cnt };
  } catch (err) {
    checks.database = { status: 'error', message: err.message };
    healthy = false;
  }

  // 2. WhatsApp service check
  try {
    const sessions = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='connected' THEN 1 ELSE 0 END) AS connected FROM devices").get();
    checks.whatsapp = {
      status: 'ok',
      total_devices: sessions.total,
      connected_devices: sessions.connected || 0,
    };
  } catch (err) {
    checks.whatsapp = { status: 'error', message: err.message };
    healthy = false;
  }

  // 3. Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
  };

  // 4. Uptime
  checks.uptime_seconds = Math.floor(process.uptime());

  const statusCode = healthy ? 200 : 503;
  res.status(statusCode).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'whatsapp-crm-backend',
    version: require('../../package.json').version,
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;
