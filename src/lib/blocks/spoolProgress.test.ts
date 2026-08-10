import { describe, expect, it } from 'vitest';
import { SPOOL_CAPACITY, SPOOL_STEPS, spoolState, untilFull } from './spoolProgress';

// 首日价值二期 §2.3/§2.4 — the two cases worth pinning are the ones a screenshot hides:
// what "exactly 100" shows, and where the eight steps actually change.
describe('spoolState', () => {
  it('starts empty and stays empty until the first step is earned', () => {
    expect(spoolState(0)).toEqual({ filled: 0, onSpool: 0, level: 0, full: false });
    expect(spoolState(12).level).toBe(0);
    expect(spoolState(13).level).toBe(1); // 12.5 rounded up to the next whole capture
  });

  it('moves one step every 12.5 captures, so nine states cover a spool', () => {
    const levels = [0, 13, 25, 38, 50, 63, 75, 88, 100].map((n) => spoolState(n).level);
    expect(levels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, SPOOL_STEPS]);
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

  it('survives a library that lost blocks (the number derived, never stored — §2.4)', () => {
    // A deleted block moves the count DOWN. Nothing here remembers a higher water mark,
    // which is exactly why 满轴数 is computed rather than incremented somewhere.
    expect(spoolState(99).filled).toBe(0);
    expect(spoolState(-3)).toEqual({ filled: 0, onSpool: 0, level: 0, full: false });
  });
});
