import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToastStore, type Toast } from '@/stores/toastStore';
import { t } from '@/lib/i18n';

// In-window toast rack (PLAN_EN.md §14.4). Rendered once at the App root; toasts
// auto-dismiss after a few seconds. Bottom-right anchored so it never overlaps the
// thread header or the composer; capture confirmations live in the *overlay* window
// (top-right) and the two surfaces don't fight for the same pixels.
export default function ToastRack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const clear = useToastStore((s) => s.clear);

  // Esc dismisses any showing toasts (§14.1). Listener is only mounted while a
  // toast exists, so it never shadows other Esc handlers when the rack is empty.
  useEffect(() => {
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts.length, clear]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-1.5">
      {toasts.map((item) => (
        <ToastItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>
  );
}

// DESIGN_AI_ENGINE §1.3: one line, and a 详情 disclosure when there is a body worth
// reading (the CLI's own error text). Collapsed by default — a failed AI run must not
// dump a stack trace over the corner of the window.
function ToastItem({ item, onDismiss }: { item: Toast; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const isError = item.kind === 'error';
  const act = (): void => {
    item.action?.run();
    onDismiss();
  };
  return (
    <div
      className="pointer-events-auto flex max-w-[360px] items-start gap-2 rounded-md border bg-paper px-3 py-2 text-xs"
      style={{
        boxShadow: 'var(--shadow-toast)',
        borderColor: isError ? 'var(--urgent)' : 'var(--line-strong)',
        color: isError ? 'var(--urgent)' : 'var(--ink)',
      }}
      role={isError ? 'alert' : 'status'}
    >
      <div className="min-w-0 flex-1">
        <span className="block break-words font-ui leading-[1.5]">{item.message}</span>
        {item.detail && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1 text-[11px] text-muted underline-offset-2 hover:underline"
            >
              {open ? t('收起详情') : t('详情')}
            </button>
            {open && (
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-paper-2 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
                {item.detail}
              </pre>
            )}
          </>
        )}
      </div>
      {/* The way back sits ON the toast, not behind a dialog: the toast is the only moment
          the user is still looking at what just happened. */}
      {item.action && (
        <button
          type="button"
          onClick={act}
          className="flex-none rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="flex-none rounded p-0.5 text-muted hover:text-ink"
        aria-label={t('关闭')}
      >
        <X size={11} />
      </button>
    </div>
  );
}
