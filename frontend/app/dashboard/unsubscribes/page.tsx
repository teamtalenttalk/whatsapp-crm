"use client";

import { useEffect, useState, useCallback } from "react";
import { getUnsubscribes, addUnsubscribe, importUnsubscribes, deleteUnsubscribe } from "@/lib/api";

interface Unsubscribe {
  id: string;
  phone: string;
  name?: string;
  created_at?: string;
}

export default function UnsubscribesPage() {
  const [items, setItems] = useState<Unsubscribe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [addForm, setAddForm] = useState({ phone: "", name: "" });
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getUnsubscribes();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!addForm.phone.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addUnsubscribe(addForm.phone.trim(), addForm.name.trim() || undefined);
      setShowAdd(false);
      setAddForm({ phone: "", name: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    const phones = importText.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    if (phones.length === 0) return;
    setSaving(true);
    try {
      await importUnsubscribes(phones);
      setShowImport(false);
      setImportText("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove from unsubscribe list?")) return;
    try { await deleteUnsubscribe(id); load(); } catch { /* ignore */ }
  }

  function handleExport() {
    const csv = ["Phone,Name", ...items.map((i) => `${i.phone},${i.name || ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unsubscribes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Unsubscribes</h1>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-3 py-2 text-sm rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Export</button>
          <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">Import</button>
          <button onClick={() => setShowAdd(true)} className="btn-wa">+ Add Number</button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
        </div>
      )}

      <p className="text-sm text-slate-400 mb-4">Phone Numbers ({items.length})</p>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">No unsubscribed numbers yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Name</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Number</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                  <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-3 px-3 text-white">{item.name || "-"}</td>
                  <td className="py-3 px-3 text-slate-300">{item.phone}</td>
                  <td className="py-3 px-3">
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Add Unsubscribe</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone *</label>
                <input type="text" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} className="input-dark" placeholder="+1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="input-dark" placeholder="Optional name" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleAdd} disabled={saving} className="btn-wa">{saving ? "Adding..." : "Add"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">Import Unsubscribes</h2>
            <p className="text-sm text-slate-400 mb-3">Paste phone numbers, one per line.</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} className="input-dark font-mono text-sm mb-4" placeholder={"+1234567890\n+1234567891\n+1234567892"} />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowImport(false); setImportText(""); }} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleImport} disabled={saving} className="btn-wa">{saving ? "Importing..." : "Import"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
