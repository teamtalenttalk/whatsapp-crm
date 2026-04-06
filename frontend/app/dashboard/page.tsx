"use client";

import { useEffect, useState } from "react";
import { getDashboardStats, getDevices, getAutoReplies, getWelcomeMessages, getTemplates } from "@/lib/api";
import Link from "next/link";

interface DashboardData {
  devices: { total: number; connected: number; disconnected: number };
  autoReplies: number;
  welcomeMessages: number;
  templates: number;
  campaigns: number;
  analytics: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalReceived: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [stats, devices, autoReplies, welcomeMessages, templates] = await Promise.all([
          getDashboardStats().catch(() => null),
          getDevices().catch(() => []),
          getAutoReplies().catch(() => []),
          getWelcomeMessages().catch(() => []),
          getTemplates().catch(() => []),
        ]);

        const devArr = Array.isArray(devices) ? devices : [];
        const connected = devArr.filter((d: Record<string, unknown>) => d.status === "connected").length;

        setData({
          devices: { total: devArr.length, connected, disconnected: devArr.length - connected },
          autoReplies: Array.isArray(autoReplies) ? autoReplies.length : 0,
          welcomeMessages: Array.isArray(welcomeMessages) ? welcomeMessages.length : 0,
          templates: Array.isArray(templates) ? templates.length : 0,
          campaigns: stats?.totalCampaigns ?? 0,
          analytics: {
            totalSent: stats?.totalSent ?? 0,
            totalDelivered: stats?.totalDelivered ?? 0,
            totalFailed: stats?.totalFailed ?? 0,
            totalReceived: stats?.totalReceived ?? 0,
          },
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
      </div>
    );
  }

  const d = data;

  const summaryCards = [
    {
      label: "Devices",
      value: `${d?.devices.connected ?? 0}/${d?.devices.total ?? 0}`,
      sub: `${d?.devices.connected ?? 0} connected, ${d?.devices.disconnected ?? 0} disconnected`,
      color: "text-[#25D366]",
      bg: "bg-[#25D366]/10",
      href: "/dashboard/devices",
    },
    {
      label: "Auto Reply",
      value: d?.autoReplies ?? 0,
      sub: "Active rules",
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      href: "/dashboard/auto-replies",
    },
    {
      label: "Welcome Messages",
      value: d?.welcomeMessages ?? 0,
      sub: "Configured",
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      href: "/dashboard/welcome-messages",
    },
    {
      label: "Templates",
      value: d?.templates ?? 0,
      sub: "Saved templates",
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
      href: "/dashboard/templates",
    },
    {
      label: "Total Campaigns",
      value: d?.campaigns ?? 0,
      sub: "Bulk sends",
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
      href: "/dashboard/send-message",
    },
  ];

  const analyticsCards = [
    { label: "Messages Sent", value: d?.analytics.totalSent ?? 0, color: "text-[#25D366]" },
    { label: "Delivered", value: d?.analytics.totalDelivered ?? 0, color: "text-blue-400" },
    { label: "Failed", value: d?.analytics.totalFailed ?? 0, color: "text-red-400" },
    { label: "Received", value: d?.analytics.totalReceived ?? 0, color: "text-purple-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href} className="card hover:border-slate-600 transition-colors group">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.bg} mb-3`}>
              <span className={`text-lg font-bold ${card.color}`}>{String(card.value).charAt(0)}</span>
            </div>
            <p className="text-sm text-slate-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
          </Link>
        ))}
      </div>

      {/* Analytics Section */}
      <h2 className="text-lg font-semibold text-white mb-4">Analytics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {analyticsCards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-sm text-slate-400 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
