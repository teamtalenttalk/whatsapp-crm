"use client";

import { useEffect, useState, useCallback } from "react";
import { getIntegrations, updateIntegration } from "@/lib/api";

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  format: string;
  docs?: string;
  website?: string;
}

interface IntegrationState {
  enabled: boolean;
  api_key?: string;
  model?: string;
  response_format?: string;
}

const PROVIDERS: ProviderInfo[] = [
  { id: "openai", name: "OpenAI GPT", description: "Flagship GPT-5 class reasoning models with full function calling and JSON schema support.", tags: ["Reasoning", "Structured JSON"], format: "JSON_SCHEMA", docs: "https://platform.openai.com/docs", website: "https://openai.com" },
  { id: "azure_openai", name: "Azure OpenAI", description: "Enterprise deployments of GPT models with Azure governance, regions, and compliance features.", tags: ["Enterprise", "Compliance"], format: "JSON_SCHEMA", docs: "https://learn.microsoft.com/en-us/azure/ai-services/openai/", website: "https://azure.microsoft.com/en-us/products/ai-services/openai-service" },
  { id: "gemini", name: "Google Gemini", description: "Gemini 3 and 2.5 multimodal models with live safety controls.", tags: ["Multimodal", "Safety"], format: "JSON_OBJECT", docs: "https://ai.google.dev/docs", website: "https://ai.google.dev" },
  { id: "grok", name: "xAI Grok", description: "Real-time reasoning with web access and humor-tuned responses.", tags: ["Real-time", "Web Access"], format: "JSON_OBJECT", docs: "https://docs.x.ai", website: "https://x.ai" },
  { id: "claude", name: "Anthropic Claude", description: "Constitutional AI with extended context and careful reasoning.", tags: ["Constitutional AI", "Long Context"], format: "JSON_SCHEMA", docs: "https://docs.anthropic.com", website: "https://anthropic.com" },
  { id: "groq", name: "Groq Cloud", description: "Ultra-fast inference on custom LPU hardware for low-latency applications.", tags: ["Fast Inference", "Low Latency"], format: "JSON_OBJECT", docs: "https://console.groq.com/docs", website: "https://groq.com" },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, IntegrationState>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<ProviderInfo | null>(null);
  const [modalForm, setModalForm] = useState({ api_key: "", model: "", response_format: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getIntegrations();
      if (data && typeof data === "object") {
        setIntegrations(data);
      }
    } catch {
      // ignore - integrations may not be configured yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEnableModal(provider: ProviderInfo) {
    const existing = integrations[provider.id];
    setModalForm({
      api_key: existing?.api_key || "",
      model: existing?.model || "",
      response_format: existing?.response_format || provider.format,
    });
    setShowModal(provider);
    setError("");
  }

  async function handleSave() {
    if (!showModal) return;
    if (!modalForm.api_key.trim()) {
      setError("API key is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateIntegration(showModal.id, {
        api_key: modalForm.api_key,
        model: modalForm.model || undefined,
        enabled: true,
        response_format: modalForm.response_format || showModal.format,
      });
      setShowModal(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable(providerId: string) {
    try {
      await updateIntegration(providerId, { enabled: false });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable integration");
    }
  }

  function isEnabled(providerId: string) {
    return integrations[providerId]?.enabled === true;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
      </div>

      {error && !showModal && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROVIDERS.map((provider) => {
            const enabled = isEnabled(provider.id);
            return (
              <div key={provider.id} className="card flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-white">{provider.name}</h3>
                  <span className={`badge text-xs ${enabled ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"}`}>
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <div className="mb-3">
                  <span className="inline-block px-2 py-0.5 rounded text-xs border border-blue-500/40 text-blue-400 bg-blue-500/10">
                    {provider.format}
                  </span>
                </div>

                <p className="text-sm text-slate-400 mb-3 flex-1">{provider.description}</p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {provider.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300">{tag}</span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                  <div className="flex gap-2">
                    {provider.docs && (
                      <a href={provider.docs} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                        Docs
                      </a>
                    )}
                    {provider.website && (
                      <a href={provider.website} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                        Website
                      </a>
                    )}
                  </div>
                  {enabled ? (
                    <button onClick={() => handleDisable(provider.id)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      Disable
                    </button>
                  ) : (
                    <button onClick={() => openEnableModal(provider)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      Enable
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enable Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Configure {showModal.name}</h2>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">API Key *</label>
                <input
                  type="password"
                  value={modalForm.api_key}
                  onChange={(e) => setModalForm({ ...modalForm, api_key: e.target.value })}
                  className="input-dark"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                <input
                  type="text"
                  value={modalForm.model}
                  onChange={(e) => setModalForm({ ...modalForm, model: e.target.value })}
                  className="input-dark"
                  placeholder={showModal.id === "openai" ? "gpt-4o" : showModal.id === "claude" ? "claude-sonnet-4-20250514" : "Enter model name"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Response Format</label>
                <select value={modalForm.response_format} onChange={(e) => setModalForm({ ...modalForm, response_format: e.target.value })} className="input-dark">
                  <option value="JSON_SCHEMA">JSON_SCHEMA</option>
                  <option value="JSON_OBJECT">JSON_OBJECT</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-wa">
                {saving ? "Saving..." : "Enable & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
