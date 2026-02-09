import { query } from './database.js';

export async function runMigrations() {
  console.log('[Migration] Running database migrations...');

  try {
    // ─── EXTENSIONS ──────────────────────────────────────────────────────────
    await query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[Migration] ✓ pgvector extension enabled');

    // ─── TABLES ──────────────────────────────────────────────────────────────

    // Customers table (core)
    await query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        business_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        trial_ends_at TIMESTAMP,
        subscription_status VARCHAR(20) DEFAULT 'trial',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        bot_instructions TEXT
      )
    `);

    // Customers auth table
    await query(`
      CREATE TABLE IF NOT EXISTS customers_auth (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'customer',
        bot_limit INTEGER DEFAULT 1,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bots table
    await query(`
      CREATE TABLE IF NOT EXISTS bots (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        public_id VARCHAR(48) NOT NULL,
        name VARCHAR(255) NOT NULL,
        bot_instructions TEXT,
        greeting_message TEXT,
        header_title VARCHAR(255),
        header_color VARCHAR(20),
        text_color VARCHAR(20),
        lead_capture_enabled BOOLEAN DEFAULT true,
        lead_form_message TEXT,
        notification_emails TEXT,
        conversation_notifications BOOLEAN DEFAULT true,
        chat_bubble_bg VARCHAR(20),
        avatar_bg VARCHAR(20),
        button_style VARCHAR(20) DEFAULT 'circle',
        button_position VARCHAR(20) DEFAULT 'right',
        button_size INTEGER DEFAULT 60,
        bar_message VARCHAR(255),
        chat_window_bg VARCHAR(20),
        user_message_bg VARCHAR(20),
        bot_message_bg VARCHAR(20),
        send_button_bg VARCHAR(20),
        greeting_bubble_enabled BOOLEAN DEFAULT true,
        retrain_frequency VARCHAR(20) DEFAULT 'none',
        retrain_time VARCHAR(10) DEFAULT '03:00',
        last_retrained_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Documents table
    await query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
        title VARCHAR(500),
        content TEXT,
        content_type VARCHAR(50),
        source_url TEXT,
        metadata JSONB,
        last_retrained_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Embeddings table (with pgvector)
    await query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Leads table
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        conversation JSONB,
        notification_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Messages table
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Chat sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        session_id VARCHAR(255) NOT NULL,
        visitor_name VARCHAR(255),
        visitor_email VARCHAR(255),
        last_activity TIMESTAMP DEFAULT NOW(),
        notification_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Sessions table (Express session store)
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `);

    // ─── ADD COLUMNS (safe for existing tables) ─────────────────────────────
    // These handle cases where tables already exist but are missing newer columns

    // Customers columns
    await safeAddColumn('customers', 'trial_ends_at', 'TIMESTAMP');
    await safeAddColumn('customers', 'subscription_status', "VARCHAR(20) DEFAULT 'trial'");
    await safeAddColumn('customers', 'stripe_customer_id', 'VARCHAR(255)');
    await safeAddColumn('customers', 'stripe_subscription_id', 'VARCHAR(255)');
    await safeAddColumn('customers', 'bot_instructions', 'TEXT');

    // Customers auth columns
    await safeAddColumn('customers_auth', 'role', "VARCHAR(20) DEFAULT 'customer'");
    await safeAddColumn('customers_auth', 'bot_limit', 'INTEGER DEFAULT 1');

    // Documents columns
    await safeAddColumn('documents', 'bot_id', 'INTEGER REFERENCES bots(id) ON DELETE CASCADE');
    await safeAddColumn('documents', 'source_url', 'TEXT');
    await safeAddColumn('documents', 'metadata', 'JSONB');
    await safeAddColumn('documents', 'last_retrained_at', 'TIMESTAMP');

    // Embeddings columns
    await safeAddColumn('embeddings', 'bot_id', 'INTEGER REFERENCES bots(id) ON DELETE CASCADE');
    await safeAddColumn('embeddings', 'embedding', 'vector(1536)');

    // Leads columns
    await safeAddColumn('leads', 'bot_id', 'INTEGER REFERENCES bots(id) ON DELETE CASCADE');
    await safeAddColumn('leads', 'conversation', 'JSONB');
    await safeAddColumn('leads', 'notification_sent_at', 'TIMESTAMP');

    // Messages columns
    await safeAddColumn('messages', 'bot_id', 'INTEGER REFERENCES bots(id) ON DELETE CASCADE');
    await safeAddColumn('messages', 'session_id', 'VARCHAR(255)');

    // Chat sessions columns
    await safeAddColumn('chat_sessions', 'notification_sent_at', 'TIMESTAMP');

    // ─── INDEXES ─────────────────────────────────────────────────────────────

    await query('CREATE INDEX IF NOT EXISTS idx_customers_auth_email ON customers_auth(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_customers_auth_customer_id ON customers_auth(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)');
    await query('CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_documents_bot ON documents(bot_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_embeddings_customer ON embeddings(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_embeddings_bot ON embeddings(bot_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_leads_bot ON leads(bot_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages(bot_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_bot ON chat_sessions(bot_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_session ON chat_sessions(session_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_bots_customer ON bots(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_bots_public_id ON bots(public_id)');

    // Vector similarity search index
    try {
      await query('CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
    } catch (ivfError) {
      // IVFFlat requires minimum rows >= lists count to build
      console.log('[Migration] IVFFlat index skipped (need more data), trying HNSW...');
      try {
        await query('CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops)');
      } catch (hnswError) {
        console.log('[Migration] Vector index deferred — will be created after backfill');
      }
    }

    console.log('[Migration] ✓ Database schema up to date');
  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  }
}

/**
 * Safely add a column to a table if it doesn't already exist
 */
async function safeAddColumn(table, column, definition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  } catch (error) {
    // Column might already exist with a different definition — that's fine
    if (!error.message.includes('already exists')) {
      console.error(`[Migration] Warning: Could not add ${table}.${column}:`, error.message);
    }
  }
}
