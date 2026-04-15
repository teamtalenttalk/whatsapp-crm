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
      name TEXT NOT NULL DEFAULT '',
      device_id TEXT,
      message_type TEXT DEFAULT 'text',
      message_template TEXT DEFAULT '',
      buttons TEXT DEFAULT '[]',
      list_config TEXT DEFAULT '{}',
      media_url TEXT DEFAULT '',
      media_type TEXT DEFAULT '',
      media_caption TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      read_count INTEGER DEFAULT 0,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Campaign recipients (legacy)
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      error TEXT
    );

    -- Campaign messages (per-phone tracking)
    CREATE TABLE IF NOT EXISTS campaign_messages (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
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

    -- Devices (multiple WhatsApp instances per tenant)
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT DEFAULT 'My Device',
      phone_number TEXT,
      status TEXT DEFAULT 'disconnected',
      profile_pic TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Welcome messages
    CREATE TABLE IF NOT EXISTS welcome_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      device_id TEXT,
      enabled INTEGER DEFAULT 1,
      message_type TEXT DEFAULT 'text',
      message TEXT NOT NULL,
      buttons TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Auto reply rules
    CREATE TABLE IF NOT EXISTS auto_replies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      device_id TEXT,
      enabled INTEGER DEFAULT 1,
      keyword TEXT NOT NULL,
      match_type TEXT DEFAULT 'contains',
      message_type TEXT DEFAULT 'text',
      message TEXT NOT NULL,
      buttons TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Message templates
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      message TEXT NOT NULL,
      buttons TEXT,
      media_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Contact groups
    CREATE TABLE IF NOT EXISTS contact_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Contact group members
    CREATE TABLE IF NOT EXISTS contact_group_members (
      group_id TEXT NOT NULL REFERENCES contact_groups(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      PRIMARY KEY (group_id, contact_id)
    );

    -- Unsubscribes (opt-out list)
    CREATE TABLE IF NOT EXISTS unsubscribes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      phone TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, phone)
    );

    -- Number filter results
    CREATE TABLE IF NOT EXISTS number_filter_results (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      phone TEXT NOT NULL,
      name TEXT,
      is_whatsapp INTEGER,
      account_type TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    );

    -- AI Integrations
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      model TEXT DEFAULT '',
      enabled INTEGER DEFAULT 0,
      response_format TEXT DEFAULT 'json_schema',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, provider)
    );

    -- Tenant Settings
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT UNIQUE NOT NULL,
      delay_enabled INTEGER DEFAULT 1,
      delay_min INTEGER DEFAULT 3,
      delay_max INTEGER DEFAULT 5,
      sleep_enabled INTEGER DEFAULT 0,
      sleep_after_messages INTEGER DEFAULT 20,
      sleep_min INTEGER DEFAULT 5,
      sleep_max INTEGER DEFAULT 10,
      switch_account_after INTEGER DEFAULT 1,
      welcome_message_enabled INTEGER DEFAULT 1,
      welcome_message_duration INTEGER DEFAULT 7,
      send_parallel INTEGER DEFAULT 0,
      show_notification INTEGER DEFAULT 1,
      auto_reply_enabled INTEGER DEFAULT 1,
      auto_read INTEGER DEFAULT 0,
      send_media_first INTEGER DEFAULT 1,
      unsubscribe_enabled INTEGER DEFAULT 1,
      unsubscribe_keyword TEXT DEFAULT 'STOP',
      auto_reject_calls INTEGER DEFAULT 0,
      webhook_url TEXT DEFAULT '',
      webhook_events TEXT DEFAULT '[]',
      default_country_code TEXT DEFAULT '',
      language TEXT DEFAULT 'en',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Products / Inventory
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cost_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      stock_qty INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      unit TEXT DEFAULT 'pcs',
      image_url TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, sku)
    );

    -- Stock movement history
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      type TEXT NOT NULL CHECK(type IN ('add', 'subtract', 'set', 'sale', 'sale_reverse')),
      quantity INTEGER NOT NULL,
      previous_qty INTEGER NOT NULL,
      new_qty INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      reference_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Sales orders
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      invoice_number TEXT,
      customer_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_email TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      payment_method TEXT DEFAULT 'cash',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Sale line items
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for new tables
    CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(tenant_id, sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(tenant_id, category);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(remote_jid, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_welcome_messages_tenant ON welcome_messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_auto_replies_tenant ON auto_replies(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_contact_groups_tenant ON contact_groups(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_unsubscribes_tenant ON unsubscribes(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_number_filter_tenant ON number_filter_results(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_messages_tenant ON campaign_messages(tenant_id);
  `);

  // Add variable1, variable2 columns to contacts if they don't exist
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN variable1 TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN variable2 TEXT`);
  } catch (e) { /* column already exists */ }

  // Add wa_message_id and delivery_status columns to messages if they don't exist
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN wa_message_id TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN delivery_status TEXT DEFAULT 'sent'`);
  } catch (e) { /* column already exists */ }

  // Add new columns to campaigns if upgrading from old schema
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN device_id TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN message_type TEXT DEFAULT 'text'`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN buttons TEXT DEFAULT '[]'`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN list_config TEXT DEFAULT '{}'`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN media_type TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN media_caption TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN delivered_count INTEGER DEFAULT 0`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN read_count INTEGER DEFAULT 0`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN started_at TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN completed_at TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN updated_at TEXT`);
  } catch (e) { /* column already exists */ }

  // Add inventory/meeting alert settings columns
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN inventory_alerts_enabled INTEGER DEFAULT 1`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN meeting_reminders_enabled INTEGER DEFAULT 1`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN daily_summary_enabled INTEGER DEFAULT 1`);
  } catch (e) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN alert_phone TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  console.log('Database initialized');
}

module.exports = { db, initDB };
