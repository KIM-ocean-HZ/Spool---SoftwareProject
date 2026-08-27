import { describe, expect, it } from 'vitest';
import {
  BREAK_MS,
  DEFAULT_WORK_MINUTES,
  formatCountdown,
  PRESENCE_WINDOW_MS,
  MAX_TICK_CREDIT_MS,
  TICK_MS,
  WORK_MINUTE_OPTIONS,
  dayKeyOf,
  initialBreakState,
  isWorking,
  shouldRollDay,
  msForMinutes,
  tickBreakState,
  workMinutesOrDefault,
  type BreakState,
  type TickInput,
} from './breakReminder';

// 情人节限定版 §4 — Ocean handed over a rule and asked for it to be corrected, not copied. The
// cases below are the ones the correction turns on; each is a claim about behaviour that would
// otherwise take an hour of sitting at the machine to observe once.

const T0 = 1_700_000_000_000;

/** The default interval, which is what every case below is written against unless it says
 *  otherwise. `workMs` is a per-tick input now (Settings owns the number), so the tests supply
 *  it the same way the hook does. */
const HOUR = msForMinutes(DEFAULT_WORK_MINUTES);

/** Feed n ticks of `input`, advancing the clock by TICK_MS each time. Returns the final state
 *  and how many times the reminder came due. */
const run = (
  state: BreakState,
  n: number,
  input: (i: number, now: number) => Omit<TickInput, 'now' | 'workMs'>,
  startAt = T0,
  workMs = HOUR,
): { state: BreakState; fired: number; lastNow: number } => {
  let s = state;
  let fired = 0;
  let now = startAt;
  for (let i = 0; i < n; i++) {
    const r = tickBreakState(s, { now, workMs, ...input(i, now) });
    s = r.state;
    if (r.due) fired++;
    now += TICK_MS;
  }
  return { state: s, fired, lastNow: now - TICK_MS };
};

/** Frontmost, machine not idle — the ordinary working tick. */
const busy = () => ({ focused: true, systemIdleMs: 1000, lastCaptureAt: null });

/** The sitting the new criterion exists for: Spool is in the BACKGROUND, the person is typing
 *  in some other application, and captures keep landing. */
const busyElsewhere = (lastCaptureAt: number) => () => ({
  focused: false,
  systemIdleMs: 1000,
  lastCaptureAt,
});

/** Nobody at the machine at all. */
const away = () => ({ focused: false, systemIdleMs: PRESENCE_WINDOW_MS * 2, lastCaptureAt: null });

describe('isWorking', () => {
  const at = (o: Partial<TickInput>): boolean =>
    isWorking({ now: T0, workMs: HOUR, focused: false, systemIdleMs: 1000, lastCaptureAt: null, ...o });

  it('needs the machine not idle AND a reason to call it a SPOOL sitting', () => {
    // Frontmost and someone at the keyboard: the plain case.
    expect(at({ focused: true })).toBe(true);
    // ⚠️ Frontmost alone is not work. A window left in front while its owner is at lunch
    // satisfies 「放在最前端窗口」 for an hour, and firing there would put a number in the dialog
    // («专注一个小时») that nothing measured.
    expect(at({ focused: true, systemIdleMs: PRESENCE_WINDOW_MS * 2 })).toBe(false);
    // Someone at the keyboard, but nothing says they are working WITH Spool.
    expect(at({ focused: false })).toBe(false);
  });

  it('counts a sitting spent in another application, on the strength of a capture', () => {
    // ⚠️⚠️ The whole reason the criterion was rewritten (2026-08-21). Spool's design premise is
    // that the user works in some OTHER app and captures into Spool from there — under the old
    // 「Spool frontmost AND touched」 rule, that hour measured as zero work.
    expect(at({ focused: false, lastCaptureAt: T0 - 60_000 })).toBe(true);
    // But a capture is not a licence that never expires: N minutes after the last one, nothing
    // in the background says this is still a Spool sitting.
    expect(at({ focused: false, lastCaptureAt: T0 - PRESENCE_WINDOW_MS })).toBe(true);
    expect(at({ focused: false, lastCaptureAt: T0 - PRESENCE_WINDOW_MS - 1 })).toBe(false);
  });

  it('treats an unavailable idle reading as not working, never as working', () => {
    // ⚠️ The direction matters more than the case. This feature LOCKS the window for five
    // minutes; a lock earned by a measurement that never happened is worse than a feature that
    // quietly stops firing, because only one of the two is recoverable.
    expect(at({ focused: true, systemIdleMs: null })).toBe(false);
    expect(at({ focused: false, lastCaptureAt: T0 - 1000, systemIdleMs: null })).toBe(false);
  });

  it('forgives stillness right up to N — reading is work', () => {
    // 验收③: Spool frontmost, reading a long block for 14 minutes without touching anything.
    // ⚠️ This is why N had to grow from Ocean's five: the signal is machine-wide HID now, and
    // reading a screen produces no HID events at all. At five minutes a person quietly reading
    // scored as absent.
    expect(at({ focused: true, systemIdleMs: 14 * 60_000 })).toBe(true);
    expect(at({ focused: true, systemIdleMs: PRESENCE_WINDOW_MS })).toBe(true);
    expect(at({ focused: true, systemIdleMs: PRESENCE_WINDOW_MS + 1 })).toBe(false);
  });
});

