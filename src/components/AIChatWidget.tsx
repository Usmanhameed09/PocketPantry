"use client";

/**
 * Floating AI chat widget — bottom-right of every authenticated page.
 *
 * Quick-access shortcut so the operator can ask "how much did today sell?"
 * without navigating away from whatever page they're on. Calls the same
 * /api/inventory/assistant endpoint as the full /inventory/assistant page,
 * so the system prompt + snapshot data are identical.
 *
 * Conversation state lives in this component (not the global app). Closing
 * the panel preserves messages until the page is reloaded.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, X, Bot, Loader2, Maximize2, Trash2 } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string; ts: string };

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore prior chat from sessionStorage so toggling the panel doesn't
  // lose context.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("aiChatWidget");
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* sessionStorage unavailable */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("aiChatWidget", JSON.stringify(messages)); } catch {}
  }, [messages]);

  // Auto-scroll to the newest message when one arrives or panel opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages, open, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: q, ts: new Date().toISOString() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Assistant failed");
      const reply: ChatMessage = { role: "assistant", content: data.reply, ts: new Date().toISOString() };
      setMessages((prev) => [...prev, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
    try { sessionStorage.removeItem("aiChatWidget"); } catch {}
  }

  return (
    <>
      {/* Floating launcher — visible only when the panel is closed so it
          doesn't sit on top of the chat itself */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 1000,
            width: 56, height: 56, borderRadius: 28,
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            color: "#fff", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 18px rgba(22,163,74,0.4), 0 2px 6px rgba(0,0,0,0.15)",
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <MessageCircle size={26} />
        </button>
      )}

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 24, right: 24, zIndex: 1000,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 48px))",
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            boxShadow: "0 16px 40px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.08)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 16px",
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>PocketPantry AI</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Ask about sales, inventory, machines…</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  aria-label="Clear conversation"
                  title="Clear chat"
                  style={iconBtn}
                ><Trash2 size={14} /></button>
              )}
              <Link
                href="/inventory/assistant"
                aria-label="Open full chat page"
                title="Open in full page"
                style={iconBtn}
              ><Maximize2 size={14} /></Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={iconBtn}
              ><X size={16} /></button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: "auto", padding: 12,
            background: "#f8fafc",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {messages.length === 0 && (
              <div style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                padding: 14, fontSize: 13, color: "#475569", lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Hi 👋</div>
                Try asking:
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#64748b" }}>
                  <li>What&apos;s today&apos;s revenue?</li>
                  <li>Top sellers this week?</li>
                  <li>What needs refilling?</li>
                  <li>What&apos;s in this week&apos;s buy list?</li>
                </ul>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "user" ? "#16a34a" : "#fff",
                color: m.role === "user" ? "#fff" : "#0f172a",
                border: m.role === "user" ? "none" : "1px solid #e2e8f0",
                padding: "8px 12px", borderRadius: 12,
                fontSize: 13, lineHeight: 1.45,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{
                alignSelf: "flex-start",
                background: "#fff", border: "1px solid #e2e8f0",
                padding: "8px 12px", borderRadius: 12,
                color: "#64748b", fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Thinking…
              </div>
            )}
            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#991b1b", padding: "8px 12px", borderRadius: 8, fontSize: 12,
              }}>{error}</div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: 10, borderTop: "1px solid #e2e8f0", background: "#fff",
            display: "flex", gap: 6,
          }}>
            <input
              type="text"
              placeholder="Ask anything about your data…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              disabled={busy}
              style={{
                flex: 1, padding: "8px 12px", fontSize: 13,
                border: "1px solid #d5d9e2", borderRadius: 10,
                outline: "none", color: "#0f172a", background: "#fff",
              }}
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              aria-label="Send"
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: input.trim() && !busy ? "#16a34a" : "#cbd5e1",
                color: "#fff", border: "none",
                cursor: input.trim() && !busy ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            ><Send size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  background: "rgba(255,255,255,0.15)",
  border: "none", color: "#fff", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  textDecoration: "none",
};
