import { useCallback, useEffect, useState } from "react";

/**
 * Shared chat logic for the ONE unified assistant. Both the full AI Assistant
 * page and the floating chat widget use this hook, so they hit the same
 * endpoint with identical request/response behavior and can never diverge.
 *
 * Pass a persistKey to keep the conversation in sessionStorage (the widget
 * uses this so the chat survives page navigation).
 */
export type AssistantMessage = { role: "user" | "assistant"; content: string; ts: string };

// The single unified assistant endpoint (tool-calling agent). v1 was removed.
const ASSISTANT_ENDPOINT = "/api/inventory/assistant-v2";

export function useAssistantChat(opts?: { persistKey?: string }) {
  const persistKey = opts?.persistKey;
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    if (!persistKey || typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as AssistantMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(persistKey, JSON.stringify(messages));
    } catch {
      /* quota — non-fatal */
    }
  }, [messages, persistKey]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    setError(null);
    const userMsg: AssistantMessage = { role: "user", content: q, ts: new Date().toISOString() };
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch(ASSISTANT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Assistant failed");
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply, ts: new Date().toISOString() }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  }, [messages, sending]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    if (persistKey && typeof window !== "undefined") {
      try { sessionStorage.removeItem(persistKey); } catch { /* ignore */ }
    }
  }, [persistKey]);

  return { messages, sending, error, send, clear, setError };
}
