import { create } from 'zustand';
import { countCaptures } from '@/lib/db/blocks';
import { useSettingsStore } from './settingsStore';

// Capture-related main-window state. Failure feedback (clipboard empty / no target /
// error) lives in the overlay window (PLAN_EN.md §Phase 5), so this store no longer
// owns notice state — only the sidebar/feed flash that confirms where a successful
// capture landed.
interface CaptureState {
  flashThreadId: string | null;
  flashBlockId: string | null;
  // DESIGN_FIRST_RUN 拍板点 5 / 首日价值 §4.5: the block that earns the one-time "you have
  // enough to pack now" line under it. Runtime-only — the "already seen" bit lives in
  // settings.json (`firstCaptureHintPending`), never in the database.
  packHintBlockId: string | null;
  setFlash: (threadId: string, blockId: string) => void;
  clearFlash: () => void;
  noteCapture: (blockId: string) => void;
}

// 首日价值 (DESIGN_NEXT_STAGE §4.5) — how many captures earn the one-time pack line.
//
// ⚠️ Ocean moved it here from the FIRST capture (2026-08-10), and against the recommendation.
// At capture 1 the user has nothing worth packing, so 「攒够几条再打包」 is a thing to remember
// for later — and later is where that instruction went to die. At 3 they can act on it now.
// The cost he took with that choice is real and was on the table: capture 1 now ends with no
// closing line at all, so the very first double-tap ⌥ confirms itself only by the block that
// appears. (The flag's name still says `firstCapture` — it is persisted in settings.json and
// renaming a stored key buys nothing but a migration.)
const PACK_HINT_AFTER = 3;

export const buildPreview = (text: string, max: number = 14): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  flashThreadId: null,
  flashBlockId: null,
  packHintBlockId: null,
  setFlash: (threadId, blockId) => set({ flashThreadId: threadId, flashBlockId: blockId }),
  clearFlash: () => set({ flashThreadId: null, flashBlockId: null }),

  // Called after every successful capture. The line shows once and only for a user whose
  // first launch armed the flag — an existing library never has it, so nobody who has been
  // capturing for weeks suddenly gets told how capture works. Consuming the flag here (not
  // on render) is what makes it one-shot across restarts.
  //
  // The flag is checked BEFORE the count so an armed-flag library is the only one that ever
  // pays for the query — everyone else returns on a synchronous read of settings.
  noteCapture: (blockId) => {
    if (!useSettingsStore.getState().firstCaptureHintPending) return;
    void (async () => {
      if ((await countCaptures()) < PACK_HINT_AFTER) return;
      void useSettingsStore.getState().update({ firstCaptureHintPending: false });
      set({ packHintBlockId: blockId });
    })();
  },
}));
