import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCaptureStore } from './captureStore';
import { useSettingsStore } from './settingsStore';

const captureCount = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/db/blocks', () => ({
  countCaptures: () => Promise.resolve(captureCount.n),
}));

// DESIGN_FIRST_RUN 拍板点 5 (2026-08-02) / 首日价值 §4.5 (2026-08-10): the one-time pack line.
//
// It used to appear under the FIRST block a new user ever captured. Ocean moved it to the
// THIRD (2026-08-10): at one capture there is nothing worth packing, so the line was an
// instruction for later, and later never came. Three ways this can go wrong, all covered:
// it must not fire early, it must not come back on later captures, and it must not appear at
// all for a library that predates the flag (Ocean's own, every existing user).
describe('captureStore.noteCapture', () => {
  beforeEach(() => {
    useCaptureStore.setState({ packHintBlockId: null });
    useSettingsStore.setState({ firstCaptureHintPending: false });
    captureCount.n = 0;
  });

  it('stays silent until the third capture, then fires once and never again', async () => {
    useSettingsStore.setState({ firstCaptureHintPending: true });

    captureCount.n = 1;
    useCaptureStore.getState().noteCapture('block-1');
    await vi.waitFor(() => expect(useCaptureStore.getState().packHintBlockId).toBeNull());
    // Not spent yet — an early capture must not burn the one shot.
    expect(useSettingsStore.getState().firstCaptureHintPending).toBe(true);

    captureCount.n = 2;
    useCaptureStore.getState().noteCapture('block-2');
    await vi.waitFor(() => expect(useCaptureStore.getState().packHintBlockId).toBeNull());

    captureCount.n = 3;
    useCaptureStore.getState().noteCapture('block-3');
    await vi.waitFor(() => expect(useCaptureStore.getState().packHintBlockId).toBe('block-3'));
    // Spent — this is what survives a restart, so the line is gone next launch too.
    expect(useSettingsStore.getState().firstCaptureHintPending).toBe(false);

    captureCount.n = 4;
    useCaptureStore.getState().noteCapture('block-4');
    await vi.waitFor(() => expect(useCaptureStore.getState().packHintBlockId).toBe('block-3'));
  });

  it('stays silent when the flag was never armed (existing library)', async () => {
    captureCount.n = 99;
    useCaptureStore.getState().noteCapture('block-1');
    await vi.waitFor(() => expect(useCaptureStore.getState().packHintBlockId).toBeNull());
  });
});
