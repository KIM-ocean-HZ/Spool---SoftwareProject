import { useEffect, useRef, useState } from 'react';

// 休息提醒 (2026-08-19 second pass, Ocean) — 「做一个倒计时时钟小组件，和原来的面板交替显示，按照
// 时间交替，可以是结合用户切换窗口和经过的时间两个判断，如果切换窗口再计算时间，过了一分钟就换
// （目的是不能让用户看到 ui 切换的过程）」.
//
// The goal in his parenthesis is the whole design, and it is what makes this a rule rather than
// a `setInterval`: a panel in the corner of the eye that mutates while you are looking at it is
// a distraction, and the sidebar is on screen all day. So the swap is **normally only performed
// while the window is not frontmost** — the user comes back to a panel that already shows the
// other face, and never watches one become the other.
//
// ⚠️ Both of his conditions are needed and neither is enough alone:
//   - **Time alone** (a plain interval) swaps under the user's gaze.
//   - **Blur alone** swaps on every glance at a browser, which in this product is constant
//     (the capture loop is: copy in another app, come back) — the panel would flicker between
//     two faces all day.
// Together they mean: at most one swap per FACE_HOLD_MS, and never one you can see.
//
// ⚠️ 2026-08-19, Ocean traded the last part the other way: 「面板交替要不要兜底定时器 —— 要，
// 时间长一点」. So there is now a second, much slower path (FACE_FALLBACK_MS) for the user who
// never leaves Spool — and it IS the one path that can swap in plain view. That is the price of
// the trade, and the length is what keeps it cheap: at ten minutes it is a swap you might catch
// once in a long sitting, not a panel that mutates while you read it.

export type PanelFace = 'stats' | 'clock';

/** The shortest a face may stay up.
 *
 *  ⚠️ Ocean asked for 「过了一分钟就换」 first and then, on seeing it installed (2026-08-19),
 *  「边栏变化时间改成 30s」. Thirty is what is here. It is still long enough to do the job it was
 *  given — the swap still only happens while the window is not frontmost, so halving the hold
 *  makes the two faces trade places more often, not more visibly. */
export const FACE_HOLD_MS = 30 * 1000;

/** How long a face may stay up when nothing ever blurs the window.
 *
 *  ⚠️ This one swaps in plain view — it exists precisely for the user who is still looking. Keep
 *  it long (Ocean: 「时间长一点」); this is the single number to change if it feels too eager. */
export const FACE_FALLBACK_MS = 10 * 60 * 1000;

/** How often the fallback wakes up to ask. Well under FACE_FALLBACK_MS so the swap lands near
 *  the interval it was given rather than up to twice it. */
const FALLBACK_TICK_MS = 30 * 1000;

/** Has the current face been up long enough to be replaced? Inclusive at exactly the hold. */
export const shouldRotate = (lastSwapAt: number, now: number, hold = FACE_HOLD_MS): boolean =>
  now - lastSwapAt >= hold;

/** Which face the capture panel should draw right now.
 *
 *  `enabled` is 休息提醒 being on: with it off there is no second face to alternate with, and
 *  Ocean's rule for that case is 「面板就只显示捕捉数量」. */
export const usePanelFace = (enabled: boolean): PanelFace => {
  const [face, setFace] = useState<PanelFace>('stats');
  const lastSwapAt = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      // Back to the counts, and the next enable starts from them rather than resuming a clock
      // face the user cannot see the point of.
      setFace('stats');
      return;
    }
    const swapIfHeld = (hold: number): void => {
      const now = Date.now();
      if (!shouldRotate(lastSwapAt.current, now, hold)) return;
      lastSwapAt.current = now;
      setFace((f) => (f === 'stats' ? 'clock' : 'stats'));
    };
    const onBlur = (): void => swapIfHeld(FACE_HOLD_MS);
    // ⚠️ `blur` on window, not `visibilitychange`: the app is not hidden when the user clicks
    // into another app, it is merely no longer frontmost — which is precisely the moment the
    // panel stops being watched.
    window.addEventListener('blur', onBlur);
    // The fallback. Every blur pushes `lastSwapAt` forward, so on a normal working day this
    // ticks, finds the face young, and does nothing.
    const tick = window.setInterval(() => swapIfHeld(FACE_FALLBACK_MS), FALLBACK_TICK_MS);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.clearInterval(tick);
    };
  }, [enabled]);

  return enabled ? face : 'stats';
};
