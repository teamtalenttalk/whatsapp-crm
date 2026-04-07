// Polyfill crypto for Node.js 18 compatibility with Baileys
if (!globalThis.crypto) {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { initDB } = require('./database');
const { setSocketIO } = require('./services/whatsapp');
const { authenticateSocket } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const whatsappRoutes = require('./routes/whatsapp');
const contactsRoutes = require('./routes/contacts');
const messagesRoutes = require('./routes/messages');
const chatbotRoutes = require('./routes/chatbot');
const dashboardRoutes = require('./routes/dashboard');
const devicesRoutes = require('./routes/devices');
const welcomeMessagesRoutes = require('./routes/welcome-messages');
const autoRepliesRoutes = require('./routes/auto-replies');
const templatesRoutes = require('./routes/templates');
const unsubscribesRoutes = require('./routes/unsubscribes');
const numberFilterRoutes = require('./routes/number-filter');
const groupGrabberRoutes = require('./routes/group-grabber');
const receivedMessagesRoutes = require('./routes/received-messages');
const integrationsRoutes = require('./routes/integrations');
const settingsRoutes = require('./routes/settings');
const sendMessageRoutes = require('./routes/send-message');
const campaignRoutes = require('./routes/campaigns');
const uploadRoutes = require('./routes/upload');
const { startScheduler } = require('./services/scheduler');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3003';

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3003', FRONTEND_URL, /\.trycloudflare\.com$/],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3003', FRONTEND_URL, /\.trycloudflare\.com$/],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Static file serving for uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// Init database
initDB();

// Set Socket.IO for WhatsApp service
setSocketIO(io);

// Socket.IO authentication and room management
io.use(authenticateSocket);
io.on('connection', (socket) => {
  const tenantId = socket.tenant.id;
  socket.join(`tenant:${tenantId}`);
  console.log(`[Socket] Tenant ${tenantId} connected`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Tenant ${tenantId} disconnected`);
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/welcome-messages', welcomeMessagesRoutes);
app.use('/api/auto-replies', autoRepliesRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/unsubscribes', unsubscribesRoutes);
app.use('/api/number-filter', numberFilterRoutes);
app.use('/api/group-grabber', groupGrabberRoutes);
app.use('/api/received-messages', receivedMessagesRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/send-message', sendMessageRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'whatsapp-crm' }));

const PORT = process.env.PORT || 8097;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WhatsApp CRM backend running on port ${PORT}`);
  // Start the campaign scheduler (checks every 30s for due scheduled campaigns)
  startScheduler();
});
