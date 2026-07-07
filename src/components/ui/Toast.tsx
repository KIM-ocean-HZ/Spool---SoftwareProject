import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useToastStore } from '@/stores/toastStore';
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
      {toasts.map((item) => {
        const isError = item.kind === 'error';
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex max-w-[360px] items-start gap-2 rounded-md border bg-paper px-3 py-2 text-xs"
            style={{
              boxShadow: 'var(--shadow-toast)',
              borderColor: isError ? 'var(--urgent)' : 'var(--line-strong)',
              color: isError ? 'var(--urgent)' : 'var(--ink)',
            }}
            role={isError ? 'alert' : 'status'}
          >
            <span className="min-w-0 flex-1 break-words font-ui leading-[1.5]">
              {item.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="flex-none rounded p-0.5 text-muted hover:text-ink"
              aria-label={t('关闭')}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
