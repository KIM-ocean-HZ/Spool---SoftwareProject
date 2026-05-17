interface Entry {
  value: string;
  expiresAt: number;
}

const MAX = 100;
const cache = new Map<string, Entry>();

const sha256 = async (s: string): Promise<string> => {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const cacheGet = async (prompt: string): Promise<string | null> => {
  const key = await sha256(prompt);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // bump LRU recency
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
};

export const cacheSet = async (
  prompt: string,
  value: string,
  ttlMs: number = 5 * 60_000,
): Promise<void> => {
  const key = await sha256(prompt);
  if (cache.size >= MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const cacheClear = (): void => {
  cache.clear();
};
