"use client";

import { useEffect, useState } from "react";

const API = "";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface Segment {
  id: string;
  name: string;
  description: string;
  rules: string;
  contact_count: number;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  stage: string;
  tags: string;
}

const STAGES = ["new", "lead", "qualified", "customer", "vip"];

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [segmentContacts, setSegmentContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleStage, setRuleStage] = useState("");
  const [ruleTags, setRuleTags] = useState("");
  const [ruleMinMessages, setRuleMinMessages] = useState("");
  const [ruleMinPurchases, setRuleMinPurchases] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    loadSegments();
  }, []);

  async function loadSegments() {
    try {
      const res = await fetch(`${API}/api/segments`, { headers: authHeaders() });
      if (res.ok) setSegments(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }

  async function loadContacts(segmentId: string) {
    setContactsLoading(true);
    setSelectedSegment(segmentId);
    try {
      const res = await fetch(`${API}/api/segments/${segmentId}/contacts`, { headers: authHeaders() });
      if (res.ok) setSegmentContacts(await res.json());
    } catch {} finally {
      setContactsLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setRuleStage("");
    setRuleTags("");
    setRuleMinMessages("");
    setRuleMinPurchases("");
    setEditId(null);
    setShowForm(false);
  }

  function editSegment(seg: Segment) {
    setEditId(seg.id);
    setName(seg.name);
    setDescription(seg.description);
    const rules = JSON.parse(seg.rules || "{}");
    setRuleStage(rules.stage || "");
    setRuleTags(Array.isArray(rules.tags) ? rules.tags.join(", ") : "");
    setRuleMinMessages(rules.min_messages?.toString() || "");
    setRuleMinPurchases(rules.min_purchases?.toString() || "");
    setShowForm(true);
  }

  async function saveSegment() {
    if (!name.trim()) return;
    setSaving(true);

    const rules: Record<string, unknown> = {};
    if (ruleStage) rules.stage = ruleStage;
    if (ruleTags.trim()) rules.tags = ruleTags.split(",").map((t) => t.trim()).filter(Boolean);
    if (ruleMinMessages) rules.min_messages = parseInt(ruleMinMessages);
    if (ruleMinPurchases) rules.min_purchases = parseInt(ruleMinPurchases);

    try {
      const url = editId ? `${API}/api/segments/${editId}` : `${API}/api/segments`;
      const method = editId ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim(), description: description.trim(), rules }),
      });
      resetForm();
      loadSegments();
    } catch {} finally {
      setSaving(false);
    }
  }

  async function deleteSegment(id: string) {
    if (!confirm("Delete this segment?")) return;
    try {
      await fetch(`${API}/api/segments/${id}`, { method: "DELETE", headers: authHeaders() });
      if (selectedSegment === id) {
        setSelectedSegment(null);
        setSegmentContacts([]);
      }
      loadSegments();
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Customer Segments</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          + New Segment
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">{editId ? "Edit" : "Create"} Segment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="VIP Customers" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="High-value repeat customers" />
            </div>
          </div>

          <h3 className="text-sm font-semibold text-slate-300 mt-2">Segmentation Rules</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Stage</label>
              <select value={ruleStage} onChange={(e) => setRuleStage(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="">Any</option>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tags (comma-separated)</label>
              <input value={ruleTags} onChange={(e) => setRuleTags(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="vip, premium" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min Messages</label>
              <input type="number" value={ruleMinMessages} onChange={(e) => setRuleMinMessages(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="5" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min Purchases</label>
              <input type="number" value={ruleMinPurchases} onChange={(e) => setRuleMinPurchases(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="1" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveSegment} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : editId ? "Update" : "Create"} Segment
            </button>
            <button onClick={resetForm} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Segments list */}
      {loading ? (
        <div className="text-center text-slate-500 py-8">Loading segments...</div>
      ) : segments.length === 0 ? (
        <div className="text-center text-slate-500 py-8">No segments yet. Create your first one!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={`bg-slate-800 rounded-xl border p-5 cursor-pointer transition-colors ${
                selectedSegment === seg.id ? "border-green-500" : "border-slate-700 hover:border-slate-600"
              }`}
              onClick={() => loadContacts(seg.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-semibold">{seg.name}</h3>
                  {seg.description && <p className="text-sm text-slate-400 mt-0.5">{seg.description}</p>}
                </div>
                <span className="text-2xl font-bold text-green-400">{seg.contact_count}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); editSegment(seg); }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                <button onClick={(e) => { e.stopPropagation(); deleteSegment(seg.id); }} className="text-xs text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Segment contacts */}
      {selectedSegment && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-white font-semibold mb-3">
            Contacts in: {segments.find((s) => s.id === selectedSegment)?.name}
          </h3>
          {contactsLoading ? (
            <p className="text-slate-500 text-sm">Loading contacts...</p>
          ) : segmentContacts.length === 0 ? (
            <p className="text-slate-500 text-sm">No contacts match this segment</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Stage</th>
                    <th className="py-2 px-3">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentContacts.map((c) => (
                    <tr key={c.id} className="border-b border-slate-700/50 text-slate-300">
                      <td className="py-2 px-3">{c.name || "-"}</td>
                      <td className="py-2 px-3">{c.phone}</td>
                      <td className="py-2 px-3">{c.email || "-"}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700">{c.stage}</span>
                      </td>
                      <td className="py-2 px-3 text-xs">{c.tags || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
