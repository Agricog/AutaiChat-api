import { query } from '../db/database.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Check for conversations needing notification every 30 seconds
export function startConversationNotifier() {
  console.log('🔔 Conversation notifier started');
  
  // Run every 30 seconds
  setInterval(async () => {
    await checkAndSendNotifications();
  }, 30000);
  
  // Also run immediately on startup
  setTimeout(async () => {
    await checkAndSendNotifications();
  }, 5000);
}

async function checkAndSendNotifications() {
  try {
    // Find leads with messages older than 1 minute that haven't been notified
    // Join with bots to get notification settings
    const result = await query(`
      SELECT DISTINCT ON (l.id)
        l.id as lead_id,
        l.name as lead_name,
        l.email as lead_email,
        l.bot_id,
        l.created_at as lead_created_at,
        b.name as bot_name,
        b.notification_emails,
        b.conversation_notifications,
        (SELECT MAX(created_at) FROM messages WHERE lead_id = l.id) as last_message_at
      FROM leads l
      JOIN bots b ON l.bot_id = b.id
      WHERE b.conversation_notifications = true
        AND b.notification_emails IS NOT NULL
        AND b.notification_emails != ''
        AND l.notification_sent_at IS NULL
        AND (SELECT MAX(created_at) FROM messages WHERE lead_id = l.id) < NOW() - INTERVAL '1 minute'
      ORDER BY l.id
      LIMIT 10
    `);
    
    for (const lead of result.rows) {
      await sendConversationTranscript(lead);
    }
  } catch (error) {
    console.error('Conversation notifier error:', error);
  }
}

async function sendConversationTranscript(lead) {
  try {
    // Get all messages for this lead
    const messagesResult = await query(`
      SELECT role, content, created_at
      FROM messages
      WHERE lead_id = $1
      ORDER BY created_at ASC
    `, [lead.lead_id]);
    
    if (messagesResult.rows.length === 0) {
      // No messages, mark as notified to avoid retry
      await query('UPDATE leads SET notification_sent_at = NOW() WHERE id = $1', [lead.lead_id]);
      return;
    }
    
    // Build transcript HTML
    const messages = messagesResult.rows;
    let transcriptHtml = messages.map(msg => {
      const time = new Date(msg.created_at).toLocaleString();
      const sender = msg.role === 'user' ? '👤 Visitor' : '🤖 Bot';
      const bgColor = msg.role === 'user' ? '#f3f4f6' : '#eff6ff';
      return `
        <div style="margin-bottom: 12px; padding: 12px; background: ${bgColor}; border-radius: 8px;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${sender} • ${time}</div>
          <div style="color: #1f2937;">${msg.content}</div>
        </div>
      `;
    }).join('');
    
    // Parse email addresses
    const emails = lead.notification_emails.split(',').map(e => e.trim()).filter(e => e);
    
    if (emails.length === 0) {
      await query('UPDATE leads SET notification_sent_at = NOW() WHERE id = $1', [lead.lead_id]);
      return;
    }
    
    // Build email
    const visitorInfo = lead.lead_name && lead.lead_email 
      ? `<p><strong>Visitor:</strong> ${lead.lead_name} (${lead.lead_email})</p>`
      : '<p><strong>Visitor:</strong> Anonymous</p>';
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">New Conversation - ${lead.bot_name}</h2>
          </div>
          <div class="content">
            ${visitorInfo}
            <p><strong>Started:</strong> ${new Date(lead.lead_created_at).toLocaleString()}</p>
            <p><strong>Messages:</strong> ${messages.length}</p>
            
            <h3 style="margin-top: 24px; margin-bottom: 16px; color: #374151;">Conversation Transcript</h3>
            ${transcriptHtml}
          </div>
          <div class="footer">
            <p>This notification was sent by AutoReplyChat.</p>
            <p>You can manage notification settings in your dashboard.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Send email
    await resend.emails.send({
      from: 'AutoReplyChat <notifications@autoreplychat.com>',
      to: emails,
      subject: `New conversation on ${lead.bot_name}${lead.lead_name ? ` from ${lead.lead_name}` : ''}`,
      html: emailHtml
    });
    
    console.log(`✉️ Sent conversation transcript for lead ${lead.lead_id} to ${emails.join(', ')}`);
    
    // Mark as notified
    await query('UPDATE leads SET notification_sent_at = NOW() WHERE id = $1', [lead.lead_id]);
    
  } catch (error) {
    console.error(`Failed to send transcript for lead ${lead.lead_id}:`, error);
  }
}
