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

interface Stage {
  name: string;
  description?: string;
  contact_count?: number;
}

interface Journey {
  id: string;
  name: string;
  description: string;
  stages: Stage[];
  status: string;
  total_contacts?: number;
  completed_contacts?: number;
  completion_rate?: number;
  created_at: string;
}

interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
}

interface DropOff {
  reason: string;
  count: number;
  action: string;
}

export default function CustomerJourneyPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Journey | null>(null);
  const [tab, setTab] = useState<"journeys" | "funnel" | "dropoff">("journeys");

  // Funnel
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [funnelConversion, setFunnelConversion] = useState(0);

  // Drop-off
  const [dropOff, setDropOff] = useState<DropOff[]>([]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStages, setFormStages] = useState<{ name: string; description: string }[]>([
    { name: "Awareness", description: "First contact" },
    { name: "Interest", description: "Engaged with content" },
    { name: "Consideration", description: "Requested info" },
    { name: "Purchase", description: "Made a purchase" },
    { name: "Loyalty", description: "Repeat customer" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadJourneys();
    loadFunnel();
    loadDropOff();
  }, []);

  async function loadJourneys() {
    try {
      const res = await fetch(`${API}/api/journeys`, { headers: authHeaders() });
      if (res.ok) setJourneys(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }

  async function loadJourneyDetail(id: string) {
    try {
      const res = await fetch(`${API}/api/journeys/${id}`, { headers: authHeaders() });
      if (res.ok) setSelected(await res.json());
    } catch {}
  }

  async function loadFunnel() {
    try {
      const res = await fetch(`${API}/api/funnels/conversion`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFunnel(data.funnel || []);
        setFunnelConversion(data.overall_conversion_rate || 0);
      }
    } catch {}
  }

  async function loadDropOff() {
    try {
      const res = await fetch(`${API}/api/funnels/drop-off`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDropOff(data.drop_off_analysis || []);
      }
    } catch {}
  }

  async function createJourney() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/journeys`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim(),
          stages: formStages.filter((s) => s.name.trim()),
        }),
      });
      setShowForm(false);
      setFormName("");
      setFormDesc("");
      loadJourneys();
    } catch {} finally {
      setSaving(false);
    }
  }

  async function deleteJourney(id: string) {
    if (!confirm("Delete this journey?")) return;
    try {
      await fetch(`${API}/api/journeys/${id}`, { method: "DELETE", headers: authHeaders() });
      if (selected?.id === id) setSelected(null);
      loadJourneys();
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Customer Journey</h1>
        <div className="flex gap-2">
          {(["journeys", "funnel", "dropoff"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-green-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {t === "journeys" ? "Journeys" : t === "funnel" ? "Conversion Funnel" : "Drop-off Analysis"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Journeys Tab ── */}
      {tab === "journeys" && (
        <div className="space-y-4">
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + New Journey
          </button>

          {showForm && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">Create Journey</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Sales Pipeline" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Description</label>
                  <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Stages</label>
                {formStages.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      value={s.name}
                      onChange={(e) => {
                        const next = [...formStages];
                        next[i].name = e.target.value;
                        setFormStages(next);
                      }}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
                      placeholder="Stage name"
                    />
                    <input
                      value={s.description}
                      onChange={(e) => {
                        const next = [...formStages];
                        next[i].description = e.target.value;
                        setFormStages(next);
                      }}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
                      placeholder="Description"
                    />
                    {formStages.length > 1 && (
                      <button onClick={() => setFormStages(formStages.filter((_, j) => j !== i))} className="text-red-400 px-2">&times;</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setFormStages([...formStages, { name: "", description: "" }])}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  + Add stage
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={createJourney} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create Journey"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600">Cancel</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-slate-500 text-center py-8">Loading...</p>
          ) : journeys.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No journeys yet</p>
          ) : (
            <div className="space-y-4">
              {journeys.map((j) => (
                <div key={j.id} className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold">{j.name}</h3>
                      {j.description && <p className="text-sm text-slate-400">{j.description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${j.status === "active" ? "bg-green-900/50 text-green-400" : "bg-slate-700 text-slate-400"}`}>{j.status}</span>
                      <button onClick={() => loadJourneyDetail(j.id)} className="text-xs text-blue-400 hover:text-blue-300">View</button>
                      <button onClick={() => deleteJourney(j.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  </div>
                  {/* Visual stages pipeline */}
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {j.stages.map((s, i) => (
                      <div key={i} className="flex items-center">
                        <div className="bg-slate-700 rounded-lg px-3 py-2 text-center min-w-[100px]">
                          <p className="text-xs text-white font-medium">{s.name}</p>
                          {s.contact_count !== undefined && (
                            <p className="text-lg font-bold text-green-400">{s.contact_count}</p>
                          )}
                        </div>
                        {i < j.stages.length - 1 && (
                          <svg className="w-5 h-5 text-slate-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Journey detail */}
          {selected && (
            <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6 space-y-4">
              <div className="flex justify-between">
                <h2 className="text-lg font-semibold text-white">{selected.name} — Details</h2>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm">&times;</button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-400">Total Contacts</p>
                  <p className="text-xl font-bold text-white">{selected.total_contacts || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400">Completed</p>
                  <p className="text-xl font-bold text-green-400">{selected.completed_contacts || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400">Completion Rate</p>
                  <p className="text-xl font-bold text-blue-400">{selected.completion_rate || 0}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Conversion Funnel Tab ── */}
      {tab === "funnel" && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Message-to-Sale Conversion Funnel</h2>
              <span className="text-sm text-green-400 font-medium">Overall: {funnelConversion}%</span>
            </div>
            {funnel.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {funnel.map((f, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-300">{f.stage}</span>
                      <span className="text-sm text-white font-medium">{f.count} ({f.rate}%)</span>
                    </div>
                    <div className="h-8 bg-slate-700 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-lg flex items-center pl-3 transition-all duration-500"
                        style={{ width: `${Math.max(f.rate, 2)}%` }}
                      >
                        {f.rate > 10 && <span className="text-xs text-white font-medium">{f.rate}%</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Drop-off Analysis Tab ── */}
      {tab === "dropoff" && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-white font-semibold">Drop-off Analysis</h2>
              <p className="text-sm text-slate-400 mt-0.5">Where customers fall out of the pipeline</p>
            </div>
            {dropOff.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No data yet</div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {dropOff.map((d, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-white font-medium">{d.reason}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d.action}</p>
                    </div>
                    <span className="text-xl font-bold text-red-400 ml-4">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
