"use client";

import { useEffect, useState, useCallback } from "react";
import { getSettings, updateSettings, getTemplates } from "@/lib/api";

interface Template {
  id: string;
  name: string;
}

interface SettingsData {
  // Sending Message
  delay_enabled: boolean;
  delay_min: number;
  delay_max: number;
  sleep_enabled: boolean;
  sleep_after_messages: number;
  sleep_min: number;
  sleep_max: number;
  switch_after_messages: number;
  welcome_enabled: boolean;
  welcome_duration_days: number;
  send_parallel: boolean;
  show_notification: boolean;
  auto_reply: boolean;
  auto_read: boolean;
  media_before_text: boolean;
  unsubscribe_enabled: boolean;
  unsubscribe_keyword: string;
  unsubscribe_template_id: string;
  auto_reject_calls: boolean;
  auto_reject_template_id: string;
  // WhatsHook
  webhook_url: string;
  webhook_message_received: boolean;
  webhook_message_sent: boolean;
  webhook_device_connected: boolean;
  webhook_device_disconnected: boolean;
  // Country & Language
  default_country_code: string;
  language: string;
}

const DEFAULT_SETTINGS: SettingsData = {
  delay_enabled: false,
  delay_min: 3,
  delay_max: 7,
  sleep_enabled: false,
  sleep_after_messages: 50,
  sleep_min: 30,
  sleep_max: 60,
  switch_after_messages: 100,
  welcome_enabled: true,
  welcome_duration_days: 1,
  send_parallel: false,
  show_notification: true,
  auto_reply: false,
  auto_read: false,
  media_before_text: false,
  unsubscribe_enabled: false,
  unsubscribe_keyword: "STOP",
  unsubscribe_template_id: "",
  auto_reject_calls: false,
  auto_reject_template_id: "",
  webhook_url: "",
  webhook_message_received: true,
  webhook_message_sent: true,
  webhook_device_connected: true,
  webhook_device_disconnected: true,
  default_country_code: "+1",
  language: "en",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("sending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const [settingsData, templatesData] = await Promise.all([
        getSettings().catch(() => ({})),
        getTemplates().catch(() => []),
      ]);
      if (settingsData && typeof settingsData === "object") {
        setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
      }
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateSettings(settings as unknown as Record<string, unknown>);
      setSuccess("Settings saved successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function update(field: keyof SettingsData, value: unknown) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  const tabs = [
    { id: "sending", label: "Sending Message" },
    { id: "whatshook", label: "WhatsHook" },
    { id: "country", label: "Country & Language" },
    { id: "storage", label: "Storage" },
  ];

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Setting</h1>
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Setting</h1>
        <button onClick={handleSave} disabled={saving} className="btn-wa">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm mb-4">
          {success}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 border-b border-slate-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#25D366] text-[#25D366]"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Sending Message */}
      {activeTab === "sending" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Delay Between Messages */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Delay Between Messages</h3>
              <ToggleSwitch checked={settings.delay_enabled} onChange={(v) => update("delay_enabled", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Min (seconds)</label>
                <input type="number" value={settings.delay_min} onChange={(e) => update("delay_min", Number(e.target.value))} className="input-dark" min={1} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max (seconds)</label>
                <input type="number" value={settings.delay_max} onChange={(e) => update("delay_max", Number(e.target.value))} className="input-dark" min={1} />
              </div>
            </div>
          </div>

          {/* Sleep Mode */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Sleep Mode</h3>
              <ToggleSwitch checked={settings.sleep_enabled} onChange={(v) => update("sleep_enabled", v)} />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">After X messages</label>
                <input type="number" value={settings.sleep_after_messages} onChange={(e) => update("sleep_after_messages", Number(e.target.value))} className="input-dark" min={1} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Min (seconds)</label>
                  <input type="number" value={settings.sleep_min} onChange={(e) => update("sleep_min", Number(e.target.value))} className="input-dark" min={1} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Max (seconds)</label>
                  <input type="number" value={settings.sleep_max} onChange={(e) => update("sleep_max", Number(e.target.value))} className="input-dark" min={1} />
                </div>
              </div>
            </div>
          </div>

          {/* Switch Account */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4">Switch Account</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">After X messages</label>
              <input type="number" value={settings.switch_after_messages} onChange={(e) => update("switch_after_messages", Number(e.target.value))} className="input-dark" min={1} />
            </div>
          </div>

          {/* Welcome Message */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Welcome Message</h3>
              <ToggleSwitch checked={settings.welcome_enabled} onChange={(v) => update("welcome_enabled", v)} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Duration (days)</label>
              <input type="number" value={settings.welcome_duration_days} onChange={(e) => update("welcome_duration_days", Number(e.target.value))} className="input-dark" min={1} />
            </div>
          </div>

          {/* Configuration */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4">Configuration</h3>
            <div className="space-y-3">
              <CheckboxItem label="Send Parallel Messages" checked={settings.send_parallel} onChange={(v) => update("send_parallel", v)} />
              <CheckboxItem label="Show Notification" checked={settings.show_notification} onChange={(v) => update("show_notification", v)} />
              <CheckboxItem label="Auto Reply" checked={settings.auto_reply} onChange={(v) => update("auto_reply", v)} />
              <CheckboxItem label="Auto Read Messages" checked={settings.auto_read} onChange={(v) => update("auto_read", v)} />
              <CheckboxItem label="Send media before text message" checked={settings.media_before_text} onChange={(v) => update("media_before_text", v)} />
            </div>
          </div>

          {/* Unsubscribe */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Unsubscribe</h3>
              <ToggleSwitch checked={settings.unsubscribe_enabled} onChange={(v) => update("unsubscribe_enabled", v)} />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Keyword</label>
                <input type="text" value={settings.unsubscribe_keyword} onChange={(e) => update("unsubscribe_keyword", e.target.value)} className="input-dark" placeholder="STOP" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reply Template</label>
                <select value={settings.unsubscribe_template_id} onChange={(e) => update("unsubscribe_template_id", e.target.value)} className="input-dark">
                  <option value="">-- None --</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Auto Reject Calls */}
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Auto Reject Calls</h3>
              <ToggleSwitch checked={settings.auto_reject_calls} onChange={(v) => update("auto_reject_calls", v)} />
            </div>
            <div className="max-w-md">
              <label className="block text-xs text-slate-400 mb-1">Reply Template</label>
              <select value={settings.auto_reject_template_id} onChange={(e) => update("auto_reject_template_id", e.target.value)} className="input-dark">
                <option value="">-- None --</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tab: WhatsHook */}
      {activeTab === "whatshook" && (
        <div className="card max-w-2xl">
          <h3 className="text-white font-semibold mb-4">Webhook Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Webhook URL</label>
              <input type="url" value={settings.webhook_url} onChange={(e) => update("webhook_url", e.target.value)} className="input-dark" placeholder="https://your-server.com/webhook" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Events</label>
              <div className="space-y-3">
                <CheckboxItem label="Message Received" checked={settings.webhook_message_received} onChange={(v) => update("webhook_message_received", v)} />
                <CheckboxItem label="Message Sent" checked={settings.webhook_message_sent} onChange={(v) => update("webhook_message_sent", v)} />
                <CheckboxItem label="Device Connected" checked={settings.webhook_device_connected} onChange={(v) => update("webhook_device_connected", v)} />
                <CheckboxItem label="Device Disconnected" checked={settings.webhook_device_disconnected} onChange={(v) => update("webhook_device_disconnected", v)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Country & Language */}
      {activeTab === "country" && (
        <div className="card max-w-2xl">
          <h3 className="text-white font-semibold mb-4">Country & Language</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default Country Code</label>
              <input type="text" value={settings.default_country_code} onChange={(e) => update("default_country_code", e.target.value)} className="input-dark" placeholder="+1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Language</label>
              <select value={settings.language} onChange={(e) => update("language", e.target.value)} className="input-dark">
                <option value="en">English</option>
                <option value="id">Indonesian</option>
                <option value="es">Spanish</option>
                <option value="pt">Portuguese</option>
                <option value="fr">French</option>
                <option value="ar">Arabic</option>
                <option value="hi">Hindi</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Storage */}
      {activeTab === "storage" && (
        <div className="card max-w-2xl">
          <h3 className="text-white font-semibold mb-4">Storage</h3>
          <div className="bg-slate-900 rounded-lg p-4 mb-4">
            <p className="text-sm text-slate-400">
              WhatsApp session data is stored locally on the server. Clearing sessions will disconnect all devices and require re-scanning QR codes.
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm("Clear all sessions? All devices will be disconnected.")) {
                handleSave();
              }
            }}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Clear All Sessions
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-[#25D366]" : "bg-slate-600"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function CheckboxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-slate-700 border-slate-600 text-[#25D366] focus:ring-[#25D366]"
      />
      {label}
    </label>
  );
}
