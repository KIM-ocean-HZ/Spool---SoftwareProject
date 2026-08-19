import { describe, expect, it } from 'vitest';
import { FACE_HOLD_MS, shouldRotate } from './usePanelFace';

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
