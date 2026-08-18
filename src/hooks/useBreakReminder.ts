import { useEffect, useRef, useState } from 'react';
import {
  initialBreakState,
  tickBreakState,
  TICK_MS,
  type BreakState,
} from '@/lib/breakReminder';
import { useIsValentine } from '@/hooks/useTheme';

// 情人节限定版 §4 (2026-08-19) — the wiring around lib/breakReminder's reducer. The rule itself,
// and every reason it is the shape it is, lives in that file; this one only supplies it with
// events and owns the dialog's open flag.
//
// ⚠️ 情人节 only (Ocean 2026-08-19, when asked directly). Nothing is registered in 经典 — the
// early return below runs before any listener or interval exists, so the shipped build carries
// this file's code and never executes a line of it.
//
// ⚠️ **Main window only, by construction.** This hook is mounted from App, not from the capture
// overlay, so 「frontmost」 always means the window with the library in it. The overlay is a
// separate always-on-top process; if it ever mounted this, every capture would look like the
// user was working.

/** Which events count as 「正在使用 spool」. Deliberately broad — reading is work, and a user
 *  scrolling a long project without typing is the exact case Ocean's five-minute grace was
 *  written to protect. `focus` is in here so coming BACK to the window counts as arriving rather
 *  than as having been present the whole time: without it, a user who left for four minutes and
 *  returned would be credited from their last keystroke, not from their return.
 *  ⚠️ Typed as `keyof WindowEventMap` so a name that is not actually a window event (the first
 *  draft had `visibilitychange`, which is dispatched on `document`) fails to compile instead of
 *  silently registering a listener nothing fires. */
const ACTIVITY_EVENTS: readonly (keyof WindowEventMap)[] = [
  'keydown',
  'mousedown',
  'wheel',
  'pointermove',
  'focus',
];

export interface BreakReminder {
  /** True while the take-a-break dialog should be on screen. */
  open: boolean;
  dismiss: () => void;
}

export const useBreakReminder = (): BreakReminder => {
  const valentine = useIsValentine();
  const [open, setOpen] = useState(false);
  // Refs, not state: a tick that changes neither the dialog nor anything drawn must not
  // re-render the whole app twice a minute, and there are 120 of them in an hour.
  const stateRef = useRef<BreakState>(initialBreakState());
  const lastInputRef = useRef<number | null>(null);

  useEffect(() => {
    if (!valentine) {
      // Switching to 经典 mid-sitting: drop the streak and close the dialog if it is up, so
      // coming back to 情人节 starts a fresh hour rather than resuming a stale one.
      stateRef.current = initialBreakState();
      lastInputRef.current = null;
      setOpen(false);
      return;
    }

    const noteInput = (): void => {
      lastInputRef.current = Date.now();
    };
    // `pointermove` fires per pixel of mouse travel; this writes one number to a ref and does
    // nothing else, which is why it can be passive and unthrottled. ⚠️ Do not grow the handler
    // — anything heavier here runs hundreds of times a second.
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, noteInput, { passive: true });
    }
    // A window that is focused when the hook mounts has just been arrived at.
    if (document.hasFocus()) noteInput();

    const id = setInterval(() => {
      const { state, due } = tickBreakState(stateRef.current, {
        now: Date.now(),
        // ⚠️ `document.hasFocus()` and not a focus/blur flag of our own: the answer has to be
        // right at the moment of the tick, and a flag can be stale after a window was raised
        // by the OS (a tray click, a shortcut) rather than by an event we saw.
        focused: document.hasFocus(),
        lastInputAt: lastInputRef.current,
      });
      stateRef.current = state;
      // ⚠️ Only ever opened here, i.e. only on a tick that found the window frontmost. That is
      // what reconciles this dialog with the product's standing rule against them (首日价值二期
      // 拍板 4: 「never a dialog … it would fire while the user was in another app」). This one
      // cannot: 「frontmost」 is a precondition of the streak, so by the time it is due, the user
      // is looking at Spool. It is also the only notice in the app that is ABOUT the user
      // rather than about their library, which is why it does not belong in a line somewhere.
      if (due) setOpen(true);
    }, TICK_MS);

    return () => {
      clearInterval(id);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, noteInput);
    };
  }, [valentine]);

  return {
    open,
    dismiss: () => setOpen(false),
  };
};
