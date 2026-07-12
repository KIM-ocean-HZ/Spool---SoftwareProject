import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

// Quiet onboarding bar (2026-07-07): without the macOS Input Monitoring grant the
// double-tap ⌥ CGEventTap only sees Spool's own events — capture works in-app and
// silently does nothing everywhere else (double_tap.rs module doc). Shown at the top
// of the main window while the grant is missing. A fresh grant only takes effect on
// the next launch, so when the re-check (on window focus, i.e. coming back from
// System Settings) sees it flip, the copy swaps to "restart Spool" instead of hiding.
//
// 2026-07-08: TCC binds the grant to the code signature (csreq), so with ad-hoc dev
// builds the System Settings toggle can show ON while preflight still reports false —
// the listed entry belongs to a stale build. The user-side fix (verified live by
// Ocean): remove the stale "Spool" entry with −, fully quit via the tray (closing the
// window only hides it), reopen and grant the fresh prompt, then quit-and-restart once
// more. The denied phase carries that recovery line, since the UI cannot tell a
// never-granted state from a stale-grant state.

type Phase = 'hidden' | 'denied' | 'granted-later';

export default function PermissionBanner() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('hidden');
  const [dismissed, setDismissed] = useState(false);
  // 任务三 #1 (2026-07-12): the stale-grant recovery walkthrough is details-on-demand
  // — the resting banner is one line, and the first screenful stays content, not
  // warnings.
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    <div className="flex-none border-b border-line bg-paper-2 px-4 py-1.5 text-xs text-ink-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate">
          {phase === 'denied'
            ? t('双击 ⌥ 捕捉需要「输入监听」权限 — 授权后完全退出 Spool（托盘图标 → 退出）再重新打开')
            : t('已授权 — 完全退出 Spool（托盘图标 → 退出）并重新打开后生效')}
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
        {phase === 'denied' && (
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex-none text-muted transition-colors hover:text-accent"
          >
            {t('详情')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('关闭')}
          className="flex-none rounded p-0.5 text-muted transition-colors hover:text-ink"
        >
          <X size={13} />
        </button>
      </div>
      {phase === 'denied' && detailsOpen && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {t(
            '已授权却仍看到本条？旧授权可能已失效：在系统设置的列表中选中 Spool 按 − 删除，完全退出并重新打开 Spool，允许新弹窗后再退出重启一次。',
          )}
        </p>
      )}
    </div>
  );
}
