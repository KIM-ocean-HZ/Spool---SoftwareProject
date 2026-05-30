// Cross-window contract for the Phase 5 capture overlay.
//
// Two Tauri webview windows can't share JavaScript state, so they coordinate via
// Tauri events. This file is the single source of truth for those event names and
// payload shapes — main produces SHOW + SOURCE_UPDATE; overlay produces ACTION.
//
// The Rust command names + the OverlayCapturePayload field shape must stay in sync
// with src-tauri/src/capture.rs (where serde renames to camelCase).

import type { UndoOpKind } from '@/lib/undo/undoLog';
import type { Block } from '@/lib/db/blocks';

export const OVERLAY_SHOW_EVENT = 'overlay:show';
export const OVERLAY_ACTION_EVENT = 'overlay:action';
export const OVERLAY_SOURCE_UPDATE_EVENT = 'overlay:source-update';
export const OVERLAY_NOTICE_EVENT = 'overlay:notice';
// v2.9 §9.13: Rust emits this (from the mouse-down event tap) when the user clicks
// outside the capture toast, so the overlay dismisses itself and lets work continue.
export const OVERLAY_DISMISS_EVENT = 'overlay:dismiss';
// v2.9 §9.13: undo/redo confirmation shown in the overlay (floats over the user's current
// window, not just the main app) — carries OverlayUndoPayload.
export const OVERLAY_UNDO_EVENT = 'overlay:undo';

export const SHOW_OVERLAY_COMMAND = 'show_capture_overlay';
export const HIDE_OVERLAY_COMMAND = 'hide_capture_overlay';
export const RESIZE_OVERLAY_COMMAND = 'resize_capture_overlay';
export const UPDATE_OVERLAY_SOURCE_COMMAND = 'update_overlay_source';
export const SHOW_OVERLAY_NOTICE_COMMAND = 'show_capture_notice';
export const SHOW_UNDO_OVERLAY_COMMAND = 'show_undo_overlay';
// Disarms the click-outside dismiss watch when the user starts dragging the toast (so the
// relocated toast isn't dismissed by a click on its new position).
export const DISARM_DISMISS_COMMAND = 'disarm_capture_dismiss';

// v2.9 §9.13: the undo/redo confirmation card rendered in the overlay window. `op = 'empty'`
// is the "没有可撤销的操作" state; `mode` distinguishes 已撤销 from 已重做; `canRedo` gates
// the 重做 quick-action button.
export interface OverlayUndoPayload {
  op: UndoOpKind | 'empty';
  preview: string;
  mode: 'undone' | 'redone';
  canRedo: boolean;
}

export interface CaptureOverlayPayload {
  blockId: string;
  threadId: string;
  workspaceId: string;
  workspaceTitle: string;
  threadTitle: string;
  preview: string;
  fullContent: string;
  source: string | null;
  // The frontmost app at the moment of capture. Used by Rust (not the overlay UI) to
  // re-activate that app after show() so the user's keyboard focus returns there —
  // fixes the "next ⌘C goes to Spool instead of the browser" bug on macOS.
  prevSourceApp: string | null;
}

export interface OverlaySourceUpdate {
  blockId: string;
  source: string;
}

// Failure feedback shown in the overlay (so the user sees it even when the main
// window is hidden). 'empty' = clipboard was empty after retries; 'no-target' = no
// capture-target thread set; 'error' = unexpected failure with a human message.
export interface OverlayNotice {
  kind: 'empty' | 'no-target' | 'error';
  msg?: string;
}

// Discriminated union of every action the overlay can take. Main listens and applies
// the deltas to its own stores — DB writes are already done by the overlay.
export type OverlayAction =
  // v2.9 §9.13: a request for the main window to run undoStore.undo(). The overlay no
  // longer deletes the block itself — both the toast Undo and Cmd+Z share one reversal
  // path — so no blockId/threadId is needed.
  | { kind: 'undo' }
  // v2.9 §9.13: 重做 button on the undo-confirmation card → re-apply the last undone op.
  | { kind: 'redo' }
  | {
      kind: 'redirect';
      oldBlockId: string;
      oldThreadId: string;
      newBlock: Block;
      targetThreadId: string;
    }
  // The user accepted an AI capture-classification suggestion (§11.5). Unlike
  // 'redirect' this reparents in place (thread_id update, same block id) — main
  // already holds the full Block in its store, so only the ids need to cross.
  | {
      kind: 'suggestion-move';
      blockId: string;
      oldThreadId: string;
      newThreadId: string;
    }
  // v2.8 §20.6: pin/annotate from the expanded capture toast. DB write already
  // done in the overlay; main mirrors the change into blocksStore.
  | {
      kind: 'pin';
      blockId: string;
      threadId: string;
      pinned: boolean;
    }
  | {
      kind: 'annotate';
      blockId: string;
      threadId: string;
      annotation: string | null;
    };
