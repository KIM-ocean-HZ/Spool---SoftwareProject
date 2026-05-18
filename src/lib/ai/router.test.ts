import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { router } from './router';

// Provider modules are mocked so the fallback chain can be exercised without keys
// or network. vi.hoisted lets the mock factories reference these shared spies.
const { groqCall, geminiCall, ollamaCall } = vi.hoisted(() => ({
  groqCall: vi.fn(),
  geminiCall: vi.fn(),
  ollamaCall: vi.fn(),
}));

vi.mock('@/lib/ai/providers/groq', () => ({
  createGroqProvider: () => ({ name: 'groq', call: groqCall }),
}));
vi.mock('@/lib/ai/providers/gemini', () => ({
  createGeminiProvider: () => ({ name: 'gemini', call: geminiCall }),
}));
vi.mock('@/lib/ai/providers/ollama', () => ({
  createOllamaProvider: () => ({ name: 'ollama', call: ollamaCall }),
  listOllamaModels: vi.fn(async () => []),
}));

describe('router fallback', () => {
  beforeEach(() => {
    groqCall.mockReset();
    geminiCall.mockReset();
    ollamaCall.mockReset();
    // Quality has a key; fast (groq) has none, so it is skipped on fallthrough,
    // isolating the Quality → Local step.
    useSettingsStore.setState({
      privacyMode: false,
      groqKey: '',
      geminiKey: 'gemini-key',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'qwen3:8b',
    });
  });

  it('returns the quality result directly when the primary tier succeeds', async () => {
    geminiCall.mockResolvedValue('quality output');
    const res = await router.quality('prompt');
    expect(res).toEqual({ text: 'quality output', tier: 'quality' });
    expect(ollamaCall).not.toHaveBeenCalled();
  });

  it('falls through to Local when Quality fails', async () => {
    geminiCall.mockRejectedValue(new Error('429 rate limit'));
    ollamaCall.mockResolvedValue('local output');
    const res = await router.quality('prompt');
    expect(res).toEqual({ text: 'local output', tier: 'local' });
    expect(geminiCall).toHaveBeenCalled();
  });

  it('throws a clean error (no unhandled rejection) when every tier fails', async () => {
    geminiCall.mockRejectedValue(new Error('500'));
    ollamaCall.mockRejectedValue(new Error('connection refused'));
    await expect(router.quality('prompt')).rejects.toThrow(/all providers failed/);
  });
});
