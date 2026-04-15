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

interface Calendar {
  id: string | number;
  name: string;
  description?: string;
  color: string;
  working_hours_start: string;
  working_hours_end: string;
  slot_duration: number;
  break_start?: string;
  break_end?: string;
  working_days: number[];
  is_active: boolean;
  appointments_today?: number;
  created_at?: string;
}

interface Slot {
  time: string;
  available: boolean;
}

const COLORS = [
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
];

const SLOT_DURATIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sat=6, Sun=0

const emptyForm = {
  name: "",
  description: "",
  color: "#22c55e",
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  slot_duration: 30,
  break_start: "",
  break_end: "",
  working_days: [1, 2, 3, 4, 5] as number[],
  is_active: true,
};

// ------- Helper Components -------

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

// ------- Helpers -------

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function workingDaysLabel(days: number[]) {
  if (!days || days.length === 0) return "No days set";
  const sorted = [...days].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a) - order.indexOf(b);
  });
  const labels = sorted.map((d) => {
    const idx = DAY_VALUES.indexOf(d);
    return idx >= 0 ? DAY_LABELS[idx] : "";
  });
  // Check for consecutive Mon-Fri, Mon-Sat, Mon-Sun
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Mon - Fri";
  if (days.length === 6 && [1, 2, 3, 4, 5, 6].every((d) => days.includes(d))) return "Mon - Sat";
  if (days.length === 7) return "Mon - Sun";
  return labels.filter(Boolean).join(", ");
}

// ------- Main Page -------

