import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { createGeminiProvider } from '@/lib/ai/providers/gemini';
import { createGroqProvider } from '@/lib/ai/providers/groq';
import type { Provider } from '@/lib/ai/providers/types';
import { useSettingsStore } from '@/stores/settingsStore';

// AI service settings (PLAN_EN.md §9.12): the two online API keys with a live test,
// the local Ollama endpoint + model, and the privacy-mode toggle.

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

const testLabel = (s: TestState): string =>
  s === 'testing' ? '测试中…' : s === 'ok' ? '✓ 有效' : s === 'fail' ? '✗ 无效' : '测试';

const inputCls =
  'min-w-0 flex-1 rounded border border-line-strong bg-paper px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent';

export default function AiConfig() {
  const groqKey = useSettingsStore((s) => s.groqKey);
  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const ollamaEndpoint = useSettingsStore((s) => s.ollamaEndpoint);
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);
  const ollamaModels = useSettingsStore((s) => s.ollamaModels);
  const privacyMode = useSettingsStore((s) => s.privacyMode);
  const update = useSettingsStore((s) => s.update);
  const detectOllama = useSettingsStore((s) => s.detectOllama);

  const [groqDraft, setGroqDraft] = useState(groqKey);
  const [geminiDraft, setGeminiDraft] = useState(geminiKey);
  const [endpointDraft, setEndpointDraft] = useState(ollamaEndpoint);
  const [groqTest, setGroqTest] = useState<TestState>('idle');
  const [geminiTest, setGeminiTest] = useState<TestState>('idle');

  useEffect(() => setGroqDraft(groqKey), [groqKey]);
  useEffect(() => setGeminiDraft(geminiKey), [geminiKey]);
  useEffect(() => setEndpointDraft(ollamaEndpoint), [ollamaEndpoint]);
  // Refresh the detected model list each time the panel opens.
  useEffect(() => {
    void detectOllama();
  }, [detectOllama]);

  const runTest = async (
    provider: Provider,
    set: (s: TestState) => void,
  ): Promise<void> => {
    set('testing');
    try {
      await provider.call('hi', { maxTokens: 1 });
      set('ok');
    } catch {
      set('fail');
    }
  };

  const commitEndpoint = (): void => {
    const trimmed = endpointDraft.trim();
    if (trimmed && trimmed !== ollamaEndpoint) {
      void update({ ollamaEndpoint: trimmed }).then(() => detectOllama());
    }
  };

  return (
    <div className="space-y-3.5">
      <div>
        <div className="text-sm text-ink">Groq API Key</div>
        <div className="mt-0.5 text-xs text-muted">console.groq.com · 用于捕捉分类</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="password"
            value={groqDraft}
            onChange={(e) => {
              setGroqDraft(e.target.value);
              setGroqTest('idle');
            }}
            onBlur={() => {
              if (groqDraft !== groqKey) void update({ groqKey: groqDraft });
            }}
            placeholder="gsk_…"
            className={inputCls}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void runTest(createGroqProvider(groqDraft), setGroqTest)}
            disabled={!groqDraft.trim() || groqTest === 'testing'}
            className="flex-none rounded border border-line-strong bg-paper px-2.5 py-1.5 text-xs text-ink-2 transition-colors enabled:hover:border-accent disabled:opacity-50"
          >
            {testLabel(groqTest)}
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm text-ink">Gemini API Key</div>
        <div className="mt-0.5 text-xs text-muted">aistudio.google.com · 用于状态/结论摘要</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="password"
            value={geminiDraft}
            onChange={(e) => {
              setGeminiDraft(e.target.value);
              setGeminiTest('idle');
            }}
            onBlur={() => {
              if (geminiDraft !== geminiKey) void update({ geminiKey: geminiDraft });
            }}
            placeholder="AIza…"
            className={inputCls}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void runTest(createGeminiProvider(geminiDraft), setGeminiTest)}
            disabled={!geminiDraft.trim() || geminiTest === 'testing'}
            className="flex-none rounded border border-line-strong bg-paper px-2.5 py-1.5 text-xs text-ink-2 transition-colors enabled:hover:border-accent disabled:opacity-50"
          >
            {testLabel(geminiTest)}
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm text-ink">Ollama 端点</div>
        <input
          type="text"
          value={endpointDraft}
          onChange={(e) => setEndpointDraft(e.target.value)}
          onBlur={commitEndpoint}
          placeholder="http://localhost:11434"
          className="mt-1.5 w-full rounded border border-line-strong bg-paper px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
          spellCheck={false}
        />
      </div>

      <div>
        <div className="text-sm text-ink">Ollama 模型</div>
        {ollamaModels.length > 0 ? (
          <select
            value={ollamaModels.includes(ollamaModel) ? ollamaModel : ''}
            onChange={(e) => void update({ ollamaModel: e.target.value })}
            className="mt-1.5 w-full rounded border border-line-strong bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          >
            {!ollamaModels.includes(ollamaModel) && (
              <option value="" disabled>
                选择模型
              </option>
            )}
            {ollamaModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1.5 text-xs text-muted">未检测到本地模型 — 确认 Ollama 正在运行</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 pt-0.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">隐私模式</div>
          <div className="mt-0.5 text-xs text-muted">所有 AI 仅走本地；无本地模型时入口隐藏</div>
        </div>
        <Toggle checked={privacyMode} onChange={(v) => void update({ privacyMode: v })} />
      </div>
    </div>
  );
}
