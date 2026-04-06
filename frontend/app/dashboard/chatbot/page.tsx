"use client";

import { useEffect, useState } from "react";
import { getChatbotConfig, updateChatbotConfig } from "@/lib/api";

interface ChatbotConfig {
  enabled: boolean;
  welcomeMessage: string;
  aiEnabled: boolean;
  aiSystemPrompt: string;
  businessInfo: string;
}

const defaultConfig: ChatbotConfig = {
  enabled: false,
  welcomeMessage: "",
  aiEnabled: false,
  aiSystemPrompt: "",
  businessInfo: "",
};

export default function ChatbotPage() {
  const [config, setConfig] = useState<ChatbotConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getChatbotConfig()
      .then((data) => setConfig({ ...defaultConfig, ...data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateChatbotConfig(config as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Chatbot Settings</h1>

      <div className="max-w-2xl space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
            Settings saved successfully
          </div>
        )}

        {/* Chatbot Enable Toggle */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Chatbot</h3>
              <p className="text-sm text-slate-400">
                Automatically reply to incoming WhatsApp messages
              </p>
            </div>
            <button
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.enabled ? "bg-[#25D366]" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  config.enabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Welcome Message */}
        <div className="card">
          <label className="block text-white font-medium mb-2">Welcome Message</label>
          <p className="text-sm text-slate-400 mb-3">
            Sent automatically when a new contact messages you for the first time
          </p>
          <textarea
            value={config.welcomeMessage}
            onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
            className="input-dark h-24 resize-y"
            placeholder="Hi! Thanks for reaching out. How can we help you today?"
          />
        </div>

        {/* AI Toggle */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-medium">AI Replies</h3>
              <p className="text-sm text-slate-400">
                Use AI to automatically respond to messages
              </p>
            </div>
            <button
              onClick={() => setConfig({ ...config, aiEnabled: !config.aiEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.aiEnabled ? "bg-[#25D366]" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  config.aiEnabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {config.aiEnabled && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  AI System Prompt
                </label>
                <textarea
                  value={config.aiSystemPrompt}
                  onChange={(e) =>
                    setConfig({ ...config, aiSystemPrompt: e.target.value })
                  }
                  className="input-dark h-28 resize-y"
                  placeholder="You are a helpful customer service assistant for our business. Be friendly and concise..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Business Information
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Provide context about your business for the AI to reference
                </p>
                <textarea
                  value={config.businessInfo}
                  onChange={(e) =>
                    setConfig({ ...config, businessInfo: e.target.value })
                  }
                  className="input-dark h-28 resize-y"
                  placeholder="We sell handmade jewelry. Hours: Mon-Fri 9am-6pm. Shipping: 3-5 business days..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-wa px-6">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
