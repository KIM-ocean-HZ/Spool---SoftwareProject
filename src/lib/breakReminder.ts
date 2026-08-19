// 情人节限定版 §4 (2026-08-19, Ocean) — 「连续工作超过一小时，跳出弹窗让用户休息」.
//
// He also handed over the rule and asked for it to be corrected rather than copied:
// 「我想到的判定规则，你需要理解，并修改成更加合理的规则：判断连续工作需要用户在固定时间段里打开
// spool，并放在最前端窗口，或者用户正在使用spool，中间间隔不超过五分钟」.
//
// His rule has three parts — Spool is frontmost, OR the user is actively using it, and gaps
// under five minutes do not break the streak. Taken literally the first two are joined by OR,
// and that is the one place it needs correcting:
//
//   ⚠️ **Frontmost alone is not work.** A window left in front while its owner is at lunch is
//   frontmost for an hour, and the reminder would fire at an empty desk — then again an hour
//   later. Worse, it would fire having measured nothing, which makes the one number in the
//   dialog («你已经专注一个小时了») false. So the two clauses are ANDed here: the window has to be
//   frontmost **and** have been touched inside the last five minutes. His five-minute grace is
//   what makes that fair — reading a long block without moving the mouse still counts, because
//   five minutes of stillness is reading, not absence.
//
//   ⚠️ **Blur does not reset, it pauses.** The five-minute grace has to cover leaving Spool as
//   well as sitting still in it, or every glance at a browser would zero an hour of real work.
//   Copying something in another app and coming back IS the product's main loop (the whole
//   capture path) — a rule that punished it would never reach an hour on a day of heavy use.
//
//   ⚠️ **The streak accumulates ACTIVE time, not wall-clock elapsed.** A gap under five minutes
//   is forgiven but it is not counted: stepping away for four minutes twice does not earn eight
//   minutes of 「专注」. What the dialog claims is time at the desk, so that is what is measured.
//
// The result is a reducer over (state, event) with no timers, no store and no DOM in it, which
// is the only way the awkward cases (the boundary at exactly five minutes; a machine that slept
// for six hours) can be pinned by tests instead of waited for by hand.
//
// ── 2026-08-19, second pass (Ocean) ──────────────────────────────────────────────────────────
// 「设置里面可以关闭休息提醒,做成两个 appearance 都有的功能…可以设置提醒时间,做成类似番茄钟的模
// 式…然后把 app 锁住」. Three things changed and none of them is in this file's rule:
//
//   - **It is no longer 情人节-only.** The earlier ruling (「休息提醒和 Gwen 彩蛋只在情人节版」)
//     is reversed for this half; the gate is now a setting, not a theme. Gwen stays 情人节-only.
//   - **The hour is a setting** — hence `workMs` on TickInput instead of a constant here.
//   - **The reminder locks the window for five minutes** instead of showing a card. That is
//     entirely the hook's and the component's business: this reducer still only answers 「has
//     this person worked long enough」, and the lock is what the caller does about it.

/** How long a gap in activity is forgiven before the streak is considered broken.
 *
 *  ⚠️ Ocean's number (「中间间隔不超过五分钟」), kept exactly. It does double duty — the longest
 *  stillness that still counts as reading, and the longest visit to another app that still
 *  counts as the same sitting. */
export const IDLE_GRACE_MS = 5 * 60 * 1000;

/** The work intervals the Settings picker offers, in minutes.
 *
 *  ⚠️ These three are not round numbers picked by eye — they are the arms of the study cited on
 *  that page (Diaz et al. 2026, BJSM: 5-minute breaks every 30 / 60 / 120 minutes). Offering
 *  exactly what was measured is what lets the sentence beside the picker be true of each choice
 *  rather than true in general. A fourth number would need its own source. */
export const WORK_MINUTE_OPTIONS = [30, 60, 120] as const;
export type WorkMinutes = (typeof WORK_MINUTE_OPTIONS)[number];

/** 60. Ocean's original 「超过一小时」 and the study's own conclusion happen to be the same number,
 *  which is why the default did not have to be chosen between them. */
export const DEFAULT_WORK_MINUTES: WorkMinutes = 60;

/** settings.json is hand-editable and travels between builds (DESIGN_LIBRARY_TRANSFER), so a
 *  value that is not one of the three has to fall back rather than become a 7-minute pomodoro
 *  nobody asked for. */
export const workMinutesOrDefault = (v: unknown): WorkMinutes =>
  (WORK_MINUTE_OPTIONS as readonly unknown[]).includes(v) ? (v as WorkMinutes) : DEFAULT_WORK_MINUTES;

export const msForMinutes = (minutes: number): number => minutes * 60 * 1000;

/** How long the lock stays up once the reminder is due.
 *
 *  ⚠️ Fixed at five minutes and deliberately NOT a setting, while the work interval is one. Five
 *  is the one number the study held constant across all three arms — it is the dose, not the
 *  schedule. Ocean asked for exactly this split (「用户可以在设置里面修改连续工作时间的设定,默认
 *  60 分钟,休息五分钟」): the part that has to fit a person's day is theirs to move, the part the
 *  evidence is actually about is not. */
