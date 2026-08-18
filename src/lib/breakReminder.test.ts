import { describe, expect, it } from 'vitest';
import {
  IDLE_GRACE_MS,
  MAX_TICK_CREDIT_MS,
  TICK_MS,
  WORK_BEFORE_BREAK_MS,
  initialBreakState,
  isWorking,
  tickBreakState,
  type BreakState,
  type TickInput,
} from './breakReminder';

// 情人节限定版 §4 — Ocean handed over a rule and asked for it to be corrected, not copied. The
// cases below are the ones the correction turns on; each is a claim about behaviour that would
// otherwise take an hour of sitting at the machine to observe once.

const T0 = 1_700_000_000_000;

/** Feed n ticks of `input`, advancing the clock by TICK_MS each time. Returns the final state
 *  and how many times the reminder came due. */
const run = (
  state: BreakState,
  n: number,
  input: (i: number, now: number) => Omit<TickInput, 'now'>,
  startAt = T0,
): { state: BreakState; fired: number; lastNow: number } => {
  let s = state;
  let fired = 0;
  let now = startAt;
  for (let i = 0; i < n; i++) {
    const r = tickBreakState(s, { now, ...input(i, now) });
    s = r.state;
    if (r.due) fired++;
    now += TICK_MS;
  }
  return { state: s, fired, lastNow: now - TICK_MS };
};

/** Frontmost, and touched a moment ago — the ordinary working tick. */
const busy = (_i: number, now: number) => ({ focused: true, lastInputAt: now - 1000 });

describe('isWorking', () => {
  it('needs BOTH frontmost and recent input — the correction to Ocean\'s OR', () => {
    // This is the whole reason the rule was changed. A window left in front while its owner is
    // at lunch satisfies 「放在最前端窗口」 for an hour, and firing there would put a number in the
    // dialog («专注一个小时») that nothing measured.
    expect(isWorking({ now: T0, focused: true, lastInputAt: T0 - 1000 })).toBe(true);
    expect(isWorking({ now: T0, focused: false, lastInputAt: T0 - 1000 })).toBe(false);
    expect(isWorking({ now: T0, focused: true, lastInputAt: T0 - IDLE_GRACE_MS * 2 })).toBe(false);
  });

  it('counts a window that has never been touched as not working', () => {
    // Launched at login, frontmost, nobody home.
    expect(isWorking({ now: T0, focused: true, lastInputAt: null })).toBe(false);
  });

  it('forgives stillness right up to five minutes — reading is work', () => {
    // Ocean's 「中间间隔不超过五分钟」, at the boundary. Inclusive on purpose: someone reading a
    // long block without moving the mouse has not stopped working.
    expect(isWorking({ now: T0, focused: true, lastInputAt: T0 - IDLE_GRACE_MS })).toBe(true);
    expect(isWorking({ now: T0, focused: true, lastInputAt: T0 - IDLE_GRACE_MS - 1 })).toBe(false);
  });
});

describe('tickBreakState', () => {
  it('says nothing for the first hour and fires exactly once at it', () => {
    const ticks = WORK_BEFORE_BREAK_MS / TICK_MS; // 120
    // One tick short of the hour: the first tick of a sitting only starts the clock (there is no
    // earlier moment to measure from), so `ticks` ticks have credited ticks-1 intervals.
    const before = run(initialBreakState(), ticks, busy);
    expect(before.fired).toBe(0);
    expect(before.state.activeMs).toBe(WORK_BEFORE_BREAK_MS - TICK_MS);

    const after = run(initialBreakState(), ticks + 1, busy);
    expect(after.fired).toBe(1);
    // Reset as it fires, so the next reminder is a fresh hour away rather than 30 seconds away.
    expect(after.state.activeMs).toBe(0);
  });

  it('fires once per hour of work, not once per tick after the first hour', () => {
    // The bug this guards is the obvious one: an un-reset streak re-satisfies `>= one hour` on
    // every subsequent tick, which is a dialog every 30 seconds forever.
    const threeHours = (3 * WORK_BEFORE_BREAK_MS) / TICK_MS + 1;
    expect(run(initialBreakState(), threeHours, busy).fired).toBe(3);
  });

  it('pauses rather than resets when the user steps into another app briefly', () => {
    // ⚠️ This is the case that decides whether the feature is usable at all. Copying something
    // in another app and coming back IS Spool's main loop — a rule that zeroed the streak on
    // blur would never reach an hour on a day of heavy capture.
    const half = run(initialBreakState(), 60, busy); // 29.5 min
    const away = run(half.state, 4, () => ({ focused: false, lastInputAt: null }), half.lastNow + TICK_MS);
    expect(away.state.activeMs).toBe(half.state.activeMs); // kept
    expect(away.fired).toBe(0);
  });

  it('does not COUNT the time spent away, only forgives it', () => {
    // Two four-minute absences must not earn eight minutes of 「专注」 — the dialog claims time at
    // the desk, so that is what is measured.
    const a = run(initialBreakState(), 10, busy);
    const gap = 4 * 60 * 1000;
    const b = run(a.state, 1, () => ({ focused: true, lastInputAt: a.lastNow + gap - 500 }), a.lastNow + gap);
    // One tick's worth credited at most, never the four-minute gap.
    expect(b.state.activeMs - a.state.activeMs).toBeLessThanOrEqual(MAX_TICK_CREDIT_MS);
  });

  it('drops the streak once the gap passes five minutes', () => {
    const half = run(initialBreakState(), 60, busy);
    const longGap = IDLE_GRACE_MS + TICK_MS;
    const r = tickBreakState(half.state, {
      now: half.lastNow + longGap,
      focused: false,
      lastInputAt: half.lastNow,
    });
    expect(r.state).toEqual(initialBreakState());
    expect(r.due).toBe(false);
  });

  it('cannot be handed an hour by a laptop waking up', () => {
    // ⚠️⚠️ The case a start-timestamp design gets wrong, and the reason the streak is built from
    // capped ticks. Lid closed at 45 minutes in, opened six hours later with the window still
    // frontmost and (as far as arithmetic goes) input inside the grace window.
    const worked = run(initialBreakState(), 90, busy); // 44.5 min
    const sleep = 6 * 60 * 60 * 1000;
    const wake = tickBreakState(worked.state, {
      now: worked.lastNow + sleep,
      focused: true,
      lastInputAt: worked.lastNow + sleep - 1000,
    });
    expect(wake.due).toBe(false);
    expect(wake.state.activeMs - worked.state.activeMs).toBeLessThanOrEqual(MAX_TICK_CREDIT_MS);
  });

  it('never credits time before the user arrived', () => {
    // The first tick of a sitting starts the clock at zero credit; otherwise every arrival would
    // be billed a free tick, and a user who alternated app-switching with single ticks could
    // accumulate an hour without ever working one.
    const first = tickBreakState(initialBreakState(), {
      now: T0,
      focused: true,
      lastInputAt: T0,
    });
    expect(first.state.activeMs).toBe(0);
    expect(first.state.lastTickAt).toBe(T0);
  });

  it('leaves a never-started streak alone while nobody is there', () => {
    const idle = tickBreakState(initialBreakState(), {
      now: T0,
      focused: false,
      lastInputAt: null,
    });
    expect(idle.state).toEqual(initialBreakState());
  });
});
