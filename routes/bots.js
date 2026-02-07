import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// POST /api/bots - Create new bot
router.post('/', async (req, res) => {
  try {
    const { customerId, name } = req.body;
    
    // Verify ownership
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (!name || name.trim().length < 1) {
      return res.status(400).json({ error: 'Bot name is required' });
    }
    
    const result = await query(
      `INSERT INTO bots (customer_id, name, bot_instructions, greeting_message)
       VALUES ($1, $2, 'You are a helpful assistant.', 'Thank you for visiting! How may we assist you today?')
       RETURNING id`,
      [customerId, name.trim()]
    );
    
    res.json({ success: true, botId: result.rows[0].id });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// DELETE /api/bots/:botId - Delete bot
router.delete('/:botId', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId } = req.body;
    
    // Verify ownership
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );
    
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Check customer has more than one bot
    const countResult = await query(
      'SELECT COUNT(*) as count FROM bots WHERE customer_id = $1',
      [customerId]
    );
    
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only bot' });
    }
    
    // Delete associated data first
    await query('DELETE FROM messages WHERE bot_id = $1', [botId]);
    await query('DELETE FROM leads WHERE bot_id = $1', [botId]);
    await query('DELETE FROM documents WHERE bot_id = $1', [botId]);
    await query('DELETE FROM bots WHERE id = $1', [botId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

// POST /api/bots/:botId/instructions - Update bot instructions
router.post('/:botId/instructions', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, instructions } = req.body;
    
    // Verify ownership
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );
    
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    await query(
      'UPDATE bots SET bot_instructions = $1 WHERE id = $2',
      [instructions, botId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update instructions error:', error);
    res.status(500).json({ error: 'Failed to update instructions' });
  }
});

// POST /api/bots/:botId/greeting - Update greeting message
router.post('/:botId/greeting', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, greeting } = req.body;
    
    // Verify ownership
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );
    
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    await query(
      'UPDATE bots SET greeting_message = $1 WHERE id = $2',
      [greeting, botId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update greeting error:', error);
    res.status(500).json({ error: 'Failed to update greeting' });
  }
});

export default router;
