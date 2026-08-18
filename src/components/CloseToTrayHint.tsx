import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { IS_MAC } from '@/lib/platform';
import { useSettingsStore } from '@/stores/settingsStore';

// The one-time 「关掉窗口不等于退出」 card (2026-08-18, Ocean, Windows 验收 #1).
//
// He clicked ✕ and reported 「托盘图标不在」. It was there — Windows had put it in the `∧`
// overflow, where new tray icons go by default — and the app was running the whole time
// (the capture hotkey still fired; left-clicking the icon brought the window back). So the
// bug was never the icon. It was that closing the window looks exactly like quitting, and
// nothing said otherwise.
//
// ⚠️ Spool cannot pull its own icon out of that overflow: since Windows 7 only the user may
// decide which notification-area icons are visible. That is why this card ends on the drag
// instruction rather than on a button — the one action that fixes it for good is one the
// user has to take, and it is worth two seconds of their attention exactly once.
//
// The first ✕ is spent on this card: Rust leaves the window up and emits (capture.rs
// CLOSE_HINT_EVENT); 「知道了」 writes the flag and finishes the close. Every ✕ after that is
// the plain hide it has always been.
export default function CloseToTrayHint() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const seen = useSettingsStore((s) => s.closeToTrayHintSeen);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const update = useSettingsStore((s) => s.update);

  // Rust starts disarmed and only arms on this call, so a launch whose settings never
  // loaded keeps ✕ working exactly as before (capture.rs says why that is the safe
  // direction). macOS never arms it: the menu-bar item is always visible there, and an app
  // that outlives its window is what every Mac app does.
  useEffect(() => {
    if (IS_MAC || !settingsLoaded) return;
    void invoke('set_close_hint_pending', { pending: !seen }).catch((e) =>
      console.warn('[close-hint] arming failed', e),
    );
  }, [settingsLoaded, seen]);

  useEffect(() => {
    if (IS_MAC) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen('close-to-tray-hint', () => setOpen(true));
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  if (!open) return null;

  // Acknowledging is the only way out — no ✕ on the card, no click-outside. The window is
  // only still here because Rust held the close open for it, and a card the user dismissed
  // without reading would leave them in exactly the state it exists to prevent, one ✕ later
  // and with the hint already spent.
  const acknowledge = (): void => {
    setOpen(false);
    void update({ closeToTrayHintSeen: true });
    void invoke('hide_main_window').catch((e) =>
      console.warn('[close-hint] hide failed', e),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[18vh]">
      <div
        className="h-fit w-[380px] rounded-lg border border-line-strong bg-paper px-5 py-4"
        style={{ boxShadow: 'var(--shadow-toast)' }}
      >
        <h2 className="font-serif text-lg text-ink">{t('Spool 没有退出')}</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">
          {t('它还在后台跑着——捕捉快捷键要它活着才能用。')}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
          {t('图标在屏幕右下角的 ∧ 里面。把它拖到任务栏上，以后就一直看得见了。')}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {t('要它回来：单击那个图标。要真的退出：右键那个图标 → 退出。')}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={acknowledge}
            className="rounded-md border border-line-strong bg-paper px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {t('知道了')}
          </button>
        </div>
      </div>
    </div>
  );
}
