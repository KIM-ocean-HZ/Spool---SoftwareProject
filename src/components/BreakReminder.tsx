import { useEffect, useRef, useState } from 'react';
import { BREAK_MS, formatCountdown } from '@/lib/breakReminder';
import { useT } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

// 休息提醒 (2026-08-19, Ocean, second pass) — 「把 app 锁住（倒计时放中间，背景奶油色压暗，用户可以
// 自己点击解锁，或者等待倒计时结束解锁，自动回复正常状态）」.
//
// It used to be a 380px card with a button. It is now a lock over the whole window, and that
// change is the point rather than a decoration of it: a card that says 「歇一会儿」 beside a
// library you can still scroll is a card you dismiss without standing up. There is nothing to
// read here and nothing to do — which is what a break IS.
//
// ⚠️⚠️ **This is still the only dialog in the product, and it is one on purpose.** 首日价值二期
// 拍板 4 set the standing rule — 「never a dialog … Every notice in this app is a line where the
// thing is; a dialog here would be the only one in the product, and it would fire while the user
// was in another app」. Both halves of that objection are answered rather than overruled:
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
// ⚠️ It never steals the window — the window was already theirs, and the streak proves it.

/** How often the countdown redraws. The state it drives is a `m:ss` string, so once a second
 *  is exactly enough; the remaining time is always recomputed against `until` rather than
 *  decremented, so a throttled timer shows a late clock, never a wrong one. */
const COUNTDOWN_TICK_MS = 1000;

interface Props {
  /** Wall-clock ms at which the break is over. From breakStore. */
  until: number;
  onDismiss: () => void;
}

export default function BreakReminder({ until, onDismiss }: Props) {
  const t = useT();
  const workMinutes = useSettingsStore((s) => s.breakWorkMinutes);
  const [remaining, setRemaining] = useState(() => until - Date.now());
  const shellRef = useRef<HTMLDivElement>(null);

  // ⚠️⚠️ **Take DOM focus, immediately.** The lock covers the window so no click can reach the
  // app behind it — but keystrokes go to whatever still holds focus, and when this fires the
  // user is very likely mid-sentence in a note. Without this they would keep typing into an
  // editor they cannot see. Moving focus to the shell is also what makes the Esc handler below
  // land somewhere sensible.
  useEffect(() => {
    shellRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const left = until - Date.now();
      setRemaining(left);
      // Ocean: 「等待倒计时结束解锁，自动回复正常状态」. The lock lifts itself; nothing has to be
      // clicked for the app to come back.
      if (left <= 0) onDismiss();
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [until, onDismiss]);

  // Esc unlocks, like every other panel in the app. ⚠️ Deliberately no click-outside and no
  // autoFocus on the button: this fires while the user is typing, and a focused button plus a
  // stray Enter would end the break without them ever seeing why it appeared.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const fraction = Math.min(Math.max(remaining / BREAK_MS, 0), 1);
  // r=54 in a 128 box leaves room for the 8px stroke without clipping.
  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    /* 「背景奶油色压暗」, in two layers: --paper-2 at 97% hides the library (an app you can still
       read through is not locked), and a thin ink wash over it is the 压暗. Both are tokens, so
       the lock is cream in 经典 and the theme's own pink-cream in 情人节 without a branch.
       ⚠️ The first version was `bg-paper/95` + `bg-ink/20` and Ocean sent it back on sight
       (2026-08-19: 「锁屏颜色太深了，不好看，改浅一点」). 20% of a near-black ink over cream is
       rgb(205,203,196) — it had stopped being cream and become grey, which is the 不好看 half.
       So the dimming now comes mostly from the DARKER PAPER TOKEN rather than from ink: paper-2
       is already the app's own second cream, and 6% ink is just enough to say 「pressed down」
       without draining the hue out of it.
       ⚠️ Above Settings (z-50) — the reminder can come due while that panel is open — and below
       the toast rack (z-100), which is a few pixels in a corner and no reason to leave a hole
       in the lock. */
    <div
      ref={shellRef}
      tabIndex={-1}
      className="fixed inset-0 z-[90] bg-paper-2/[0.97] outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('歇一会儿')}
    >
      <div className="absolute inset-0 bg-ink/[0.06]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-7 px-10">
        {/* 倒计时放中间. The ring is drawn in --accent, so it is the theme's own colour in both
            appearances and there is no mark here that belongs to only one of them. */}
        <div className="relative flex-none">
          <svg width={128} height={128} viewBox="0 0 128 128" aria-hidden>
            <circle
              cx={64}
              cy={64}
              r={RADIUS}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={8}
            />
            {/* The arc drains clockwise from 12 o'clock: rotated -90° about the centre, and the
                dash offset carries the fraction. One <circle> and two numbers — no per-frame
                path arithmetic, and it animates identically in WKWebView and WebView2. */}
            <circle
              cx={64}
              cy={64}
              r={RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={8}
              strokeLinecap="round"
              transform="rotate(-90 64 64)"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Tabular figures so the digits do not shuffle sideways once a second. */}
            <span
              className="font-serif text-4xl text-ink"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCountdown(remaining)}
            </span>
          </div>
        </div>

        <div className="flex max-w-[420px] flex-col items-center gap-2 text-center">
          <h2 className="font-serif text-2xl text-ink">{t('歇一会儿')}</h2>
          <p className="text-sm leading-relaxed text-ink-2">
            {t('你已经连着专注 {n} 分钟了。站起来活动一下——走两步，喝口水，看看窗外。', {
              n: workMinutes,
            })}
          </p>
          {/* Ocean asked for 「最能劝服用户休息的一句原话」 out of the study cited in Settings. This
              is the sentence, and it is the one that answers the actual objection: people skip
              breaks because they believe stopping costs output. It is also written so it stays
              true at all three intervals — the 「每 60 分钟」 half of the finding belongs beside
              the picker in Settings, not here, where the user may have chosen 30 or 120. */}
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {t('「活动 5 分钟，心情会变好、疲劳会减轻，而工作效率并不会因此下降。」')}
          </p>
          <p className="text-[11px] text-muted">
            {t('——《英国运动医学杂志》2026 年，近两万人的真实世界研究')}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-line-strong bg-paper px-4 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {t('结束休息，继续工作')}
          </button>
          <span className="text-[11px] text-muted">{t('倒计时走完，它会自己解开')}</span>
        </div>
      </div>
    </div>
  );
}
