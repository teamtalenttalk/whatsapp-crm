"use client";

import { useEffect, useState, useCallback } from "react";
import { getCampaigns, startCampaign, deleteCampaign } from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "scheduled" | "failed";
  message_type: string;
  total: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  scheduled_at: string | null;
  created_at: string;
}

type FilterTab = "all" | "pending" | "running" | "completed" | "scheduled" | "failed";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "scheduled", label: "Scheduled" },
  { key: "failed", label: "Failed" },
];

const statusConfig: Record<string, { bg: string; text: string; pulse?: boolean }> = {
  pending: { bg: "bg-gray-500/20", text: "text-gray-400" },
  running: { bg: "bg-blue-500/20", text: "text-blue-400", pulse: true },
  completed: { bg: "bg-green-500/20", text: "text-green-400" },
  scheduled: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  failed: { bg: "bg-red-500/20", text: "text-red-400" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCampaigns();
      setCampaigns(Array.isArray(data) ? data : data?.data || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered =
    activeTab === "all"
      ? campaigns
      : campaigns.filter((c) => c.status === activeTab);

  async function handleStart(id: string) {
    setActionLoading(id);
    try {
      await startCampaign(id);
      await load();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campaign?")) return;
    setActionLoading(id);
    try {
      await deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Campaigns</h1>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#25D366] text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">
                {campaigns.filter((c) =>
                  tab.key === "all" ? true : c.status === tab.key
                ).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <svg
            className="w-12 h-12 text-slate-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
            />
          </svg>
          <p className="text-slate-400 text-sm">
            {activeTab === "all"
              ? "No campaigns yet. Send a message to create one."
              : `No ${activeTab} campaigns.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((campaign) => {
            const sc = statusConfig[campaign.status] || statusConfig.pending;
            const pct =
              campaign.total > 0
                ? Math.round((campaign.sent / campaign.total) * 100)
                : 0;

            return (
              <div
                key={campaign.id}
                className="card"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Left: name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-semibold truncate">
                        {campaign.name || `Campaign #${campaign.id.slice(0, 8)}`}
                      </h3>
                      <span
                        className={`badge ${sc.bg} ${sc.text} ${
                          sc.pulse ? "animate-pulse" : ""
                        }`}
                      >
                        {campaign.status}
                      </span>
                      <span className="badge bg-slate-700 text-slate-300">
                        {campaign.message_type || "text"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#25D366] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">
                        {pct}%
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-4 text-xs">
                      <span className="text-slate-400">
                        Total:{" "}
                        <span className="text-white font-medium">
                          {campaign.total}
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Sent:{" "}
                        <span className="text-[#25D366] font-medium">
                          {campaign.sent}
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Delivered:{" "}
                        <span className="text-blue-400 font-medium">
                          {campaign.delivered || 0}
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Failed:{" "}
                        <span className="text-red-400 font-medium">
                          {campaign.failed}
                        </span>
                      </span>
                      {campaign.scheduled_at && (
                        <span className="text-slate-400">
                          Scheduled:{" "}
                          <span className="text-yellow-400 font-medium">
                            {formatDate(campaign.scheduled_at)}
                          </span>
                        </span>
                      )}
                      <span className="text-slate-500">
                        Created: {formatDate(campaign.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex gap-2 shrink-0">
                    {(campaign.status === "pending" ||
                      campaign.status === "scheduled") && (
                      <button
                        onClick={() => handleStart(campaign.id)}
                        disabled={actionLoading === campaign.id}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === campaign.id ? "..." : "Start"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(campaign.id)}
                      disabled={actionLoading === campaign.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === campaign.id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
