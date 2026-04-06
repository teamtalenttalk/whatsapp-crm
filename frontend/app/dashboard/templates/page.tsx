"use client";

import { useEffect, useState, useCallback } from "react";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  message_type: string;
  message: string;
  buttons?: string;
  created_at?: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", message_type: "text", message: "", buttons: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", message_type: "text", message: "", buttons: "" });
    setShowModal(true);
    setError("");
  }

  function openEdit(tpl: Template) {
    setEditing(tpl);
    setForm({ name: tpl.name, message_type: tpl.message_type, message: tpl.message, buttons: tpl.buttons || "" });
    setShowModal(true);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim() || !form.message.trim()) { setError("Name and message are required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, buttons: form.buttons || undefined };
      if (editing) {
        await updateTemplate(editing.id, payload);
      } else {
        await createTemplate(payload);
      }
      setShowModal(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try { await deleteTemplate(id); load(); } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Templates</h1>
        <button onClick={openAdd} className="btn-wa">+ Add Template</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">No templates yet. Create your first one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div key={tpl.id} className="card flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold truncate">{tpl.name}</h3>
                <span className="badge bg-slate-700 text-slate-300 capitalize">{tpl.message_type}</span>
              </div>
              <p className="text-sm text-slate-400 flex-1 line-clamp-3 mb-3">{tpl.message}</p>
              {tpl.created_at && (
                <p className="text-xs text-slate-500 mb-3">{new Date(tpl.created_at).toLocaleDateString()}</p>
              )}
              <div className="flex gap-2 pt-3 border-t border-slate-700">
                <button onClick={() => openEdit(tpl)} className="text-[#25D366] hover:text-green-300 text-xs">Edit</button>
                <button onClick={() => handleDelete(tpl.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">{editing ? "Edit" : "Add"} Template</h2>
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-dark" placeholder="Welcome Template" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message Type</label>
                <select value={form.message_type} onChange={(e) => setForm({ ...form, message_type: e.target.value })} className="input-dark">
                  <option value="text">Text</option>
                  <option value="buttons">Buttons</option>
                  <option value="list">List</option>
                  <option value="image">Image</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message *</label>
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} className="input-dark" placeholder={"Hello {{name}}, welcome to our service!"} />
                <p className="text-xs text-slate-500 mt-1">Use {"{{name}}"}, {"{{var1}}"}, {"{{var2}}"} for variables</p>
              </div>
              {form.message_type !== "text" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Buttons / List JSON</label>
                  <textarea value={form.buttons} onChange={(e) => setForm({ ...form, buttons: e.target.value })} rows={3} className="input-dark font-mono text-sm" placeholder='[{"id":"1","title":"Option 1"}]' />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-wa">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
