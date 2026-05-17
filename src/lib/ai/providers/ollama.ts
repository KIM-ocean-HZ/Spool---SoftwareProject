import { ProviderError, type Provider } from './types';

export const createOllamaProvider = (endpoint: string, model: string): Provider => ({
  name: 'ollama',
  async call(prompt, opts = {}) {
    const url = `${endpoint.replace(/\/$/, '')}/api/chat`;
    const res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
        options: { temperature: opts.temperature ?? 0.7 },
        ...(opts.json ? { format: 'json' } : {}),
      }),
    });
    if (!res.ok) {
      throw new ProviderError('ollama', res.status, await res.text());
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  },
});

export const listOllamaModels = async (
  endpoint: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  const url = `${endpoint.replace(/\/$/, '')}/api/tags`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new ProviderError('ollama', res.status, 'tags failed');
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
};
