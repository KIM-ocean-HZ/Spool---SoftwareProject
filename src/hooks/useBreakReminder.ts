import { useEffect, useRef } from 'react';
import {
  BREAK_MS,
  initialBreakState,
  msForMinutes,
  tickBreakState,
  TICK_MS,
  type BreakState,
} from '@/lib/breakReminder';
import { useBreakStore } from '@/stores/breakStore';
import { useSettingsStore } from '@/stores/settingsStore';

// 休息提醒 (2026-08-19) — the wiring around lib/breakReminder's reducer. The rule itself, and
// every reason it is the shape it is, lives in that file; this one only supplies it with events
// and owns when the lock goes up.
//
// ⚠️ **Both themes now** (Ocean 2026-08-19, second pass: 「做成两个 appearance 都有的功能」).
// It used to early-return in 经典 — the gate is `breakReminderEnabled` instead, so turning it
// off is a decision the user makes once in Settings rather than a side effect of preferring the
// shipped colours. Gwen is untouched and is still 情人节-only.
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

/** Drives the streak. Returns nothing — what it produces goes into breakStore, because the
 *  sidebar's clock needs the same numbers the lock does (see that file's header). */
export const useBreakReminder = (): void => {
  const enabled = useSettingsStore((s) => s.breakReminderEnabled);
  const workMinutes = useSettingsStore((s) => s.breakWorkMinutes);
  // Refs, not state: a tick that changes neither the lock nor anything drawn must not
  // re-render the whole app twice a minute, and there are 120 of them in an hour. What IS
  // drawn goes through breakStore, whose subscribers are the sidebar card and App's lock —
  // not App's whole tree.
  const stateRef = useRef<BreakState>(initialBreakState());
  const lastInputRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Switched off mid-sitting: drop the streak and lift the lock if it is up, so switching
      // back on later starts a fresh interval rather than resuming a stale one.
      stateRef.current = initialBreakState();
      lastInputRef.current = null;
      useBreakStore.getState().unlock();
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

    const workMs = msForMinutes(workMinutes);

    const id = setInterval(() => {
      const store = useBreakStore.getState();

      // ⚠️ **The break itself must not count as work.** The window is frontmost during the lock
      // and the user may well move the mouse over it, so a tick left running would bank five
      // minutes of 「专注」 for sitting through a rest. Held at zero for the whole lock, which also
      // means the sidebar's clock starts counting from the moment they come back.
      if (store.lockUntil !== null) {
        stateRef.current = initialBreakState();
        lastInputRef.current = null;
        return;
      }

      const { state, due } = tickBreakState(stateRef.current, {
        now: Date.now(),
        workMs,
        // ⚠️ `document.hasFocus()` and not a focus/blur flag of our own: the answer has to be
        // right at the moment of the tick, and a flag can be stale after a window was raised
        // by the OS (a tray click, a shortcut) rather than by an event we saw.
        focused: document.hasFocus(),
        lastInputAt: lastInputRef.current,
      });
      stateRef.current = state;
      store.publish(state.activeMs);
      // ⚠️ The lock is only ever raised here, i.e. only on a tick that found the window
      // frontmost. That is what reconciles it with the product's standing rule against dialogs
      // (首日价值二期 拍板 4: 「never a dialog … it would fire while the user was in another
      // app」). This one cannot: 「frontmost」 is a precondition of the streak, so by the time it
      // is due, the user is looking at Spool.
      if (due) store.lock(Date.now() + BREAK_MS);
    }, TICK_MS);

    return () => {
      clearInterval(id);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, noteInput);
    };
  }, [enabled, workMinutes]);
};
