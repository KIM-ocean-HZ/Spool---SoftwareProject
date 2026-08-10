// 首日价值二期 §2.3 — the spool meter's arithmetic, kept out of the component so the
// awkward cases (exactly full, the step boundaries) can be pinned by tests rather than
// looked at in a screenshot.
//
// Ocean 2026-08-10: 「加一个 spool 线轴的小组件，记录用户的累积捕捉数量，线轴从空到被线缠满
// 做一个动态变化，积累 100 条捕捉线轴被缠满，然后提醒用户已经累积 100 条，再清空，中间状态
// 多做几个。」 plus 「加一个总线轴数统计，让用户有记录的成就感。」

/** Captures per spool. */
export const SPOOL_CAPACITY = 100;

/** How many wound steps there are between empty and full — 9 档 = 空 + 8 (拍板 2, and he
 *  took the cost: eight states to draw). Every 12.5 captures move the thread, so a user who
 *  captures two or three sees the widget change; at 4 档 they could capture a dozen and
 *  watch nothing happen, which is the disease this widget exists to treat. */
export const SPOOL_STEPS = 8;

export interface SpoolState {
  /** How many spools have been wound full, ever. §2.4: DERIVED, never stored — a stored
   *  counter is a second version of the truth that goes wrong the moment a block is
   *  deleted, and this one cannot disagree with the block table. */
  filled: number;
  /** How many captures are on the spool being wound now (SPOOL_CAPACITY when it is full). */
  onSpool: number;
  /** 0 (bare axle) … SPOOL_STEPS (wound full). */
  level: number;
  /** The moment worth saying something about: a spool just came up full and nothing has
   *  been captured since. It is a property of the count, not an event — so it survives a
   *  restart, and the next capture clears it by starting the next spool. */
  full: boolean;
}

export const spoolState = (captures: number): SpoolState => {
  const n = Math.max(0, Math.floor(captures));
  const filled = Math.floor(n / SPOOL_CAPACITY);
  const rest = n % SPOOL_CAPACITY;
  const full = filled > 0 && rest === 0;
  return {
    filled,
    onSpool: full ? SPOOL_CAPACITY : rest,
    level: full ? SPOOL_STEPS : Math.floor(rest / (SPOOL_CAPACITY / SPOOL_STEPS)),
    full,
  };
};

/** How many more captures until this spool is full. Zero only when it already is. */
export const untilFull = (s: SpoolState): number => SPOOL_CAPACITY - s.onSpool;
