const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── Helper: generate invoice number INV-YYYYMMDD-XXXX ──────────────────────
function generateInvoiceNumber(tenantId) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${dateStr}-`;

  const last = db.prepare(
    "SELECT invoice_number FROM sales WHERE tenant_id = ? AND invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1"
  ).get(tenantId, `${prefix}%`);

  let seq = 1;
  if (last) {
    const lastSeq = parseInt(last.invoice_number.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── GET /stats — Sales statistics ───────────────────────────────────────────
// (Defined before /:id to avoid route collision)
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const todayTotal = db.prepare(
      "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count FROM sales WHERE tenant_id = ? AND date(created_at) = date('now')"
    ).get(tenantId);

    const weekTotal = db.prepare(
      "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count FROM sales WHERE tenant_id = ? AND created_at >= datetime('now', '-7 days')"
    ).get(tenantId);

    const monthTotal = db.prepare(
      "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count FROM sales WHERE tenant_id = ? AND created_at >= datetime('now', 'start of month')"
    ).get(tenantId);

    const allTimeTotal = db.prepare(
      "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count FROM sales WHERE tenant_id = ?"
    ).get(tenantId);

    const topProducts = db.prepare(`
      SELECT si.product_id, p.name as product_name, p.sku,
             SUM(si.quantity) as total_qty,
             SUM(si.quantity * si.unit_price) as total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.tenant_id = ?
      GROUP BY si.product_id
      ORDER BY total_revenue DESC
      LIMIT 10
    `).all(tenantId);

    const statusBreakdown = db.prepare(
      "SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue FROM sales WHERE tenant_id = ? GROUP BY status"
    ).all(tenantId);

    res.json({
      today: todayTotal,
      this_week: weekTotal,
      this_month: monthTotal,
      all_time: allTimeTotal,
      top_products: topProducts,
      status_breakdown: statusBreakdown
    });
  } catch (err) {
    console.error('Sales stats error:', err);
    res.status(500).json({ error: 'Failed to fetch sales stats' });
  }
});

// ─── GET /daily-summary — Daily sales summary for dashboard ──────────────────
router.get('/daily-summary', authMiddleware, (req, res) => {
  try {
    const { days = 30 } = req.query;

    const summary = db.prepare(`
      SELECT date(created_at) as date,
             COUNT(*) as order_count,
             COALESCE(SUM(total), 0) as revenue,
             COALESCE(SUM(discount), 0) as total_discounts
      FROM sales
      WHERE tenant_id = ? AND created_at >= datetime('now', ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(req.tenant.id, `-${parseInt(days)}`);

    res.json({ summary, days: parseInt(days) });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Failed to fetch daily summary' });
  }
});

