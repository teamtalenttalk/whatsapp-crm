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

interface CampaignComparison {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  delivery_rate: number;
  open_rate: number;
  failure_rate: number;
  started_at: string | null;
  duration_minutes: number | null;
}

interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  rates: {
    delivery_rate: number;
    open_rate: number;
    response_rate: number;
    failure_rate: number;
  };
  counts: {
    total_recipients: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    responses: number;
  };
  timeline: { hour: string; cnt: number }[];
  top_errors: { error: string; cnt: number }[];
}

export default function CampaignAnalyticsPage() {
  const [campaigns, setCampaigns] = useState<CampaignComparison[]>([]);
  const [averages, setAverages] = useState<{ avg_delivery_rate: number; avg_open_rate: number }>({ avg_delivery_rate: 0, avg_open_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignAnalytics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadComparison();
  }, []);

  async function loadComparison() {
    try {
      const res = await fetch(`${API}/api/campaigns/comparison`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setAverages(data.averages || { avg_delivery_rate: 0, avg_open_rate: 0 });
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/api/campaigns/${id}/analytics`, { headers: authHeaders() });
      if (res.ok) setSelected(await res.json());
    } catch {} finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Campaign Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400">Total Campaigns</p>
          <p className="text-2xl font-bold text-white mt-1">{campaigns.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400">Avg Delivery Rate</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{averages.avg_delivery_rate}%</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400">Avg Open Rate</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{averages.avg_open_rate}%</p>
        </div>
      </div>

      {/* Campaigns comparison table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Campaign Comparison</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No completed or running campaigns yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Recipients</th>
                  <th className="py-3 px-4 text-right">Delivery</th>
                  <th className="py-3 px-4 text-right">Open</th>
                  <th className="py-3 px-4 text-right">Failure</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-700/50 text-slate-300 hover:bg-slate-700/30">
                    <td className="py-3 px-4 font-medium text-white">{c.name || "Unnamed"}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        c.status === "completed" ? "bg-green-900/50 text-green-400" : "bg-blue-900/50 text-blue-400"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">{c.total_recipients}</td>
                    <td className="py-3 px-4 text-right">
                      <RateBar value={c.delivery_rate} color="green" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <RateBar value={c.open_rate} color="blue" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <RateBar value={c.failure_rate} color="red" />
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {c.duration_minutes != null ? `${c.duration_minutes}m` : "-"}
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => loadDetail(c.id)} className="text-xs text-green-400 hover:text-green-300">
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{selected.campaign_name} — Detailed Analytics</h2>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-sm">&times; Close</button>
          </div>

          {detailLoading ? (
            <p className="text-slate-500">Loading...</p>
          ) : (
            <>
              {/* Rate cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniCard label="Delivery Rate" value={`${selected.rates.delivery_rate}%`} />
                <MiniCard label="Open Rate" value={`${selected.rates.open_rate}%`} />
                <MiniCard label="Response Rate" value={`${selected.rates.response_rate}%`} />
                <MiniCard label="Failure Rate" value={`${selected.rates.failure_rate}%`} />
              </div>

              {/* Counts */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Object.entries(selected.counts).map(([k, v]) => (
                  <div key={k} className="text-center">
                    <p className="text-xs text-slate-400">{k.replace(/_/g, " ")}</p>
                    <p className="text-lg font-bold text-white">{v}</p>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {selected.top_errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-400 mb-2">Top Errors</h3>
                  {selected.top_errors.map((e, i) => (
                    <div key={i} className="flex justify-between text-sm text-slate-400 py-1 border-b border-slate-700/50">
                      <span className="truncate mr-4">{e.error}</span>
                      <span className="text-red-400">{e.cnt}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RateBar({ value, color }: { value: number; color: "green" | "blue" | "red" }) {
  const colors = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${colors[color]} rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs w-8 text-right">{value}%</span>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
