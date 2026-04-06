"use client";

import { useEffect, useState } from "react";
import { getDashboardStats, getWaStatus } from "@/lib/api";

interface Stats {
  totalContacts: number;
  messagesToday: number;
  botReplies: number;
  newLeadsThisWeek: number;
}

interface WaStatus {
  connected: boolean;
  phone?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboardStats().catch(() => null),
      getWaStatus().catch(() => null),
    ]).then(([s, w]) => {
      setStats(s);
      setWaStatus(w);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: "Total Contacts", value: stats?.totalContacts ?? 0, color: "text-blue-400" },
    { label: "Messages Today", value: stats?.messagesToday ?? 0, color: "text-[#25D366]" },
    { label: "Bot Replies", value: stats?.botReplies ?? 0, color: "text-purple-400" },
    { label: "New Leads This Week", value: stats?.newLeadsThisWeek ?? 0, color: "text-yellow-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* WhatsApp Connection Status */}
      <div className="card mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              waStatus?.connected ? "bg-[#25D366]" : "bg-red-500"
            }`}
          />
          <span className="text-slate-300">
            WhatsApp:{" "}
            {waStatus?.connected ? (
              <span className="text-[#25D366] font-medium">
                Connected {waStatus.phone ? `(${waStatus.phone})` : ""}
              </span>
            ) : (
              <span className="text-red-400 font-medium">Disconnected</span>
            )}
          </span>
        </div>
        {!waStatus?.connected && (
          <a
            href="/dashboard/whatsapp"
            className="text-sm text-[#25D366] hover:underline"
          >
            Connect now
          </a>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-sm text-slate-400 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
