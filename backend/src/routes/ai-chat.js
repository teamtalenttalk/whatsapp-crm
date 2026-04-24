const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiChatbot = require('../services/aiChatbot');

// POST /api/ai-chat/respond — Get AI-powered response
router.post('/respond', authMiddleware, async (req, res) => {
  try {
    const { message, contact_id, context } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await aiChatbot.respond(req.tenant.id, {
      message: message.trim(),
      contactId: contact_id,
      context: context || {},
    });

    res.json(result);
  } catch (err) {
    console.error('[AI Chat] Respond error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-chat/train — Train AI with business data
router.put('/train', authMiddleware, (req, res) => {
  try {
    const { training_data, business_context } = req.body;

    if (!training_data || !Array.isArray(training_data) || training_data.length === 0) {
      return res.status(400).json({ error: 'training_data must be a non-empty array of {question, answer} objects' });
    }

    const result = aiChatbot.train(req.tenant.id, {
      trainingData: training_data,
      businessContext: business_context,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[AI Chat] Train error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-chat/analytics — Get AI chatbot analytics
router.get('/analytics', authMiddleware, (req, res) => {
  try {
    const analytics = aiChatbot.getAnalytics(req.tenant.id);
    res.json(analytics);
  } catch (err) {
    console.error('[AI Chat] Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
