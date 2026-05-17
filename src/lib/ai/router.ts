import { useSettingsStore } from '@/stores/settingsStore';
import { cacheGet, cacheSet } from './cache';
import { createGeminiProvider } from './providers/gemini';
import { createGroqProvider } from './providers/groq';
import { createOllamaProvider } from './providers/ollama';
import type { Provider, Tier } from './providers/types';

const TIMEOUT_MS: Record<Tier, number> = {
  fast: 5_000,
  quality: 20_000,
  local: 30_000,
};

// Plan §3.2 路由表
const FALLBACK: Record<Tier, Tier[]> = {
  fast: ['fast', 'quality', 'local'],
  quality: ['quality', 'fast', 'local'],
  local: ['local'],
};

const buildProvider = (tier: Tier): Provider | null => {
  const s = useSettingsStore.getState();
  if (s.privacyMode) {
    return createOllamaProvider(s.ollamaEndpoint, s.ollamaModel);
  }
  switch (tier) {
    case 'fast':
      return s.groqKey ? createGroqProvider(s.groqKey) : null;
    case 'quality':
      return s.geminiKey ? createGeminiProvider(s.geminiKey) : null;
    case 'local':
      return createOllamaProvider(s.ollamaEndpoint, s.ollamaModel);
  }
};

const callWithTimeout = async (
  provider: Provider,
  prompt: string,
  timeoutMs: number,
  external: AbortSignal | undefined,
  json: boolean,
  maxTokens: number | undefined,
): Promise<string> => {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await provider.call(prompt, { signal: ctrl.signal, json, maxTokens });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
};

export interface RouteOptions {
  signal?: AbortSignal;
  json?: boolean;
  cache?: boolean;
  ttlMs?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface RouteResult {
  text: string;
  tier: Tier;
}

const route = async (
  primary: Tier,
  prompt: string,
  opts: RouteOptions = {},
): Promise<RouteResult> => {
  if (opts.cache) {
    const hit = await cacheGet(prompt);
    if (hit) return { text: hit, tier: primary };
  }

  const errors: string[] = [];
  for (const tier of FALLBACK[primary]) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const provider = buildProvider(tier);
    if (!provider) {
      errors.push(`${tier}: no key`);
      continue;
    }
    try {
      const text = await callWithTimeout(
        provider,
        prompt,
        opts.timeoutMs ?? TIMEOUT_MS[tier],
        opts.signal,
        opts.json ?? false,
        opts.maxTokens,
      );
      if (opts.cache) await cacheSet(prompt, text, opts.ttlMs);
      return { text, tier };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError' && opts.signal?.aborted) {
        throw e;
      }
      errors.push(`${tier}: ${(e as Error).message}`);
    }
  }
  throw new Error(`all providers failed -> ${errors.join(' | ')}`);
};

export const router = {
  fast: (prompt: string, opts?: RouteOptions) => route('fast', prompt, opts),
  quality: (prompt: string, opts?: RouteOptions) => route('quality', prompt, opts),
  local: (prompt: string, opts?: RouteOptions) => route('local', prompt, opts),
};

export const callTier = async (
  tier: Tier,
  prompt: string,
  opts?: RouteOptions,
): Promise<string> => {
  const provider = buildProvider(tier);
  if (!provider) throw new Error(`${tier}: no provider configured`);
  return callWithTimeout(
    provider,
    prompt,
    opts?.timeoutMs ?? TIMEOUT_MS[tier],
    opts?.signal,
    opts?.json ?? false,
    opts?.maxTokens,
  );
};
