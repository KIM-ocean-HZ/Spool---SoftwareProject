import { ProviderError, type Provider } from './types';

const MODEL = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const createGeminiProvider = (apiKey: string): Provider => ({
  name: 'gemini',
  async call(prompt, opts = {}) {
    if (!apiKey) throw new ProviderError('gemini', 0, 'no api key');
    const url = `${BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxTokens ?? 4096,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!res.ok) {
      throw new ProviderError('gemini', res.status, await res.text());
    }
    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
    };
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.[0]?.text ?? '';
    const reason = cand?.finishReason;
    if (reason && reason !== 'STOP') {
      console.warn(`[gemini] finishReason=${reason} (output may be incomplete)`);
    }
    return text;
  },
});
