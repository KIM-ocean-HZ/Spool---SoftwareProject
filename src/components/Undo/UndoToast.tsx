import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UndoOpKind } from '@/lib/undo/undoLog';
import { useUndoStore } from '@/stores/undoStore';

// §9.13 / §13.2: feedback after a Cmd+Z (or capture-toast Undo). Same dimensions +
// animations as CaptureToast; bottom-right of the main window like the in-window toast
// rack. ~2.5s auto-dismiss, paused on hover. No "redo" action.
const AUTO_DISMISS_MS = 2500;

const KIND_LABEL: Record<UndoOpKind, string> = {
  capture: '已撤销:捕获',
  merge: '已撤销:合并',
  delete: '已撤销:删除',
  collect_send: '已撤销:暂存合并',
};

export default function UndoToast() {
  const undoToast = useUndoStore((s) => s.undoToast);
  const dismiss = useUndoStore((s) => s.dismissUndoToast);
  const [hover, setHover] = useState(false);

  // Auto-dismiss timer, re-armed on each new toast (id changes) and paused while hovered.
  useEffect(() => {
    if (!undoToast || hover) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [undoToast, hover, dismiss]);

  if (!undoToast) return null;

  const isEmpty = undoToast.kind === 'empty';
  const label = isEmpty ? '没有可撤销的操作' : KIND_LABEL[undoToast.kind];

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[110] flex justify-end">
      <div
        key={undoToast.id}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="undo-toast-in pointer-events-auto flex max-w-[360px] items-center gap-2 rounded-lg border border-line-strong bg-paper px-3.5 py-2.5 font-ui text-[13px] leading-snug text-ink"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        role="status"
      >
        <RotateCcw size={12} className="shrink-0 text-muted" />
        <span className={isEmpty ? 'text-muted' : 'text-ink'}>{label}</span>
        {!isEmpty && undoToast.preview && (
          <span className="min-w-0 truncate text-muted">
            <span className="text-muted/60">「</span>
            {undoToast.preview}
            <span className="text-muted/60">」</span>
          </span>
        )}
      </div>
    </div>
  );
}
