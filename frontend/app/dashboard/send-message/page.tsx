"use client";

import { useEffect, useState, useCallback } from "react";
import { getDevices, getTemplates, sendBulkMessages } from "@/lib/api";

interface PhoneRow {
  id: string;
  name: string;
  number: string;
  var1: string;
  var2: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
  message: string;
  messageType?: string;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function SendMessagePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [messageType, setMessageType] = useState("text");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const [excludeUnsubs, setExcludeUnsubs] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    getDevices().then((d) => { if (Array.isArray(d)) setDevices(d); }).catch(() => {});
    getTemplates().then((t) => { if (Array.isArray(t)) setTemplates(t); }).catch(() => {});
  }, []);

  const handleTemplateChange = useCallback((templateId: string) => {
    setSelectedTemplate(templateId);
    const t = templates.find((t) => t.id === templateId);
    if (t) {
      setMessage(t.message);
      if (t.messageType) setMessageType(t.messageType);
    }
  }, [templates]);

  function addRow() {
    setRows([...rows, { id: uid(), name: "", number: "", var1: "", var2: "" }]);
  }

  function updateRow(id: string, field: keyof PhoneRow, value: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function deleteRow(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  function handleImport() {
    const lines = importText.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const newRows: PhoneRow[] = lines.map((line) => {
      const parts = line.split(/[\t|]+/);
      return { id: uid(), name: parts[1] || "", number: parts[0], var1: parts[2] || "", var2: parts[3] || "" };
    });
    setRows([...rows, ...newRows]);
    setShowImport(false);
    setImportText("");
  }

  function clearInvalid() {
    setRows(rows.filter((r) => /^\+?\d{7,15}$/.test(r.number.replace(/\s/g, ""))));
  }

  function removeDuplicates() {
    const seen = new Set<string>();
    setRows(rows.filter((r) => {
      const n = r.number.replace(/\s/g, "");
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    }));
  }

  function insertCountryCode() {
    const code = prompt("Enter country code (e.g. +1, +91):");
    if (!code) return;
    setRows(rows.map((r) => ({
      ...r,
      number: r.number.startsWith("+") ? r.number : code + r.number.replace(/^0+/, ""),
    })));
  }

  async function handleSend() {
    if (!selectedDevice || !message.trim() || rows.length === 0) {
      setStatus("Please select a device, enter a message, and add phone numbers.");
      return;
    }
    setSending(true);
    setStatus("");
    try {
      await sendBulkMessages({
        device_id: selectedDevice,
        template_id: selectedTemplate || undefined,
        message_type: messageType,
        message: message,
        recipients: rows.map((r) => ({ phone: r.number, name: r.name, var1: r.var1, var2: r.var2 })),
        exclude_unsubscribes: excludeUnsubs,
      });
      setStatus("Messages queued successfully!");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Send Message</h1>

      {status && (
        <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${status.includes("success") ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {status}
          <button onClick={() => setStatus("")} className="ml-2 hover:text-white">&times;</button>
        </div>
      )}

      {/* Config row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Template</label>
          <select value={selectedTemplate} onChange={(e) => handleTemplateChange(e.target.value)} className="input-dark">
            <option value="">-- Select Template --</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Instance / Device</label>
          <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="input-dark">
            <option value="">-- Select Device --</option>
            {devices.filter((d) => d.status === "connected").map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Message Type</label>
          <select value={messageType} onChange={(e) => setMessageType(e.target.value)} className="input-dark">
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="document">Document</option>
          </select>
        </div>
      </div>

      {/* Message */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-1">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="input-dark font-mono text-sm"
          placeholder={"Hello {{name}}, {{var1}} {{var2}}"}
        />
        <p className="text-xs text-slate-500 mt-1">Use {"{{name}}"}, {"{{var1}}"}, {"{{var2}}"} for personalization</p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={excludeUnsubs} onChange={(e) => setExcludeUnsubs(e.target.checked)} className="rounded bg-slate-700 border-slate-600 text-[#25D366] focus:ring-[#25D366]" />
          Exclude Unsubscribes
        </label>
        <div className="flex-1" />
        <button onClick={clearInvalid} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Clear Invalid</button>
        <button onClick={insertCountryCode} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Insert Country Code</button>
        <button onClick={removeDuplicates} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Remove Duplicates</button>
        <button onClick={() => setRows([])} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Clear All</button>
      </div>

      {/* Phone Numbers Table */}
      <div className="card mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Phone Numbers ({rows.length})</h3>
          <div className="flex gap-2">
            <button onClick={addRow} className="px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors">+ Add</button>
            <button onClick={() => setShowImport(true)} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">Import</button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No numbers added. Click Add or Import to begin.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-slate-400 font-medium w-12">SN</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Name</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Number</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Variable 1</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Variable 2</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                  <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-2 px-3"><input type="text" value={row.name} onChange={(e) => updateRow(row.id, "name", e.target.value)} className="bg-transparent border-0 text-white text-sm w-full focus:outline-none" placeholder="Name" /></td>
                  <td className="py-2 px-3"><input type="text" value={row.number} onChange={(e) => updateRow(row.id, "number", e.target.value)} className="bg-transparent border-0 text-white text-sm w-full focus:outline-none" placeholder="+1234567890" /></td>
                  <td className="py-2 px-3"><input type="text" value={row.var1} onChange={(e) => updateRow(row.id, "var1", e.target.value)} className="bg-transparent border-0 text-white text-sm w-full focus:outline-none" placeholder="Var 1" /></td>
                  <td className="py-2 px-3"><input type="text" value={row.var2} onChange={(e) => updateRow(row.id, "var2", e.target.value)} className="bg-transparent border-0 text-white text-sm w-full focus:outline-none" placeholder="Var 2" /></td>
                  <td className="py-2 px-3">
                    <button onClick={() => deleteRow(row.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Send Button */}
      <button onClick={handleSend} disabled={sending} className="btn-wa w-full py-3 text-lg">
        {sending ? "Sending..." : "Send Messages"}
      </button>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">Import Numbers</h2>
            <p className="text-sm text-slate-400 mb-3">Paste numbers, one per line. Format: number | name | var1 | var2</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="input-dark font-mono text-sm mb-4"
              placeholder={"+1234567890\n+1234567891|John\n+1234567892|Jane|VIP|Gold"}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowImport(false); setImportText(""); }} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleImport} className="btn-wa">Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
