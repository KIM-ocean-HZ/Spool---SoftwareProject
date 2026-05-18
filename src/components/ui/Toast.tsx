import { X } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';

// In-window toast rack (PLAN_EN.md §14.4). Rendered once at the App root; toasts
// auto-dismiss after a few seconds. Bottom-right anchored so it never overlaps the
// thread header or the composer; capture confirmations live in the *overlay* window
// (top-right) and the two surfaces don't fight for the same pixels.
export default function ToastRack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-1.5">
      {toasts.map((t) => {
        const isError = t.kind === 'error';
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[360px] items-start gap-2 rounded-md border bg-paper px-3 py-2 text-xs"
            style={{
              boxShadow: 'var(--shadow-toast)',
              borderColor: isError ? 'var(--urgent)' : 'var(--line-strong)',
              color: isError ? 'var(--urgent)' : 'var(--ink)',
            }}
            role={isError ? 'alert' : 'status'}
          >
            <span className="min-w-0 flex-1 break-words font-ui leading-[1.5]">
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="flex-none rounded p-0.5 text-muted hover:text-ink"
              aria-label="关闭"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
