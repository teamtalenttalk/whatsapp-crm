const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

// Store active WhatsApp connections per tenant
const connections = new Map();
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

function getConnection(tenantId) {
  return connections.get(tenantId);
}

async function connectWhatsApp(tenantId) {
  // Prevent duplicate connections
  const existing = connections.get(tenantId);
  if (existing && existing.sock) {
    return { status: 'already_connected' };
  }

  const sessionsDir = path.join(__dirname, '..', '..', 'data', 'sessions', tenantId);
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

  connections.set(tenantId, { sock, status: 'connecting' });

  // Update session status in DB
  const updateStatus = (status, phone) => {
    const session = db.prepare('SELECT id FROM wa_sessions WHERE tenant_id = ?').get(tenantId);
    if (session) {
      db.prepare('UPDATE wa_sessions SET status = ?, phone_number = COALESCE(?, phone_number), updated_at = datetime("now") WHERE tenant_id = ?').run(status, phone || null, tenantId);
    } else {
      db.prepare('INSERT INTO wa_sessions (id, tenant_id, status, phone_number) VALUES (?, ?, ?, ?)').run(uuid(), tenantId, status, phone || null);
    }
    // Notify frontend via socket
    if (io) {
      io.to(`tenant:${tenantId}`).emit('wa:status', { status, phone });
    }
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connections.set(tenantId, { ...connections.get(tenantId), status: 'qr', qr });
      updateStatus('waiting_qr');
      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:qr', { qr });
      }
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || '';
      connections.set(tenantId, { ...connections.get(tenantId), status: 'connected', qr: null });
      updateStatus('connected', phone);
      console.log(`[WA] Tenant ${tenantId} connected: ${phone}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connections.set(tenantId, { ...connections.get(tenantId), status: 'disconnected', qr: null });
      updateStatus('disconnected');
      console.log(`[WA] Tenant ${tenantId} disconnected. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(tenantId), 3000);
      } else {
        connections.delete(tenantId);
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
        // Update name if we got a push name
        if (pushName && pushName !== phone) {
          db.prepare('UPDATE contacts SET name = ?, updated_at = datetime("now") WHERE id = ?').run(pushName, contact.id);
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
          timestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
        });
      }

      // Check chatbot auto-reply
      await handleChatbotReply(tenantId, remoteJid, contact.id, content, sock);
    }
  });

  return { status: 'connecting' };
}

async function handleChatbotReply(tenantId, remoteJid, contactId, incomingText, sock) {
  const config = db.prepare('SELECT * FROM chatbot_configs WHERE tenant_id = ?').get(tenantId);
  if (!config || !config.enabled) return;

  let replyText = '';

  if (config.ai_enabled && process.env.GEMINI_API_KEY) {
    // AI-powered reply using Gemini
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const systemPrompt = config.ai_prompt || 'You are a helpful business assistant.';
      const businessInfo = config.business_info ? `\nBusiness info: ${config.business_info}` : '';

      // Get last 10 messages for context
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
    // Simple auto-reply with welcome message
    // Only send welcome to first-time contacts (1 incoming message = first)
    const msgCount = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE tenant_id = ? AND remote_jid = ? AND direction = "incoming"').get(tenantId, remoteJid);
    if (msgCount.cnt <= 1) {
      replyText = config.welcome_message;
    }
  }

  if (!replyText) return;

  // Send with delay
  setTimeout(async () => {
    try {
      await sock.sendMessage(remoteJid, { text: replyText });

      // Save outgoing bot message
      const msgId = uuid();
      db.prepare('INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, is_bot_reply, timestamp) VALUES (?, ?, ?, ?, ?, ?, 1, datetime("now"))').run(
        msgId, tenantId, contactId, remoteJid, 'outgoing', replyText
      );

      if (io) {
        io.to(`tenant:${tenantId}`).emit('wa:message', {
          id: msgId,
          contactId,
          direction: 'outgoing',
          content: replyText,
          isBotReply: true,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Send auto-reply error:', err.message);
    }
  }, config.auto_reply_delay_ms || 1000);
}

async function sendMessage(tenantId, remoteJid, text) {
  const conn = connections.get(tenantId);
  if (!conn || !conn.sock || conn.status !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  // Ensure JID format
  const jid = remoteJid.includes('@') ? remoteJid : `${remoteJid}@s.whatsapp.net`;

  await conn.sock.sendMessage(jid, { text });

  // Get or create contact
  const phone = jid.replace('@s.whatsapp.net', '');
  let contact = db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(tenantId, phone);
  if (!contact) {
    const contactId = uuid();
    db.prepare('INSERT INTO contacts (id, tenant_id, phone, name) VALUES (?, ?, ?, ?)').run(contactId, tenantId, phone, phone);
    contact = { id: contactId };
  }

  // Save message
  const msgId = uuid();
  db.prepare('INSERT INTO messages (id, tenant_id, contact_id, remote_jid, direction, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))').run(
    msgId, tenantId, contact.id, jid, 'outgoing', text
  );

  return { id: msgId, content: text, direction: 'outgoing', timestamp: new Date().toISOString() };
}

async function disconnectWhatsApp(tenantId) {
  const conn = connections.get(tenantId);
  if (conn && conn.sock) {
    await conn.sock.logout();
    connections.delete(tenantId);
  }
  db.prepare('UPDATE wa_sessions SET status = "disconnected", updated_at = datetime("now") WHERE tenant_id = ?').run(tenantId);
}

function getStatus(tenantId) {
  const conn = connections.get(tenantId);
  if (conn) return { status: conn.status, qr: conn.qr || null };
  const session = db.prepare('SELECT status, phone_number FROM wa_sessions WHERE tenant_id = ?').get(tenantId);
  return { status: session?.status || 'disconnected', phone: session?.phone_number || null };
}

module.exports = { setSocketIO, connectWhatsApp, disconnectWhatsApp, sendMessage, getConnection, getStatus };
