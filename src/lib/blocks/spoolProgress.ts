// 首日价值二期 §2.3 — the spool meter's arithmetic, kept out of the component so the
// awkward cases (exactly full, the step boundaries) can be pinned by tests rather than
// looked at in a screenshot.
//
// Ocean 2026-08-10: 「加一个 spool 线轴的小组件，记录用户的累积捕捉数量，线轴从空到被线缠满
// 做一个动态变化，积累 100 条捕捉线轴被缠满，然后提醒用户已经累积 100 条，再清空，中间状态
// 多做几个。」 plus 「加一个总线轴数统计，让用户有记录的成就感。」

/** Captures per spool. */
export const SPOOL_CAPACITY = 100;

/** How many wound steps there are between empty and full.
 *
 *  ⚠️ Ocean raised this from 8 to **20** after seeing it installed (2026-08-10): 「线轴的状态
 *  增加,变成 20 个」. One step is now **5 captures**, so a user who captures a handful sees the
 *  thread move — which is the whole disease this widget treats.
 *
 *  ⚠️ 20 steps is what forced the meter's shape to change (SpoolMeter.tsx). At 8 steps the
 *  wound thread grew in thickness; split twenty ways that growth is half a CSS pixel per
 *  step, i.e. a state the user cannot see. One step now adds one whole turn of thread. */
export const SPOOL_STEPS = 20;

/** How many frames the 情人节 heart is drawn in (2026-08-19, Ocean: 「同样绘制多帧（25）」).
 *
 *  ⚠️ It is a different number from SPOOL_STEPS on purpose, and it is not interchangeable with
 *  it: 25 divides SPOOL_CAPACITY exactly (4 captures per frame, against the spool's 5), so
 *  every frame is the same width. A step count that does not divide 100 would make the last
 *  frame short, and the FULL frame is the one the app says something about (拍板 4).
 *
 *  ⚠️ 25 frames of a heart that GROWS is legible in a way 20 turns of thread was not — see
 *  SpoolMeter's note on half-pixel steps. The heart's smallest and largest frames differ by a
 *  factor of about five, so one frame is roughly 4% of the mark's size. */
export const HEART_STEPS = 25;

export interface SpoolState {
  /** How many spools have been wound full, ever. §2.4: DERIVED, never stored — a stored
   *  counter is a second version of the truth that goes wrong the moment a block is
   *  deleted, and this one cannot disagree with the block table. */
  filled: number;
  /** How many captures are on the spool being wound now (SPOOL_CAPACITY when it is full). */
  onSpool: number;
  /** 0 (bare axle / smallest heart) … `steps` (wound full / whole heart). One turn of thread
   *  per step for the spool; one frame per step for the 情人节 heart. */
  level: number;
  /** The moment worth saying something about: a spool just came up full and nothing has
   *  been captured since. It is a property of the count, not an event — so it survives a
   *  restart, and the next capture clears it by starting the next spool. */
  full: boolean;
}

/** @param steps how many frames the mark on screen has. Defaults to the spool's 20, so every
 *  existing caller is unchanged; the 情人节 heart passes HEART_STEPS. ⚠️ Only `level` depends on
 *  it — `filled`, `onSpool` and `full` are facts about the library and are identical in both
 *  themes, which is what stops the same library from reporting two different 满轴数. */
export const spoolState = (captures: number, steps: number = SPOOL_STEPS): SpoolState => {
  const n = Math.max(0, Math.floor(captures));
  const filled = Math.floor(n / SPOOL_CAPACITY);
  const rest = n % SPOOL_CAPACITY;
  const full = filled > 0 && rest === 0;
  return {
    filled,
    onSpool: full ? SPOOL_CAPACITY : rest,
    level: full ? steps : Math.floor(rest / (SPOOL_CAPACITY / steps)),
    full,
  };
};

/** How many more captures until this spool is full. Zero only when it already is. */
export const untilFull = (s: SpoolState): number => SPOOL_CAPACITY - s.onSpool;
