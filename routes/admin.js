import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// GET /api/admin - Simple admin interface
router.get('/', (req, res) => {
  const testEmail = process.env.TEST_BUSINESS_EMAIL || 'your-email@example.com';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AutaiChat Admin</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #2563eb; }
        .section { background: #f9fafb; padding: 20px; margin: 20px 0; border-radius: 8px; }
        input, textarea { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { background: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #1d4ed8; }
        .result { margin-top: 20px; padding: 10px; background: #e0f2fe; border-radius: 4px; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h1>🎯 AutaiChat Admin Test Page</h1>
      
      <div class="section">
        <h2>Step 1: Create Test Customer</h2>
        <button onclick="createCustomer()">Create Customer (ID: 1)</button>
        <div id="customer-result" class="result" style="display:none;"></div>
      </div>

      <div class="section">
        <h2>Step 2: Upload Content</h2>
        <textarea id="content" rows="6" placeholder="Enter content for the chatbot to learn...">Welcome to Autaimate! We build custom SaaS solutions for UK businesses. Our services include TradeCalcs (electrical calculators for BS 7671 compliance), EquipSafety (QR-based safety compliance for care homes at £199/month), and DetailRecon (AI reconnaissance for close protection at £29.99/report). We are based in London and founded by Mick who has 40+ years of construction experience.</textarea>
        <button onclick="uploadContent()">Upload Content</button>
        <div id="upload-result" class="result" style="display:none;"></div>
      </div>

      <div class="section">
        <h2>Step 3: Test RAG</h2>
        <input type="text" id="question" placeholder="Ask a question about the content..." value="What services does Autaimate offer?" />
        <button onclick="testChat()">Ask Question</button>
        <div id="chat-result" class="result" style="display:none;"></div>
      </div>

      <div class="section">
        <h2>Step 4: View Documents</h2>
        <button onclick="viewDocuments()">View All Documents</button>
        <div id="docs-result" class="result" style="display:none;"></div>
      </div>

      <script>
        async function createCustomer() {
          const result = document.getElementById('customer-result');
          result.style.display = 'block';
          result.innerHTML = 'Creating customer...';
          
          try {
            const response = await fetch('/api/admin/create-customer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: 'Test Business',
                email: 'test@example.com',
                businessEmail: '${testEmail}'
              })
            });
            
            const data = await response.json();
            result.innerHTML = JSON.stringify(data, null, 2);
          } catch (error) {
            result.innerHTML = 'Error: ' + error.message;
          }
        }

        async function uploadContent() {
          const content = document.getElementById('content').value;
          const result = document.getElementById('upload-result');
          result.style.display = 'block';
          result.innerHTML = 'Uploading...';
          
          try {
            const response = await fetch('/api/content/text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerId: 1,
                title: 'Test Content',
                content: content
              })
            });
            
            const data = await response.json();
            result.innerHTML = JSON.stringify(data, null, 2);
          } catch (error) {
            result.innerHTML = 'Error: ' + error.message;
          }
        }

        async function testChat() {
          const question = document.getElementById('question').value;
          const result = document.getElementById('chat-result');
          result.style.display = 'block';
          result.innerHTML = 'Thinking...';
          
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: question,
                customerId: 1,
                conversationHistory: []
              })
            });
            
            const data = await response.json();
            result.innerHTML = 'Question: ' + question + '\\n\\nAnswer: ' + data.message + '\\n\\nUsed Context: ' + (data.contextUsed ? 'Yes ✓' : 'No');
          } catch (error) {
            result.innerHTML = 'Error: ' + error.message;
          }
        }

        async function viewDocuments() {
          const result = document.getElementById('docs-result');
          result.style.display = 'block';
          result.innerHTML = 'Loading...';
          
          try {
            const response = await fetch('/api/content/1');
            const data = await response.json();
            result.innerHTML = JSON.stringify(data, null, 2);
          } catch (error) {
            result.innerHTML = 'Error: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// POST /api/admin/create-customer - Create test customer
router.post('/create-customer', async (req, res) => {
  try {
    const { name, email, businessEmail } = req.body;
    
    // Check if customer already exists
    const existing = await query('SELECT id FROM customers WHERE id = 1');
    
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'Customer already exists', customerId: 1 });
    }
    
    // Create customer with ID = 1
    await query(
      `INSERT INTO customers (id, name, email, business_email) VALUES (1, $1, $2, $3)`,
      [name, email, businessEmail]
    );
    
    res.json({ success: true, message: 'Customer created', customerId: 1 });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
