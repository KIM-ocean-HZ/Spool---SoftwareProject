import { beforeEach, describe, expect, it } from 'vitest';
import { useCaptureStore } from './captureStore';
import { useSettingsStore } from './settingsStore';

// DESIGN_FIRST_RUN 拍板点 5 (2026-08-02): the "that's the whole gesture" line appears
// under the FIRST block a new user ever captured — once, ever. Two ways that could go
// wrong, both covered here: it must not come back on later captures, and it must not
// appear at all for a library that predates the flag (Ocean's own, every existing user).
describe('captureStore.noteCapture', () => {
  beforeEach(() => {
    useCaptureStore.setState({ firstCaptureHintBlockId: null });
    useSettingsStore.setState({ firstCaptureHintPending: false });
  });

  it('arms the hint on the first capture after a fresh install, then never again', () => {
    useSettingsStore.setState({ firstCaptureHintPending: true });

    useCaptureStore.getState().noteCapture('block-1');
    expect(useCaptureStore.getState().firstCaptureHintBlockId).toBe('block-1');
    // Spent — this is what survives a restart, so the hint is gone next launch too.
    expect(useSettingsStore.getState().firstCaptureHintPending).toBe(false);

    useCaptureStore.getState().noteCapture('block-2');
    expect(useCaptureStore.getState().firstCaptureHintBlockId).toBe('block-1');
  });

  it('stays silent when the flag was never armed (existing library)', () => {
    useCaptureStore.getState().noteCapture('block-1');
    expect(useCaptureStore.getState().firstCaptureHintBlockId).toBeNull();
  });
});
