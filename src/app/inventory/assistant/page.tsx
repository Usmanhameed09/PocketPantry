"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, Send, Sparkles, Trash2, Bot, User } from "lucide-react";
import { PAGE_BG, CARD, pageContainer } from "../ui";

type ChatMessage = { role: "user" | "assistant"; content: string; ts: string };

const SUGGESTED_PROMPTS = [
  { label: "What should I remove?", q: "Which products should I consider removing from the catalog? Look at sales velocity and margins." },
  { label: "Top performers this week", q: "Show me the top 10 best-selling products this week with their velocity and margin." },
  { label: "Where to place a new product?", q: "If I introduce a new energy drink targeting office workers, which machines should I put it in first based on current demographics and what's selling there?" },
  { label: "Velocity spikes & declines", q: "What products are spiking or declining in sales this week vs last? Should I take any action?" },
  { label: "Which machines need restocking?", q: "Which machines are running low or need attention soon based on current stock and sales rate?" },
  { label: "Category mix balance", q: "Is my category mix (Snacks/Drinks/Meals/Health) balanced based on sales? What should I add or remove to balance?" },
];

/* Simple markdown renderer — bold, italic, bullets, headers */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      out.push(
        <ul key={`ul-${out.length}`} style={{ margin: "6px 0", paddingLeft: 22 }}>
          {bulletBuffer.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{renderInline(b)}</li>)}
        </ul>
      );
      bulletBuffer = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushBullets();
    if (/^###\s+/.test(trimmed)) {
      out.push(<h4 key={i} style={{ margin: "10px 0 4px", fontSize: 14, fontWeight: 700 }}>{renderInline(trimmed.replace(/^###\s+/, ""))}</h4>);
    } else if (/^##\s+/.test(trimmed)) {
      out.push(<h3 key={i} style={{ margin: "12px 0 6px", fontSize: 15, fontWeight: 700 }}>{renderInline(trimmed.replace(/^##\s+/, ""))}</h3>);
    } else if (trimmed) {
      out.push(<p key={i} style={{ margin: "4px 0", lineHeight: 1.55 }}>{renderInline(trimmed)}</p>);
    }
  }
  flushBullets();
  return out;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text** and code `text`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const bold = /\*\*([^*]+)\*\*/.exec(remaining);
    const code = /`([^`]+)`/.exec(remaining);
    const next = [bold, code].filter(Boolean).sort((a, b) => (a!.index - b!.index))[0];
    if (!next) { parts.push(remaining); break; }
    if (next.index > 0) parts.push(remaining.slice(0, next.index));
    if (next === bold) {
      parts.push(<strong key={key++}>{next[1]}</strong>);
    } else if (next === code) {
      parts.push(<code key={key++} style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>{next[1]}</code>);
    }
    remaining = remaining.slice(next.index + next[0].length);
  }
  return parts;
}

export default function AssistantPage() {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<{ productsTracked: number; productsWithSales: number } | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setError(null);
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: q, ts: new Date().toISOString() };
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);

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
      setMessages((cur) => [...cur, reply]);
      if (data.snapshotMeta) setSnapshotMeta(data.snapshotMeta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Assistant" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        {/* Snapshot stats banner */}
        <div style={{
          ...CARD, padding: 14, marginBottom: 16, background: "#ede9fe",
          border: "1px solid #ddd6fe", display: "flex", alignItems: "center", gap: 10,
        }}>
          <Sparkles size={20} color="#6366f1" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3730a3" }}>
              AI-powered inventory advisor
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {snapshotMeta
                ? `Live snapshot: ${snapshotMeta.productsTracked} products tracked, ${snapshotMeta.productsWithSales} with sales velocity.`
                : "Ask anything about your inventory, sales trends, or product decisions."}
            </div>
          </div>
        </div>

        {/* Chat history */}
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div
            ref={scrollRef}
            style={{
              minHeight: 360, maxHeight: isMobile ? 380 : 520, overflowY: "auto",
              padding: messages.length > 0 ? 16 : 0,
            }}
          >
            {messages.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <Bot size={36} color="#94a3b8" style={{ marginBottom: 10 }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  Start a conversation
                </h3>
                <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
                  Try one of these prompts or type your own question 👇
                </p>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 8, maxWidth: 600, margin: "0 auto",
                }}>
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => send(p.q)}
                      style={{
                        padding: "12px 14px", textAlign: "left",
                        background: "#fff", border: "1px solid #d5d9e2", borderRadius: 10,
                        fontSize: 13, color: "#0f172a", cursor: "pointer",
                        transition: "all 0.15s", lineHeight: 1.4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#16a34a"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#d5d9e2"; }}
                    >
                      <span style={{ display: "block", fontWeight: 600, color: "#15803d", marginBottom: 2 }}>
                        {p.label}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{p.q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, marginBottom: 16,
                flexDirection: m.role === "user" ? "row-reverse" : "row",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, flexShrink: 0,
                  background: m.role === "user" ? "#dcfce7" : "#ede9fe",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {m.role === "user" ? <User size={16} color="#15803d" /> : <Bot size={16} color="#6366f1" />}
                </div>
                <div style={{
                  maxWidth: "85%",
                  background: m.role === "user" ? "#16a34a" : "#f8fafc",
                  color: m.role === "user" ? "#fff" : "#0f172a",
                  padding: "10px 14px", borderRadius: 12,
                  fontSize: 14, lineHeight: 1.5,
                  border: m.role === "user" ? "none" : "1px solid #e2e8f0",
                }}>
                  {m.role === "user" ? m.content : renderMarkdown(m.content)}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: "#ede9fe",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bot size={16} color="#6366f1" />
                </div>
                <div style={{
                  background: "#f8fafc", padding: "10px 14px", borderRadius: 12,
                  display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13,
                  border: "1px solid #e2e8f0",
                }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, background: "#fef2f2",
                color: "#dc2626", border: "1px solid #fecaca", fontSize: 13, margin: "12px 0",
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div style={{
            borderTop: "1px solid #e2e8f0", padding: 12, background: "#f8fafc",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError(null); }}
                title="Clear chat"
                style={{
                  padding: 10, background: "transparent", border: "none", cursor: "pointer", color: "#64748b",
                  display: "inline-flex", alignItems: "center",
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <input
              type="text"
              placeholder={messages.length === 0 ? "Ask a question…" : "Follow up…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={sending}
              style={{
                flex: 1, padding: "12px 16px", border: "1px solid #d5d9e2", borderRadius: 10,
                fontSize: 14, outline: "none", background: "#fff",
              }}
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              style={{
                padding: "12px 18px",
                background: input.trim() && !sending ? "#16a34a" : "#e2e8f0",
                color: input.trim() && !sending ? "#fff" : "#94a3b8",
                border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {sending ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
