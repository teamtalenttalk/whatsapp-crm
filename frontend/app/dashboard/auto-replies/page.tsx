"use client";

import { useEffect, useState, useCallback } from "react";
import { getAutoReplies, createAutoReply, updateAutoReply, deleteAutoReply, getDevices } from "@/lib/api";

interface AutoReply {
  id: string;
  enabled: boolean;
  keyword: string;
  match_type: string;
  device_id: string;
  device_name?: string;
  message_type: string;
  message: string;
  buttons?: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
}

export default function AutoRepliesPage() {
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AutoReply | null>(null);
  const [form, setForm] = useState({ keyword: "", match_type: "contains", device_id: "", message_type: "text", message: "", buttons: "", enabled: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewMsg, setPreviewMsg] = useState<AutoReply | null>(null);

  const load = useCallback(async () => {
    try {
      const [reps, devs] = await Promise.all([
        getAutoReplies().catch(() => []),
        getDevices().catch(() => []),
      ]);
      setReplies(Array.isArray(reps) ? reps : []);
      setDevices(Array.isArray(devs) ? devs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ keyword: "", match_type: "contains", device_id: "", message_type: "text", message: "", buttons: "", enabled: true });
    setShowModal(true);
    setError("");
  }

  function openEdit(reply: AutoReply) {
    setEditing(reply);
    setForm({ keyword: reply.keyword, match_type: reply.match_type, device_id: reply.device_id, message_type: reply.message_type, message: reply.message, buttons: reply.buttons || "", enabled: reply.enabled });
    setShowModal(true);
    setError("");
  }

  async function handleSave() {
    if (!form.keyword.trim() || !form.message.trim()) { setError("Keyword and message are required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, buttons: form.buttons || undefined };
      if (editing) {
        await updateAutoReply(editing.id, payload);
      } else {
        await createAutoReply(payload);
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
    if (!confirm("Delete this auto reply?")) return;
    try { await deleteAutoReply(id); load(); } catch { /* ignore */ }
  }

  async function handleClearAll() {
    if (!confirm("Delete ALL auto replies?")) return;
    try {
      await Promise.all(replies.map((r) => deleteAutoReply(r.id)));
      load();
    } catch { /* ignore */ }
  }

  function deviceName(id: string) {
    return devices.find((d) => d.id === id)?.name || id || "All";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Auto Reply</h1>
        <div className="flex gap-2">
          <button onClick={handleClearAll} className="px-4 py-2 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors">Clear All</button>
          <button onClick={openAdd} className="btn-wa">+ Add Auto Reply</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : replies.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">No auto replies configured yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-16">Enable</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Keyword</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Match</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Instance</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Type</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Message</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((reply, i) => (
                <tr key={reply.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                  <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-3 px-3">
                    <div className={`w-3 h-3 rounded-full ${reply.enabled ? "bg-green-400" : "bg-red-400"}`} />
                  </td>
                  <td className="py-3 px-3 text-white font-mono text-xs">{reply.keyword}</td>
                  <td className="py-3 px-3 text-slate-400 capitalize text-xs">{reply.match_type}</td>
                  <td className="py-3 px-3 text-slate-300">{reply.device_name || deviceName(reply.device_id)}</td>
                  <td className="py-3 px-3 text-slate-300 capitalize">{reply.message_type}</td>
                  <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{reply.message}</td>
                  <td className="py-3 px-3">
                    <div className="flex gap-2">
                      <button onClick={() => setPreviewMsg(reply)} className="text-blue-400 hover:text-blue-300 text-xs">Preview</button>
                      <button onClick={() => openEdit(reply)} className="text-[#25D366] hover:text-green-300 text-xs">Edit</button>
                      <button onClick={() => handleDelete(reply.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">{editing ? "Edit" : "Add"} Auto Reply</h2>
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Keyword *</label>
                  <input type="text" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} className="input-dark" placeholder="hello" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Match Type</label>
                  <select value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })} className="input-dark">
                    <option value="contains">Contains</option>
                    <option value="exact">Exact Match</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Instance</label>
                  <select value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} className="input-dark">
                    <option value="">All Devices</option>
                    {devices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Message Type</label>
                  <select value={form.message_type} onChange={(e) => setForm({ ...form, message_type: e.target.value })} className="input-dark">
                    <option value="text">Text</option>
                    <option value="buttons">Buttons</option>
                    <option value="list">List</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message *</label>
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className="input-dark" placeholder="Thank you for contacting us!" />
              </div>
              {form.message_type !== "text" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Buttons / List JSON</label>
                  <textarea value={form.buttons} onChange={(e) => setForm({ ...form, buttons: e.target.value })} rows={3} className="input-dark font-mono text-sm" placeholder='[{"id":"1","title":"Option 1"}]' />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded bg-slate-700 border-slate-600 text-[#25D366] focus:ring-[#25D366]" />
                Enabled
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-wa">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewMsg && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-2">Preview</h2>
            <p className="text-xs text-slate-400 mb-3">Keyword: <span className="font-mono text-white">{previewMsg.keyword}</span> ({previewMsg.match_type})</p>
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <div className="bg-[#25D366]/20 rounded-lg p-3 max-w-[80%]">
                <p className="text-white text-sm whitespace-pre-wrap">{previewMsg.message}</p>
              </div>
            </div>
            <button onClick={() => setPreviewMsg(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors w-full">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
