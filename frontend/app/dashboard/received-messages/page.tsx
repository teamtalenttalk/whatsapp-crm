"use client";

import { useEffect, useState, useCallback } from "react";
import { getReceivedMessages, clearReceivedMessages, exportReceivedMessages } from "@/lib/api";

interface ReceivedMessage {
  id: string;
  sender: string;
  sender_name?: string;
  message: string;
  timestamp: string;
  device_id?: string;
  device_name?: string;
}

interface PaginatedResponse {
  data: ReceivedMessage[];
  total: number;
  page: number;
  pages: number;
}

export default function ReceivedMessagesPage() {
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async (p: number = 1) => {
    setLoading(true);
    try {
      const res = await getReceivedMessages(p, 50);
      if (res && res.data) {
        const paginated = res as PaginatedResponse;
        setMessages(paginated.data);
        setTotalPages(paginated.pages || 1);
        setTotal(paginated.total || 0);
        setPage(paginated.page || p);
      } else if (Array.isArray(res)) {
        setMessages(res);
        setTotalPages(1);
        setTotal(res.length);
      } else {
        setMessages([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClearAll() {
    if (!confirm("Are you sure you want to clear all received messages? This cannot be undone.")) return;
    try {
      await clearReceivedMessages();
      setMessages([]);
      setTotal(0);
      setTotalPages(1);
      setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to clear messages");
    }
  }

  async function handleExport() {
    try {
      await exportReceivedMessages();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function formatTimestamp(ts: string) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-white">
          Received Message Report
          {total > 0 && <span className="text-slate-400 text-lg font-normal ml-2">({total})</span>}
        </h1>
        <div className="flex gap-2">
          <button onClick={handleClearAll} disabled={messages.length === 0} className="px-4 py-2 rounded-lg text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Clear All
          </button>
          <button onClick={handleExport} disabled={messages.length === 0} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="text-slate-500 text-lg font-medium">Received Message Not Found</p>
          <p className="text-slate-600 text-sm mt-1">Messages will appear here when contacts reply to you.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Sender</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Message</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Device</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium w-44">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg, i) => (
                  <tr key={msg.id || i} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                    <td className="py-3 px-3 text-slate-500">{(page - 1) * 50 + i + 1}</td>
                    <td className="py-3 px-3">
                      <div className="text-white">{msg.sender_name || msg.sender}</div>
                      {msg.sender_name && <div className="text-xs text-slate-500">{msg.sender}</div>}
                    </td>
                    <td className="py-3 px-3 text-slate-300 max-w-md">
                      <p className="line-clamp-2">{msg.message}</p>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-xs">{msg.device_name || msg.device_id || "-"}</td>
                    <td className="py-3 px-3 text-slate-500 text-xs">{formatTimestamp(msg.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