describe('tickBreakState', () => {
  it('says nothing for the first hour and fires exactly once at it', () => {
    const ticks = HOUR / TICK_MS; // 120
    // One tick short of the hour: the first tick of a sitting only starts the clock (there is no
    // earlier moment to measure from), so `ticks` ticks have credited ticks-1 intervals.
    const before = run(initialBreakState(), ticks, busy);
    expect(before.fired).toBe(0);
    expect(before.state.activeMs).toBe(HOUR - TICK_MS);

    const after = run(initialBreakState(), ticks + 1, busy);
    expect(after.fired).toBe(1);
    // Reset as it fires, so the next reminder is a fresh hour away rather than 30 seconds away.
    expect(after.state.activeMs).toBe(0);
  });

  it('fires once per hour of work, not once per tick after the first hour', () => {
    // The bug this guards is the obvious one: an un-reset streak re-satisfies `>= one hour` on
    // every subsequent tick, which is a dialog every 30 seconds forever.
    const threeHours = (3 * HOUR) / TICK_MS + 1;
    expect(run(initialBreakState(), threeHours, busy).fired).toBe(3);
  });

  it('pauses rather than resets when the user steps into another app briefly', () => {
    // ⚠️ This is the case that decides whether the feature is usable at all. Copying something
    // in another app and coming back IS Spool's main loop — a rule that zeroed the streak on
    // blur would never reach an hour on a day of heavy capture.
    const half = run(initialBreakState(), 60, busy); // 29.5 min
    const gone = run(half.state, 4, away, half.lastNow + TICK_MS);
    expect(gone.state.activeMs).toBe(half.state.activeMs); // kept
    expect(gone.fired).toBe(0);
  });

  it('does not COUNT the time spent away, only forgives it', () => {
    // Two four-minute absences must not earn eight minutes of 「专注」 — the dialog claims time at
    // the desk, so that is what is measured.
    const a = run(initialBreakState(), 10, busy);
    const gap = 4 * 60 * 1000;
    const b = run(a.state, 1, busy, a.lastNow + gap);
    // One tick's worth credited at most, never the four-minute gap.
    expect(b.state.activeMs - a.state.activeMs).toBeLessThanOrEqual(MAX_TICK_CREDIT_MS);
  });

  it('drops the streak once the gap passes N', () => {
    const half = run(initialBreakState(), 60, busy);
    const longGap = PRESENCE_WINDOW_MS + TICK_MS;
    const r = tickBreakState(half.state, {
      now: half.lastNow + longGap,
      workMs: HOUR,
      ...away(),
    });
    // ⚠️ 2026-08-27：这一坐清零了，但今天那三个数**留着** —— 那些分钟是真的工作过的
    // （Ocean:「倒计时结束之后，总专注时间还看得见、还在往上加」），而「今天」翻不翻篇
    // 由下一次开工时的 shouldRollDay 决定。
    expect(r.state).toEqual({
      ...initialBreakState(),
      totalMs: half.state.totalMs,
      dayKey: half.state.dayKey,
      lastActiveAt: half.state.lastActiveAt,
    });
    expect(r.state.activeMs).toBe(0);
    expect(r.state.totalMs).toBeGreaterThan(0);
    expect(r.due).toBe(false);
  });

  // ⭐ 2026-08-27（Ocean:「专注时间要一直累积 —— 倒计时结束之后，总专注时间还看得见、
  // 还在往上加」）。甲档：本次开机以来的累计，⛔ 不落盘。
  it('休息把这一坐清零，但总专注时间接着往上加', () => {
    const first = run(initialBreakState(), HOUR / TICK_MS + 1, busy);
    expect(first.fired).toBe(1);
    // 倒计时到点：这一坐归零……
    expect(first.state.activeMs).toBe(0);
    // ……而总数就是刚工作过的那一个小时。
    expect(first.state.totalMs).toBeGreaterThanOrEqual(HOUR);

    // 休息完接着工作十分钟：这一坐从零开始数，总数在上面接着加。
    const second = run(first.state, 20, busy, first.lastNow + TICK_MS);
    expect(second.state.activeMs).toBeGreaterThan(0);
    expect(second.state.activeMs).toBeLessThan(HOUR);
    expect(second.state.totalMs).toBeGreaterThan(first.state.totalMs);
  });

  it('总时间和这一坐记的是同一批毫秒 —— 没休息过的时候两个数一样', () => {
    const r = run(initialBreakState(), 40, busy);
    expect(r.state.totalMs).toBe(r.state.activeMs);
  });

  // ⭐⭐ 2026-08-27 第二轮（Ocean:「可以做成今天，按天算，但是注意 24:00 时，如果用户还在
  // 工作，就需要继续计算专注时间，一直到用户睡觉再断」）。
  // 断点是**人停下来**，⛔ 不是钟走过 0 点 —— 这一组把两边都钉住。
  describe('按天算，但午夜不切', () => {
    /** 本地时间当天 23:40，好让 +40 分钟正好跨过午夜。 */
    const nearMidnight = (): number => {
      const d = new Date(T0);
      d.setHours(23, 40, 0, 0);
      return d.getTime();
    };

    it('人没停下来，跨过午夜也不翻篇 —— 熬夜那两小时仍然记在昨天', () => {
      const start = nearMidnight();
      // 从 23:40 一直干到 00:20，中间一次都没断（每 30 秒一个 tick）。
      const r = run(initialBreakState(), 80, busy, start);
      expect(r.state.dayKey).toBe(dayKeyOf(start));
      // 跨过午夜了，但 dayKey 还是**开始那一天**。
      expect(dayKeyOf(r.lastNow)).not.toBe(dayKeyOf(start));
      expect(r.state.totalMs).toBeGreaterThanOrEqual(39 * 60 * 1000);
    });

    it('睡了一觉再回来（隔了超过 N 分钟 + 日期变了）才翻篇', () => {
      const start = nearMidnight();
      const first = run(initialBreakState(), 40, busy, start);
      const worked = first.state.totalMs;
      expect(worked).toBeGreaterThan(0);

      // 睡觉：八小时之后再开工。
      const nextMorning = first.lastNow + 8 * 60 * 60 * 1000;
      const second = run(first.state, 4, busy, nextMorning);
      expect(second.state.dayKey).toBe(dayKeyOf(nextMorning));
      // 昨天那些分钟没有被算进今天。
      expect(second.state.totalMs).toBeLessThan(worked);
    });

    it('同一天里歇了半小时，回来接着加，⛔ 不清零', () => {
      const first = run(initialBreakState(), 40, busy);
      const worked = first.state.totalMs;
      // 半小时不在（超过 N，这一坐会断），但还是同一天。
      const later = first.lastNow + 30 * 60 * 1000;
      const second = run(first.state, 4, busy, later);
      expect(second.state.dayKey).toBe(first.state.dayKey);
      expect(second.state.totalMs).toBeGreaterThan(worked);
    });

    it('关掉 Spool 五分钟再打开，不算断，也不翻篇（重启走的就是这条）', () => {
      const start = nearMidnight();
      const first = run(initialBreakState(), 40, busy, start);
      // 模拟重启：这一坐没了（lastTickAt=null），但落盘那三个数读了回来。
      const restored = {
        ...initialBreakState(),
        totalMs: first.state.totalMs,
        dayKey: first.state.dayKey,
        lastActiveAt: first.state.lastActiveAt,
      };
      const back = run(restored, 4, busy, first.lastNow + 5 * 60 * 1000);
      expect(back.state.dayKey).toBe(first.state.dayKey);
      expect(back.state.totalMs).toBeGreaterThanOrEqual(first.state.totalMs);
    });

    it('⛔ 合盖睡觉：中间一个 tick 都没跑过，第二天照样翻篇', () => {
      const start = nearMidnight();
      const first = run(initialBreakState(), 40, busy, start);
      const worked = first.state.totalMs;
      // ⚠️ 关键：**不跑任何中间 tick**（机器睡着了），直接第二天早上继续。
      // 所以 `lastTickAt` 还停在昨晚 —— 第一版就是在这儿把昨天的时间接着往今天加的。
      const nextMorning = first.lastNow + 9 * 60 * 60 * 1000;
      const back = run(first.state, 4, busy, nextMorning);
      expect(back.state.dayKey).toBe(dayKeyOf(nextMorning));
      expect(back.state.totalMs).toBeLessThan(worked);
    });

    it('shouldRollDay 自己的四种情况', () => {
      const day = dayKeyOf(T0);
      const base = { ...initialBreakState(), dayKey: day, totalMs: 1000 };
      // 从来没记过 → 不翻
      expect(shouldRollDay(initialBreakState(), T0)).toBe(false);
      // 断过 + 换天 → 翻
      const nextDay = T0 + 26 * 60 * 60 * 1000;
      expect(shouldRollDay({ ...base, lastActiveAt: T0 }, nextDay)).toBe(true);
      // 没断 + 换天 → ⛔ 不翻（这就是午夜那一条）
      expect(shouldRollDay({ ...base, lastActiveAt: nextDay - 60_000 }, nextDay)).toBe(false);
      // 断过 + 同一天 → 不翻
      expect(shouldRollDay({ ...base, lastActiveAt: T0 }, T0 + 30 * 60 * 1000)).toBe(false);
    });
  });

  it('cannot be handed an hour by a laptop waking up', () => {
    // ⚠️⚠️ The case a start-timestamp design gets wrong, and the reason the streak is built from
    // capped ticks. Lid closed at 45 minutes in, opened six hours later with the window still
    // frontmost and (as far as arithmetic goes) input inside the grace window.
    const worked = run(initialBreakState(), 90, busy); // 44.5 min
    const sleep = 6 * 60 * 60 * 1000;
    const wake = tickBreakState(worked.state, {
      now: worked.lastNow + sleep,
      workMs: HOUR,
      ...busy(),
    });
    expect(wake.due).toBe(false);
    expect(wake.state.activeMs - worked.state.activeMs).toBeLessThanOrEqual(MAX_TICK_CREDIT_MS);
  });

  it('never credits time before the user arrived', () => {
    // The first tick of a sitting starts the clock at zero credit; otherwise every arrival would
    // be billed a free tick, and a user who alternated app-switching with single ticks could
    // accumulate an hour without ever working one.
    const first = tickBreakState(initialBreakState(), { now: T0, workMs: HOUR, ...busy() });
    expect(first.state.activeMs).toBe(0);
    expect(first.state.lastTickAt).toBe(T0);
  });

  it('leaves a never-started streak alone while nobody is there', () => {
    const idle = tickBreakState(initialBreakState(), { now: T0, workMs: HOUR, ...away() });
    expect(idle.state).toEqual(initialBreakState());
  });
});

