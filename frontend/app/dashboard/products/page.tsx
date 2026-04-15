"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8097";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---------- types ---------- */

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  cost_price: number;
  selling_price: number;
  stock_qty: number;
  min_stock: number;
  unit: string;
}

interface Stats {
  total_products: number;
  total_retail_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  categories: string[];
}

const emptyForm = {
  name: "",
  sku: "",
  category: "",
  description: "",
  cost_price: "",
  selling_price: "",
  stock_qty: "",
  min_stock: "",
  unit: "pcs",
};

/* ---------- component ---------- */

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // category autocomplete
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  // stock adjust
  const [stockModal, setStockModal] = useState<{ product: Product; type: "add" | "subtract" } | null>(null);
  const [stockQty, setStockQty] = useState("1");
  const [stockReason, setStockReason] = useState("");
  const [adjustingStock, setAdjustingStock] = useState(false);

  /* ---------- data loading ---------- */

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCategory) params.set("category", filterCategory);
      if (lowStockOnly) params.set("low_stock", "1");
      const res = await fetch(`${API}/api/products?${params}`, { headers: authHeaders() });
      const data = await res.json();
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, lowStockOnly]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/products/stats`, { headers: authHeaders() });
      const data = await res.json();
      setStats(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/products/categories`, { headers: authHeaders() });
      const data = await res.json();
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadCategories();
  }, [loadStats, loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(), 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  // close category dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ---------- handlers ---------- */

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError("");
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name || "",
      sku: p.sku || "",
      category: p.category || "",
      description: p.description || "",
      cost_price: p.cost_price?.toString() || "",
      selling_price: p.selling_price?.toString() || "",
      stock_qty: p.stock_qty?.toString() || "",
      min_stock: p.min_stock?.toString() || "",
      unit: p.unit || "pcs",
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Product name is required");
      return;
    }
    setSaving(true);
    setFormError("");
    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      cost_price: parseFloat(form.cost_price) || 0,
      selling_price: parseFloat(form.selling_price) || 0,
      stock_qty: parseInt(form.stock_qty) || 0,
      min_stock: parseInt(form.min_stock) || 0,
      unit: form.unit.trim() || "pcs",
    };
    try {
      const url = editingId ? `${API}/api/products/${editingId}` : `${API}/api/products`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      setShowModal(false);
      loadProducts();
      loadStats();
      loadCategories();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      await fetch(`${API}/api/products/${id}`, { method: "DELETE", headers: authHeaders() });
      loadProducts();
      loadStats();
    } catch {
      /* ignore */
    }
  }

  async function handleStockAdjust() {
    if (!stockModal) return;
    const qty = parseInt(stockQty);
    if (!qty || qty <= 0) return;
    setAdjustingStock(true);
    try {
      const res = await fetch(`${API}/api/products/${stockModal.product.id}/stock`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ type: stockModal.type, quantity: qty, reason: stockReason.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setStockModal(null);
      setStockQty("1");
      setStockReason("");
      loadProducts();
      loadStats();
    } catch {
      /* ignore */
    } finally {
      setAdjustingStock(false);
    }
  }

  function stockBadge(stock: number, minStock: number) {
    if (stock === 0)
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Out of Stock</span>;
    if (stock <= minStock)
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">Low Stock</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">In Stock</span>;
  }

  function fmtCurrency(val: number) {
    return val != null ? `$${Number(val).toFixed(2)}` : "$0.00";
  }

  const filteredCategories = categories.filter(
    (c) => c && c.toLowerCase().includes(form.category.toLowerCase()) && c.toLowerCase() !== form.category.toLowerCase()
  );

  /* ---------- render ---------- */

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Products / Inventory</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
          + Add Product
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Products</div>
          <div className="text-2xl font-bold text-white">{stats?.total_products ?? "—"}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Retail Value</div>
          <div className="text-2xl font-bold text-green-400">{stats ? fmtCurrency(stats.total_retail_value) : "—"}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Low Stock</div>
          <div className="text-2xl font-bold text-amber-400">{stats?.low_stock_count ?? "—"}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Out of Stock</div>
          <div className="text-2xl font-bold text-red-400">{stats?.out_of_stock_count ?? "—"}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
            lowStockOnly
              ? "bg-amber-600/30 border-amber-500 text-amber-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
          }`}
        >
          ⚠ Low Stock
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">SKU</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Category</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Cost</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Price</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Min</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  No products found
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{p.sku || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{p.category || "—"}</td>
                  <td className="px-4 py-3 text-slate-300 text-right">{fmtCurrency(p.cost_price)}</td>
                  <td className="px-4 py-3 text-white text-right font-medium">{fmtCurrency(p.selling_price)}</td>
                  <td className="px-4 py-3 text-white text-right font-medium">{p.stock_qty ?? 0}</td>
                  <td className="px-4 py-3 text-slate-400 text-right">{p.min_stock ?? 0}</td>
                  <td className="px-4 py-3 text-center">{stockBadge(p.stock_qty ?? 0, p.min_stock ?? 0)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setStockModal({ product: p, type: "add" })}
                        title="Add stock"
                        className="p-1.5 rounded hover:bg-green-600/20 text-green-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setStockModal({ product: p, type: "subtract" })}
                        title="Subtract stock"
                        className="p-1.5 rounded hover:bg-amber-600/20 text-amber-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-blue-600/20 text-blue-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-red-600/20 text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">{editingId ? "Edit Product" : "Add Product"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {formError && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{formError}</div>}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  placeholder="Product name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="e.g. PROD-001"
                  />
                </div>
                <div ref={catRef} className="relative">
                  <label className="block text-sm text-slate-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => {
                      setForm({ ...form, category: e.target.value });
                      setShowCatDropdown(true);
                    }}
                    onFocus={() => setShowCatDropdown(true)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="Type or select"
                  />
                  {showCatDropdown && filteredCategories.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-36 overflow-y-auto">
                      {filteredCategories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setForm({ ...form, category: c });
                            setShowCatDropdown(false);
                          }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500 resize-none"
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Cost Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Selling Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.selling_price}
                    onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Stock Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock_qty}
                    onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="pcs"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? "Saving..." : editingId ? "Update Product" : "Create Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setStockModal(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">
                {stockModal.type === "add" ? "Add Stock" : "Subtract Stock"} — {stockModal.product.name}
              </h2>
              <button onClick={() => setStockModal(null)} className="text-slate-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-slate-400">
                Current stock: <span className="text-white font-medium">{stockModal.product.stock_qty}</span>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  placeholder="e.g. New shipment, Sold, Damaged"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button onClick={() => setStockModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleStockAdjust}
                disabled={adjustingStock}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  stockModal.type === "add" ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {adjustingStock ? "Saving..." : stockModal.type === "add" ? "Add Stock" : "Subtract Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
