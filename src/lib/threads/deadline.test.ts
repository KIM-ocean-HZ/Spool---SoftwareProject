import { describe, expect, it } from 'vitest';
import type { Thread } from '@/lib/db/threads';
import { DUE_SOON_DAYS, dueInDays } from './deadline';

// Local dates on purpose. The helper compares calendar days, so a test built out of UTC
// offsets would pass or fail depending on the machine's timezone — the same trap the golden
// fixtures have (HANDOFF §6.5).
const endOfLocalDay = (y: number, m: number, d: number): number =>
  new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
const NOON = (y: number, m: number, d: number): number => new Date(y, m - 1, d, 12, 0, 0).getTime();
const NOW = NOON(2026, 8, 7);

const thread = (patch: Partial<Thread>): Thread => ({
  id: 't1',
  workspaceId: 'w1',
  title: 'Flux',
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  createdAt: NOON(2026, 7, 8),
  updatedAt: NOW,
  completedAt: null,
  autoMaintain: null,
  ...patch,
});

// Two surfaces read this and they have to agree: the pinned 项目管理 row counts 「N 个快到期」
// and the matrix behind it colours the cards. A row saying 2 above a board showing 3 is
// worse than no count at all.
describe('dueInDays', () => {
  it('counts calendar days, so something due later today is 0 and not 1', () => {
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 10) }), NOW)).toBe(3);
    // THE case this helper exists for. The deadline is 23:59 today and it is noon: measured
    // in elapsed time that is half a day, which rounds to "1 day left" on the very day the
    // thing is due. It has to read 「今天到期」.
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 7) }), NOW)).toBe(0);
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 5) }), NOW)).toBe(-2);
    // Late by an hour is still late by a whole day's worth of wording — there is no
    // "-0 days" to render.
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 6) }), NOW)).toBe(-1);
  });

  it('a project with no deadline is not on the clock at all', () => {
    expect(dueInDays(thread({ deadline: null }), NOW)).toBeNull();
  });

  // The rule that is easy to lose: a finished project keeps its deadline (reopening restores
  // everything), so without this it would sit in 「快到期」 for ever — work already done,
  // nagging. Same filter the sidebar's countdown badge applies.
  it('a finished project is never due, even with a deadline in the past', () => {
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 2), status: 'done' }), NOW)).toBeNull();
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 8), status: 'done' }), NOW)).toBeNull();
  });

  it('the 快到期 window is inclusive of its own edge', () => {
    expect(dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 7 + DUE_SOON_DAYS) }), NOW)).toBe(
      DUE_SOON_DAYS,
    );
    expect(
      dueInDays(thread({ deadline: endOfLocalDay(2026, 8, 8 + DUE_SOON_DAYS) }), NOW),
    ).toBeGreaterThan(DUE_SOON_DAYS);
  });
});
