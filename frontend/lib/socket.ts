"use client";
import { io, Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8097";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (socket) return socket;

  const token = localStorage.getItem("crm_token");
  if (!token) return null;

  socket = io(WS_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => console.log("[WS] Connected"));
  socket.on("disconnect", () => console.log("[WS] Disconnected"));

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
