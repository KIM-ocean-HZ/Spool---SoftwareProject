import { useEffect, useState } from 'react';
import { router } from '@/lib/ai/router';
import { buildDigestPrompt } from '@/lib/ai/prompts/summarizeDigest';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { isAiAvailable, useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

interface Props {
  thread: Thread;
  blocks: readonly Block[];
  onClose: () => void;
}

// Thread completion (PLAN_EN.md §9.8). A modal-style panel, not a full screen. The
// handwritten one-line conclusion is the primary path; "让 AI 总结" is an optional
// convenience that prefills a draft (§11.4). Completing with an empty conclusion is
// allowed — and correct (§9.8). Completion must work whether the AI button is
// disabled, never clicked, or failed.
export default function CompleteThreadPanel({ thread, blocks, onClose }: Props) {
  const patch = useThreadsStore((s) => s.patch);
  const aiAvailable = useSettingsStore(isAiAvailable);
  const [conclusion, setConclusion] = useState('');
  // 'failed' covers both an error and a NO_DIGEST response — both silently disable
  // the button for this thread, with no popup (§11.4 + §12.4).
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'failed'>('idle');

  const pinnedBlocks = blocks.filter((b) => b.pinned);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleComplete = async (): Promise<void> => {
    await patch(thread.id, {
      status: 'done',
      completedAt: Date.now(),
      digest: conclusion.trim() || null,
    });
    onClose();
  };

  // §6.3 / §18 rule 9: the degradation path comes first. Any failure — error,
  // NO_DIGEST — silently disables the button; the handwritten path stays primary.
  const handleAiSummary = async (): Promise<void> => {
    if (pinnedBlocks.length === 0 || aiState !== 'idle') return;
    setAiState('loading');
    try {
      const { text } = await router.quality(buildDigestPrompt(thread, pinnedBlocks));
      const trimmed = text.trim();
      if (trimmed === '' || trimmed === 'NO_DIGEST') {
        setAiState('failed');
        return;
      }
      setConclusion(trimmed);
      setAiState('idle');
    } catch {
      setAiState('failed');
    }
  };

  const aiDisabled = pinnedBlocks.length === 0 || aiState !== 'idle';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-8"
      onClick={onClose}
    >
      <div
        className="w-[440px] rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <p className="font-serif text-lg text-ink">这个项目结束了。</p>
          <p className="mt-0.5 text-sm text-muted">要不要加一段结论？</p>

          <textarea
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            autoFocus
            rows={3}
            placeholder="一句话写下这个项目的结论…（可以留空）"
            className="mt-3 w-full resize-none rounded border border-line-strong bg-paper px-2.5 py-2 font-ui text-sm leading-[1.6] text-ink outline-none focus:border-accent"
            spellCheck={false}
          />

          {aiAvailable && (
            <button
              type="button"
              onClick={() => void handleAiSummary()}
              disabled={aiDisabled}
              title={
                pinnedBlocks.length === 0
                  ? '先给重要的信息块加上置顶标记'
                  : '从置顶的信息块生成一段结论草稿'
              }
              className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:text-muted/60"
            >
              {aiState === 'loading' ? '总结中…' : '让 AI 总结'}
            </button>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-ink-2 transition-colors hover:border-line-strong"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleComplete()}
            className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-accent transition-colors hover:bg-accent/20"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
