import OpenAI from 'openai';
import { query } from '../db/database.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// ─── EMBEDDING GENERATION ────────────────────────────────────────────────────

/**
 * Generate a 1536-dim embedding vector for a given text
 */
export async function generateEmbedding(text) {
  try {
    const cleaned = text.replace(/\n+/g, ' ').trim();
    if (!cleaned) return null;

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleaned,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in a single API call (batch)
 * OpenAI supports up to 2048 inputs per request
 */
async function generateEmbeddingsBatch(texts) {
  try {
    const cleaned = texts.map(t => t.replace(/\n+/g, ' ').trim());
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleaned,
    });

    return response.data.map(d => d.embedding);
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw error;
  }
}

// ─── DOCUMENT STORAGE ────────────────────────────────────────────────────────

/**
 * Store a document: chunk the content, generate embeddings, store in pgvector
 */
export async function storeDocument({ customerId, botId, title, contentType, sourceUrl, content, metadata = {} }) {
  try {
    // Insert document record
    const docResult = await query(
      `INSERT INTO documents (customer_id, bot_id, title, content_type, source_url, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [customerId, botId || null, title, contentType, sourceUrl, content, JSON.stringify(metadata)]
    );

    const documentId = docResult.rows[0].id;

    // Chunk the content
    const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);

    // Generate embeddings in batches of 100
    const BATCH_SIZE = 100;
    let totalStored = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch);

      // Store each chunk with its embedding
      for (let j = 0; j < batch.length; j++) {
        const chunkIndex = i + j;
        const chunkMetadata = {
          ...metadata,
          chunkIndex,
          totalChunks: chunks.length,
        };

        const embeddingStr = `[${embeddings[j].join(',')}]`;

        await query(
          `INSERT INTO embeddings (customer_id, bot_id, document_id, chunk_text, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [customerId, botId || null, documentId, batch[j], embeddingStr, JSON.stringify(chunkMetadata)]
        );
        totalStored++;
      }
    }

    console.log(`Stored document ${documentId} with ${totalStored} embedded chunks`);
    return { documentId, chunksStored: totalStored };
  } catch (error) {
    console.error('Error storing document:', error);
    throw error;
  }
}

// ─── CONTEXT RETRIEVAL (VECTOR SIMILARITY SEARCH) ───────────────────────────

/**
 * Retrieve relevant context chunks using pgvector cosine similarity
 */
export async function retrieveContext(customerId, userQuery, limit = 5, botId = null) {
  try {
    // Generate embedding for the user's query
    const queryEmbedding = await generateEmbedding(userQuery);
    if (!queryEmbedding) return [];

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let result;

    if (botId) {
      // Bot-specific vector similarity search
      result = await query(
        `SELECT chunk_text, 1 - (embedding <=> $1::vector) AS similarity
         FROM embeddings
         WHERE bot_id = $2
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [embeddingStr, botId, limit]
      );
    } else {
      // Fallback: customer-level search
      result = await query(
        `SELECT chunk_text, 1 - (embedding <=> $1::vector) AS similarity
         FROM embeddings
         WHERE customer_id = $1
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        [embeddingStr, customerId, limit]
      );
    }

    // Filter out low-similarity results (threshold: 0.25)
    const relevant = result.rows.filter(row => row.similarity > 0.25);

    if (relevant.length === 0) {
      console.log(`No relevant context found for query: "${userQuery.substring(0, 80)}..."`);
      return [];
    }

    console.log(`Found ${relevant.length} relevant chunks (best similarity: ${relevant[0].similarity.toFixed(3)})`);
    return relevant.map(row => row.chunk_text);
  } catch (error) {
    console.error('Error retrieving context:', error);
    return [];
  }
}

// ─── TEXT CHUNKING ──────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks using sentence boundaries
 */
function chunkText(text, maxChunkSize = 500, overlap = 50) {
  const chunks = [];
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((currentChunk + ' ' + trimmed).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Create overlap by keeping end of previous chunk
      if (overlap > 0) {
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.ceil(overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + trimmed;
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + trimmed : trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ─── LEAD STORAGE ───────────────────────────────────────────────────────────

/**
 * Store a captured lead
 */
export async function storeLead(customerId, botId, name, email, conversation) {
  try {
    const result = await query(
      `INSERT INTO leads (customer_id, bot_id, name, email, conversation)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [customerId, botId || null, name, email, JSON.stringify(conversation)]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error storing lead:', error);
    throw error;
  }
}

// ─── CUSTOMER LOOKUP ────────────────────────────────────────────────────────

/**
 * Get customer by ID
 */
export async function getCustomer(customerId) {
  try {
    const result = await query(
      `SELECT * FROM customers WHERE id = $1`,
      [customerId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting customer:', error);
    throw error;
  }
}
