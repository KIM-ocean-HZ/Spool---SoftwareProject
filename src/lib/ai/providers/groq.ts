import { ProviderError, type Provider } from './types';

const URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export const createGroqProvider = (apiKey: string): Provider => ({
  name: 'groq',
  async call(prompt, opts = {}) {
    if (!apiKey) throw new ProviderError('groq', 0, 'no api key');
    const res = await fetch(URL, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2048,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      throw new ProviderError('groq', res.status, await res.text());
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0]?.message?.content ?? '';
  },
});
