/**
 * OpenAI chat-completions call with retry-on-429/5xx + backoff.
 *
 * Rapid-fire questions (a demo asking several things quickly) blow the org's
 * tokens-per-minute limit; OpenAI returns 429 and the route would otherwise
 * surface a 502. Retrying after a short wait lets the burst succeed instead of
 * failing. Honors the Retry-After header when present, else exponential backoff.
 */
export async function openAiChat(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (res.ok || attempt >= MAX_RETRIES || (res.status !== 429 && res.status < 500)) {
      return res;
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 12_000)
      : Math.min(2_000 * 2 ** attempt, 12_000); // 2s, 4s, 8s
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
