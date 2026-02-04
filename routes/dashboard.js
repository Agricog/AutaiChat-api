import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// GET /api/dashboard/:customerId - Customer dashboard page
router.get('/:customerId', async (req, res) => {
  const { customerId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Auto Reply Chat - Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; }
        .header { background: #2563eb; color: white; padding: 20px 40px; }
        .header h1 { font-size: 24px; }
        .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        .card { background: white; border-radius: 8px; padding: 30px; margin-bottom: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .card h2 { color: #1f2937; margin-bottom: 20px; font-size: 20px; }
        .tabs { display: flex; gap: 10px; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px; }
        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
        .tab.active { border-bottom-color: #2563eb; color: #2563eb; font-weight: 600; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        textarea, input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; margin: 10px 0; font-family: inherit; }
        button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
        button:hover { background: #1d4ed8; }
        .code-block { background: #1f2937; color: #f9fafb; padding: 20px; border-radius: 6px; overflow-x: auto; margin: 10px 0; }
        .code-block code { font-family: 'Courier New', monospace; font-size: 14px; white-space: pre; }
        .stat { display: inline-block; margin-right: 30px; }
        .stat-value { font-size: 32px; font-weight: bold; color: #2563eb; }
        .stat-label { color: #6b7280; font-size: 14px; margin-top: 5px; }
        .doc-list { list-style: none; }
        .doc-item { padding: 15px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 10px 0; display: flex; justify-content: space-between; align-items: center; }
        .doc-meta { color: #6b7280; font-size: 14px; }
        .delete-btn { background: #ef4444; padding: 8px 16px; font-size: 14px; }
        .delete-btn:hover { background: #dc2626; }
        .lead-item { padding: 15px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 10px 0; }
        .lead-email { color: #2563eb; font-weight: 600; }
        .lead-date { color: #6b7280; font-size: 12px; }
        .success { background: #d1fae5; color: #065f46; padding: 12px; border-radius: 6px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎯 Auto Reply Chat Dashboard</h1>
      </div>

      <div class="container">
        <div class="card">
          <div class="stat">
            <div class="stat-value" id="doc-count">-</div>
            <div class="stat-label">Documents</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="lead-count">-</div>
            <div class="stat-label">Leads Captured</div>
          </div>
        </div>

        <div class="card">
          <div class="tabs">
            <div class="tab active" onclick="switchTab('upload')">Upload Content</div>
            <div class="tab" onclick="switchTab('documents')">My Documents</div>
            <div class="tab" onclick="switchTab('leads')">Leads</div>
            <div class="tab" onclick="switchTab('embed')">Embed Code</div>
          </div>

          <!-- Upload Content Tab -->
          <div id="upload-tab" class="tab-content active">
            <h2>Upload Training Content</h2>
            <p style="color: #6b7280; margin-bottom: 20px;">Add content for your chatbot to learn from. The more context you provide, the better it will answer questions.</p>
            
            <input type="text" id="doc-title" placeholder="Document title (e.g., 'Product Information', 'FAQ')" />
            <textarea id="doc-content" rows="12" placeholder="Paste your content here...

Examples:
- Company information
- Product/service descriptions
- Pricing details
- FAQ
- Contact information"></textarea>
            <button onclick="uploadDocument()">Upload Content</button>
            <div id="upload-result"></div>
          </div>

          <!-- Documents Tab -->
          <div id="documents-tab" class="tab-content">
            <h2>Your Documents</h2>
            <ul id="doc-list" class="doc-list"></ul>
          </div>

          <!-- Leads Tab -->
          <div id="leads-tab" class="tab-content">
            <h2>Captured Leads</h2>
            <div id="lead-list"></div>
          </div>

          <!-- Embed Code Tab -->
          <div id="embed-tab" class="tab-content">
            <h2>Add Chatbot to Your Website</h2>
            <p style="color: #6b7280; margin-bottom: 20px;">Copy this code and paste it before the closing &lt;/body&gt; tag on your website.</p>
            <div class="code-block">
              <code id="embed-code">Loading...</code>
            </div>
            <button onclick="copyEmbedCode()">Copy to Clipboard</button>
            <div id="copy-result"></div>
          </div>
        </div>
      </div>

      <script>
        const customerId = ${customerId};
        let embedCode = '';

        // Switch tabs
        function switchTab(tabName) {
          document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
          
          event.target.classList.add('active');
          document.getElementById(tabName + '-tab').classList.add('active');
          
          if (tabName === 'documents') loadDocuments();
          if (tabName === 'leads') loadLeads();
        }

        // Upload document
        async function uploadDocument() {
          const title = document.getElementById('doc-title').value;
          const content = document.getElementById('doc-content').value;
          const result = document.getElementById('upload-result');

          if (!content.trim()) {
            result.innerHTML = '<div style="color: #ef4444; margin-top: 10px;">Please enter some content</div>';
            return;
          }

          result.innerHTML = '<div style="color: #6b7280; margin-top: 10px;">Uploading...</div>';

          try {
            const response = await fetch('/api/content/text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerId: customerId,
                title: title || 'Untitled Document',
                content: content
              })
            });

            const data = await response.json();
            
            if (data.success) {
              result.innerHTML = '<div class="success">✓ Content uploaded! ' + data.chunksStored + ' chunks stored.</div>';
              document.getElementById('doc-title').value = '';
              document.getElementById('doc-content').value = '';
              loadStats();
            } else {
              result.innerHTML = '<div style="color: #ef4444; margin-top: 10px;">Error: ' + data.error + '</div>';
            }
          } catch (error) {
            result.innerHTML = '<div style="color: #ef4444; margin-top: 10px;">Error: ' + error.message + '</div>';
          }
        }

        // Load documents
        async function loadDocuments() {
          const list = document.getElementById('doc-list');
          list.innerHTML = '<li>Loading...</li>';

          try {
            const response = await fetch('/api/content/' + customerId);
            const data = await response.json();

            if (data.documents.length === 0) {
              list.innerHTML = '<li style="color: #6b7280;">No documents yet. Upload some content to get started!</li>';
              return;
            }

            list.innerHTML = data.documents.map(doc => \`
              <li class="doc-item">
                <div>
                  <strong>\${doc.title}</strong>
                  <div class="doc-meta">\${new Date(doc.created_at).toLocaleDateString()}</div>
                </div>
                <button class="delete-btn" onclick="deleteDocument(\${doc.id})">Delete</button>
              </li>
            \`).join('');
          } catch (error) {
            list.innerHTML = '<li style="color: #ef4444;">Error loading documents</li>';
          }
        }

        // Delete document
        async function deleteDocument(docId) {
          if (!confirm('Delete this document?')) return;

          try {
            await fetch('/api/content/' + docId, { method: 'DELETE' });
            loadDocuments();
            loadStats();
          } catch (error) {
            alert('Error deleting document');
          }
        }

        // Load leads
        async function loadLeads() {
          const container = document.getElementById('lead-list');
          container.innerHTML = '<div style="color: #6b7280;">Loading...</div>';

          try {
            const response = await fetch('/api/customers/' + customerId + '/leads');
            const data = await response.json();

            if (data.leads.length === 0) {
              container.innerHTML = '<div style="color: #6b7280;">No leads captured yet.</div>';
              return;
            }

            container.innerHTML = data.leads.map(lead => \`
              <div class="lead-item">
                <div><strong>\${lead.name}</strong></div>
                <div class="lead-email">\${lead.email}</div>
                <div class="lead-date">\${new Date(lead.created_at).toLocaleString()}</div>
              </div>
            \`).join('');
          } catch (error) {
            container.innerHTML = '<div style="color: #ef4444;">Error loading leads</div>';
          }
        }

        // Load stats
        async function loadStats() {
          try {
            const response = await fetch('/api/customers/' + customerId);
            const data = await response.json();
            
            // Get document count
            const docsResponse = await fetch('/api/content/' + customerId);
            const docsData = await docsResponse.json();
            document.getElementById('doc-count').textContent = docsData.documents.length;
            
            // Get leads count
            const leadsResponse = await fetch('/api/customers/' + customerId + '/leads');
            const leadsData = await leadsResponse.json();
            document.getElementById('lead-count').textContent = leadsData.leads.length;
            
            // Set embed code
            embedCode = data.customer.embedCode;
            document.getElementById('embed-code').textContent = embedCode;
          } catch (error) {
            console.error('Error loading stats:', error);
          }
        }

        // Copy embed code
        function copyEmbedCode() {
          navigator.clipboard.writeText(embedCode);
          document.getElementById('copy-result').innerHTML = '<div class="success">✓ Copied to clipboard!</div>';
          setTimeout(() => {
            document.getElementById('copy-result').innerHTML = '';
          }, 3000);
        }

        // Load initial data
        loadStats();
      </script>
    </body>
    </html>
  `);
});

export default router;
