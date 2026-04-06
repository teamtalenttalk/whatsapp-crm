"use client";

import { useEffect, useState } from "react";
import { getWaStatus, connectWa, disconnectWa } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { QRCodeSVG } from "qrcode.react";

interface WaStatus {
  connected: boolean;
  phone?: string;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getWaStatus()
      .then((data) => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Listen for QR code and connection events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleQr(data: { qr: string }) {
      setQrCode(data.qr);
      setConnecting(false);
    }

    function handleConnected(data: { phone?: string }) {
      setStatus({ connected: true, phone: data.phone });
      setQrCode(null);
      setConnecting(false);
    }

    function handleDisconnected() {
      setStatus({ connected: false });
      setQrCode(null);
    }

    socket.on("wa:qr", handleQr);
    socket.on("wa:connected", handleConnected);
    socket.on("wa:disconnected", handleDisconnected);

    return () => {
      socket.off("wa:qr", handleQr);
      socket.off("wa:connected", handleConnected);
      socket.off("wa:disconnected", handleDisconnected);
    };
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError("");
    setQrCode(null);
    try {
      await connectWa();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectWa();
      setStatus({ connected: false });
      setQrCode(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
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
      <h1 className="text-2xl font-bold text-white mb-6">WhatsApp Connection</h1>

      <div className="card max-w-xl">
        {/* Status */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className={`w-4 h-4 rounded-full ${
              status?.connected ? "bg-[#25D366]" : "bg-red-500"
            }`}
          />
          <div>
            <p className="text-white font-medium">
              {status?.connected ? "Connected" : "Disconnected"}
            </p>
            {status?.connected && status.phone && (
              <p className="text-sm text-slate-400">{status.phone}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {/* QR Code */}
        {qrCode && (
          <div className="mb-6">
            <p className="text-sm text-slate-400 mb-3">
              Scan this QR code with WhatsApp on your phone:
            </p>
            <div className="bg-white p-6 rounded-lg inline-block">
              <QRCodeSVG value={qrCode} size={280} level="M" />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
            </p>
          </div>
        )}

        {/* Actions */}
        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
          >
            Disconnect WhatsApp
          </button>
        ) : (
          <button onClick={handleConnect} disabled={connecting} className="btn-wa">
            {connecting ? "Connecting..." : "Connect WhatsApp"}
          </button>
        )}
      </div>
    </div>
  );
}
