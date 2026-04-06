"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getConversations, getMessages, sendWaMessage } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface Conversation {
  contactId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  timestamp: string;
  fromBot?: boolean;
}

export default function ChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConvo = conversations.find((c) => c.contactId === selectedId);

  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      setConversations(data);
    } catch {
      // ignore
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    getMessages(selectedId)
      .then((data) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleMessage(msg: { contactId: string; message: Message }) {
      // Update messages if viewing this conversation
      if (msg.contactId === selectedId) {
        setMessages((prev) => [...prev, msg.message]);
      }
      // Refresh conversation list
      loadConversations();
    }

    socket.on("wa:message", handleMessage);
    return () => {
      socket.off("wa:message", handleMessage);
    };
  }, [selectedId, loadConversations]);

  async function handleSend() {
    if (!input.trim() || !selectedConvo) return;
    setSending(true);
    try {
      await sendWaMessage(selectedConvo.contactPhone, input.trim());
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          direction: "outbound",
          body: input.trim(),
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput("");
      loadConversations();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      {/* Left panel - conversations */}
      <div className="w-80 border-r border-slate-700 bg-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Chats</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((convo) => (
              <button
                key={convo.contactId}
                onClick={() => setSelectedId(convo.contactId)}
                className={`w-full text-left px-4 py-3 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors ${
                  selectedId === convo.contactId ? "bg-slate-700" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-white text-sm truncate">
                    {convo.contactName || convo.contactPhone}
                  </span>
                  {convo.unread > 0 && (
                    <span className="bg-[#25D366] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                      {convo.unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">{convo.lastMessage}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel - messages */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select a conversation to start chatting
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-slate-700 bg-slate-800">
              <h3 className="font-semibold text-white">
                {selectedConvo?.contactName || selectedConvo?.contactPhone}
              </h3>
              <p className="text-xs text-slate-400">{selectedConvo?.contactPhone}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-500 text-sm">No messages yet</div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                        msg.direction === "outbound"
                          ? "bg-[#25D366] text-white rounded-br-sm"
                          : "bg-slate-700 text-slate-100 rounded-bl-sm"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] opacity-60">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {msg.fromBot && (
                          <span className="text-[10px] opacity-60">BOT</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send input */}
            <div className="px-4 py-3 border-t border-slate-700 bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="input-dark flex-1"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="btn-wa px-5"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