// —— 2026-08-21: the three acceptance cases WORKPLAN §9 施工细节 A wrote for this change ——————
//
// They are copied here rather than paraphrased, because two of them are exactly the behaviours
// the OLD rule got wrong and the third is the one it got right and must keep getting right.
describe('the rewritten criterion, against its own acceptance list', () => {
  it('① an hour in another application, capturing at least once every N, fires', () => {
    // A capture every ten minutes — inside N the whole way.
    const ticks = HOUR / TICK_MS + 1;
    const r = run(initialBreakState(), ticks, (_i, now) => busyElsewhere(now - 10 * 60_000)());
    expect(r.fired).toBe(1);
  });

  it('①-bis one capture and then nothing does NOT keep the streak alive', () => {
    // ⚠️ The acceptance wording says 「每 15 分钟内至少有一次捕获」 and the frequency is the point:
    // capture once at minute 0 and sit in another app for an hour, and the streak dies at N.
    // That is correct behaviour, not a gap — Spool must not bill time it has no evidence for.
    const r = run(initialBreakState(), HOUR / TICK_MS + 1, () => busyElsewhere(T0)());
    expect(r.fired).toBe(0);
    // 这一坐没了（activeMs 归零、lastTickAt 清空）。⚠️ `totalMs` 不归零，理由同上。
    expect(r.state.activeMs).toBe(0);
    expect(r.state.lastTickAt).toBeNull();
  });

  it('② an hour of an untouched machine with Spool in front does not fire', () => {
    const r = run(initialBreakState(), HOUR / TICK_MS + 1, (_i, now) => ({
      focused: true,
      // Idle grows with the wall clock: nobody has touched anything since T0.
      systemIdleMs: now - T0,
      lastCaptureAt: null,
    }));
    expect(r.fired).toBe(0);
    expect(r.state.activeMs).toBe(0);
  });

  // 休息提醒的浮窗 (Ocean 2026-08-22). The reducer does not know about windows — it only ever
  // says `due`. What this pins is the FACT the split in useBreakReminder depends on: `due` can
  // now arrive on a tick where Spool is not frontmost, which was impossible under the old rule
  // and is the entire reason the overlay card had to exist. ⛔ If this ever goes back to false,
  // the popup path is dead code and the lock is covering other people's windows again.
  it('can come due while Spool is in the background — the popup exists for this tick', () => {
    const r = run(initialBreakState(), HOUR / TICK_MS + 1, (_i, now) =>
      busyElsewhere(now - 10 * 60_000)(),
    );
    expect(r.fired).toBe(1);
    // …and the tick it fired on had `focused: false`.
    expect(busyElsewhere(T0)().focused).toBe(false);
  });

  it('③ reading a long block in Spool for 14 minutes does not break the count', () => {
    // Frontmost, no input at all for fourteen minutes. The streak keeps accumulating, so the
    // clock in the sidebar does not jump backwards while someone reads.
    const started = run(initialBreakState(), 2, busy);
    const reading = run(
      started.state,
      28, // 14 minutes of ticks
      (_i, now) => ({ focused: true, systemIdleMs: now - started.lastNow, lastCaptureAt: null }),
      started.lastNow + TICK_MS,
    );
    expect(reading.state.activeMs).toBeGreaterThan(started.state.activeMs);
    expect(reading.state.activeMs).toBeGreaterThanOrEqual(14 * 60_000 - TICK_MS);
  });
});

