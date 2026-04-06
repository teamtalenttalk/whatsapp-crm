const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'crm.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    -- Tenants (businesses/clients)
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- WhatsApp sessions per tenant
    CREATE TABLE IF NOT EXISTS wa_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      phone_number TEXT,
      status TEXT DEFAULT 'disconnected',
      session_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Contacts/Leads
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      phone TEXT NOT NULL,
      name TEXT,
      email TEXT,
      tags TEXT DEFAULT '[]',
      notes TEXT,
      stage TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, phone)
    );

    -- Chat messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      contact_id TEXT REFERENCES contacts(id),
      remote_jid TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
      message_type TEXT DEFAULT 'text',
      content TEXT,
      media_url TEXT,
      status TEXT DEFAULT 'sent',
      is_bot_reply INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Chatbot configurations
    CREATE TABLE IF NOT EXISTS chatbot_configs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id),
      enabled INTEGER DEFAULT 0,
      welcome_message TEXT DEFAULT 'Hello! How can I help you today?',
      ai_enabled INTEGER DEFAULT 0,
      ai_prompt TEXT DEFAULT 'You are a helpful business assistant. Answer customer queries politely and concisely.',
      business_info TEXT,
      auto_reply_delay_ms INTEGER DEFAULT 1000,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Bulk campaigns
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      message_template TEXT NOT NULL,
      media_url TEXT,
      status TEXT DEFAULT 'draft',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      scheduled_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Campaign recipients
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      error TEXT
    );

    -- Appointments
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      contact_id TEXT REFERENCES contacts(id),
      contact_phone TEXT,
      contact_name TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      service TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(remote_jid, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
  `);

  console.log('Database initialized');
}

module.exports = { db, initDB };
