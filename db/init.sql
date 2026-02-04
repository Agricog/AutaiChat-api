-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  business_email VARCHAR(255) NOT NULL, -- Where to send lead notifications
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table (stores uploaded content)
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  title VARCHAR(500),
  content_type VARCHAR(50), -- 'pdf', 'website', 'youtube', 'qa', 'text'
  source_url TEXT, -- Original source (URL, file path, etc.)
  content TEXT, -- Full text content
  metadata JSONB, -- Additional metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings table (vector chunks for RAG)
CREATE TABLE IF NOT EXISTS embeddings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL, -- The actual text chunk
  embedding vector(1536), -- OpenAI ada-002 or Claude embeddings (1536 dimensions)
  metadata JSONB, -- Chunk position, page number, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table (captured from chatbot)
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  conversation JSONB, -- Full conversation history
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster vector similarity search
CREATE INDEX IF NOT EXISTS embeddings_customer_idx ON embeddings(customer_id);
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (embedding vector_cosine_ops);

-- Create index for faster document lookups
CREATE INDEX IF NOT EXISTS documents_customer_idx ON documents(customer_id);
CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads(customer_id);
