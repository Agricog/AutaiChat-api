import express from 'express';
import { query } from '../db/database.js';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const router = express.Router();

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const docId = req.params.id;
    const format = req.query.format || 'txt';
    const customerId = req.session.customerId;

    if (!customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get document and verify ownership
    const result = await query(
      'SELECT title, content, customer_id FROM documents WHERE id = $1',
      [docId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Security: Verify ownership
    if (doc.customer_id !== customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const title = doc.title || 'Untitled Document';
    const content = doc.content || '';

    switch (format) {
      case 'pdf':
        return downloadAsPDF(res, title, content);
      
      case 'docx':
        return await downloadAsDocx(res, title, content);
      
      case 'csv':
        return downloadAsCSV(res, title, content);
      
      case 'txt':
      default:
        return downloadAsTxt(res, title, content);
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

function downloadAsPDF(res, title, content) {
  const pdf = new PDFDocument();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.pdf"`);
  
  pdf.pipe(res);
  
  pdf.fontSize(20).text(title, { align: 'center' });
  pdf.moveDown();
  pdf.fontSize(12).text(content, { align: 'left' });
  
  pdf.end();
}

async function downloadAsDocx(res, title, content) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({
              text: content,
              size: 24,
            }),
          ],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.docx"`);
  
  res.send(buffer);
}

function downloadAsCSV(res, title, content) {
  // Simple CSV format: Title, Content
  const csv = `"Title","Content"\n"${title.replace(/"/g, '""')}","${content.replace(/"/g, '""')}"`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.csv"`);
  
  res.send(csv);
}

function downloadAsTxt(res, title, content) {
  const txt = `${title}\n${'='.repeat(title.length)}\n\n${content}`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.txt"`);
  
  res.send(txt);
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export default router;
