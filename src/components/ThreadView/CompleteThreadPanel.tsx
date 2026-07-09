import { useEffect, useState } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import type { Thread } from '@/lib/db/threads';
import { useThreadsStore } from '@/stores/threadsStore';
import { useT } from '@/lib/i18n';

interface Props {
  thread: Thread;
  onClose: () => void;
}

// Thread completion (PLAN_EN.md §9.8). A modal-style panel, not a full screen. The
// handwritten one-line conclusion is the whole path; completing with an empty
// conclusion is allowed — and correct (§9.8).
export default function CompleteThreadPanel({ thread, onClose }: Props) {
  const t = useT();
  const patch = useThreadsStore((s) => s.patch);
  const [conclusion, setConclusion] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc during an IME composition (in the conclusion textarea) only cancels the
      // composition — it must not close the panel and drop the draft.
      if (isImeComposing(e)) return;
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
          <p className="font-serif text-lg text-ink">{t('这个项目结束了。')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('要不要加一段结论？')}</p>

          <textarea
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            autoFocus
            rows={3}
            placeholder={t('一句话写下这个项目的结论…（可以留空）')}
            className="mt-3 w-full resize-none rounded border border-line-strong bg-paper px-2.5 py-2 font-ui text-sm leading-[1.6] text-ink outline-none focus:border-accent"
            spellCheck={false}
          />

        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-ink-2 transition-colors hover:border-line-strong"
          >
            {t('取消')}
          </button>
          <button
            type="button"
            onClick={() => void handleComplete()}
            className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-accent transition-colors hover:bg-accent/20"
          >
            {t('完成')}
          </button>
        </footer>
      </div>
    </div>
  );
}
