"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getDevices, createDevice, deleteDevice, connectDevice, disconnectDevice, getDeviceStatus } from "@/lib/api";

interface Device {
  id: string;
  name: string;
  status: string;
  phone?: string;
  qr?: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [qrModal, setQrModal] = useState<{ deviceId: string; qr: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const data = await getDevices();
      const list = data?.devices || data;
      setDevices(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadDevices]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createDevice(newName.trim());
      setNewName("");
      setShowCreate(false);
      loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create device");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this device?")) return;
    try {
      await deleteDevice(id);
      loadDevices();
    } catch {
      // ignore
    }
  }

  async function handleConnect(device: Device) {
    try {
      const res = await connectDevice(device.id);
      if (res?.qr) {
        setQrModal({ deviceId: device.id, qr: res.qr, name: device.name });
        startPolling(device.id);
      }
      loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  function startPolling(deviceId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getDeviceStatus(deviceId);
        if (status?.status === "connected") {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrModal(null);
          loadDevices();
        } else if (status?.qr) {
          setQrModal((prev) => prev ? { ...prev, qr: status.qr } : null);
        }
      } catch {
        // ignore
      }
    }, 2000);
  }

  async function handleDisconnect(id: string) {
    try {
      await disconnectDevice(id);
      loadDevices();
    } catch {
      // ignore
    }
  }

  const connectedCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Devices <span className="text-slate-400 text-lg font-normal">({devices.length}/10)</span>
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          disabled={devices.length >= 10}
          className="btn-wa"
        >
          + Create Instance
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex gap-3 mb-6">
        <span className="badge bg-slate-700 text-slate-300">Total: {devices.length}</span>
        <span className="badge bg-green-500/20 text-green-400">Connected: {connectedCount}</span>
        <span className="badge bg-red-500/20 text-red-400">Disconnected: {devices.length - connectedCount}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : devices.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">
          No devices yet. Create your first instance to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <div key={device.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold truncate">{device.name}</h3>
                <span
                  className={`badge ${
                    device.status === "connected"
                      ? "bg-green-500/20 text-green-400"
                      : device.status === "qr"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {device.status}
                </span>
              </div>

              {device.phone && (
                <p className="text-sm text-slate-400 mb-3">{device.phone}</p>
              )}

              <div className="flex gap-2 mt-3">
                {device.status === "connected" ? (
                  <button
                    onClick={() => handleDisconnect(device.id)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(device)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
                  >
                    Connect
                  </button>
                )}
                <button
                  onClick={() => handleDelete(device.id)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Create Instance</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Device Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input-dark"
                  placeholder="e.g. Marketing Phone 1"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setNewName(""); }} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="btn-wa">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center">
            <h2 className="text-lg font-bold text-white mb-2">Scan QR Code</h2>
            <p className="text-sm text-slate-400 mb-4">{qrModal.name}</p>
            <div className="bg-white rounded-xl p-4 inline-block mb-4">
              {/* QR code rendered as image from base64/URL or SVG placeholder */}
              {qrModal.qr.startsWith("data:") || qrModal.qr.startsWith("http") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrModal.qr} alt="QR Code" className="w-64 h-64" />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-sm text-slate-600 font-mono break-all overflow-auto">
                  {qrModal.qr}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">Open WhatsApp on your phone, go to Settings &gt; Linked Devices &gt; Link a Device</p>
            <button
              onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setQrModal(null); }}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