// ─── GET / — List sales orders ───────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const { status, date_from, date_to, search, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM sales WHERE tenant_id = ?';
    const params = [req.tenant.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (date_from) {
      query += ' AND created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      query += ' AND created_at <= ?';
      params.push(date_to + ' 23:59:59');
    }
    if (search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR invoice_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as cnt');
    const total = db.prepare(countQuery).get(...params).cnt;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const sales = db.prepare(query).all(...params);
    res.json({ sales, total });
  } catch (err) {
    console.error('Sales list error:', err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// ─── GET /:id — Get single sale with line items ─────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const sale = db.prepare(
      'SELECT * FROM sales WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.sku as product_sku
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(req.params.id);

    res.json({ ...sale, items });
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

// ─── POST / — Create sale ────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      customer_name, customer_phone,
      items, tax_rate = 0, discount = 0,
      notes, status = 'completed'
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const tenantId = req.tenant.id;

    // Validate all products exist and have sufficient stock
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have a product_id and positive quantity' });
      }
      const product = db.prepare(
        'SELECT id, name, stock_qty, selling_price FROM products WHERE id = ? AND tenant_id = ?'
      ).get(item.product_id, tenantId);

      if (!product) {
        return res.status(404).json({ error: `Product not found: ${item.product_id}` });
      }
      if (product.stock_qty < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.stock_qty}, requested: ${item.quantity}`
        });
      }
      // Default unit_price from product if not provided
      if (item.unit_price == null) {
        item.unit_price = product.selling_price;
      }
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const taxAmount = subtotal * (parseFloat(tax_rate) / 100);
    const total = subtotal + taxAmount - parseFloat(discount || 0);
    const invoiceNumber = generateInvoiceNumber(tenantId);
    const saleId = uuid();

    const createSale = db.transaction(() => {
      // Insert sale record
      db.prepare(`
        INSERT INTO sales (id, tenant_id, invoice_number, customer_name, customer_phone, subtotal, tax_rate, tax_amount, discount, total, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId, tenantId, invoiceNumber,
        customer_name || null, customer_phone || null,
        subtotal, parseFloat(tax_rate), taxAmount, parseFloat(discount || 0),
        total, notes || null, status
      );

      // Insert line items and deduct stock
      for (const item of items) {
        const itemId = uuid();
        const lineTotal = item.quantity * item.unit_price;

        const productInfo = db.prepare('SELECT name FROM products WHERE id = ?').get(item.product_id);
        db.prepare(`
          INSERT INTO sale_items (id, sale_id, tenant_id, product_id, product_name, quantity, unit_price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, saleId, tenantId, item.product_id, productInfo?.name || '', item.quantity, item.unit_price, lineTotal);

        // Deduct stock
        const product = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(item.product_id);
        const newQty = product.stock_qty - item.quantity;

        db.prepare(
          "UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(newQty, item.product_id);

        // Record stock movement
        db.prepare(`
          INSERT INTO stock_movements (id, product_id, tenant_id, type, quantity, previous_qty, new_qty, reason)
          VALUES (?, ?, ?, 'subtract', ?, ?, ?, ?)
        `).run(uuid(), item.product_id, tenantId, item.quantity, product.stock_qty, newQty, `Sale ${invoiceNumber}`);
      }
    });

    createSale();

    // Return created sale with items
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare(`
      SELECT si.*, p.name as product_name, p.sku as product_sku
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(saleId);

    res.status(201).json({ ...sale, items: saleItems });
  } catch (err) {
    console.error('Create sale error:', err);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

// ─── PUT /:id — Update sale ─────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const sale = db.prepare(
      'SELECT * FROM sales WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const { customer_name, customer_phone, tax_rate, discount, notes, status } = req.body;

    // Recalculate if tax or discount changed
    const newTaxRate = tax_rate != null ? parseFloat(tax_rate) : sale.tax_rate;
    const newDiscount = discount != null ? parseFloat(discount) : sale.discount;
    const newTaxAmount = sale.subtotal * (newTaxRate / 100);
    const newTotal = sale.subtotal + newTaxAmount - newDiscount;

    db.prepare(`
      UPDATE sales SET
        customer_name = ?, customer_phone = ?,
        tax_rate = ?, tax_amount = ?, discount = ?, total = ?,
        notes = ?, status = ?,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      customer_name ?? sale.customer_name,
      customer_phone ?? sale.customer_phone,
      newTaxRate, newTaxAmount, newDiscount, newTotal,
      notes ?? sale.notes,
      status ?? sale.status,
      req.params.id, req.tenant.id
    );

    const updated = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.sku as product_sku
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(req.params.id);

    res.json({ ...updated, items });
  } catch (err) {
    console.error('Update sale error:', err);
    res.status(500).json({ error: 'Failed to update sale' });
  }
});

// ─── DELETE /:id — Delete sale (restore stock) ──────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const sale = db.prepare(
      'SELECT * FROM sales WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const deleteSale = db.transaction(() => {
      // Restore stock for each line item
      const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);

      for (const item of items) {
        const product = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(item.product_id);
        if (product) {
          const newQty = product.stock_qty + item.quantity;

          db.prepare(
            "UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(newQty, item.product_id);

          db.prepare(`
            INSERT INTO stock_movements (id, product_id, tenant_id, type, quantity, previous_qty, new_qty, reason)
            VALUES (?, ?, ?, 'add', ?, ?, ?, ?)
          `).run(uuid(), item.product_id, req.tenant.id, item.quantity, product.stock_qty, newQty, `Sale deleted: ${sale.invoice_number}`);
        }
      }

      db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(req.params.id);
      db.prepare('DELETE FROM sales WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant.id);
    });

    deleteSale();

    res.json({ success: true, message: 'Sale deleted and stock restored' });
  } catch (err) {
    console.error('Delete sale error:', err);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
});

// ─── POST /:id/invoice — Generate PDF invoice ──────────────────────────────
router.post('/:id/invoice', authMiddleware, (req, res) => {
  try {
    const PDFDocument = require('pdfkit');

    const sale = db.prepare(
      'SELECT * FROM sales WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.sku as product_sku
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(req.params.id);

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Build PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${sale.invoice_number}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    });

    const pageWidth = doc.page.width - 100; // accounting for margins

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').text(tenant ? tenant.name : 'Invoice', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    if (tenant && tenant.email) doc.text(tenant.email, 50, 78);

    // Invoice details — right-aligned block
    const rightCol = 380;
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#333333').text('INVOICE', rightCol, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    doc.text(`Invoice #: ${sale.invoice_number}`, rightCol, 75);
    doc.text(`Date: ${new Date(sale.created_at).toLocaleDateString('en-GB')}`, rightCol, 90);
    doc.text(`Status: ${(sale.status || 'completed').toUpperCase()}`, rightCol, 105);

    // Divider
    doc.moveTo(50, 130).lineTo(50 + pageWidth, 130).strokeColor('#cccccc').stroke();

    // ── Customer info ──
    let y = 145;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333').text('Bill To:', 50, y);
    y += 18;
    doc.fontSize(10).font('Helvetica').fillColor('#444444');
    if (sale.customer_name) { doc.text(sale.customer_name, 50, y); y += 15; }
    if (sale.customer_phone) { doc.text(sale.customer_phone, 50, y); y += 15; }

    // ── Items table ──
    y += 15;
    const tableTop = y;
    const col = { num: 50, desc: 80, sku: 260, qty: 340, price: 400, total: 475 };

    // Table header
    doc.rect(50, tableTop, pageWidth, 22).fill('#f0f0f0');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
    doc.text('#', col.num + 5, tableTop + 6);
    doc.text('Description', col.desc, tableTop + 6);
    doc.text('SKU', col.sku, tableTop + 6);
    doc.text('Qty', col.qty, tableTop + 6);
    doc.text('Unit Price', col.price, tableTop + 6);
    doc.text('Total', col.total, tableTop + 6);

    // Table rows
    y = tableTop + 26;
    doc.font('Helvetica').fontSize(9).fillColor('#444444');

    items.forEach((item, idx) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      const rowBg = idx % 2 === 1 ? '#fafafa' : '#ffffff';
      doc.rect(50, y - 2, pageWidth, 18).fill(rowBg);
      doc.fillColor('#444444');
      doc.text(String(idx + 1), col.num + 5, y + 2);
      doc.text(item.product_name || 'Unknown', col.desc, y + 2, { width: 170 });
      doc.text(item.product_sku || '-', col.sku, y + 2);
      doc.text(String(item.quantity), col.qty, y + 2);
      doc.text(item.unit_price.toFixed(2), col.price, y + 2);
      doc.text(item.line_total.toFixed(2), col.total, y + 2);
      y += 20;
    });

    // Table bottom line
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#cccccc').stroke();

    // ── Totals ──
    y += 15;
    const labelX = 380;
    const valueX = 475;

    doc.font('Helvetica').fontSize(10).fillColor('#444444');
    doc.text('Subtotal:', labelX, y);
    doc.text(sale.subtotal.toFixed(2), valueX, y);
    y += 18;

    if (sale.tax_rate > 0) {
      doc.text(`Tax (${sale.tax_rate}%):`, labelX, y);
      doc.text(sale.tax_amount.toFixed(2), valueX, y);
      y += 18;
    }

    if (sale.discount > 0) {
      doc.text('Discount:', labelX, y);
      doc.text(`-${sale.discount.toFixed(2)}`, valueX, y);
      y += 18;
    }

    doc.moveTo(labelX, y).lineTo(50 + pageWidth, y).strokeColor('#cccccc').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#333333');
    doc.text('TOTAL:', labelX, y);
    doc.text(sale.total.toFixed(2), valueX, y);

    // ── Notes ──
    if (sale.notes) {
      y += 40;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Notes:', 50, y);
      y += 15;
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(sale.notes, 50, y, { width: pageWidth });
    }

    // ── Footer ──
    doc.fontSize(8).font('Helvetica').fillColor('#999999');
    doc.text('Thank you for your business!', 50, 760, { align: 'center', width: pageWidth });

    doc.end();
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return res.status(501).json({ error: 'pdfkit is not installed. Run: npm install pdfkit' });
    }
    console.error('Invoice generation error:', err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

module.exports = router;
