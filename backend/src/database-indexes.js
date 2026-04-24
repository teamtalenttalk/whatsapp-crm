/**
 * Performance Indexes for SQLite
 *
 * Run once after DB init to ensure optimal query performance.
 * All statements use IF NOT EXISTS so they are safe to re-run.
 */
const { db } = require('./database');

function ensurePerformanceIndexes() {
  const indexes = [
    // ── Contacts ──────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)',
    'CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(tenant_id, stage)',
    'CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts(tenant_id, tags)',
    'CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(tenant_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(tenant_id, name)',

    // ── Messages ──────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(tenant_id, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(tenant_id, direction)',
    'CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(tenant_id, message_type)',

    // ── Campaigns ─────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(tenant_id, created_at)',

    // ── Campaign Messages ─────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(campaign_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_campaign_messages_phone ON campaign_messages(phone)',

    // ── Products ──────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_products_active ON products(tenant_id, is_active)',
    'CREATE INDEX IF NOT EXISTS idx_products_stock ON products(tenant_id, stock_qty)',
    'CREATE INDEX IF NOT EXISTS idx_products_name ON products(tenant_id, name)',

    // ── Sales ─────────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(customer_phone)',
    'CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number)',

    // ── Appointments ──────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(tenant_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_calendar ON appointments(calendar_id)',

    // ── Devices ───────────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(tenant_id, status)',

    // ── Auto Replies ──────────────────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_auto_replies_keyword ON auto_replies(tenant_id, keyword)',

    // ── Segments (Phase 6 tables) ─────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_segments_tenant ON segments(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_segment_contacts_segment ON segment_contacts(segment_id)',
    'CREATE INDEX IF NOT EXISTS idx_segment_contacts_contact ON segment_contacts(contact_id)',

    // ── Journeys (Phase 6 tables) ─────────────────────────
    'CREATE INDEX IF NOT EXISTS idx_journeys_tenant ON journeys(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_journey_contacts_journey ON journey_contacts(journey_id)',
    'CREATE INDEX IF NOT EXISTS idx_journey_contacts_contact ON journey_contacts(contact_id)',

    // ── AI Chat Logs (Phase 6 tables) ─────────────────────
    'CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_tenant ON ai_chat_logs(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_contact ON ai_chat_logs(contact_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_created ON ai_chat_logs(tenant_id, created_at)',
  ];

  let created = 0;
  for (const sql of indexes) {
    try {
      db.exec(sql);
      created++;
    } catch (err) {
      // Table may not exist yet — that is fine, indexes will be created when tables exist
      // This is expected for Phase 6 tables on first run before Phase 6 migration
    }
  }

  console.log(`[Indexes] Ensured ${created}/${indexes.length} performance indexes`);
}

module.exports = { ensurePerformanceIndexes };
