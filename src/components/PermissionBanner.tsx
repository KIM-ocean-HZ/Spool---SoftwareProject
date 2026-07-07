import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

// Quiet onboarding bar (2026-07-07): without the macOS Input Monitoring grant the
// double-tap ⌥ CGEventTap only sees Spool's own events — capture works in-app and
// silently does nothing everywhere else (double_tap.rs module doc). Shown at the top
// of the main window while the grant is missing. A fresh grant only takes effect on
// the next launch, so when the re-check (on window focus, i.e. coming back from
// System Settings) sees it flip, the copy swaps to "restart Spool" instead of hiding.

type Phase = 'hidden' | 'denied' | 'granted-later';

export default function PermissionBanner() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('hidden');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const granted = await invoke<boolean>('input_monitoring_granted');
        if (cancelled) return;
        setPhase((prev) => {
          if (!granted) return 'denied';
          // Granted from the start → nothing to say; granted after we showed the
          // banner → the tap is still deaf until relaunch, say so.
          return prev === 'hidden' ? 'hidden' : 'granted-later';
        });
      } catch {
        // Non-Tauri context (tests / plain vite) — stay hidden.
      }
    };
    void check();
    const onFocus = (): void => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (dismissed || phase === 'hidden') return null;

  return (
    <div className="flex flex-none items-center gap-3 border-b border-line bg-paper-2 px-4 py-1.5 text-xs text-ink-2">
      <span className="min-w-0 flex-1 truncate">
        {phase === 'denied'
          ? t('双击 ⌥ 捕捉需要「输入监听」权限 — 授权后请重启 Spool')
          : t('已授权 — 重启 Spool 后双击 ⌥ 生效')}
      </span>
      {phase === 'denied' && (
        <button
          type="button"
          onClick={() => {
            void invoke('open_input_monitoring_settings').catch((e) =>
              console.warn('[permission] open settings failed', e),
            );
          }}
          className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {t('打开系统设置')}
        </button>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t('关闭')}
        className="flex-none text-muted transition-colors hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
