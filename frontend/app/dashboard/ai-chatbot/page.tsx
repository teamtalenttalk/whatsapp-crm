"use client";

import { useEffect, useState } from "react";

const API = "";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("crm_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface Analytics {
  total_chats: number;
  by_source: { source: string; cnt: number }[];
  by_day: { day: string; cnt: number }[];
  avg_response_length: number;
  training_data_count: number;
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  source?: string;
}

export default function AIChatbotPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"chat" | "train" | "analytics">("chat");

  // Training state
  const [trainingPairs, setTrainingPairs] = useState([{ question: "", answer: "" }]);
  const [businessContext, setBusinessContext] = useState("");
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainMsg, setTrainMsg] = useState("");

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      const res = await fetch(`${API}/api/ai-chat/analytics`, { headers: authHeaders() });
      if (res.ok) setAnalytics(await res.json());
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/ai-chat/respond`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: data.response, source: data.source },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Error: Could not get AI response" },
      ]);
    } finally {
      setLoading(false);
      loadAnalytics();
    }
  }

  async function submitTraining() {
    const validPairs = trainingPairs.filter((p) => p.question.trim() && p.answer.trim());
    if (validPairs.length === 0) {
      setTrainMsg("Add at least one Q&A pair");
      return;
    }
    setTrainLoading(true);
    setTrainMsg("");
    try {
      const res = await fetch(`${API}/api/ai-chat/train`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          training_data: validPairs,
          business_context: businessContext || undefined,
        }),
      });
      const data = await res.json();
      setTrainMsg(`Trained with ${data.trained} Q&A pairs`);
      setTrainingPairs([{ question: "", answer: "" }]);
      loadAnalytics();
    } catch (err) {
      setTrainMsg("Training failed");
    } finally {
      setTrainLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">AI Chatbot</h1>
        <div className="flex gap-2">
          {(["chat", "train", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-green-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {t === "chat" ? "Test Chat" : t === "train" ? "Train AI" : "Analytics"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Test Chat ── */}
      {tab === "chat" && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col" style={{ height: "500px" }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-slate-500 text-center mt-20">Send a message to test the AI chatbot</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                    m.role === "user"
                      ? "bg-green-600 text-white rounded-br-sm"
                      : "bg-slate-700 text-slate-200 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                  {m.source && (
                    <span className="block text-[10px] mt-1 opacity-50">via {m.source}</span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-700 text-slate-400 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
                  Thinking...
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-700 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Train AI ── */}
      {tab === "train" && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Train Your AI Chatbot</h2>
          <p className="text-sm text-slate-400">Add Q&A pairs to teach the chatbot about your business</p>

          <div className="space-y-3">
            {trainingPairs.map((pair, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <input
                  value={pair.question}
                  onChange={(e) => {
                    const next = [...trainingPairs];
                    next[i].question = e.target.value;
                    setTrainingPairs(next);
                  }}
                  placeholder="Customer question..."
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={pair.answer}
                    onChange={(e) => {
                      const next = [...trainingPairs];
                      next[i].answer = e.target.value;
                      setTrainingPairs(next);
                    }}
                    placeholder="Your answer..."
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  {trainingPairs.length > 1 && (
                    <button
                      onClick={() => setTrainingPairs(trainingPairs.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 px-2"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setTrainingPairs([...trainingPairs, { question: "", answer: "" }])}
            className="text-sm text-green-400 hover:text-green-300"
          >
            + Add another Q&A pair
          </button>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Business Context (optional)</label>
            <textarea
              value={businessContext}
              onChange={(e) => setBusinessContext(e.target.value)}
              rows={3}
              placeholder="Describe your business, products, and services..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {trainMsg && (
            <p className={`text-sm ${trainMsg.includes("fail") ? "text-red-400" : "text-green-400"}`}>
              {trainMsg}
            </p>
          )}

          <button
            onClick={submitTraining}
            disabled={trainLoading}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {trainLoading ? "Training..." : "Submit Training Data"}
          </button>
        </div>
      )}

      {/* ── Analytics ── */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total AI Chats" value={analytics?.total_chats ?? 0} />
            <StatCard label="Avg Response Length" value={`${analytics?.avg_response_length ?? 0} chars`} />
            <StatCard label="Training Data" value={`${analytics?.training_data_count ?? 0} pairs`} />
          </div>

          {analytics?.by_source && analytics.by_source.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Responses by Source</h3>
              <div className="space-y-2">
                {analytics.by_source.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <span className="text-sm text-slate-400 capitalize">{s.source}</span>
                    <span className="text-sm text-white font-medium">{s.cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analytics?.by_day && analytics.by_day.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Daily Chat Volume (Last 30 days)</h3>
              <div className="flex items-end gap-1 h-32">
                {analytics.by_day.slice(0, 30).reverse().map((d) => {
                  const max = Math.max(...analytics.by_day.map((x) => x.cnt));
                  const h = max > 0 ? (d.cnt / max) * 100 : 0;
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center group relative">
                      <div
                        className="w-full bg-green-600 rounded-t-sm min-h-[2px]"
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                      <div className="absolute -top-6 hidden group-hover:block text-xs bg-slate-700 px-1.5 py-0.5 rounded whitespace-nowrap text-slate-300">
                        {d.day}: {d.cnt}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
