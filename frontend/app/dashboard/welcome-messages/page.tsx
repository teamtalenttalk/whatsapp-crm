"use client";

import { useEffect, useState, useCallback } from "react";
import { getWelcomeMessages, createWelcomeMessage, updateWelcomeMessage, deleteWelcomeMessage, getDevices } from "@/lib/api";

interface WelcomeMessage {
  id: string;
  enabled: boolean;
  device_id: string;
  device_name?: string;
  message_type: string;
  message: string;
  buttons?: string;
  created_at?: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
}

export default function WelcomeMessagesPage() {
  const [messages, setMessages] = useState<WelcomeMessage[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WelcomeMessage | null>(null);
  const [form, setForm] = useState({ device_id: "", message_type: "text", message: "", buttons: "", enabled: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewMsg, setPreviewMsg] = useState<WelcomeMessage | null>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, devs] = await Promise.all([
        getWelcomeMessages().catch(() => []),
        getDevices().catch(() => []),
      ]);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setDevices(Array.isArray(devs) ? devs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ device_id: "", message_type: "text", message: "", buttons: "", enabled: true });
    setShowModal(true);
    setError("");
  }

  function openEdit(msg: WelcomeMessage) {
    setEditing(msg);
    setForm({ device_id: msg.device_id, message_type: msg.message_type, message: msg.message, buttons: msg.buttons || "", enabled: msg.enabled });
    setShowModal(true);
    setError("");
  }

  async function handleSave() {
    if (!form.device_id || !form.message.trim()) { setError("Device and message are required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, buttons: form.buttons || undefined };
      if (editing) {
        await updateWelcomeMessage(editing.id, payload);
      } else {
        await createWelcomeMessage(payload);
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
    if (!confirm("Delete this welcome message?")) return;
    try { await deleteWelcomeMessage(id); load(); } catch { /* ignore */ }
  }

  function deviceName(id: string) {
    return devices.find((d) => d.id === id)?.name || id;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Welcome Message</h1>
        <button onClick={openAdd} className="btn-wa">+ Add Welcome Message</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">No welcome messages configured yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-16">Enable</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Instance</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Type</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Message</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Created At</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg, i) => (
                <tr key={msg.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                  <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-3 px-3">
                    <div className={`w-3 h-3 rounded-full ${msg.enabled ? "bg-green-400" : "bg-red-400"}`} />
                  </td>
                  <td className="py-3 px-3 text-white">{msg.device_name || deviceName(msg.device_id)}</td>
                  <td className="py-3 px-3 text-slate-300 capitalize">{msg.message_type}</td>
                  <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{msg.message}</td>
                  <td className="py-3 px-3 text-slate-500 text-xs">{msg.created_at ? new Date(msg.created_at).toLocaleDateString() : "-"}</td>
                  <td className="py-3 px-3">
                    <div className="flex gap-2">
                      <button onClick={() => setPreviewMsg(msg)} className="text-blue-400 hover:text-blue-300 text-xs">Preview</button>
                      <button onClick={() => openEdit(msg)} className="text-[#25D366] hover:text-green-300 text-xs">Edit</button>
                      <button onClick={() => handleDelete(msg.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
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
            <h2 className="text-lg font-bold text-white mb-4">{editing ? "Edit" : "Add"} Welcome Message</h2>
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Instance *</label>
                <select value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} className="input-dark">
                  <option value="">-- Select Device --</option>
                  {devices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message Type</label>
                <select value={form.message_type} onChange={(e) => setForm({ ...form, message_type: e.target.value })} className="input-dark">
                  <option value="text">Text</option>
                  <option value="text_with_media">Text With Media</option>
                  <option value="buttons">Buttons</option>
                  <option value="button_with_media">Button With Media</option>
                  <option value="list">List</option>
                  <option value="list_with_media">List With Media</option>
                  <option value="poll">Poll Message</option>
                  <option value="poll_with_media">Poll With Media</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message *</label>
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className="input-dark" placeholder="Welcome! How can we help you today?" />
              </div>
              {form.message_type !== "text" && form.message_type !== "text_with_media" && (
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
            <h2 className="text-lg font-bold text-white mb-4">Message Preview</h2>
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
