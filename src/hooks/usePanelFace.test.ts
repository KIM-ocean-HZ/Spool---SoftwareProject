import { describe, expect, it } from 'vitest';
import { FACE_FALLBACK_MS, FACE_HOLD_MS, shouldRotate } from './usePanelFace';

// The one number in the rule, at its boundary. The rest of usePanelFace is a listener and a
// toggle; this is the part that decides whether the panel flickers.
describe('shouldRotate', () => {
  const T0 = 1_700_000_000_000;

  it('holds a face for the full hold and swaps at exactly it', () => {
    expect(shouldRotate(T0, T0)).toBe(false);
    expect(shouldRotate(T0, T0 + FACE_HOLD_MS - 1)).toBe(false);
    expect(shouldRotate(T0, T0 + FACE_HOLD_MS)).toBe(true);
    expect(shouldRotate(T0, T0 + 10 * FACE_HOLD_MS)).toBe(true);
  });

  it('does not swap on a clock that ran backwards', () => {
    // NTP correction, or a laptop that woke with a stale time. Refusing is the safe answer:
    // the next blur a minute later will do it.
    expect(shouldRotate(T0, T0 - 5_000)).toBe(false);
  });
});

// The fallback path (2026-08-19, Ocean: 「要，时间长一点」). It shares shouldRotate with the blur
// path and differs only in the hold it is asked about — this pins that the two cannot be confused.
describe('shouldRotate at the fallback hold', () => {
  const T0 = 1_700_000_000_000;

  it('holds far longer than a blur swap does', () => {
    expect(FACE_FALLBACK_MS).toBeGreaterThan(FACE_HOLD_MS);
    expect(shouldRotate(T0, T0 + FACE_HOLD_MS, FACE_FALLBACK_MS)).toBe(false);
    expect(shouldRotate(T0, T0 + FACE_FALLBACK_MS - 1, FACE_FALLBACK_MS)).toBe(false);
    expect(shouldRotate(T0, T0 + FACE_FALLBACK_MS, FACE_FALLBACK_MS)).toBe(true);
  });
});
