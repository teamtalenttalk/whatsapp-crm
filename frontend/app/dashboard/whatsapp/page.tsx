"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getWaStatus, connectWa, disconnectWa } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<string>("loading");
  const [phone, setPhone] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getWaStatus();
      setStatus(data.status || "disconnected");
      if (data.phone) setPhone(data.phone);
      if (data.qr) {
        setQrCode(data.qr);
        setConnecting(false);
      }
      if (data.status === "connected") {
        setQrCode(null);
        setConnecting(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll when connecting or waiting for QR
  useEffect(() => {
    if (connecting || status === "qr" || status === "waiting_qr" || status === "connecting") {
      pollRef.current = setInterval(fetchStatus, 2000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connecting, status, fetchStatus]);

  async function handleConnect() {
    setConnecting(true);
    setError("");
    setQrCode(null);
    try {
      await connectWa();
      // Polling will pick up the QR
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectWa();
      setStatus("disconnected");
      setQrCode(null);
      setPhone("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
      </div>
    );
  }

  const isConnected = status === "connected";

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">WhatsApp Connection</h1>

      <div className="card max-w-xl">
        {/* Status */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-4 h-4 rounded-full ${isConnected ? "bg-[#25D366]" : "bg-red-500"}`} />
          <div>
            <p className="text-white font-medium">
              {isConnected ? "Connected" : status === "qr" || status === "waiting_qr" ? "Waiting for scan..." : "Disconnected"}
            </p>
            {isConnected && phone && <p className="text-sm text-slate-400">{phone}</p>}
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
            <p className="text-xs text-yellow-500 mt-1">
              Scan quickly - QR refreshes every 30 seconds
            </p>
          </div>
        )}

        {/* Connecting spinner */}
        {connecting && !qrCode && (
          <div className="flex items-center gap-3 mb-6 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
            <span>Generating QR code...</span>
          </div>
        )}

        {/* Actions */}
        {isConnected ? (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
          >
            Disconnect WhatsApp
          </button>
        ) : !qrCode ? (
          <button onClick={handleConnect} disabled={connecting} className="btn-wa">
            {connecting ? "Connecting..." : "Connect WhatsApp"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
