"use client";

import { useEffect, useState, useCallback } from "react";
import { getReport, getDevices } from "@/lib/api";

interface ReportData {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalReceived: number;
  byDevice: { device_id: string; device_name: string; sent: number; delivered: number; failed: number }[];
}

interface Device {
  id: string;
  name: string;
}

export default function ReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, devs] = await Promise.all([
        getReport(dateFrom || undefined, dateTo || undefined).catch(() => null),
        getDevices().catch(() => []),
      ]);
      setReport(rep || { totalSent: 0, totalDelivered: 0, totalFailed: 0, totalReceived: 0, byDevice: [] });
      setDevices(Array.isArray(devs) ? devs : []);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function deviceName(id: string) {
    return devices.find((d) => d.id === id)?.name || id;
  }

  const summaryCards = [
    { label: "Total Sent", value: report?.totalSent ?? 0, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
    { label: "Delivered", value: report?.totalDelivered ?? 0, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Failed", value: report?.totalFailed ?? 0, color: "text-red-400", bg: "bg-red-400/10" },
    { label: "Received", value: report?.totalReceived ?? 0, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  const totalAll = (report?.totalSent ?? 0) + (report?.totalReceived ?? 0);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summaryCards.map((card) => (
              <div key={card.label} className="card">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.bg} mb-3`}>
                  <span className={`text-lg font-bold ${card.color}`}>{String(card.value).charAt(0) || "0"}</span>
                </div>
                <p className="text-sm text-slate-400 mb-1">{card.label}</p>
                <p className={`text-3xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Visual bar chart */}
          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Message Breakdown</h2>
            <div className="space-y-4">
              {summaryCards.map((card) => (
                <div key={card.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-300">{card.label}</span>
                    <span className={`text-sm font-medium ${card.color}`}>{card.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        card.label === "Total Sent" ? "bg-[#25D366]" :
                        card.label === "Delivered" ? "bg-blue-400" :
                        card.label === "Failed" ? "bg-red-400" : "bg-purple-400"
                      }`}
                      style={{ width: `${totalAll > 0 ? (card.value / totalAll) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

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
