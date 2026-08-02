import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { usePermissionStore } from '@/stores/permissionStore';
import { useSettingsStore } from '@/stores/settingsStore';

// Quiet onboarding bar (2026-07-07): without the macOS Input Monitoring grant the
// double-tap ⌥ CGEventTap only sees Spool's own events — capture works in-app and
// silently does nothing everywhere else (double_tap.rs module doc). Shown at the top
// of the main window while the grant is missing. A fresh grant only takes effect on
// the next launch — probe-verified 2026-07-31: the running process never sees the
// grant flip on the CG side (same binary, new process preflights true while the old
// one polls false forever), so rebuilding the tap in place is a dead end. When the
// re-check (on window focus, i.e. coming back from System Settings) sees it flip,
// the copy swaps to a one-click "restart Spool now" button (§2.1 route A).
//
// 2026-07-08: TCC binds the grant to the code signature (csreq), so with ad-hoc dev
// builds the System Settings toggle can show ON while preflight still reports false —
// the listed entry belongs to a stale build. The user-side fix (verified live by
// Ocean): remove the stale "Spool" entry with −, fully quit via the tray (closing the
// window only hides it), reopen and grant the fresh prompt, then quit-and-restart once
// more. The denied phase carries that recovery line, since the UI cannot tell a
// never-granted state from a stale-grant state.

// 2026-08-02 (DESIGN_FIRST_RUN 拍板点 4): the resting line no longer reads as a chore
// the user owes the system. It names what is still missing, and — more importantly —
// what works right now without it, so a first-launch user has somewhere to go. The
// "fully quit and reopen" instruction moved into the `asked` phase: it only means
// anything after the user has actually gone for the grant.
type Phase = 'hidden' | 'denied' | 'asked' | 'granted-later';

export default function PermissionBanner() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const update = useSettingsStore((s) => s.update);
  const granted = usePermissionStore((s) => s.inputMonitoring);
  const everDenied = usePermissionStore((s) => s.everDenied);
  const requested = usePermissionStore((s) => s.requested);
  const check = usePermissionStore((s) => s.check);
  const request = usePermissionStore((s) => s.request);
  const [dismissed, setDismissed] = useState(false);
  // 任务三 #1 (2026-07-12): the stale-grant recovery walkthrough is details-on-demand
  // — the resting banner is one line, and the first screenful stays content, not
  // warnings.
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    void check();
    const onFocus = (): void => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);

  // Granted all along → nothing to say. Granted after we had shown the banner → the
  // tap stays deaf until relaunch, so offer the restart.
  const phase: Phase =
    granted === null
      ? 'hidden'
      : granted
        ? everDenied
          ? 'granted-later'
          : 'hidden'
        : requested
          ? 'asked'
          : 'denied';

  if (dismissed || phase === 'hidden') return null;

  return (
    <div className="flex-none border-b border-line bg-paper-2 px-4 py-1.5 text-xs text-ink-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate">
          {phase === 'denied' &&
            t('想在别的 app 里复制就存，需要开一个权限。在那之前 Spool 照样能用——在下面写笔记，或者在 Spool 里复制后双击 ⌥。')}
          {phase === 'asked' &&
            t('在系统设置里勾选 Spool，然后完全退出 Spool（托盘图标 → 退出）再重新打开。没看到系统弹窗？点右边打开设置。')}
          {phase === 'granted-later' && t('已授权 — 重启 Spool 后生效')}
        </span>
        {/* Language escape hatch (2026-07-31, Ocean). The UI now starts in the system
            locale, so a first-launch user whose language guessed wrong needs a way back
            that does not require reading the language they can't read. This bar is the
            first thing on screen for every new install (the grant is always missing at
            that point), which makes it the one reliable place to put it. Writing the
            setting is also what marks the language as user-chosen — from here on nothing
            auto-follows the system locale. */}
        <div className="flex flex-none items-center gap-0.5">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => void update({ language: lang })}
              className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                language === lang ? 'text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {lang === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
        {/* 拍板点 3: the two system prompts fire from here, not from app startup. */}
        {phase === 'denied' && (
          <button
            type="button"
            onClick={() => void request()}
            className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {t('打开捕捉')}
          </button>
        )}
        {phase === 'asked' && (
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
        {phase === 'granted-later' && (
          <button
            type="button"
            onClick={() => {
              void invoke('restart_app').catch((e) =>
                console.warn('[permission] restart failed', e),
              );
            }}
            className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {t('立即重启 Spool')}
          </button>
        )}
        {(phase === 'denied' || phase === 'asked') && (
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
      {(phase === 'denied' || phase === 'asked') && detailsOpen && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {t(
            '已授权却仍看到本条？旧授权可能已失效：在系统设置的列表中选中 Spool 按 − 删除，完全退出并重新打开 Spool，允许新弹窗后再退出重启一次。',
          )}
        </p>
      )}
    </div>
  );
}
