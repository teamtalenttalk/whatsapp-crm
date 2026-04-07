"use client";

import { useEffect, useState, useCallback } from "react";
import { getReport, getDevices, getCampaigns, getDashboardStats } from "@/lib/api";

interface ReportData {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalReceived: number;
  totalRead?: number;
  byDevice: { device_id: string; device_name: string; sent: number; delivered: number; failed: number }[];
}

interface Device {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  total: number;
}

interface DashboardStats {
  totalCampaigns?: number;
  totalSent?: number;
  totalDelivered?: number;
  totalRead?: number;
  totalFailed?: number;
}

export default function ReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, devs, camps, dashStats] = await Promise.all([
        getReport(dateFrom || undefined, dateTo || undefined).catch(() => null),
        getDevices().catch(() => []),
        getCampaigns().catch(() => []),
        getDashboardStats().catch(() => null),
      ]);
      setReport(rep || { totalSent: 0, totalDelivered: 0, totalFailed: 0, totalReceived: 0, totalRead: 0, byDevice: [] });
      setDevices(Array.isArray(devs) ? devs : []);
      const campList = Array.isArray(camps) ? camps : camps?.data || [];
      setCampaigns(campList);
      setStats(dashStats);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function deviceName(id: string) {
    return devices.find((d) => d.id === id)?.name || id;
  }

  // Derived stats (prefer dashboard stats, fall back to report)
  const totalCampaigns = stats?.totalCampaigns ?? campaigns.length;
  const totalSent = stats?.totalSent ?? report?.totalSent ?? 0;
  const totalDelivered = stats?.totalDelivered ?? report?.totalDelivered ?? 0;
  const totalRead = stats?.totalRead ?? report?.totalRead ?? 0;
  const totalFailed = stats?.totalFailed ?? report?.totalFailed ?? 0;
  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "0.0";

  const summaryCards = [
    { label: "Total Campaigns", value: totalCampaigns, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Messages Sent", value: totalSent, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
    { label: "Delivered", value: totalDelivered, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Read", value: totalRead, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { label: "Failed", value: totalFailed, color: "text-red-400", bg: "bg-red-400/10" },
    { label: "Delivery Rate", value: `${deliveryRate}%`, color: "text-yellow-400", bg: "bg-yellow-400/10", isRate: true },
  ];

  const totalAll = totalSent + (report?.totalReceived ?? 0);

  const barCards = [
    { label: "Sent", value: totalSent, color: "text-[#25D366]", barColor: "bg-[#25D366]" },
    { label: "Delivered", value: totalDelivered, color: "text-blue-400", barColor: "bg-blue-400" },
    { label: "Read", value: totalRead, color: "text-cyan-400", barColor: "bg-cyan-400" },
    { label: "Failed", value: totalFailed, color: "text-red-400", barColor: "bg-red-400" },
    { label: "Received", value: report?.totalReceived ?? 0, color: "text-purple-400", barColor: "bg-purple-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Report</h1>

      {/* Date filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-dark w-auto" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-dark w-auto" />
        </div>
        <button onClick={load} className="btn-wa">Apply</button>
        <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Clear</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {summaryCards.map((card) => (
              <div key={card.label} className="card">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.bg} mb-3`}>
                  <span className={`text-lg font-bold ${card.color}`}>
                    {typeof card.value === "string" ? "%" : String(card.value).charAt(0) || "0"}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-1">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </p>
              </div>
            ))}
          </div>

          {/* Visual bar chart */}
          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Message Breakdown</h2>
            <div className="space-y-4">
              {barCards.map((card) => (
                <div key={card.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-300">{card.label}</span>
                    <span className={`text-sm font-medium ${card.color}`}>{(typeof card.value === "number" ? card.value : 0).toLocaleString()}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${card.barColor}`}
                      style={{ width: `${totalAll > 0 ? ((typeof card.value === "number" ? card.value : 0) / totalAll) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-campaign breakdown */}
          {campaigns.length > 0 && (
            <div className="card mb-8">
              <h2 className="text-lg font-semibold text-white mb-4">Campaign Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Campaign</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Status</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Sent</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Delivered</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Read</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Failed</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Delivery Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const rate = c.sent > 0 ? ((c.delivered / c.sent) * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={c.id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                          <td className="py-3 px-3 text-white">{c.name || `Campaign #${c.id.slice(0, 8)}`}</td>
                          <td className="py-3 px-3">
                            <span className={`badge ${
                              c.status === "completed" ? "bg-green-500/20 text-green-400" :
                              c.status === "running" ? "bg-blue-500/20 text-blue-400" :
                              c.status === "failed" ? "bg-red-500/20 text-red-400" :
                              c.status === "scheduled" ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-gray-500/20 text-gray-400"
                            }`}>{c.status}</span>
                          </td>
                          <td className="py-3 px-3 text-[#25D366]">{c.sent.toLocaleString()}</td>
                          <td className="py-3 px-3 text-blue-400">{(c.delivered || 0).toLocaleString()}</td>
                          <td className="py-3 px-3 text-cyan-400">{(c.read || 0).toLocaleString()}</td>
                          <td className="py-3 px-3 text-red-400">{c.failed.toLocaleString()}</td>
                          <td className="py-3 px-3 text-yellow-400">{rate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-device breakdown */}
          {report?.byDevice && report.byDevice.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4">By Device</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Device</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Sent</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Delivered</th>
                      <th className="text-left py-3 px-3 text-slate-400 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byDevice.map((row) => (
                      <tr key={row.device_id} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                        <td className="py-3 px-3 text-white">{row.device_name || deviceName(row.device_id)}</td>
                        <td className="py-3 px-3 text-[#25D366]">{row.sent.toLocaleString()}</td>
                        <td className="py-3 px-3 text-blue-400">{row.delivered.toLocaleString()}</td>
                        <td className="py-3 px-3 text-red-400">{row.failed.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