export default function CalendarsPage() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // View Slots Modal
  const [slotsCalendar, setSlotsCalendar] = useState<Calendar | null>(null);
  const [slotsDate, setSlotsDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // ------- Data loading -------

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/calendars");
      const list = Array.isArray(data?.calendars) ? data.calendars : Array.isArray(data) ? data : [];
      setCalendars(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load calendars");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendars();
  }, [loadCalendars]);

  // ------- Stats -------

  const totalCalendars = calendars.length;
  const activeCalendars = calendars.filter((c) => c.is_active).length;
  const appointmentsToday = calendars.reduce((sum, c) => sum + (c.appointments_today || 0), 0);

  // ------- Slots -------

  async function loadSlots(calendarId: string | number, date: string) {
    if (!date) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const data = await apiFetch(`/api/calendars/${calendarId}/slots?date=${date}`);
      setSlots(Array.isArray(data?.slots) ? data.slots : []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  // ------- Actions -------

  function openCreateModal() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setModalError("");
    setShowModal(true);
  }

  function openEditModal(cal: Calendar) {
    setForm({
      name: cal.name || "",
      description: cal.description || "",
      color: cal.color || "#22c55e",
      working_hours_start: cal.working_hours_start || "09:00",
      working_hours_end: cal.working_hours_end || "18:00",
      slot_duration: cal.slot_duration || 30,
      break_start: cal.break_start || "",
      break_end: cal.break_end || "",
      working_days: cal.working_days || [1, 2, 3, 4, 5],
      is_active: cal.is_active !== false,
    });
    setEditingId(cal.id);
    setModalError("");
    setShowModal(true);
  }

  function openSlotsModal(cal: Calendar) {
    setSlotsCalendar(cal);
    const today = new Date().toISOString().split("T")[0];
    setSlotsDate(today);
    setSlots([]);
    loadSlots(cal.id, today);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setModalError("Calendar name is required.");
      return;
    }
    setSaving(true);
    setModalError("");
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        color: form.color,
        working_hours_start: form.working_hours_start,
        working_hours_end: form.working_hours_end,
        slot_duration: form.slot_duration,
        break_start: form.break_start || undefined,
        break_end: form.break_end || undefined,
        working_days: form.working_days,
        is_active: form.is_active,
      };
      if (editingId) {
        await apiFetch(`/api/calendars/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/calendars", { method: "POST", body: JSON.stringify(body) });
      }
      setShowModal(false);
      loadCalendars();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to save calendar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string | number) {
    if (!confirm("Are you sure you want to delete this calendar?")) return;
    try {
      await apiFetch(`/api/calendars/${id}`, { method: "DELETE" });
      loadCalendars();
    } catch {
      // ignore
    }
  }

  function toggleWorkingDay(day: number) {
    setForm((prev) => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day],
    }));
  }

  // ------- Render -------

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar Management</h1>
          <p className="text-slate-400 text-sm mt-1">Create and manage your booking calendars</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Calendar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Calendars" value={totalCalendars} color="blue" />
        <StatCard label="Active Calendars" value={activeCalendars} color="green" />
        <StatCard label="Appointments Today" value={appointmentsToday} color="amber" />
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm">{error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && calendars.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-lg font-medium">No calendars yet</p>
          <p className="text-sm mt-1">Click &quot;New Calendar&quot; to create your first one.</p>
        </div>
      )}

      {/* Calendar Cards Grid */}
      {!loading && !error && calendars.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {calendars.map((cal) => (
            <div
              key={cal.id}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Color indicator */}
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/10"
                    style={{ backgroundColor: cal.color || "#22c55e" }}
                  />
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold text-lg truncate">{cal.name}</h3>
                    {cal.description && (
                      <p className="text-slate-400 text-sm mt-0.5 line-clamp-2">{cal.description}</p>
                    )}
                  </div>
                </div>
                {/* Active/Inactive badge */}
                <span
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${
                    cal.is_active
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-slate-600/20 text-slate-400 border border-slate-600/30"
                  }`}
                >
                  {cal.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm mb-4">
                {/* Working hours */}
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {formatTime(cal.working_hours_start)} - {formatTime(cal.working_hours_end)}
                </div>

                {/* Slot duration */}
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 10h16M4 14h16M4 18h16"
                    />
                  </svg>
                  {cal.slot_duration} min slots
                </div>

                {/* Working days */}
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {workingDaysLabel(cal.working_days)}
                </div>

                {/* Break time (if set) */}
                {cal.break_start && cal.break_end && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Break: {formatTime(cal.break_start)} - {formatTime(cal.break_end)}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                <button
                  onClick={() => openSlotsModal(cal)}
                  className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  View Slots
                </button>
                <button
                  onClick={() => openEditModal(cal)}
                  className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(cal.id)}
                  className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Create / Edit Calendar Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">
                {editingId ? "Edit Calendar" : "Create Calendar"}
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

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Main Office, Virtual Consultations"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of this calendar..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none placeholder-slate-500 resize-none"
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
                <div className="flex gap-3">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({ ...form, color: c.value })}
                      className={`w-8 h-8 rounded-full transition-all ${
                        form.color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Working Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Work Hours Start</label>
                  <input
                    type="time"
                    value={form.working_hours_start}
                    onChange={(e) => setForm({ ...form, working_hours_start: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Work Hours End</label>
                  <input
                    type="time"
                    value={form.working_hours_end}
                    onChange={(e) => setForm({ ...form, working_hours_end: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Slot Duration */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Slot Duration</label>
                <select
                  value={form.slot_duration}
                  onChange={(e) => setForm({ ...form, slot_duration: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                >
                  {SLOT_DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Break Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Break Start</label>
                  <input
                    type="time"
                    value={form.break_start}
                    onChange={(e) => setForm({ ...form, break_start: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Break End</label>
                  <input
                    type="time"
                    value={form.break_end}
                    onChange={(e) => setForm({ ...form, break_end: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Working Days */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, idx) => {
                    const dayVal = DAY_VALUES[idx];
                    const active = form.working_days.includes(dayVal);
                    return (
                      <button
                        key={dayVal}
                        type="button"
                        onClick={() => toggleWorkingDay(dayVal)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          active
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-slate-700/50 text-slate-400 border border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Active</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? "bg-green-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.is_active ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
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
                {saving ? "Saving..." : editingId ? "Update Calendar" : "Create Calendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== View Slots Modal ===== */}
      {slotsCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: slotsCalendar.color || "#22c55e" }}
                />
                <h2 className="text-lg font-bold text-white">{slotsCalendar.name} - Slots</h2>
              </div>
              <button
                onClick={() => {
                  setSlotsCalendar(null);
                  setSlots([]);
                  setSlotsDate("");
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Date picker */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Select Date</label>
                <input
                  type="date"
                  value={slotsDate}
                  onChange={(e) => {
                    setSlotsDate(e.target.value);
                    if (e.target.value) {
                      loadSlots(slotsCalendar.id, e.target.value);
                    } else {
                      setSlots([]);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-green-400 focus:outline-none"
                />
              </div>

              {/* Slots grid */}
              {slotsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
                </div>
              ) : slotsDate && slots.length > 0 ? (
                <div>
                  <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
                      Available
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-slate-700/50 border border-slate-700" />
                      Booked
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.time}
                        disabled={!s.available}
                        className={`text-xs py-2 px-1 rounded-lg font-medium transition-colors ${
                          s.available
                            ? "bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 cursor-pointer"
                            : "bg-slate-700/50 text-slate-500 border border-slate-700 cursor-not-allowed line-through"
                        }`}
                      >
                        {formatTime(s.time)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : slotsDate ? (
                <div className="text-center py-8 text-slate-500">
                  <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm">No slots available for this date</p>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-sm">Select a date to view available slots</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-6 py-4 flex justify-end rounded-b-2xl">
              <button
                onClick={() => {
                  setSlotsCalendar(null);
                  setSlots([]);
                  setSlotsDate("");
                }}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
