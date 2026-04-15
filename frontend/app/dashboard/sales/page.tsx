"use client";

import { useEffect, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8097";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res;
}

async function apiJson(path: string, opts?: RequestInit) {
  const res = await apiFetch(path, opts);
  return res.json();
}

/* ── Types ── */
interface SaleItem {
  id?: number;
  product_id?: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

interface Sale {
  id: number;
  invoice_number?: string;
  customer_name: string;
  customer_phone?: string;
  items?: SaleItem[];
  items_count?: number;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  discount?: number;
  total: number;
  status?: string;
  payment_method?: string;
  notes?: string;
  created_at?: string;
}

interface Stats {
  today: { revenue: number; count: number };
  this_week: { revenue: number; count: number };
  this_month: { revenue: number; count: number };
  all_time: { revenue: number; count: number };
  top_products: { name: string; quantity: number; revenue: number }[];
  status_breakdown: { status: string; count: number }[];
}

interface Product {
  id: number;
  name: string;
  selling_price: number;
  stock?: number;
}

interface NewItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

const paymentMethods = ["Cash", "Card", "Bank Transfer", "WhatsApp Pay"];

function fmtCurrency(n: number) {
  return "$" + Number(n || 0).toFixed(2);
}

function fmtDate(d?: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d?: string) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Icons (inline SVG) ── */
function IconCurrency() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

/* ── Status badge ── */
function StatusBadge({ status }: { status?: string }) {
  const s = (status || "pending").toLowerCase();
  const colors: Record<string, string> = {
    paid: "bg-green-500/20 text-green-400",
    completed: "bg-green-500/20 text-green-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    cancelled: "bg-red-500/20 text-red-400",
    refunded: "bg-purple-500/20 text-purple-400",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[s] || "bg-slate-600 text-slate-300"}`}>
      {status || "Pending"}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function SalesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // New sale modal
  const [showNewSale, setShowNewSale] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newSale, setNewSale] = useState({
    customer_name: "",
    customer_phone: "",
    tax_rate: 0,
    discount: 0,
    payment_method: "Cash",
    notes: "",
  });
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | "">("");
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // View sale detail
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  /* ── Load data ── */
  const loadStats = useCallback(async () => {
    try {
      const data = await apiJson("/api/sales/stats");
      setStats(data);
    } catch {
      // ignore
    }
  }, []);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiJson(`/api/sales?${params.toString()}`);
      setSales(Array.isArray(data.sales) ? data.sales : Array.isArray(data) ? data : []);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    loadStats();
    loadSales();
  }, [loadStats, loadSales]);

  /* ── Products for new sale ── */
  const loadProducts = useCallback(async () => {
    try {
      const data = await apiJson("/api/products");
      setProducts(Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    if (showNewSale) loadProducts();
  }, [showNewSale, loadProducts]);

  /* ── When product changes, fill price ── */
  useEffect(() => {
    if (selectedProductId !== "") {
      const p = products.find((pr) => pr.id === selectedProductId);
      if (p) setItemPrice(p.selling_price || 0);
    }
  }, [selectedProductId, products]);

  /* ── Add item to new sale ── */
  function addItem() {
    if (selectedProductId === "" || itemQty <= 0) return;
    const p = products.find((pr) => pr.id === selectedProductId);
    if (!p) return;
    setNewItems((prev) => [
      ...prev,
      { product_id: p.id, product_name: p.name, quantity: itemQty, unit_price: itemPrice },
    ]);
    setSelectedProductId("");
    setItemQty(1);
    setItemPrice(0);
  }

  function removeItem(idx: number) {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = newItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const taxAmount = subtotal * (newSale.tax_rate / 100);
  const grandTotal = subtotal + taxAmount - (newSale.discount || 0);

  /* ── Save sale ── */
  async function handleSave() {
    if (!newSale.customer_name.trim()) {
      setSaveError("Customer name is required");
      return;
    }
    if (newItems.length === 0) {
      setSaveError("Add at least one item");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await apiJson("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customer_name: newSale.customer_name.trim(),
          customer_phone: newSale.customer_phone.trim() || undefined,
          items: newItems.map((it) => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price })),
          tax_rate: newSale.tax_rate,
          discount: newSale.discount,
          payment_method: newSale.payment_method,
          notes: newSale.notes.trim() || undefined,
        }),
      });
      setShowNewSale(false);
      setNewSale({ customer_name: "", customer_phone: "", tax_rate: 0, discount: 0, payment_method: "Cash", notes: "" });
      setNewItems([]);
      loadSales();
      loadStats();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }

  /* ── View sale detail ── */
  async function openSaleDetail(id: number) {
    setLoadingDetail(true);
    try {
      const data = await apiJson(`/api/sales/${id}`);
      setViewSale(data.sale || data);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  /* ── Delete sale ── */
  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this sale?")) return;
    try {
      await apiFetch(`/api/sales/${id}`, { method: "DELETE" });
      loadSales();
      loadStats();
      if (viewSale?.id === id) setViewSale(null);
    } catch {
      // ignore
    }
  }

  /* ── Download invoice ── */
  async function downloadInvoice(id: number) {
    try {
      const res = await apiFetch(`/api/sales/${id}/invoice`, { method: "POST" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download invoice");
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales &amp; Billing</h1>
          <p className="text-slate-400 text-sm mt-1">Manage sales, invoices, and revenue tracking</p>
        </div>
        <button
          onClick={() => setShowNewSale(true)}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <IconPlus /> New Sale
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Today&apos;s Revenue</p>
              <p className="text-2xl font-bold text-white mt-1">{fmtCurrency(stats?.today?.revenue || 0)}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center text-green-400">
              <IconCurrency />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Today&apos;s Orders</p>
              <p className="text-2xl font-bold text-white mt-1">{stats?.today?.count || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
              <IconCart />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">This Week</p>
              <p className="text-2xl font-bold text-white mt-1">{fmtCurrency(stats?.this_week?.revenue || 0)}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400">
              <IconCalendar />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">This Month</p>
              <p className="text-2xl font-bold text-white mt-1">{fmtCurrency(stats?.this_month?.revenue || 0)}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center text-yellow-400">
              <IconTrend />
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-green-400 focus:border-green-400 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-green-400 focus:border-green-400 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-green-400 focus:border-green-400 outline-none"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Sales Table ── */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Invoice #</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">Loading...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">No sales found</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                    onClick={() => openSaleDetail(sale.id)}
                  >
                    <td className="px-4 py-3 text-green-400 font-mono text-xs">
                      {sale.invoice_number || `#${sale.id}`}
                    </td>
                    <td className="px-4 py-3 text-white">{sale.customer_name}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtDate(sale.created_at)}</td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      {sale.items_count ?? sale.items?.length ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">{fmtCurrency(sale.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={sale.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openSaleDetail(sale.id)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-colors"
                          title="View"
                        >
                          <IconEye />
                        </button>
                        <button
                          onClick={() => downloadInvoice(sale.id)}
                          className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-600 rounded transition-colors"
                          title="Download Invoice"
                        >
                          <IconDownload />
                        </button>
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                          title="Delete"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         NEW SALE SLIDE-OVER
         ══════════════════════════════════════════════════════════════════ */}
      {showNewSale && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowNewSale(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-white">New Sale</h2>
              <button onClick={() => setShowNewSale(false)} className="text-slate-400 hover:text-white">
                <IconX />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={newSale.customer_name}
                    onChange={(e) => setNewSale((s) => ({ ...s, customer_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-green-400 focus:border-green-400 outline-none"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={newSale.customer_phone}
                    onChange={(e) => setNewSale((s) => ({ ...s, customer_phone: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-green-400 focus:border-green-400 outline-none"
                    placeholder="+1234567890"
                  />
                </div>
              </div>

              {/* Product selector */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Add Products</label>
                <div className="flex gap-2">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-green-400 focus:border-green-400 outline-none"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {fmtCurrency(p.selling_price)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={itemQty}
                    onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white text-center focus:ring-green-400 focus:border-green-400 outline-none"
                    title="Quantity"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemPrice}
                    onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white text-center focus:ring-green-400 focus:border-green-400 outline-none"
                    title="Unit price"
                  />
                  <button
                    onClick={addItem}
                    disabled={selectedProductId === ""}
                    className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:text-slate-400 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Items list */}
              {newItems.length > 0 && (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/80">
                        <th className="text-left px-3 py-2 text-slate-400 font-medium">Product</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 text-slate-400 font-medium">Price</th>
                        <th className="text-right px-3 py-2 text-slate-400 font-medium">Total</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-slate-700/50">
                          <td className="px-3 py-2 text-white">{item.product_name}</td>
                          <td className="px-3 py-2 text-center text-slate-300">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{fmtCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right text-white font-medium">
                            {fmtCurrency(item.quantity * item.unit_price)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="text-white">{fmtCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Tax Rate (%)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={newSale.tax_rate}
                    onChange={(e) => setNewSale((s) => ({ ...s, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white text-right outline-none focus:border-green-400"
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tax Amount</span>
                  <span className="text-white">{fmtCurrency(taxAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Discount ($)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={newSale.discount}
                    onChange={(e) => setNewSale((s) => ({ ...s, discount: parseFloat(e.target.value) || 0 }))}
                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white text-right outline-none focus:border-green-400"
                  />
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                  <span className="text-white font-bold">Grand Total</span>
                  <span className="text-green-400 font-bold text-lg">{fmtCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Payment & Notes */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payment Method</label>
                <select
                  value={newSale.payment_method}
                  onChange={(e) => setNewSale((s) => ({ ...s, payment_method: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-green-400 focus:border-green-400 outline-none"
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <textarea
                  value={newSale.notes}
                  onChange={(e) => setNewSale((s) => ({ ...s, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-green-400 focus:border-green-400 outline-none resize-none"
                  placeholder="Optional notes..."
                />
              </div>

              {saveError && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 text-sm px-3 py-2 rounded-lg">
                  {saveError}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:text-slate-400 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                {saving ? "Saving..." : "Save Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         VIEW SALE DETAIL MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {(viewSale || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setViewSale(null); setLoadingDetail(false); }} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl mx-4">
            {loadingDetail && !viewSale ? (
              <div className="p-12 text-center text-slate-400">Loading sale details...</div>
            ) : viewSale ? (
              <>
                {/* Header */}
                <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {viewSale.invoice_number || `Sale #${viewSale.id}`}
                    </h2>
                    <p className="text-slate-400 text-sm">{fmtDateTime(viewSale.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadInvoice(viewSale.id)}
                      className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      <IconDownload /> Invoice
                    </button>
                    <button onClick={() => { setViewSale(null); setLoadingDetail(false); }} className="text-slate-400 hover:text-white">
                      <IconX />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Customer info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400">Customer</p>
                      <p className="text-white font-medium">{viewSale.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Phone</p>
                      <p className="text-slate-300">{viewSale.customer_phone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Payment Method</p>
                      <p className="text-slate-300">{viewSale.payment_method || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Status</p>
                      <StatusBadge status={viewSale.status} />
                    </div>
                  </div>

                  {/* Items table */}
                  {viewSale.items && viewSale.items.length > 0 && (
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/80">
                            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Product</th>
                            <th className="text-center px-4 py-2.5 text-slate-400 font-medium">Qty</th>
                            <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Unit Price</th>
                            <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewSale.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-slate-700/50">
                              <td className="px-4 py-2.5 text-white">{item.product_name || `Product #${item.product_id}`}</td>
                              <td className="px-4 py-2.5 text-center text-slate-300">{item.quantity}</td>
                              <td className="px-4 py-2.5 text-right text-slate-300">{fmtCurrency(item.unit_price)}</td>
                              <td className="px-4 py-2.5 text-right text-white font-medium">
                                {fmtCurrency(item.line_total ?? item.quantity * item.unit_price)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Subtotal</span>
                      <span className="text-white">{fmtCurrency(viewSale.subtotal || 0)}</span>
                    </div>
                    {(viewSale.tax_rate ?? 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Tax ({viewSale.tax_rate}%)</span>
                        <span className="text-white">{fmtCurrency(viewSale.tax_amount || 0)}</span>
                      </div>
                    )}
                    {(viewSale.discount ?? 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Discount</span>
                        <span className="text-red-400">-{fmtCurrency(viewSale.discount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                      <span className="text-white font-bold">Grand Total</span>
                      <span className="text-green-400 font-bold text-lg">{fmtCurrency(viewSale.total)}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {viewSale.notes && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Notes</p>
                      <p className="text-slate-300 text-sm bg-slate-800 rounded-lg p-3">{viewSale.notes}</p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
