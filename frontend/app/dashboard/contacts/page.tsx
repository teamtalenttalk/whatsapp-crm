"use client";

import { useEffect, useState, useCallback } from "react";
import { getContacts, createContact } from "@/lib/api";

interface Contact {
  id: string;
  phone: string;
  name: string;
  email?: string;
  stage: string;
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
  const [form, setForm] = useState({ phone: "", name: "", email: "", stage: "new" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContacts(
        search || undefined,
        stage !== "all" ? stage : undefined
      );
      setContacts(data);
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
      setForm({ phone: "", name: "", email: "", stage: "new" });
      loadContacts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Contacts</h1>
        <button onClick={() => setShowModal(true)} className="btn-wa">
          + Add Contact
        </button>
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

      {/* Contacts list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">
          No contacts found
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div key={contact.id} className="card flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-white truncate">
                    {contact.name || "Unnamed"}
                  </span>
                  <span className={`badge ${stageBadgeClass[contact.stage] || "badge-new"}`}>
                    {contact.stage}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{contact.phone}</p>
                {contact.lastMessage && (
                  <p className="text-xs text-slate-500 mt-1 truncate max-w-md">
                    {contact.lastMessage}
                  </p>
                )}
              </div>
              {contact.email && (
                <span className="text-sm text-slate-500 hidden md:block">{contact.email}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Add Contact</h2>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Phone *
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-dark"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-dark"
                  placeholder="Contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-dark"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Stage</label>
                <select
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                  className="input-dark"
                >
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="customer">Customer</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="btn-wa">
                {creating ? "Creating..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
