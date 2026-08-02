import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

// Capture-related main-window state. Failure feedback (clipboard empty / no target /
// error) lives in the overlay window (PLAN_EN.md §Phase 5), so this store no longer
// owns notice state — only the sidebar/feed flash that confirms where a successful
// capture landed.
interface CaptureState {
  flashThreadId: string | null;
  flashBlockId: string | null;
  // DESIGN_FIRST_RUN 拍板点 5: the block that earns the one-time "that's the whole
  // gesture" line under it. Runtime-only — the "already seen" bit lives in
  // settings.json (`firstCaptureHintPending`), never in the database.
  firstCaptureHintBlockId: string | null;
  setFlash: (threadId: string, blockId: string) => void;
  clearFlash: () => void;
  noteCapture: (blockId: string) => void;
}

export const buildPreview = (text: string, max: number = 14): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  flashThreadId: null,
  flashBlockId: null,
  firstCaptureHintBlockId: null,
  setFlash: (threadId, blockId) => set({ flashThreadId: threadId, flashBlockId: blockId }),
  clearFlash: () => set({ flashThreadId: null, flashBlockId: null }),

  // Called after every successful capture. The closing line shows once and only for a
  // user whose first launch armed the flag — an existing library never has it, so
  // nobody who has been capturing for weeks suddenly gets told how capture works.
  // Consuming the flag here (not on render) is what makes it one-shot across restarts.
  noteCapture: (blockId) => {
    if (!useSettingsStore.getState().firstCaptureHintPending) return;
    void useSettingsStore.getState().update({ firstCaptureHintPending: false });
    set({ firstCaptureHintBlockId: blockId });
  },
}));
