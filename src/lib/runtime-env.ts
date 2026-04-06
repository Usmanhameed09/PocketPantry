function normalizeValue(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

export function readEnv(name: string, fallbacks: string[] = []) {
  const candidates = [name, ...fallbacks];

  for (const candidate of candidates) {
    const value = normalizeValue(process.env[candidate]);
    if (value) {
      return value;
    }
  }

  return "";
}