export const BREAK_MS = 5 * 60 * 1000;

/** How often the hook feeds a tick in. Only used to bound how much a single tick may add — see
 *  `MAX_TICK_CREDIT`. */
export const TICK_MS = 30 * 1000;

/** The most one tick may add to the streak, however long the wall clock says it has been.
 *
 *  ⚠️⚠️ This is the sleep guard, and it is the reason the streak is built from ticks rather than
 *  from a start timestamp. A laptop closed at 14:00 and opened at 20:00 delivers one tick whose
 *  elapsed time is six hours, with the window still frontmost and `lastInputAt` still inside
 *  the grace window as far as arithmetic is concerned — a start-timestamp design would greet
 *  the user with 「你已经专注六个小时了」 the instant the lid came up. Crediting at most one tick's
 *  worth of time per tick means a sleep can never contribute more than 30 seconds, and the
 *  stale `lastInputAt` is then caught by the grace check on the following tick. */
export const MAX_TICK_CREDIT_MS = TICK_MS * 2;

export interface BreakState {
  /** Active milliseconds accumulated in the current sitting. */
  activeMs: number;
  /** When the last tick was credited (or the streak reset). Null before the first tick. */
  lastTickAt: number | null;
}

export const initialBreakState = (): BreakState => ({ activeMs: 0, lastTickAt: null });

export interface TickInput {
  now: number;
  /** Is the Spool window frontmost right now (document.hasFocus()). */
  focused: boolean;
  /** When the user last typed / clicked / scrolled / moved inside Spool. Null = never. */
  lastInputAt: number | null;
  /** How much active time earns a reminder — Settings → 休息提醒 → 连续工作时长, in ms.
   *
   *  ⚠️ Passed in on every tick rather than read from a constant, so a user who changes the
   *  setting mid-sitting gets the new rule on the next tick. Lowering it below what is already
   *  accumulated fires the reminder immediately, which is the honest answer: they have already
   *  worked longer than they just said they wanted to. */
  workMs: number;
}

export interface TickResult {
  state: BreakState;
  /** True on the single tick that crosses the hour. The caller shows the dialog and the streak
   *  is already reset in `state`, so the next reminder is a fresh hour away rather than one
   *  tick away. */
  due: boolean;
}

/** Is this moment part of a sitting at all?
 *
 *  Both clauses, ANDed — see the header. `lastInputAt === null` is a window that has been open
 *  since launch and never touched, which is not work no matter how long it lasts. */
export const isWorking = ({ now, focused, lastInputAt }: TickInput): boolean =>
  focused && lastInputAt !== null && now - lastInputAt <= IDLE_GRACE_MS;

/** One tick of the clock.
 *
 *  ⚠️ Returns a NEW state and never mutates: the hook holds this in a ref and React's strict
 *  mode would otherwise double-apply a tick in development. */
export const tickBreakState = (state: BreakState, input: TickInput): TickResult => {
  const { now } = input;
  const working = isWorking(input);

  // Not working. The streak survives a gap up to the grace window and dies past it. ⚠️ Measured
  // from the last CREDITED tick and not from `lastInputAt`, so a blurred window is treated the
  // same way an idle one is — one rule for 「away」, whichever way the user went away.
  if (!working) {
    if (state.lastTickAt === null) return { state, due: false };
    if (now - state.lastTickAt > IDLE_GRACE_MS) {
      return { state: initialBreakState(), due: false };
    }
    return { state, due: false };
  }

  // Working. First tick of a sitting only starts the clock — there is no earlier moment to
  // measure from, and crediting a full tick here would bill time before the user arrived.
  if (state.lastTickAt === null) {
    return { state: { activeMs: state.activeMs, lastTickAt: now }, due: false };
  }

  // ⚠️ A gap this long means the machine slept or the tab was throttled. The elapsed time is
  // real but it was not spent working, so it is capped rather than trusted (MAX_TICK_CREDIT_MS).
  const credit = Math.min(Math.max(now - state.lastTickAt, 0), MAX_TICK_CREDIT_MS);
  const activeMs = state.activeMs + credit;

  if (activeMs >= input.workMs) {
    // Reset as we fire. The dialog is the end of this sitting whether or not the user actually
    // rests — an un-reset streak would re-fire on the very next tick, thirty seconds later.
    return { state: { activeMs: 0, lastTickAt: now }, due: true };
  }
  return { state: { activeMs, lastTickAt: now }, due: false };
};

/** `m:ss` for the lock's countdown.
 *
 *  ⚠️ Rounds UP, so the lock opens showing 5:00 rather than 4:59 (a break that starts by
 *  visibly losing a second reads as already running late), and 0:00 appears only when the time
 *  really is gone. */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
