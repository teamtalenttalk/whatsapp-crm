"use client";

import { useEffect, useState, useCallback } from "react";
import { getContacts, createContact, deleteContact } from "@/lib/api";

interface Contact {
  id: string;
  phone: string;
  name: string;
  email?: string;
  stage: string;
  var1?: string;
  var2?: string;
  group?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

const stages = ["all", "new", "qualified", "customer", "lost"] as const;

const stageBadgeClass: Record<string, string> = {
  new: "badge-new",
  qualified: "badge-qualified",
  customer: "badge-customer",
  lost: "badge-lost",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", email: "", stage: "new", var1: "", var2: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContacts(search || undefined, stage !== "all" ? stage : undefined);
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, stage]);

  useEffect(() => {
    const timer = setTimeout(() => loadContacts(), 300);
    return () => clearTimeout(timer);
  }, [loadContacts]);

  async function handleCreate() {
    if (!form.phone.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createContact({
        phone: form.phone.trim(),
        name: form.name.trim() || undefined,
        email: form.email.trim() || undefined,
        stage: form.stage,
      });
      setShowModal(false);
      setForm({ phone: "", name: "", email: "", stage: "new", var1: "", var2: "" });
      loadContacts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    try { await deleteContact(id); loadContacts(); } catch { /* ignore */ }
  }

  function handleImport() {
    const lines = importText.split(/[\n]+/).map((l) => l.trim()).filter(Boolean);
    const promises = lines.map((line) => {
      const parts = line.split(/[\t|,]+/);
      return createContact({ phone: parts[0], name: parts[1] || undefined }).catch(() => null);
    });
    Promise.all(promises).then(() => {
      setShowImport(false);
      setImportText("");
      loadContacts();
    });
  }

  function handleExport() {
    const csv = ["Name,Phone,Email,Stage,Var1,Var2", ...contacts.map((c) => `${c.name},${c.phone},${c.email || ""},${c.stage},${c.var1 || ""},${c.var2 || ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearInvalid() {
    // Would call backend; for now just reload
    loadContacts();
  }

  function removeDuplicates() {
    loadContacts();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Contacts ({contacts.length})</h1>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-3 py-2 text-sm rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Export</button>
          <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">Import</button>
          <button onClick={() => setShowModal(true)} className="btn-wa">+ Add Contact</button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={clearInvalid} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Clear Invalid Number</button>
        <button onClick={() => { const code = prompt("Country code (e.g. +1):"); if (code) loadContacts(); }} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Insert Country Code</button>
        <button onClick={removeDuplicates} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Remove Duplicate Number</button>
        <button onClick={() => { if (confirm("Clear all contacts?")) loadContacts(); }} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Clear All</button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="input-dark sm:max-w-xs"
        />
        <div className="flex gap-2">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                stage === s
                  ? "bg-[#25D366] text-white"
                  : "bg-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">No contacts found</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Name</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Number</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Stage</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Variable 1</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium">Variable 2</th>
                <th className="text-left py-3 px-3 text-slate-400 font-medium w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, i) => (
                <tr key={contact.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                  <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-3 px-3 text-white">{contact.name || "Unnamed"}</td>
                  <td className="py-3 px-3 text-slate-300">{contact.phone}</td>
                  <td className="py-3 px-3">
                    <span className={`badge ${stageBadgeClass[contact.stage] || "badge-new"}`}>{contact.stage}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-400">{contact.var1 || "-"}</td>
                  <td className="py-3 px-3 text-slate-400">{contact.var2 || "-"}</td>
                  <td className="py-3 px-3">
                    <button onClick={() => handleDelete(contact.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Add Contact</h2>
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone *</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-dark" placeholder="+1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-dark" placeholder="Contact name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-dark" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Stage</label>
                <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="input-dark">
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="customer">Customer</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Variable 1</label>
                  <input type="text" value={form.var1} onChange={(e) => setForm({ ...form, var1: e.target.value })} className="input-dark" placeholder="Custom field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Variable 2</label>
                  <input type="text" value={form.var2} onChange={(e) => setForm({ ...form, var2: e.target.value })} className="input-dark" placeholder="Custom field" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="btn-wa">{creating ? "Creating..." : "Add Contact"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">Import Contacts</h2>
            <p className="text-sm text-slate-400 mb-3">One per line: phone | name</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} className="input-dark font-mono text-sm mb-4" placeholder={"+1234567890|John Doe\n+1234567891|Jane Smith"} />
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