// —— 2026-08-19, second pass: the interval is a setting ——————————————————————————————————
describe('a settable work interval', () => {
  it('fires at whichever interval it was handed, not at a built-in hour', () => {
    // The 30-minute arm. Same reducer, same ticks — the only difference is the number Settings
    // put in, which is the whole point of moving it out of a constant.
    const half = msForMinutes(30);
    const r = run(initialBreakState(), half / TICK_MS + 1, busy, T0, half);
    expect(r.fired).toBe(1);

    // …and at that point the default interval would still be counting.
    const atHour = run(initialBreakState(), half / TICK_MS + 1, busy);
    expect(atHour.fired).toBe(0);
  });

  it('fires at once when the interval is lowered below time already worked', () => {
    // ⚠️ The case the per-tick `workMs` creates and the honest answer to it: someone 40 minutes
    // into a sitting who switches from 60 to 30 has already worked past their new rule.
    const worked = run(initialBreakState(), 80, busy); // 39.5 min
    const r = tickBreakState(worked.state, {
      now: worked.lastNow + TICK_MS,
      workMs: msForMinutes(30),
      ...busy(),
    });
    expect(r.due).toBe(true);
    expect(r.state.activeMs).toBe(0);
  });

  it('falls back to 60 for anything that is not one of the three offered', () => {
    // settings.json is hand-editable and travels between builds.
    for (const m of WORK_MINUTE_OPTIONS) expect(workMinutesOrDefault(m)).toBe(m);
    expect(workMinutesOrDefault(7)).toBe(DEFAULT_WORK_MINUTES);
    expect(workMinutesOrDefault('60')).toBe(DEFAULT_WORK_MINUTES);
    expect(workMinutesOrDefault(null)).toBe(DEFAULT_WORK_MINUTES);
    expect(workMinutesOrDefault(undefined)).toBe(DEFAULT_WORK_MINUTES);
  });
});

describe('formatCountdown', () => {
  it('opens at the full five minutes and only reaches zero when the time is gone', () => {
    expect(formatCountdown(BREAK_MS)).toBe('5:00');
    // Half a second into the break — still 5:00, not 4:59.
    expect(formatCountdown(BREAK_MS - 500)).toBe('5:00');
    expect(formatCountdown(60_000)).toBe('1:00');
    expect(formatCountdown(59_400)).toBe('1:00');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    // A timer that fires late must not print a negative clock.
    expect(formatCountdown(-2_000)).toBe('0:00');
  });
});
