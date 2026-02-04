import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/database.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Generate embeddings using Claude (alternative: use OpenAI's ada-002)
// For now, we'll use a simple text-based retrieval
// In production, you'd use proper embeddings
export async function generateEmbedding(text) {
  // TODO: Implement proper embedding generation
  // For now, we'll use keyword-based search as a placeholder
  return null;
}

// Store document chunks with embeddings
export async function storeDocument({ customerId, title, contentType, sourceUrl, content, metadata = {} }) {
  try {
    // Insert document
    const docResult = await query(
      `INSERT INTO documents (customer_id, title, content_type, source_url, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [customerId, title, contentType, sourceUrl, content, JSON.stringify(metadata)]
    );
    
    const documentId = docResult.rows[0].id;
    
    // Split content into chunks (roughly 500 chars each)
    const chunks = chunkText(content, 500);
    
    // Store each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkMetadata = {
        ...metadata,
        chunkIndex: i,
        totalChunks: chunks.length
      };
      
      // For now, storing without embeddings (keyword search)
      await query(
        `INSERT INTO embeddings (customer_id, document_id, chunk_text, metadata)
         VALUES ($1, $2, $3, $4)`,
        [customerId, documentId, chunk, JSON.stringify(chunkMetadata)]
      );
    }
    
    console.log(`Stored document ${documentId} with ${chunks.length} chunks`);
    return { documentId, chunksStored: chunks.length };
    
  } catch (error) {
    console.error('Error storing document:', error);
    throw error;
  }
}

// Retrieve relevant context for a query
export async function retrieveContext(customerId, userQuery, limit = 5) {
  try {
    // Simple keyword-based search for now
    // In production, use vector similarity search with embeddings
    const result = await query(
      `SELECT chunk_text, metadata
       FROM embeddings
       WHERE customer_id = $1
       AND chunk_text ILIKE $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [customerId, `%${userQuery}%`, limit]
    );
    
    // If no keyword matches, return recent chunks
    if (result.rows.length === 0) {
      const fallbackResult = await query(
        `SELECT chunk_text, metadata
         FROM embeddings
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [customerId, limit]
      );
      return fallbackResult.rows.map(row => row.chunk_text);
    }
    
    return result.rows.map(row => row.chunk_text);
    
  } catch (error) {
    console.error('Error retrieving context:', error);
    return [];
  }
}

// Helper: Split text into chunks
function chunkText(text, maxChunkSize = 500) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Store lead in database
export async function storeLead({ customerId, name, email, conversation }) {
  try {
    const result = await query(
      `INSERT INTO leads (customer_id, name, email, conversation)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [customerId, name, email, JSON.stringify(conversation)]
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error storing lead:', error);
    throw error;
  }
}

// Get customer by ID
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
