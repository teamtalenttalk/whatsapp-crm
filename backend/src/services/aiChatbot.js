/**
 * AI Chatbot Service
 *
 * GPT-powered intelligent responses.
 * Works in two modes:
 *   1. Demo mode (no API key) — uses keyword-matching + template responses
 *   2. Live mode — calls OpenAI GPT-4o API
 */

const { db } = require('../database');

class AIChatbot {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  /**
   * Generate a response to a customer message
   */
  async respond(tenantId, { message, contactId, context = {} }) {
    // Check if tenant has an OpenAI integration configured
    const integration = db.prepare(
      "SELECT api_key, model FROM integrations WHERE tenant_id = ? AND provider = 'openai' AND enabled = 1"
    ).get(tenantId);

    const apiKey = integration?.api_key || this.apiKey;
    const model = integration?.model || 'gpt-4o-mini';

    // Load chatbot config
    const config = db.prepare(
      "SELECT * FROM chatbot_configs WHERE tenant_id = ?"
    ).get(tenantId);

    // Load training data
    const trainingData = db.prepare(
      "SELECT * FROM ai_training_data WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(tenantId);

    // Load contact context if available
    let contactInfo = null;
    if (contactId) {
      contactInfo = db.prepare(
        "SELECT name, phone, tags, stage, notes FROM contacts WHERE id = ? AND tenant_id = ?"
      ).get(contactId, tenantId);
    }

    // Build system prompt
    const systemPrompt = this._buildSystemPrompt(config, trainingData, contactInfo, context);

    let response;
    let source;

    if (apiKey && apiKey.startsWith('sk-')) {
      // Live mode — call OpenAI
      try {
        response = await this._callOpenAI(apiKey, model, systemPrompt, message);
        source = 'openai';
      } catch (err) {
        console.error('[AI Chatbot] OpenAI error, falling back to demo:', err.message);
        response = this._demoResponse(message, config, trainingData);
        source = 'demo_fallback';
      }
    } else {
      // Demo mode
      response = this._demoResponse(message, config, trainingData);
      source = 'demo';
    }

    // Log the interaction
    const logId = require('uuid').v4();
    db.prepare(`
      INSERT INTO ai_chat_logs (id, tenant_id, contact_id, user_message, ai_response, source, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(logId, tenantId, contactId || null, message, response, source, source === 'openai' ? model : 'demo');

    return {
      response,
      source,
      model: source === 'openai' ? model : 'demo',
      log_id: logId,
    };
  }

  /**
   * Train the AI with business-specific Q&A pairs
   */
  train(tenantId, { trainingData, businessContext }) {
    const insert = db.prepare(`
      INSERT INTO ai_training_data (id, tenant_id, question, answer, category, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(
          require('uuid').v4(),
          tenantId,
          item.question || '',
          item.answer || '',
          item.category || 'general'
        );
      }
    });

    insertMany(trainingData);

    // Update business info in chatbot config if provided
    if (businessContext) {
      db.prepare(`
        INSERT INTO chatbot_configs (id, tenant_id, business_info)
        VALUES (?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET business_info = ?, updated_at = datetime('now')
      `).run(require('uuid').v4(), tenantId, businessContext, businessContext);
    }

    return { trained: trainingData.length };
  }

  /**
   * Get analytics for AI chat performance
   */
  getAnalytics(tenantId) {
    const totalChats = db.prepare(
      "SELECT COUNT(*) AS cnt FROM ai_chat_logs WHERE tenant_id = ?"
    ).get(tenantId)?.cnt || 0;

    const bySource = db.prepare(
      "SELECT source, COUNT(*) AS cnt FROM ai_chat_logs WHERE tenant_id = ? GROUP BY source"
    ).all(tenantId);

    const byDay = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS cnt
      FROM ai_chat_logs WHERE tenant_id = ?
      GROUP BY date(created_at)
      ORDER BY day DESC LIMIT 30
    `).all(tenantId);

    const avgResponseLength = db.prepare(
      "SELECT AVG(LENGTH(ai_response)) AS avg_len FROM ai_chat_logs WHERE tenant_id = ?"
    ).get(tenantId)?.avg_len || 0;

    const trainingCount = db.prepare(
      "SELECT COUNT(*) AS cnt FROM ai_training_data WHERE tenant_id = ?"
    ).get(tenantId)?.cnt || 0;

    return {
      total_chats: totalChats,
      by_source: bySource,
      by_day: byDay,
      avg_response_length: Math.round(avgResponseLength),
      training_data_count: trainingCount,
    };
  }

  // ── Private methods ──────────────────────────────────────────────

  _buildSystemPrompt(config, trainingData, contactInfo, context) {
    let prompt = config?.ai_prompt || 'You are a helpful business assistant. Answer customer queries politely and concisely.';

    if (config?.business_info) {
      prompt += `\n\nBusiness Information:\n${config.business_info}`;
    }

    if (trainingData.length > 0) {
      prompt += '\n\nKnowledge Base:';
      for (const item of trainingData.slice(0, 20)) {
        prompt += `\nQ: ${item.question}\nA: ${item.answer}`;
      }
    }

    if (contactInfo) {
      prompt += `\n\nCustomer Context:`;
      if (contactInfo.name) prompt += `\n- Name: ${contactInfo.name}`;
      if (contactInfo.stage) prompt += `\n- Stage: ${contactInfo.stage}`;
      if (contactInfo.tags) prompt += `\n- Tags: ${contactInfo.tags}`;
      if (contactInfo.notes) prompt += `\n- Notes: ${contactInfo.notes}`;
    }

    if (context.recent_messages) {
      prompt += `\n\nRecent conversation:\n${context.recent_messages}`;
    }

    return prompt;
  }

  async _callOpenAI(apiKey, model, systemPrompt, userMessage) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
  }

  _demoResponse(message, config, trainingData) {
    const lower = message.toLowerCase().trim();

    // Check training data for keyword matches
    for (const item of trainingData) {
      const keywords = (item.question || '').toLowerCase().split(/\s+/);
      const matchCount = keywords.filter(kw => kw.length > 3 && lower.includes(kw)).length;
      if (matchCount >= 2 || (keywords.length === 1 && lower.includes(keywords[0]))) {
        return item.answer;
      }
    }

    // Default keyword-based responses
    if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
      return 'Thank you for your interest! Our pricing depends on the specific product or service. Could you please tell me which item you are interested in?';
    }
    if (lower.includes('hours') || lower.includes('open') || lower.includes('available')) {
      return 'We are available Monday through Friday, 9 AM to 6 PM. How can we help you today?';
    }
    if (lower.includes('order') || lower.includes('track') || lower.includes('delivery')) {
      return 'I can help you with your order! Please provide your order number or phone number so I can look it up.';
    }
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return config?.welcome_message || 'Hello! Welcome! How can I assist you today?';
    }
    if (lower.includes('thank') || lower.includes('thanks')) {
      return 'You\'re welcome! Is there anything else I can help you with?';
    }
    if (lower.includes('help') || lower.includes('support')) {
      return 'I\'m here to help! Please describe what you need assistance with, and I\'ll do my best to help you.';
    }

    return 'Thank you for your message! A team member will follow up with you shortly. In the meantime, is there anything specific I can help you with?';
  }
}

module.exports = new AIChatbot();
