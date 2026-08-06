import type { Thread } from '@/lib/db/threads';

// DESIGN_WORKBENCH §9.4 — how close a project is to its deadline.
//
// Pulled out of the components because two surfaces read it and they must agree: the pinned
// 项目管理 row says "N 个快到期", and the matrix behind it colours the cards. A row that says
// 2 above a board showing 3 is worse than no count at all.

/** Inside this many days a deadline stops being a date and becomes a reason to look. */
export const DUE_SOON_DAYS = 3;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Whole days until this project is due — 0 today, negative when it is late, `null` when
 * there is nothing to be late for.
 *
 * ⚠️ **Calendar days, not elapsed milliseconds.** A deadline is stored as the last moment of
 * the chosen day, so subtracting `now` and rounding gives a fraction of a day for something
 * due this afternoon — which comes out as "1 day left" on the day it is actually due, and 0
 * only in the instant it expires. Comparing the two dates' midnights is what makes 「今天到期」
 * a thing the user can ever see. `Math.round` rather than a division, because a DST boundary
 * makes one of those "days" 23 or 25 hours long.
 *
 * ⚠️ A finished project is never due. Its deadline is kept (reopening restores the whole
 * thing) but counting it would keep 「快到期」 raised for work that is already done — the same
 * rule the sidebar's countdown badge already follows.
 */
export const dueInDays = (thread: Thread, now: number): number | null => {
  if (thread.deadline === null || thread.status === 'done') return null;
  return Math.round((startOfDay(thread.deadline) - startOfDay(now)) / 86_400_000);
};
