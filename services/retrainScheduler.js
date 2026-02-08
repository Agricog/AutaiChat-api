import { query } from '../db/database.js';
import { storeDocument } from '../services/rag.js';

// Check and run scheduled retrains
async function checkScheduledRetrains() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours().toString().padStart(2, '0') + ':00';

    console.log(`[Scheduler] Checking for scheduled retrains at ${currentHour} UTC...`);

    // Find bots that need retraining
    const botsResult = await query(
      `SELECT b.id as bot_id, b.customer_id, b.retrain_frequency, b.retrain_time, b.last_retrained_at
       FROM bots b
       WHERE b.retrain_frequency != 'none'
       AND b.retrain_time = $1`,
      [currentHour]
    );

    if (botsResult.rows.length === 0) {
      console.log('[Scheduler] No bots scheduled for retrain at this time.');
      return;
    }

    for (const bot of botsResult.rows) {
      const shouldRetrain = checkIfDue(bot);
      if (!shouldRetrain) {
        console.log(`[Scheduler] Bot ${bot.bot_id}: not due yet (${bot.retrain_frequency}, last: ${bot.last_retrained_at})`);
        continue;
      }

      console.log(`[Scheduler] Bot ${bot.bot_id}: starting scheduled retrain (${bot.retrain_frequency})`);

      // Get all website documents for this bot
      const docsResult = await query(
        `SELECT id, source_url, bot_id FROM documents
         WHERE bot_id = $1 AND customer_id = $2 AND content_type = 'website' AND source_url IS NOT NULL`,
        [bot.bot_id, bot.customer_id]
      );

      if (docsResult.rows.length === 0) {
        console.log(`[Scheduler] Bot ${bot.bot_id}: no website documents to retrain`);
        continue;
      }

      // Re-scrape each page
      const { scrapeWebpage } = await import('../services/webScraper.js');
      let successCount = 0;

      for (const doc of docsResult.rows) {
        try {
          const pageData = await scrapeWebpage(doc.source_url);

          // Delete old embeddings and document
          await query('DELETE FROM embeddings WHERE document_id = $1', [doc.id]);
          await query('DELETE FROM documents WHERE id = $1', [doc.id]);

          // Store fresh
          await storeDocument({
            customerId: bot.customer_id,
            botId: doc.bot_id,
            title: pageData.title,
            contentType: 'website',
            sourceUrl: doc.source_url,
            content: pageData.content,
            metadata: {
              scrapedAt: new Date().toISOString(),
              wordCount: pageData.wordCount,
              url: pageData.url,
              scheduledRetrain: true
            }
          });

          successCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`[Scheduler] Failed to retrain doc ${doc.id} (${doc.source_url}):`, error.message);
        }
      }

      // Update last_retrained_at on the bot
      await query('UPDATE bots SET last_retrained_at = NOW() WHERE id = $1', [bot.bot_id]);

      console.log(`[Scheduler] Bot ${bot.bot_id}: retrain complete. ${successCount}/${docsResult.rows.length} pages updated.`);
    }
  } catch (error) {
    console.error('[Scheduler] Error:', error);
  }
}

function checkIfDue(bot) {
  if (!bot.last_retrained_at) return true; // Never retrained

  const lastRetrained = new Date(bot.last_retrained_at);
  const now = new Date();
  const hoursSince = (now - lastRetrained) / (1000 * 60 * 60);

  switch (bot.retrain_frequency) {
    case 'daily': return hoursSince >= 23;
    case 'weekly': return hoursSince >= 167; // ~7 days
    case 'monthly': return hoursSince >= 719; // ~30 days
    default: return false;
  }
}

// Start the scheduler - runs every hour
export function startRetrainScheduler() {
  console.log('[Scheduler] Retrain scheduler started. Checking every hour.');
  
  // Run immediately on startup
  setTimeout(() => checkScheduledRetrains(), 10000);
  
  // Then every hour
  setInterval(() => checkScheduledRetrains(), 60 * 60 * 1000);
}
