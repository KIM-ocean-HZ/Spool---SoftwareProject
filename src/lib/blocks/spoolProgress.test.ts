import { describe, expect, it } from 'vitest';
import { HEART_STEPS, SPOOL_CAPACITY, SPOOL_STEPS, spoolState, untilFull } from './spoolProgress';

// 首日价值二期 §2.3/§2.4 — the two cases worth pinning are the ones a screenshot hides:
// what "exactly 100" shows, and where the twenty steps actually change.
describe('spoolState', () => {
  it('starts empty and stays empty until the first step is earned', () => {
    expect(spoolState(0)).toEqual({ filled: 0, onSpool: 0, level: 0, full: false });
    expect(spoolState(4).level).toBe(0);
    expect(spoolState(5).level).toBe(1);
  });

  it('lays down one turn of thread every 5 captures (Ocean 2026-08-10: 20 档)', () => {
    expect(SPOOL_STEPS).toBe(20);
    const levels = [0, 5, 25, 50, 95, 99, 100].map((n) => spoolState(n).level);
    expect(levels).toEqual([0, 1, 5, 10, 19, 19, SPOOL_STEPS]);
  });

  it('shows the 100th capture as a FULL spool, not an empty next one', () => {
    // The whole point of 拍板 4: at exactly 100 there is something to say, and saying it
    // over a picture of an empty spool would be nonsense.
    const s = spoolState(SPOOL_CAPACITY);
    expect(s).toEqual({ filled: 1, onSpool: 100, level: SPOOL_STEPS, full: true });
    expect(untilFull(s)).toBe(0);
  });

  it('clears the spool on the next capture and keeps the one already wound', () => {
    const s = spoolState(SPOOL_CAPACITY + 1);
    expect(s).toEqual({ filled: 1, onSpool: 1, level: 0, full: false });
    expect(untilFull(s)).toBe(99);
  });

  it('counts every full spool, so the total never resets', () => {
    expect(spoolState(250).filled).toBe(2);
    expect(spoolState(250).onSpool).toBe(50);
    expect(spoolState(300).full).toBe(true);
    expect(spoolState(300).filled).toBe(3);
  });

  // 情人节限定版 (2026-08-19, Ocean: 「同样绘制多帧（25）」) — the heart is drawn in 25 frames where
  // the spool has 20 turns. `steps` is the only thing that changes.
  it('lays down one heart frame every 4 captures (25 档)', () => {
    expect(HEART_STEPS).toBe(25);
    const levels = [0, 3, 4, 40, 96, 99, 100].map((n) => spoolState(n, HEART_STEPS).level);
    expect(levels).toEqual([0, 0, 1, 10, 24, 24, HEART_STEPS]);
  });

  it('reports the SAME library either way — only `level` is per-theme', () => {
    // ⚠️ The invariant that stops one library from having two different 满轴数. If a future theme
    // ever needs its own capacity too, this is the test that will fail, and it should.
    for (const n of [0, 1, 57, 99, 100, 101, 250, 300]) {
      const spool = spoolState(n, SPOOL_STEPS);
      const heart = spoolState(n, HEART_STEPS);
      expect({ ...heart, level: 0 }).toEqual({ ...spool, level: 0 });
    }
  });

  it('defaults to the spool\'s 20 steps, so every existing caller is unchanged', () => {
    expect(spoolState(50)).toEqual(spoolState(50, SPOOL_STEPS));
  });

  it('survives a library that lost blocks (the number derived, never stored — §2.4)', () => {
    // A deleted block moves the count DOWN. Nothing here remembers a higher water mark,
    // which is exactly why 满轴数 is computed rather than incremented somewhere.
    expect(spoolState(99).filled).toBe(0);
    expect(spoolState(-3)).toEqual({ filled: 0, onSpool: 0, level: 0, full: false });
  });
});
