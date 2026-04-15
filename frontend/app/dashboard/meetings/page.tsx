"use client";

import { useEffect, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8097";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeaders(), ...opts?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ------- Types -------

interface Meeting {
  id: string | number;
  contact_phone: string;
  contact_name: string;
  date: string;
  time: string;
  duration_minutes: number;
  service?: string;
  notes?: string;
  location?: string;
  meeting_link?: string;
  status: "pending" | "completed" | "cancelled";
  created_at?: string;
}

interface Stats {
  today: number;
  this_week: number;
  pending: number;
  completed: number;
  cancelled?: number;
}

interface Slot {
  time: string;
  available: boolean;
}

const DURATIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
];

const emptyForm = {
  contact_name: "",
  contact_phone: "",
  date: "",
  time: "",
  duration_minutes: 30,
  service: "",
  location: "",
  meeting_link: "",
  notes: "",
};

// ------- Helper Components -------

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-green-500/20 text-green-400 border border-green-500/30"
      : status === "cancelled"
      ? "bg-red-500/20 text-red-400 border border-red-500/30"
      : "bg-amber-500/20 text-amber-400 border border-amber-500/30";
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: "from-green-500/20 to-green-500/5 border-green-500/30 text-green-400",
    blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400",
    amber: "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400",
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
  };
  const c = colorMap[color] || colorMap.green;
  return (
    <div className={`bg-gradient-to-br ${c} border rounded-xl p-5`}>
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ------- Main Page -------

export default function MeetingsPage() {
  const [tab, setTab] = useState<"today" | "upcoming" | "all">("today");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stats, setStats] = useState<Stats>({ today: 0, this_week: 0, pending: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Complete modal
  const [completeId, setCompleteId] = useState<string | number | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");

  // Filters for "All" tab
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // ------- Data loading -------

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch("/api/meetings/stats");
      setStats(data);
    } catch {
      // ignore
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let data;
      if (tab === "today") {
        data = await apiFetch("/api/meetings/today");
      } else if (tab === "upcoming") {
        data = await apiFetch("/api/meetings/upcoming");
      } else {
        const params = new URLSearchParams();
        if (filterStatus) params.set("status", filterStatus);
        if (filterFrom) params.set("date_from", filterFrom);
        if (filterTo) params.set("date_to", filterTo);
        const qs = params.toString();
        data = await apiFetch(`/api/meetings${qs ? `?${qs}` : ""}`);
      }
      const list = Array.isArray(data?.meetings) ? data.meetings : Array.isArray(data) ? data : [];
      setMeetings(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, [tab, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    loadStats();
    loadMeetings();
  }, [loadStats, loadMeetings]);

  // ------- Slots -------

  async function loadSlots(date: string) {
    if (!date) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const data = await apiFetch(`/api/meetings/available-slots?date=${date}`);
      setSlots(Array.isArray(data?.slots) ? data.slots : []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  // ------- Actions -------

  function openBookModal() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setSlots([]);
    setModalError("");
    setShowModal(true);
  }

  function openEditModal(m: Meeting) {
    setForm({
      contact_name: m.contact_name || "",
      contact_phone: m.contact_phone || "",
      date: m.date || "",
      time: m.time || "",
      duration_minutes: m.duration_minutes || 30,
      service: m.service || "",
      location: m.location || "",
      meeting_link: m.meeting_link || "",
      notes: m.notes || "",
    });
    setEditingId(m.id);
    setSlots([]);
    setModalError("");
    setShowModal(true);
    if (m.date) loadSlots(m.date);
  }

  async function handleSave() {
    if (!form.contact_name.trim() || !form.contact_phone.trim()) {
      setModalError("Contact name and phone are required.");
      return;
    }
    if (!form.date || !form.time) {
      setModalError("Please select a date and time slot.");
      return;
    }
    setSaving(true);
    setModalError("");
    try {
      const body = {
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        date: form.date,
        time: form.time,
        duration_minutes: form.duration_minutes,
        service: form.service.trim() || undefined,
        location: form.location.trim() || undefined,
        meeting_link: form.meeting_link.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        await apiFetch(`/api/meetings/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/meetings", { method: "POST", body: JSON.stringify(body) });
      }
      setShowModal(false);
      loadMeetings();
      loadStats();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to save meeting");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string | number) {
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    try {
      await apiFetch(`/api/meetings/${id}`, { method: "DELETE" });
      loadMeetings();
      loadStats();
    } catch {
      // ignore
    }
  }

  async function handleCancel(id: string | number) {
    if (!confirm("Cancel this meeting?")) return;
    try {
      await apiFetch(`/api/meetings/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      loadMeetings();
      loadStats();
    } catch {
      // ignore
    }
  }

  async function handleComplete() {
    if (completeId == null) return;
    try {
      await apiFetch(`/api/meetings/${completeId}/complete`, {
        method: "POST",
        body: JSON.stringify({ notes: completeNotes.trim() || undefined }),
      });
      setCompleteId(null);
      setCompleteNotes("");
      loadMeetings();
      loadStats();
    } catch {
      // ignore
    }
  }

  // ------- Helpers -------

  function formatDate(d: string) {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return d;
    }
  }

  function formatTime(t: string) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  // ------- Sorted today meetings for timeline -------

  const sortedMeetings =
    tab === "today"
      ? [...meetings].sort((a, b) => (a.time || "").localeCompare(b.time || ""))
      : meetings;

  // ------- Render -------

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Meeting Booking</h1>
          <p className="text-slate-400 text-sm mt-1">Schedule and manage your meetings</p>
        </div>
        <button
          onClick={openBookModal}
          className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Book Meeting
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Meetings" value={stats.today} color="blue" />
        <StatCard label="This Week" value={stats.this_week} color="amber" />
        <StatCard label="Pending" value={stats.pending} color="green" />
        <StatCard label="Completed" value={stats.completed} color="emerald" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-1">
          {(["today", "upcoming", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t
                  ? "bg-slate-800 text-green-400 border-b-2 border-green-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              {t === "today" ? "Today" : t === "upcoming" ? "Upcoming" : "All Meetings"}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters for All tab */}
      {tab === "all" && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm">{error}</div>
      )}

      {/* Meeting list */}
      {!loading && !error && meetings.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-lg font-medium">No meetings found</p>
          <p className="text-sm mt-1">Click &quot;Book Meeting&quot; to schedule one.</p>
        </div>
      )}

      {!loading && !error && meetings.length > 0 && (
        <>
          {/* Timeline view for Today tab */}
          {tab === "today" ? (
            <div className="relative space-y-0">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />
              {sortedMeetings.map((m) => (
                <div key={m.id} className="relative flex gap-4 pb-6">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold ${
                      m.status === "completed"
                        ? "bg-green-500/20 text-green-400 border-2 border-green-500/40"
                        : m.status === "cancelled"
                        ? "bg-red-500/20 text-red-400 border-2 border-red-500/40"
                        : "bg-blue-500/20 text-blue-400 border-2 border-blue-500/40"
                    }`}
                  >
                    {formatTime(m.time).split(" ")[0]}
                  </div>
                  {/* Card */}
                  <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-white font-semibold">{m.contact_name || "Unknown"}</h3>
                        <p className="text-slate-400 text-sm">{m.contact_phone}</p>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                      <span>{formatTime(m.time)}</span>
                      <span>{m.duration_minutes} min</span>
                      {m.service && <span className="text-green-400">{m.service}</span>}
                      {m.location && <span>{m.location}</span>}
                    </div>
                    {m.meeting_link && (
                      <a
                        href={m.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
                      >
                        Join Meeting
                      </a>
                    )}
                    {m.notes && <p className="mt-2 text-sm text-slate-500 italic">{m.notes}</p>}
                    {/* Actions */}
                    {m.status === "pending" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setCompleteId(m.id);
                            setCompleteNotes("");
                          }}
                          className="text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleCancel(m.id)}
                          className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => openEditModal(m)}
                          className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Card grid for Upcoming / All */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedMeetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-white font-semibold">{m.contact_name || "Unknown"}</h3>
                      <p className="text-slate-400 text-sm">{m.contact_phone}</p>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {formatDate(m.date)}
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {formatTime(m.time)} &middot; {m.duration_minutes} min
                    </div>
                    {m.service && (
                      <div className="flex items-center gap-2 text-green-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                          />
                        </svg>
                        {m.service}
                      </div>
                    )}
                    {m.location && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {m.location}
                      </div>
                    )}
                  </div>

                  {m.meeting_link && (
                    <a
                      href={m.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                      Join Meeting
                    </a>
                  )}
                  {m.notes && <p className="mt-2 text-sm text-slate-500 italic">{m.notes}</p>}

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                    {m.status === "pending" && (
                      <>
                        <button
                          onClick={() => {
                            setCompleteId(m.id);
                            setCompleteNotes("");
                          }}
                          className="text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleCancel(m.id)}
                          className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => openEditModal(m)}
                          className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== Book / Edit Meeting Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">
                {editingId ? "Edit Meeting" : "Book Meeting"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {modalError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
                  {modalError}
                </div>
              )}

              {/* Contact Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Phone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="+1234567890"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    setForm({ ...form, date: e.target.value, time: "" });
                    loadSlots(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                />
              </div>

              {/* Time Slots */}
              {form.date && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Time Slot</label>
                  {slotsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
                    </div>
                  ) : slots.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          disabled={!s.available}
                          onClick={() => setForm({ ...form, time: s.time })}
                          className={`text-xs py-2 px-1 rounded-lg font-medium transition-colors ${
                            form.time === s.time
                              ? "bg-green-500 text-white ring-2 ring-green-400/50"
                              : s.available
                              ? "bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
                              : "bg-slate-700/50 text-slate-500 border border-slate-700 cursor-not-allowed"
                          }`}
                        >
                          {formatTime(s.time)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-500 text-sm mb-2">No slots returned. Enter time manually:</p>
                      <input
                        type="time"
                        value={form.time}
                        onChange={(e) => setForm({ ...form, time: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Duration</label>
                <select
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Service / Purpose</label>
                <input
                  type="text"
                  value={form.service}
                  onChange={(e) => setForm({ ...form, service: e.target.value })}
                  placeholder="e.g. Consultation, Demo, Follow-up"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Office, Cafe, Online..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Meeting Link */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Meeting Link</label>
                <input
                  type="url"
                  value={form.meeting_link}
                  onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                  placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                {saving ? "Saving..." : editingId ? "Update Meeting" : "Book Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Complete Meeting Modal ===== */}
      {completeId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">Complete Meeting</h2>
            </div>
            <div className="px-6 py-5">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Completion Notes (optional)
              </label>
              <textarea
                rows={4}
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="How did the meeting go? Key outcomes..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500 resize-none"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setCompleteId(null)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                className="px-5 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
              >
                Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
