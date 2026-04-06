const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM tenants WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = uuid();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO tenants (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, name, email.toLowerCase(), hash);

    // Create default chatbot config
    db.prepare('INSERT INTO chatbot_configs (id, tenant_id) VALUES (?, ?)').run(uuid(), id);

    const tenant = { id, email: email.toLowerCase(), name };
    const token = generateToken(tenant);
    res.json({ token, tenant: { id, name, email: email.toLowerCase(), plan: 'free' } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE email = ?').get(email.toLowerCase());
    if (!tenant || !bcrypt.compareSync(password, tenant.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(tenant);
    res.json({ token, tenant: { id: tenant.id, name: tenant.name, email: tenant.email, plan: tenant.plan } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current tenant
router.get('/me', authMiddleware, (req, res) => {
  const tenant = db.prepare('SELECT id, name, email, plan, created_at FROM tenants WHERE id = ?').get(req.tenant.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json(tenant);
});

module.exports = router;
