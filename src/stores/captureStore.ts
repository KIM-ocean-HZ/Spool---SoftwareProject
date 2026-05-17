import { create } from 'zustand';

// Capture-related main-window state. Failure feedback (clipboard empty / no target /
// error) lives in the overlay window (PLAN_EN.md §Phase 5), so this store no longer
// owns notice state — only the sidebar/feed flash that confirms where a successful
// capture landed.
interface CaptureState {
  flashThreadId: string | null;
  flashBlockId: string | null;
  setFlash: (threadId: string, blockId: string) => void;
  clearFlash: () => void;
}

export const buildPreview = (text: string, max: number = 14): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  flashThreadId: null,
  flashBlockId: null,
  setFlash: (threadId, blockId) => set({ flashThreadId: threadId, flashBlockId: blockId }),
  clearFlash: () => set({ flashThreadId: null, flashBlockId: null }),
}));
