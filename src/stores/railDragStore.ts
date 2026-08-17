import { create } from 'zustand';

// Transient state of an in-flight sidebar project drag (v23 follow-up). The gesture itself
// lives in lib/sidebar/railDrag — this only holds what two other components need to see:
// the ghost that follows the cursor, and which workspace is lit up underneath it.
//
// ⚠️ `overWorkspaceId` is read as a boolean per group (`overWorkspaceId === ws.id`), so a
// group only re-renders when its own highlight flips, not on every pointermove.
interface RailDragState {
  /** Empty when no drag is in flight — that is also 「the ghost is hidden」. */
  ids: string[];
  /** Title of the row the drag started from; the ghost shows a count instead when ids > 1. */
  label: string;
  /** Cursor, in viewport CSS px. */
  x: number;
  y: number;
  /** Workspace under the cursor, or null when the cursor is not over one. */
  overWorkspaceId: string | null;
  begin: (ids: string[], label: string, x: number, y: number) => void;
  move: (x: number, y: number, overWorkspaceId: string | null) => void;
  end: () => void;
}

const IDLE = { ids: [] as string[], label: '', x: 0, y: 0, overWorkspaceId: null };

export const useRailDragStore = create<RailDragState>((set) => ({
  ...IDLE,
  begin: (ids, label, x, y) => set({ ids, label, x, y, overWorkspaceId: null }),
  move: (x, y, overWorkspaceId) => set({ x, y, overWorkspaceId }),
  end: () => set(IDLE),
}));
