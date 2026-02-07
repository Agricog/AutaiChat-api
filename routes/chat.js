import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { sendLeadNotification } from '../services/email.js';
import { retrieveContext, storeLead, getCustomer } from '../services/rag.js';
import { query } from '../db/database.js';

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/chat - Handle chat messages with RAG
router.post('/', async (req, res) => {
  try {
    const { message, botId, customerId, conversationHistory, leadId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Support both botId (new) and customerId (legacy)
    let bot;
    let cid;
    
    if (botId) {
      // New bot-based lookup
      const botResult = await query(
        'SELECT id, customer_id, bot_instructions FROM bots WHERE id = $1',
        [botId]
      );
      
      if (botResult.rows.length === 0) {
        return res.status(404).json({ error: 'Bot not found' });
      }
      
      bot = botResult.rows[0];
      cid = bot.customer_id;
    } else {
      // Legacy customer-based lookup - get first bot for customer
      cid = customerId || 1;
      const botResult = await query(
        'SELECT id, customer_id, bot_instructions FROM bots WHERE customer_id = $1 ORDER BY created_at ASC LIMIT 1',
        [cid]
      );
      
      if (botResult.rows.length > 0) {
        bot = botResult.rows[0];
      } else {
        // Fallback to customer's bot_instructions if no bot exists
        const customerResult = await query(
          'SELECT bot_instructions FROM customers WHERE id = $1',
          [cid]
        );
        bot = { 
          id: null, 
          customer_id: cid, 
          bot_instructions: customerResult.rows[0]?.bot_instructions || '' 
        };
      }
    }

    const botInstructions = bot.bot_instructions || '';

    // Save user message to database
    await query(
      'INSERT INTO messages (customer_id, bot_id, lead_id, role, content) VALUES ($1, $2, $3, $4, $5)',
      [cid, bot.id, leadId || null, 'user', message]
    );

    // Retrieve relevant context from bot's knowledge base
    const context = await retrieveContext(cid, message, 5, bot.id);
    
    // Build system prompt with bot instructions and context
    let systemPrompt = botInstructions || 'You are a helpful assistant.';
    
    if (context && context.length > 0) {
      systemPrompt += '\n\nRelevant information from the knowledge base:\n\n';
      systemPrompt += context.map((chunk, idx) => `[${idx + 1}] ${chunk}`).join('\n\n');
      systemPrompt += '\n\nUse this information to answer the user\'s question. If the information is not in the knowledge base, say so politely.';
    }

    // Build conversation history for Claude
    const messages = conversationHistory || [];
    messages.push({
      role: 'user',
      content: message
    });

    // Call Claude API with context
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const assistantMessage = response.content[0].text;

    // Save assistant response to database
    await query(
      'INSERT INTO messages (customer_id, bot_id, lead_id, role, content) VALUES ($1, $2, $3, $4, $5)',
      [cid, bot.id, leadId || null, 'assistant', assistantMessage]
    );

    res.json({
      message: assistantMessage,
      conversationId: cid,
      botId: bot.id,
      contextUsed: context.length > 0
    });
  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ 
      error: 'Failed to get response',
      details: error.message 
    });
  }
});

// POST /api/chat/lead - Capture lead information
router.post('/lead', async (req, res) => {
  try {
    const { name, email, botId, customerId, conversation } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Get bot and customer info
    let cid;
    let bid;
    
    if (botId) {
      const botResult = await query(
        'SELECT id, customer_id FROM bots WHERE id = $1',
        [botId]
      );
      if (botResult.rows.length > 0) {
        bid = botResult.rows[0].id;
        cid = botResult.rows[0].customer_id;
      }
    }
    
    if (!cid) {
      cid = customerId || 1;
      // Get first bot for customer
      const botResult = await query(
        'SELECT id FROM bots WHERE customer_id = $1 ORDER BY created_at ASC LIMIT 1',
        [cid]
      );
      if (botResult.rows.length > 0) {
        bid = botResult.rows[0].id;
      }
    }

    console.log('Lead captured:', { name, email, customerId: cid, botId: bid });
    
    // Store lead in database
    const leadId = await storeLead({
      customerId: cid,
      botId: bid,
      name,
      email,
      conversation: conversation || []
    });

    // Get customer info for email
    const customer = await getCustomer(cid);
    const businessEmail = customer?.business_email || process.env.TEST_BUSINESS_EMAIL || 'your-email@example.com';
    
    // Send email notification to business owner
    const emailResult = await sendLeadNotification({
      businessEmail,
      leadName: name,
      leadEmail: email,
      conversation: conversation || [],
      customerId: cid
    });

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error);
    }

    res.json({ 
      success: true,
      message: 'Lead captured successfully',
      leadId,
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ 
      error: 'Failed to capture lead',
      details: error.message 
    });
  }
});

export default router;
