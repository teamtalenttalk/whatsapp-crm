const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

// Store active WhatsApp connections per device (keyed by deviceId)
const connections = new Map();
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

function getConnection(deviceId) {
  return connections.get(deviceId);
}

// Legacy helper: get any connected device for a tenant (used by old routes)
function getConnectionByTenant(tenantId) {
  for (const [deviceId, conn] of connections.entries()) {
    if (conn.tenantId === tenantId && conn.status === 'connected') {
      return conn;
    }
  }
  return null;
}

async function connectWhatsApp(tenantId, deviceId) {
  // If no deviceId provided, fall back to legacy tenant-level connection
  if (!deviceId) {
    // Check for a default device
    let device = db.prepare('SELECT id FROM devices WHERE tenant_id = ? LIMIT 1').get(tenantId);
    if (!device) {
      // Create a default device
      deviceId = uuid();
      db.prepare(`INSERT INTO devices (id, tenant_id, name) VALUES (?, ?, 'Default Device')`).run(deviceId, tenantId);
    } else {
      deviceId = device.id;
    }
  }

  // Prevent duplicate connections
  const existing = connections.get(deviceId);
  if (existing && existing.sock) {
    return { status: 'already_connected', deviceId };
  }

  const sessionsDir = path.join(__dirname, '..', '..', 'data', 'sessions', tenantId, deviceId);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, { trace() {}, debug() {}, info() {}, warn() {}, error() {} }),
    },
    printQRInTerminal: false,
    logger: { trace() {}, debug() {}, info() {}, warn() {}, error: console.error, fatal: console.error, child() { return this; }, level: 'error' },
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  connections.set(deviceId, { sock, status: 'connecting', tenantId, deviceId });

  // Update device + session status in DB
  const updateStatus = (status, phone) => {
    db.prepare(`UPDATE devices SET status = ?, phone_number = COALESCE(?, phone_number), updated_at = datetime('now') WHERE id = ?`).run(status, phone || null, deviceId);

    // Also update legacy wa_sessions table
    const session = db.prepare('SELECT id FROM wa_sessions WHERE tenant_id = ?').get(tenantId);
    if (session) {
      db.prepare(`UPDATE wa_sessions SET status = ?, phone_number = COALESCE(?, phone_number), updated_at = datetime('now') WHERE tenant_id = ?`).run(status, phone || null, tenantId);
    } else {
      db.prepare('INSERT INTO wa_sessions (id, tenant_id, status, phone_number) VALUES (?, ?, ?, ?)').run(uuid(), tenantId, status, phone || null);
    }
    // Notify frontend via socket
    if (io) {
      io.to(`tenant:${tenantId}`).emit('wa:status', { status, phone, deviceId });
    }
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log(`[WA] connection.update for device ${deviceId} (tenant ${tenantId}):`, JSON.stringify({ connection, hasQR: !!qr, qrLen: qr?.length }));

    if (qr) {
      connections.set(deviceId, { ...connections.get(deviceId), status: 'qr', qr });
      updateStatus('waiting_qr');
      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:qr', { qr, deviceId });
      }
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || '';
      connections.set(deviceId, { ...connections.get(deviceId), status: 'connected', qr: null });
      updateStatus('connected', phone);
      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:connected', { phone, deviceId });
      }
      console.log(`[WA] Device ${deviceId} (tenant ${tenantId}) connected: ${phone}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connections.set(deviceId, { ...connections.get(deviceId), status: 'disconnected', qr: null });
      updateStatus('disconnected');
      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:disconnected', { deviceId });
      }
      console.log(`[WA] Device ${deviceId} disconnected. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(tenantId, deviceId), 3000);
      } else {
        connections.delete(deviceId);
        // Clear session files on logout
        if (fs.existsSync(sessionsDir)) {
          fs.rmSync(sessionsDir, { recursive: true, force: true });
        }
      }
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;

    for (const msg of msgs) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const remoteJid = msg.key.remoteJid;
      if (remoteJid === 'status@broadcast') continue;

      const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const pushName = msg.pushName || phone;

      // Extract message content
      let content = '';
      let messageType = 'text';
      if (msg.message.conversation) {
        content = msg.message.conversation;
      } else if (msg.message.extendedTextMessage) {
        content = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        content = msg.message.imageMessage.caption || '[Image]';
        messageType = 'image';
      } else if (msg.message.videoMessage) {
        content = msg.message.videoMessage.caption || '[Video]';
        messageType = 'video';
      } else if (msg.message.documentMessage) {
        content = msg.message.documentMessage.fileName || '[Document]';
        messageType = 'document';
      } else if (msg.message.audioMessage) {
        content = '[Audio]';
        messageType = 'audio';
      } else {
        content = '[Unsupported message]';
      }

      // Upsert contact
      let contact = db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(tenantId, phone);
      if (!contact) {
        const contactId = uuid();
        db.prepare('INSERT INTO contacts (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)').run(contactId, tenantId, phone, pushName);
        contact = { id: contactId };
      } else {
        if (pushName && pushName !== phone) {
          db.prepare(`UPDATE contacts SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(pushName, contact.id);
        }
      }

      // Save message
      const msgId = uuid();
      db.prepare('INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, message_type, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        msgId, tenantId, contact.id, remoteJid, 'incoming', messageType, content, new Date(msg.messageTimestamp * 1000).toISOString()
      );

      // Emit to frontend
      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:message', {
          id: msgId,
          contactId: contact.id,
          phone,
          name: pushName,
          direction: 'incoming',
          messageType,
          content,
          deviceId,
          timestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
        });
      }

      // Check auto-reply rules first, then fall back to chatbot
      const handled = await handleAutoReply(tenantId, deviceId, remoteJid, contact.id, content, sock);
      if (!handled) {
        await handleChatbotReply(tenantId, remoteJid, contact.id, content, sock);
      }

      // Check welcome message for first-time contacts
      await handleWelcomeMessage(tenantId, deviceId, remoteJid, contact.id, phone, sock);
    }
  });

  return { status: 'connecting', deviceId };
}

async function handleAutoReply(tenantId, deviceId, remoteJid, contactId, incomingText, sock) {
  const rules = db.prepare(
    `SELECT * FROM auto_replies WHERE tenant_id = ? AND enabled = 1 AND (device_id IS NULL OR device_id = ?)`
  ).all(tenantId, deviceId);

  for (const rule of rules) {
    let matched = false;
    const keyword = rule.keyword.toLowerCase();
    const text = incomingText.toLowerCase();

    if (rule.match_type === 'exact') {
      matched = text === keyword;
    } else {
      matched = text.includes(keyword);
    }

    if (matched) {
      try {
        await sock.sendMessage(remoteJid, { text: rule.message });
        const msgId = uuid();
        db.prepare(`INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, is_bot_reply, timestamp) VALUES (?, ?, ?, ?, 'outgoing', ?, 1, datetime('now'))`).run(
          msgId, tenantId, contactId, remoteJid, rule.message
        );
        if (io) {
          io.to(`tenant:${tenantId}`).emit('wa:message', {
            id: msgId, contactId, direction: 'outgoing', content: rule.message, isBotReply: true, deviceId, timestamp: new Date().toISOString(),
          });
        }
        return true;
      } catch (err) {
        console.error('Auto-reply send error:', err.message);
      }
    }
  }
  return false;
}

async function handleWelcomeMessage(tenantId, deviceId, remoteJid, contactId, phone, sock) {
  // Only send welcome to first-time contacts (1 incoming message = first)
  const msgCount = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND remote_jid = ? AND direction = 'incoming'`).get(tenantId, remoteJid);
  if (msgCount.cnt > 1) return;

  const welcome = db.prepare(
    `SELECT * FROM welcome_messages WHERE tenant_id = ? AND enabled = 1 AND (device_id IS NULL OR device_id = ?) LIMIT 1`
  ).get(tenantId, deviceId);

  if (!welcome) return;

  try {
    await sock.sendMessage(remoteJid, { text: welcome.message });
    const msgId = uuid();
    db.prepare(`INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, is_bot_reply, timestamp) VALUES (?, ?, ?, ?, 'outgoing', ?, 1, datetime('now'))`).run(
      msgId, tenantId, contactId, remoteJid, welcome.message
    );
    if (io) {
      io.to(`tenant:${tenantId}`).emit('wa:message', {
        id: msgId, contactId, direction: 'outgoing', content: welcome.message, isBotReply: true, deviceId, timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('Welcome message send error:', err.message);
  }
}

async function handleChatbotReply(tenantId, remoteJid, contactId, incomingText, sock) {
  const config = db.prepare('SELECT * FROM chatbot_configs WHERE tenant_id = ?').get(tenantId);
  if (!config || !config.enabled) return;

  let replyText = '';

  if (config.ai_enabled && process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const systemPrompt = config.ai_prompt || 'You are a helpful business assistant.';
      const businessInfo = config.business_info ? `\nBusiness info: ${config.business_info}` : '';

      const history = db.prepare(
        'SELECT direction, content FROM messages WHERE tenant_id = ? AND remote_jid = ? ORDER BY timestamp DESC LIMIT 10'
      ).all(tenantId, remoteJid).reverse();

      const chatHistory = history.map(m => `${m.direction === 'incoming' ? 'Customer' : 'Assistant'}: ${m.content}`).join('\n');

      const prompt = `${systemPrompt}${businessInfo}\n\nChat history:\n${chatHistory}\nCustomer: ${incomingText}\n\nReply concisely (max 200 words):`;

      const result = await model.generateContent(prompt);
      replyText = result.response.text().trim();
    } catch (err) {
      console.error('AI reply error:', err.message);
      replyText = config.welcome_message || 'Thank you for your message! We will get back to you shortly.';
    }
  } else {
    const msgCount = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND remote_jid = ? AND direction = 'incoming'`).get(tenantId, remoteJid);
    if (msgCount.cnt <= 1) {
      replyText = config.welcome_message;
    }
  }

  if (!replyText) return;

  setTimeout(async () => {
    try {
      await sock.sendMessage(remoteJid, { text: replyText });

      const msgId = uuid();
      db.prepare(`INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, is_bot_reply, timestamp) VALUES (?, ?, ?, ?, 'outgoing', ?, 1, datetime('now'))`).run(
        msgId, tenantId, contactId, remoteJid, replyText
      );

      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:message', {
          id: msgId, contactId, direction: 'outgoing', content: replyText, isBotReply: true, timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Send auto-reply error:', err.message);
    }
  }, config.auto_reply_delay_ms || 1000);
}

async function sendMessage(tenantId, remoteJid, text, deviceId) {
  // If deviceId provided, use that specific device; otherwise find any connected device for tenant
  let conn;
  if (deviceId) {
    conn = connections.get(deviceId);
  } else {
    conn = getConnectionByTenant(tenantId);
  }

  if (!conn || !conn.sock || conn.status !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  const jid = remoteJid.includes('@') ? remoteJid : `${remoteJid}@s.whatsapp.net`;

  await conn.sock.sendMessage(jid, { text });

  const phone = jid.replace('@s.whatsapp.net', '');
  let contact = db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(tenantId, phone);
  if (!contact) {
    const contactId = uuid();
    db.prepare('INSERT INTO contacts (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)').run(contactId, tenantId, phone, phone);
    contact = { id: contactId };
  }

  const msgId = uuid();
  db.prepare(`INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, timestamp) VALUES (?, ?, ?, ?, 'outgoing', ?, datetime('now'))`).run(
    msgId, tenantId, contact.id, jid, text
  );

  return { id: msgId, content: text, direction: 'outgoing', timestamp: new Date().toISOString() };
}

async function disconnectWhatsApp(tenantId, deviceId) {
  if (deviceId) {
    const conn = connections.get(deviceId);
    if (conn && conn.sock) {
      await conn.sock.logout();
      connections.delete(deviceId);
    }
    db.prepare(`UPDATE devices SET status = 'disconnected', updated_at = datetime('now') WHERE id = ?`).run(deviceId);
  } else {
    // Legacy: disconnect all devices for tenant
    for (const [dId, conn] of connections.entries()) {
      if (conn.tenantId === tenantId) {
        try { await conn.sock.logout(); } catch (e) {}
        connections.delete(dId);
      }
    }
  }
  db.prepare(`UPDATE wa_sessions SET status = 'disconnected', updated_at = datetime('now') WHERE tenant_id = ?`).run(tenantId);
}

function getStatus(tenantId, deviceId) {
  if (deviceId) {
    const conn = connections.get(deviceId);
    if (conn) return { status: conn.status, qr: conn.qr || null, deviceId };
    const device = db.prepare('SELECT status, phone_number FROM devices WHERE id = ? AND tenant_id = ?').get(deviceId, tenantId);
    return { status: device?.status || 'disconnected', phone: device?.phone_number || null, deviceId };
  }
  // Legacy: check tenant-level
  const conn = getConnectionByTenant(tenantId);
  if (conn) return { status: conn.status, qr: conn.qr || null };
  const session = db.prepare('SELECT status, phone_number FROM wa_sessions WHERE tenant_id = ?').get(tenantId);
  return { status: session?.status || 'disconnected', phone: session?.phone_number || null };
}

async function checkNumbers(tenantId, deviceId, phones) {
  const conn = deviceId ? connections.get(deviceId) : getConnectionByTenant(tenantId);
  if (!conn || !conn.sock || conn.status !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  const results = [];
  for (const phone of phones) {
    try {
      const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
      const [result] = await conn.sock.onWhatsApp(jid);
      results.push({
        phone,
        exists: !!result?.exists,
        jid: result?.jid || null,
      });
    } catch (err) {
      results.push({ phone, exists: false, error: err.message });
    }
  }
  return results;
}

module.exports = { setSocketIO, connectWhatsApp, disconnectWhatsApp, sendMessage, getConnection, getConnectionByTenant, getStatus, checkNumbers };
