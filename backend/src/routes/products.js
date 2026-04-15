const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── GET /stats — Inventory statistics ───────────────────────────────────────
// (Defined before /:id to avoid route collision)
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const totalProducts = db.prepare(
      'SELECT COUNT(*) as count FROM products WHERE tenant_id = ?'
    ).get(tenantId).count;

    const totalValue = db.prepare(
      'SELECT COALESCE(SUM(selling_price * stock_qty), 0) as value FROM products WHERE tenant_id = ?'
    ).get(tenantId).value;

    const totalCostValue = db.prepare(
      'SELECT COALESCE(SUM(cost_price * stock_qty), 0) as value FROM products WHERE tenant_id = ?'
    ).get(tenantId).value;

    const lowStockCount = db.prepare(
      'SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND stock_qty <= min_stock AND stock_qty > 0'
    ).get(tenantId).count;

    const outOfStockCount = db.prepare(
      'SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND stock_qty = 0'
    ).get(tenantId).count;

    const categories = db.prepare(
      'SELECT COALESCE(category, \'Uncategorized\') as category, COUNT(*) as count FROM products WHERE tenant_id = ? GROUP BY category ORDER BY count DESC'
    ).all(tenantId);

    res.json({
      total_products: totalProducts,
      total_retail_value: totalValue,
      total_cost_value: totalCostValue,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      categories
    });
  } catch (err) {
    console.error('Products stats error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory stats' });
  }
});

// ─── GET /low-stock — Products at or below min_stock ─────────────────────────
router.get('/low-stock', authMiddleware, (req, res) => {
  try {
    const products = db.prepare(
      'SELECT * FROM products WHERE tenant_id = ? AND stock_qty <= min_stock ORDER BY (stock_qty - min_stock) ASC, name ASC'
    ).all(req.tenant.id);

    res.json({ products, count: products.length });
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// ─── GET /categories — Distinct categories list ──────────────────────────────
router.get('/categories', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT DISTINCT COALESCE(category, \'Uncategorized\') as category FROM products WHERE tenant_id = ? ORDER BY category ASC'
    ).all(req.tenant.id);

    res.json({ categories: rows.map(r => r.category) });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ─── GET / — List all products ───────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const { search, category, low_stock, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM products WHERE tenant_id = ?';
    const params = [req.tenant.id];

    if (search) {
      query += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (low_stock === 'true') {
      query += ' AND stock_qty <= min_stock';
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as cnt');
    const total = db.prepare(countQuery).get(...params).cnt;

    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const products = db.prepare(query).all(...params);
    res.json({ products, total });
  } catch (err) {
    console.error('Products list error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── GET /:id — Get single product ──────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const product = db.prepare(
      'SELECT * FROM products WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);

    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Fetch recent stock movements
    const movements = db.prepare(
      'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(req.params.id);

    res.json({ ...product, stock_movements: movements });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ─── POST / — Create product ────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      name, sku, category, description,
      cost_price, selling_price,
      stock_qty, min_stock, unit, image_url
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });

    // Check for duplicate SKU within tenant
    if (sku) {
      const existing = db.prepare(
        'SELECT id FROM products WHERE tenant_id = ? AND sku = ?'
      ).get(req.tenant.id, sku);
      if (existing) return res.status(409).json({ error: 'A product with this SKU already exists' });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO products (id, tenant_id, name, sku, category, description, cost_price, selling_price, stock_qty, min_stock, unit, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.tenant.id,
      name,
      sku || null,
      category || null,
      description || null,
      cost_price != null ? parseFloat(cost_price) : 0,
      selling_price != null ? parseFloat(selling_price) : 0,
      stock_qty != null ? parseInt(stock_qty) : 0,
      min_stock != null ? parseInt(min_stock) : 5,
      unit || 'pcs',
      image_url || null
    );

    // Record initial stock if any
    if (stock_qty && parseInt(stock_qty) > 0) {
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, tenant_id, type, quantity, reason)
        VALUES (?, ?, ?, 'add', ?, 'Initial stock')
      `).run(uuid(), id, req.tenant.id, parseInt(stock_qty));
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ─── PUT /:id — Update product ──────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const product = db.prepare(
      'SELECT * FROM products WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const {
      name, sku, category, description,
      cost_price, selling_price,
      min_stock, unit, image_url
    } = req.body;

    // Check SKU uniqueness if changed
    if (sku && sku !== product.sku) {
      const existing = db.prepare(
        'SELECT id FROM products WHERE tenant_id = ? AND sku = ? AND id != ?'
      ).get(req.tenant.id, sku, req.params.id);
      if (existing) return res.status(409).json({ error: 'A product with this SKU already exists' });
    }

    db.prepare(`
      UPDATE products SET
        name = ?, sku = ?, category = ?, description = ?,
        cost_price = ?, selling_price = ?,
        min_stock = ?, unit = ?, image_url = ?,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      name ?? product.name,
      sku ?? product.sku,
      category ?? product.category,
      description ?? product.description,
      cost_price != null ? parseFloat(cost_price) : product.cost_price,
      selling_price != null ? parseFloat(selling_price) : product.selling_price,
      min_stock != null ? parseInt(min_stock) : product.min_stock,
      unit ?? product.unit,
      image_url ?? product.image_url,
      req.params.id, req.tenant.id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ─── DELETE /:id — Delete product ────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const product = db.prepare(
      'SELECT * FROM products WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check if product is referenced in any sale items
    const saleRef = db.prepare(
      'SELECT COUNT(*) as cnt FROM sale_items WHERE product_id = ?'
    ).get(req.params.id).cnt;

    if (saleRef > 0) {
      return res.status(409).json({
        error: 'Cannot delete product — it is referenced in existing sales. Consider setting stock to 0 instead.'
      });
    }

    db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant.id);

    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ─── PUT /:id/stock — Update stock quantity ──────────────────────────────────
router.put('/:id/stock', authMiddleware, (req, res) => {
  try {
    const product = db.prepare(
      'SELECT * FROM products WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { type, quantity, reason } = req.body;

    if (!type || !['add', 'subtract', 'set'].includes(type)) {
      return res.status(400).json({ error: 'type must be "add", "subtract", or "set"' });
    }
    if (quantity == null || isNaN(quantity) || parseInt(quantity) < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative integer' });
    }

    const qty = parseInt(quantity);
    let newStock;

    if (type === 'add') {
      newStock = product.stock_qty + qty;
    } else if (type === 'subtract') {
      newStock = product.stock_qty - qty;
      if (newStock < 0) {
        return res.status(400).json({ error: `Insufficient stock. Current: ${product.stock_qty}, requested: ${qty}` });
      }
    } else {
      // set
      newStock = qty;
    }

    const updateStock = db.transaction(() => {
      db.prepare(
        'UPDATE products SET stock_qty = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(newStock, req.params.id);

      db.prepare(`
        INSERT INTO stock_movements (id, product_id, tenant_id, type, quantity, previous_qty, new_qty, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuid(), req.params.id, req.tenant.id, type, qty, product.stock_qty, newStock, reason || null);
    });

    updateStock();

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Stock update error:', err);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

module.exports = router;
