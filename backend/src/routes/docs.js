const express = require('express');
const router = express.Router();

// GET /api/docs — structured API documentation
router.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp CRM API',
    version: '1.0.0',
    base_url: '/api',
    authentication: {
      type: 'Bearer Token (JWT)',
      header: 'Authorization: Bearer <token>',
      obtain: 'POST /api/auth/login',
    },
    endpoints: {
      auth: {
        'POST /api/auth/register': { desc: 'Register a new tenant', body: { name: 'string', email: 'string', password: 'string' } },
        'POST /api/auth/login': { desc: 'Login and receive JWT token', body: { email: 'string', password: 'string' } },
        'GET /api/auth/me': { desc: 'Get current tenant info', auth: true },
      },
      health: {
        'GET /api/health': { desc: 'Comprehensive health check (DB, WhatsApp, memory)' },
      },
      whatsapp: {
        'GET /api/whatsapp/status': { desc: 'Get WhatsApp connection status', auth: true },
        'POST /api/whatsapp/connect': { desc: 'Initiate WhatsApp connection (QR code)', auth: true },
        'POST /api/whatsapp/disconnect': { desc: 'Disconnect WhatsApp session', auth: true },
        'POST /api/whatsapp/send': { desc: 'Send a WhatsApp message', auth: true, body: { to: 'string', message: 'string' } },
      },
      contacts: {
        'GET /api/contacts': { desc: 'List contacts', auth: true, query: { search: 'string?', stage: 'string?' } },
        'POST /api/contacts': { desc: 'Create contact', auth: true, body: { phone: 'string', name: 'string?', email: 'string?' } },
        'GET /api/contacts/:id': { desc: 'Get contact details', auth: true },
        'PUT /api/contacts/:id': { desc: 'Update contact', auth: true },
        'DELETE /api/contacts/:id': { desc: 'Delete contact', auth: true },
      },
      messages: {
        'GET /api/messages': { desc: 'List conversations', auth: true },
        'GET /api/messages/:contactId': { desc: 'Get messages for a contact', auth: true },
      },
      devices: {
        'GET /api/devices': { desc: 'List WhatsApp devices', auth: true },
        'POST /api/devices': { desc: 'Create a new device', auth: true, body: { name: 'string' } },
        'DELETE /api/devices/:id': { desc: 'Delete device', auth: true },
        'POST /api/devices/:id/connect': { desc: 'Connect device (get QR)', auth: true },
        'POST /api/devices/:id/disconnect': { desc: 'Disconnect device', auth: true },
        'GET /api/devices/:id/status': { desc: 'Get device status', auth: true },
      },
      send_message: {
        'POST /api/send-message/send': { desc: 'Send message (text, media, buttons, list)', auth: true },
        'POST /api/send-message/bulk': { desc: 'Send bulk messages', auth: true },
      },
      campaigns: {
        'GET /api/campaigns': { desc: 'List campaigns', auth: true },
        'GET /api/campaigns/:id': { desc: 'Get campaign details', auth: true },
        'POST /api/campaigns/:id/start': { desc: 'Start a campaign', auth: true },
        'DELETE /api/campaigns/:id': { desc: 'Delete campaign', auth: true },
        'GET /api/campaigns/:id/analytics': { desc: 'Get campaign analytics', auth: true },
        'GET /api/campaigns/comparison': { desc: 'Compare campaign performance', auth: true },
      },
      automation: {
        'GET /api/chatbot/config': { desc: 'Get chatbot config', auth: true },
        'PUT /api/chatbot/config': { desc: 'Update chatbot config', auth: true },
        'GET /api/auto-replies': { desc: 'List auto-reply rules', auth: true },
        'POST /api/auto-replies': { desc: 'Create auto-reply rule', auth: true },
        'PUT /api/auto-replies/:id': { desc: 'Update auto-reply rule', auth: true },
        'DELETE /api/auto-replies/:id': { desc: 'Delete auto-reply rule', auth: true },
        'GET /api/welcome-messages': { desc: 'List welcome messages', auth: true },
        'POST /api/welcome-messages': { desc: 'Create welcome message', auth: true },
        'PUT /api/welcome-messages/:id': { desc: 'Update welcome message', auth: true },
        'DELETE /api/welcome-messages/:id': { desc: 'Delete welcome message', auth: true },
      },
      templates: {
        'GET /api/templates': { desc: 'List message templates', auth: true },
        'POST /api/templates': { desc: 'Create template', auth: true },
        'PUT /api/templates/:id': { desc: 'Update template', auth: true },
        'DELETE /api/templates/:id': { desc: 'Delete template', auth: true },
      },
      products: {
        'GET /api/products': { desc: 'List products/inventory', auth: true },
        'POST /api/products': { desc: 'Create product', auth: true },
        'PUT /api/products/:id': { desc: 'Update product', auth: true },
        'DELETE /api/products/:id': { desc: 'Delete product', auth: true },
        'POST /api/products/:id/stock': { desc: 'Adjust stock', auth: true },
      },
      sales: {
        'GET /api/sales': { desc: 'List sales orders', auth: true },
        'POST /api/sales': { desc: 'Create sale', auth: true },
        'GET /api/sales/:id': { desc: 'Get sale details', auth: true },
        'DELETE /api/sales/:id': { desc: 'Delete sale', auth: true },
      },
      meetings: {
        'GET /api/meetings': { desc: 'List appointments', auth: true },
        'POST /api/meetings': { desc: 'Create appointment', auth: true },
        'PUT /api/meetings/:id': { desc: 'Update appointment', auth: true },
        'DELETE /api/meetings/:id': { desc: 'Delete appointment', auth: true },
      },
      calendars: {
        'GET /api/calendars': { desc: 'List calendars', auth: true },
        'POST /api/calendars': { desc: 'Create calendar', auth: true },
        'PUT /api/calendars/:id': { desc: 'Update calendar', auth: true },
        'DELETE /api/calendars/:id': { desc: 'Delete calendar', auth: true },
      },
      ai_chat: {
        'POST /api/ai-chat/respond': { desc: 'Get AI-powered response to customer message', auth: true, body: { message: 'string', contact_id: 'string?', context: 'object?' } },
        'PUT /api/ai-chat/train': { desc: 'Train AI with business-specific data', auth: true, body: { training_data: 'array', business_context: 'string?' } },
        'GET /api/ai-chat/analytics': { desc: 'Get AI chatbot performance analytics', auth: true },
      },
      segments: {
        'GET /api/segments': { desc: 'List customer segments', auth: true },
        'POST /api/segments': { desc: 'Create segment', auth: true, body: { name: 'string', rules: 'object' } },
        'PUT /api/segments/:id': { desc: 'Update segment', auth: true },
        'DELETE /api/segments/:id': { desc: 'Delete segment', auth: true },
        'GET /api/segments/:id/contacts': { desc: 'Get contacts in segment', auth: true },
      },
      journeys: {
        'GET /api/journeys': { desc: 'List customer journeys', auth: true },
        'POST /api/journeys': { desc: 'Create journey', auth: true },
        'GET /api/journeys/:id': { desc: 'Get journey details', auth: true },
        'GET /api/journeys/:id/contacts': { desc: 'Get contacts in journey stage', auth: true },
      },
      funnels: {
        'GET /api/funnels/conversion': { desc: 'Get message-to-sale conversion funnel', auth: true },
        'GET /api/funnels/drop-off': { desc: 'Get funnel drop-off analysis', auth: true },
      },
      other: {
        'GET /api/unsubscribes': { desc: 'List unsubscribed contacts', auth: true },
        'POST /api/unsubscribes': { desc: 'Add unsubscribe', auth: true },
        'GET /api/number-filter': { desc: 'Get number filter results', auth: true },
        'POST /api/number-filter/check': { desc: 'Check WhatsApp numbers', auth: true },
        'GET /api/group-grabber/groups': { desc: 'List WhatsApp groups', auth: true },
        'GET /api/integrations': { desc: 'List AI integrations', auth: true },
        'PUT /api/integrations/:provider': { desc: 'Update integration config', auth: true },
        'GET /api/settings': { desc: 'Get tenant settings', auth: true },
        'PUT /api/settings': { desc: 'Update tenant settings', auth: true },
        'POST /api/upload': { desc: 'Upload file (multipart/form-data)', auth: true },
      },
    },
    websocket: {
      url: 'ws://<host>:<port>',
      auth: 'Pass JWT via socket.handshake.auth.token',
      events: {
        'qr-code': 'QR code for WhatsApp pairing',
        'wa-status': 'WhatsApp connection status change',
        'new-message': 'Incoming WhatsApp message',
        'message-status': 'Message delivery/read status update',
      },
    },
  });
});

module.exports = router;
