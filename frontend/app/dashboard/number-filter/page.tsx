"use client";

import { useEffect, useState, useCallback } from "react";
import { getDevices, getFilterResults, checkNumbers, clearFilterResults } from "@/lib/api";

interface Device {
  id: string;
  name: string;
  status: string;
}

interface FilterResult {
  id: string;
  phone: string;
  name?: string;
  has_whatsapp: boolean | null;
  account_type?: string;
  country?: string;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function NumberFilterPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [results, setResults] = useState<FilterResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [phones, setPhones] = useState<{ id: string; name: string; number: string }[]>([]);
  const [filterWa, setFilterWa] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [devs, res] = await Promise.all([
        getDevices().catch(() => []),
        getFilterResults().catch(() => []),
      ]);
      setDevices(Array.isArray(devs) ? devs : []);
      setResults(Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addPhone() {
    setPhones([...phones, { id: uid(), name: "", number: "" }]);
  }

  function updatePhone(id: string, field: string, value: string) {
    setPhones(phones.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  function deletePhone(id: string) {
    setPhones(phones.filter((p) => p.id !== id));
  }

  function handleImport() {
    const lines = importText.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const newPhones = lines.map((line) => {
      const parts = line.split(/[\t|]+/);
      return { id: uid(), name: parts[1] || "", number: parts[0] };
    });
    setPhones([...phones, ...newPhones]);
    setShowImport(false);
    setImportText("");
  }

  async function handleStart() {
    if (!selectedDevice) { setError("Please select a device."); return; }
    const numbers = phones.map((p) => p.number).filter(Boolean);
    if (numbers.length === 0) { setError("Please add phone numbers to check."); return; }
    setChecking(true);
    setError("");
    try {
      const res = await checkNumbers(selectedDevice, numbers);
      if (Array.isArray(res)) setResults(res);
      else load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  async function handleClear() {
    if (!confirm("Clear all filter results?")) return;
    try { await clearFilterResults(); setResults([]); } catch { /* ignore */ }
  }

  function handleExport() {
    const csv = ["Phone,Name,WhatsApp,Account Type", ...filteredResults.map((r) => `${r.phone},${r.name || ""},${r.has_whatsapp === true ? "Yes" : r.has_whatsapp === false ? "No" : "Unknown"},${r.account_type || ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "number_filter_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredResults = results.filter((r) => {
    if (filterWa === "whatsapp" && r.has_whatsapp !== true) return false;
    if (filterWa === "non-whatsapp" && r.has_whatsapp !== false) return false;
    if (filterType !== "all" && r.account_type !== filterType) return false;
    return true;
  });

  const totalWhatsApp = results.filter((r) => r.has_whatsapp === true).length;
  const totalNonWa = results.filter((r) => r.has_whatsapp === false).length;
  const totalUnknown = results.filter((r) => r.has_whatsapp === null).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Number Filter</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
        </div>
      )}

      {/* Control bar */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-300 mb-1">Instance</label>
          <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="input-dark">
            <option value="">-- Select Device --</option>
            {devices.filter((d) => d.status === "connected").map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button onClick={handleStart} disabled={checking} className="btn-wa">
          {checking ? "Checking..." : "Start"}
        </button>
      </div>

      {/* Stats */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-sm text-slate-400">Total Contacts</p>
            <p className="text-2xl font-bold text-white">{results.length}</p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-slate-400">Filtered</p>
            <p className="text-2xl font-bold text-blue-400">{filteredResults.length}</p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-slate-400">WhatsApp</p>
            <p className="text-2xl font-bold text-[#25D366]">{totalWhatsApp}</p>
            <p className="text-xs text-slate-500">{results.length > 0 ? ((totalWhatsApp / results.length) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-slate-400">Non WhatsApp</p>
            <p className="text-2xl font-bold text-red-400">{totalNonWa}</p>
            <p className="text-xs text-slate-500">{results.length > 0 ? ((totalNonWa / results.length) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>
      )}

      {/* Phone numbers input */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Phone Numbers ({phones.length})</h3>
          <div className="flex gap-2">
            <button onClick={addPhone} className="px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors">+ Add</button>
            <button onClick={() => setShowImport(true)} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">Import</button>
          </div>
        </div>
        {phones.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Add phone numbers to filter.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {phones.map((p) => (
              <div key={p.id} className="flex gap-2 items-center">
                <input type="text" value={p.number} onChange={(e) => updatePhone(p.id, "number", e.target.value)} className="input-dark flex-1" placeholder="+1234567890" />
                <input type="text" value={p.name} onChange={(e) => updatePhone(p.id, "name", e.target.value)} className="input-dark flex-1" placeholder="Name (optional)" />
                <button onClick={() => deletePhone(p.id)} className="text-red-400 hover:text-red-300 text-xs px-2">Del</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select value={filterWa} onChange={(e) => setFilterWa(e.target.value)} className="input-dark w-auto">
              <option value="all">All Status</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="non-whatsapp">Non WhatsApp</option>
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-dark w-auto">
              <option value="all">All Types</option>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
            </select>
            <div className="flex-1" />
            <button onClick={handleExport} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">Export</button>
            <button onClick={handleClear} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Clear Results</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Name</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Number</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">WhatsApp</th>
                  <th className="text-left py-3 px-3 text-slate-400 font-medium">Account Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                    <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                    <td className="py-3 px-3 text-white">{r.name || "-"}</td>
                    <td className="py-3 px-3 text-slate-300">{r.phone}</td>
                    <td className="py-3 px-3">
                      {r.has_whatsapp === true ? (
                        <span className="badge bg-green-500/20 text-green-400">Yes</span>
                      ) : r.has_whatsapp === false ? (
                        <span className="badge bg-red-500/20 text-red-400">No</span>
                      ) : (
                        <span className="badge bg-yellow-500/20 text-yellow-400">Unknown</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-400 capitalize">{r.account_type || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">Import Numbers</h2>
            <p className="text-sm text-slate-400 mb-3">Paste numbers, one per line. Format: number | name</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} className="input-dark font-mono text-sm mb-4" placeholder={"+1234567890\n+1234567891|John"} />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowImport(false); setImportText(""); }} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleImport} className="btn-wa">Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
