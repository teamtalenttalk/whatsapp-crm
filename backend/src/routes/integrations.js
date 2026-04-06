const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const VALID_PROVIDERS = ['openai', 'azure_openai', 'gemini', 'grok', 'claude', 'groq'];

// List all integrations for tenant
router.get('/', authMiddleware, (req, res) => {
  try {
    const integrations = db.prepare(
      `SELECT * FROM integrations WHERE tenant_id = ? ORDER BY provider`
    ).all(req.tenant.id);

    // Return all providers, filling in defaults for missing ones
    const result = VALID_PROVIDERS.map(provider => {
      const existing = integrations.find(i => i.provider === provider);
      if (existing) return existing;
      return {
        id: null,
        tenant_id: req.tenant.id,
        provider,
        api_key: '',
        model: '',
        enabled: 0,
        response_format: 'json_schema',
        created_at: null,
        updated_at: null,
      };
    });

    res.json({ integrations: result });
  } catch (err) {
    console.error('List integrations error:', err);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

// Update integration config for a provider
router.put('/:provider', authMiddleware, (req, res) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    const { api_key, model, enabled, response_format } = req.body;

    const existing = db.prepare(
      `SELECT * FROM integrations WHERE tenant_id = ? AND provider = ?`
    ).get(req.tenant.id, provider);

    if (existing) {
      db.prepare(
        `UPDATE integrations SET
          api_key = COALESCE(?, api_key),
          model = COALESCE(?, model),
          enabled = COALESCE(?, enabled),
          response_format = COALESCE(?, response_format),
          updated_at = datetime('now')
        WHERE tenant_id = ? AND provider = ?`
      ).run(
        api_key !== undefined ? api_key : null,
        model !== undefined ? model : null,
        enabled !== undefined ? (enabled ? 1 : 0) : null,
        response_format !== undefined ? response_format : null,
        req.tenant.id,
        provider
      );
    } else {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO integrations (id, tenant_id, provider, api_key, model, enabled, response_format)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.tenant.id,
        provider,
        api_key || '',
        model || '',
        enabled ? 1 : 0,
        response_format || 'json_schema'
      );
    }

    const updated = db.prepare(
      `SELECT * FROM integrations WHERE tenant_id = ? AND provider = ?`
    ).get(req.tenant.id, provider);

    res.json(updated);
  } catch (err) {
    console.error('Update integration error:', err);
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

module.exports = router;
