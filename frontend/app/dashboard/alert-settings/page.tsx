"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8097";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---------- types ---------- */

interface AlertSettings {
  inventory: {
    enabled: boolean;
    frequency: string;
    phone: string;
  };
  meetings: {
    enabled: boolean;
    remind1DayBefore: boolean;
    remindMorningOf: boolean;
    morningTime: string;
  };
  dailySummary: {
    enabled: boolean;
    summaryTime: string;
    includeSalesRecap: boolean;
    includeMeetingStats: boolean;
    includeInventoryWarnings: boolean;
    includeTomorrowMeetings: boolean;
  };
}

const defaultSettings: AlertSettings = {
  inventory: {
    enabled: false,
    frequency: "15",
    phone: "",
  },
  meetings: {
    enabled: false,
    remind1DayBefore: true,
    remindMorningOf: true,
    morningTime: "08:00",
  },
  dailySummary: {
    enabled: false,
    summaryTime: "20:00",
    includeSalesRecap: true,
    includeMeetingStats: true,
    includeInventoryWarnings: true,
    includeTomorrowMeetings: true,
  },
};

const STORAGE_KEY = "crm_alert_settings";

/* ---------- component ---------- */

export default function AlertSettingsPage() {
  const [settings, setSettings] = useState<AlertSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /* ---------- load ---------- */

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/settings`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data && data.inventory) {
            setSettings(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        /* API not available, fall back to localStorage */
      }
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSettings(JSON.parse(stored));
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, []);

  /* ---------- save ---------- */

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showToast("Settings saved successfully");
        setSaving(false);
        return;
      }
    } catch {
      /* API not available, save to localStorage */
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      showToast("Settings saved locally");
    } catch {
      showToast("Failed to save settings");
    }
    setSaving(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  /* ---------- helpers ---------- */

  function updateInventory(patch: Partial<AlertSettings["inventory"]>) {
    setSettings((s) => ({ ...s, inventory: { ...s.inventory, ...patch } }));
  }

  function updateMeetings(patch: Partial<AlertSettings["meetings"]>) {
    setSettings((s) => ({ ...s, meetings: { ...s.meetings, ...patch } }));
  }

  function updateSummary(patch: Partial<AlertSettings["dailySummary"]>) {
    setSettings((s) => ({ ...s, dailySummary: { ...s.dailySummary, ...patch } }));
  }

  /* ---------- toggle switch ---------- */

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          checked ? "bg-green-500" : "bg-slate-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    );
  }

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-slate-500">Loading settings...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Alert / Notification Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Configure automated WhatsApp notifications and reminders</p>
      </div>

      <div className="space-y-6">
        {/* ========== INVENTORY ALERTS ========== */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Inventory Alerts</h2>
              <p className="text-slate-400 text-sm mt-0.5">Get notified when products run low on stock</p>
            </div>
            <Toggle checked={settings.inventory.enabled} onChange={(v) => updateInventory({ enabled: v })} />
          </div>

          {settings.inventory.enabled && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Check Frequency</label>
                <select
                  value={settings.inventory.frequency}
                  onChange={(e) => updateInventory({ frequency: e.target.value })}
                  className="w-full max-w-xs px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                >
                  <option value="5">Every 5 minutes</option>
                  <option value="15">Every 15 minutes</option>
                  <option value="30">Every 30 minutes</option>
                  <option value="60">Every 1 hour</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Alert Phone Number</label>
                <input
                  type="tel"
                  value={settings.inventory.phone}
                  onChange={(e) => updateInventory({ phone: e.target.value })}
                  placeholder="+1234567890"
                  className="w-full max-w-xs px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500 placeholder-slate-500"
                />
                <p className="text-slate-500 text-xs mt-1">WhatsApp number to receive inventory alerts</p>
              </div>
            </div>
          )}
        </div>

        {/* ========== MEETING REMINDERS ========== */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Meeting Reminders</h2>
              <p className="text-slate-400 text-sm mt-0.5">Automated reminders before scheduled meetings</p>
            </div>
            <Toggle checked={settings.meetings.enabled} onChange={(v) => updateMeetings({ enabled: v })} />
          </div>

          {settings.meetings.enabled && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-white">Remind 1 day before</span>
                  <p className="text-slate-500 text-xs">Send a reminder the day before the meeting</p>
                </div>
                <Toggle checked={settings.meetings.remind1DayBefore} onChange={(v) => updateMeetings({ remind1DayBefore: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-white">Remind morning of meeting day</span>
                  <p className="text-slate-500 text-xs">Send a reminder on the morning of the meeting</p>
                </div>
                <Toggle checked={settings.meetings.remindMorningOf} onChange={(v) => updateMeetings({ remindMorningOf: v })} />
              </div>
              {settings.meetings.remindMorningOf && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Morning Reminder Time</label>
                  <input
                    type="time"
                    value={settings.meetings.morningTime}
                    onChange={(e) => updateMeetings({ morningTime: e.target.value })}
                    className="w-full max-w-xs px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== DAILY SUMMARY ========== */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Daily Summary</h2>
              <p className="text-slate-400 text-sm mt-0.5">Receive a daily recap of key business metrics</p>
            </div>
            <Toggle checked={settings.dailySummary.enabled} onChange={(v) => updateSummary({ enabled: v })} />
          </div>

          {settings.dailySummary.enabled && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Summary Time</label>
                <input
                  type="time"
                  value={settings.dailySummary.summaryTime}
                  onChange={(e) => updateSummary({ summaryTime: e.target.value })}
                  className="w-full max-w-xs px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-3">Include Sections</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.dailySummary.includeSalesRecap}
                      onChange={(e) => updateSummary({ includeSalesRecap: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white">Sales recap</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.dailySummary.includeMeetingStats}
                      onChange={(e) => updateSummary({ includeMeetingStats: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white">Meeting stats</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.dailySummary.includeInventoryWarnings}
                      onChange={(e) => updateSummary({ includeInventoryWarnings: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white">Inventory warnings</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.dailySummary.includeTomorrowMeetings}
                      onChange={(e) => updateSummary({ includeTomorrowMeetings: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white">Tomorrow&#39;s meetings</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
