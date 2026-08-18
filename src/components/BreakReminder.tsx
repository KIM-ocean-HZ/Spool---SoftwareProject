import { useEffect } from 'react';
import { useT } from '@/lib/i18n';
import { HEART_PATH, HEART_ROSE } from '@/lib/valentine/heart';

// 情人节限定版 §4 (2026-08-19, Ocean) — 「连续工作超过一小时，跳出弹窗让用户休息」.
//
// The card. The rule that decides WHEN it appears is lib/breakReminder.ts and the wiring is
// hooks/useBreakReminder.ts; this file is only what it looks like and how it closes.
//
// ⚠️⚠️ **This is the only dialog in the product, and it is one on purpose.** 首日价值二期 拍板 4
// set the standing rule — 「never a dialog … Every notice in this app is a line where the thing
// is; a dialog here would be the only one in the product, and it would fire while the user was
// in another app」. Both halves of that objection are answered rather than overruled:
//
//   1. **It cannot fire into another app.** Being frontmost is a *precondition* of the streak
//      (breakReminder's `isWorking`), so when this appears the user is already looking at Spool.
//      The 满轴 notice could not make that promise — a capture arrives whenever it arrives.
//   2. **It is not about the library.** Every other notice here reports something that happened
//      to the user's material, and 「a line where the thing is」 works because there IS a thing to
//      put the line beside. This one is about the person, and there is nowhere on the page that
//      is where *they* are. A line in the block feed saying 「歇一会儿」 is a line they would scroll
//      past, which is the same as not saying it.
//
// ⚠️ It follows the rule's spirit anyway: one card, one button, no second chance to ignore it,
// and it never steals the window — the window was already theirs.
//
// ⚠️ Shown by App only when the theme is 情人节. 经典 never mounts it.
export default function BreakReminder({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();

  // Esc closes it, like every other panel in the app. ⚠️ Deliberately no click-outside: the
  // whole point is that it interrupts, and a card that vanishes on a stray click on the page
  // behind it is a card the user never read. Esc is a decision; a stray click is not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    /* ⚠️⚠️ The scrim is an inline style and NOT `bg-ink/30`, which is what every other overlay in
       this app writes. Measured in the compiled CSS on 2026-08-19: **Tailwind v3 emits no rule at
       all for an opacity modifier on a colour defined as a bare `var(--…)`**, which is how every
       colour in tailwind.config.js is defined. So `bg-ink/30` is an inert class name — the
       existing modals have no scrim behind them, they just look as though they do because the
       card is opaque. There are ~100 such classes in src/ and they are NOT this window's business
       to fix (that would change the released build's appearance in a hundred places), but a new
       modal must not be built on one. `--ink` at 32%, written out. */
    <div
      className="fixed inset-0 z-50 flex justify-center px-8 pt-[18vh]"
      style={{ backgroundColor: 'rgba(58, 42, 53, 0.32)' }}
    >
      <div
        className="h-fit w-[380px] rounded-lg border border-line-strong bg-paper px-5 py-4"
        style={{ boxShadow: 'var(--shadow-toast)' }}
      >
        <div className="flex items-center gap-2">
          {/* The theme's own mark, at text size — the same heart the sidebar meter draws, so the
              card reads as part of this edition rather than as a system alert that wandered in.
              The path is imported rather than redrawn: one heart in this edition, not three. Its
              bounds are exactly ±1 (lib/valentine/heart explains why), so a viewBox of -1.1…1.1
              frames it with a hair of margin and no arithmetic.
              ⚠️ aria-hidden: it is decoration, and the heading beside it already says this. */}
          <svg viewBox="-1.1 -1.1 2.2 2.2" width={12} height={12} aria-hidden className="flex-none">
            <path d={HEART_PATH} fill={HEART_ROSE} />
          </svg>
          <h2 className="font-serif text-lg text-ink">{t('歇一会儿')}</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">
          {t('你已经连着专注一个小时了。站起来走两步，喝口水，看看窗外。')}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {t('存下来的东西不会跑，它们会在这儿等你回来。')}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onDismiss}
            className="rounded-md border border-line-strong bg-paper px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {t('好，去休息')}
          </button>
        </div>
      </div>
    </div>
  );
}
