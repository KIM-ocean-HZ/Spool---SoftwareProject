import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import {
  BREAK_MS,
  initialBreakState,
  msForMinutes,
  tickBreakState,
  TICK_MS,
  type BreakState,
} from '@/lib/breakReminder';
import { SHOW_BREAK_OVERLAY_COMMAND } from '@/lib/capture/overlayProtocol';
import { useBreakStore } from '@/stores/breakStore';
import { useCaptureStore } from '@/stores/captureStore';
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

// ── 2026-08-21 (WORKPLAN §9 第 2 步) ────────────────────────────────────────────────────────
//
// ⚠️ **The window-level activity listeners are gone.** They fed `lastInputAt`, and the rule
// they fed was the wrong one: it could only see input that landed on Spool, so an hour spent
// in Word capturing into Spool measured as zero. Presence is now read machine-wide from
// `system_idle_ms`, and the Spool-ness of the sitting comes from frontmost-or-recent-capture.
// ⛔ Do not put them back as a third signal — a keystroke in this window is already covered by
// machine-wide idle, so all it would add is a way for the two answers to disagree.

/** One-shot guard so a broken idle query says so once instead of twice a minute forever.
 *
 *  ⚠️ A `system_idle_ms` that throws (or answers None) is 「could not tell」, and the reducer
 *  treats that as not working — correct, but if it failed forever the streak would never build
 *  and the feature would be silently dead. It cannot be made to guess the other way: a lock
 *  raised on an unmeasured hour is worse than no lock. So it stays honest and says so in the
 *  console once, which is the only signal a user could ever bring back to us. */
let idleQueryWarned = false;

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
  // ⚠️ The tick awaits an IPC call now, so two of them can be in flight at once if the app is
  // busy enough that `system_idle_ms` takes longer than a tick to come back. Both would read
  // the same `stateRef` and both would credit against the same `lastTickAt` — time counted
  // twice, on exactly the machine too loaded to answer. Skipping the overlapping tick is the
  // right resolution: a dropped tick under-counts by 30 seconds, and under-counting is the
  // direction this whole feature errs in on purpose.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // Switched off mid-sitting: drop the streak and lift the lock if it is up, so switching
      // back on later starts a fresh interval rather than resuming a stale one.
      stateRef.current = initialBreakState();
      inFlightRef.current = false;
      useBreakStore.getState().unlock();
      return;
    }

    const workMs = msForMinutes(workMinutes);

    const id = setInterval(() => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      void (async () => {
        try {
          const store = useBreakStore.getState();

          // ⚠️ **The break itself must not count as work.** The window is frontmost during the
          // lock and the user may well move the mouse over it, so a tick left running would
          // bank five minutes of 「专注」 for sitting through a rest. Held at zero for the whole
          // lock, which also means the sidebar's clock starts counting from the moment they
          // come back.
          if (store.lockUntil !== null) {
            stateRef.current = initialBreakState();
            return;
          }

          let systemIdleMs: number | null = null;
          try {
            systemIdleMs = await invoke<number | null>('system_idle_ms');
          } catch (e) {
            if (!idleQueryWarned) {
              idleQueryWarned = true;
              console.warn('[break] system idle unavailable, the streak will not build', e);
            }
          }

          const { state, due } = tickBreakState(stateRef.current, {
            now: Date.now(),
            workMs,
            // ⚠️ `document.hasFocus()` and not a focus/blur flag of our own: the answer has to
            // be right at the moment of the tick, and a flag can be stale after a window was
            // raised by the OS (a tray click, a shortcut) rather than by an event we saw.
            focused: document.hasFocus(),
            systemIdleMs,
            lastCaptureAt: useCaptureStore.getState().lastCaptureAt,
          });
          stateRef.current = state;
          store.publish(state.activeMs, state.totalMs);

          // ⚠️⚠️ **Due splits in two, and which half runs depends on where the user is.**
          //
          // Under the old criterion 「frontmost」 was a precondition of the streak, so a due
          // tick was by definition a tick the user was watching — and that is what reconciled
          // a five-minute window lock with the standing rule against dialogs (首日价值二期
          // 拍板 4: 「never a dialog … it would fire while the user was in another app」) and
          // with 「主窗永不跳前」. The 2026-08-21 criterion measures sittings spent in OTHER
          // applications, which is the point of it, so that reconciliation is gone.
          //
          // Ocean's answer (2026-08-22): 「跳弹窗，提示需要休息了，不跳主窗（点击弹窗再回到主
          // 窗，然后弹窗自动消失）」. So:
          //
          //   - Spool in front → lock the window, exactly as before. Nothing is gained by
          //     floating a card over a window the user is already looking at.
          //   - Spool behind   → the OVERLAY says it, over whatever they are in. It takes no
          //     keyboard and moves no window; the main window comes up only if they click,
          //     and the lock is put on by that click (useCapture.ts applyOverlayAction).
          //
          // ⛔ The main window is never raised from here. The click is the only thing allowed
          // to spend that, and it is a click on a card that says it will.
          if (due) {
            if (document.hasFocus()) {
              store.lock(Date.now() + BREAK_MS);
            } else {
              void invoke(SHOW_BREAK_OVERLAY_COMMAND, { workMinutes }).catch((e) => {
                // ⚠️ Falls back to the lock rather than to silence. The helper is a separate
                // process and may be gone; a break the person earned should not vanish
                // because the messenger died — it arrives the old way instead, when they look.
                console.warn('[break] overlay reminder failed, falling back to the lock', e);
                store.lock(Date.now() + BREAK_MS);
              });
            }
          }
        } finally {
          inFlightRef.current = false;
        }
      })();
    }, TICK_MS);

    return () => {
      clearInterval(id);
    };
  }, [enabled, workMinutes]);
};
