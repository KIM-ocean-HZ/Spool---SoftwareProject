// Cross-window contract for the Phase 5 capture overlay.
//
// Two Tauri webview windows can't share JavaScript state, so they coordinate via
// Tauri events. This file is the single source of truth for those event names and
// payload shapes — main produces SHOW + SOURCE_UPDATE; overlay produces ACTION.
//
// The Rust command names + the OverlayCapturePayload field shape must stay in sync
// with src-tauri/src/capture.rs (where serde renames to camelCase).

import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';

export const OVERLAY_SHOW_EVENT = 'overlay:show';
export const OVERLAY_ACTION_EVENT = 'overlay:action';
export const OVERLAY_SOURCE_UPDATE_EVENT = 'overlay:source-update';
export const OVERLAY_NOTICE_EVENT = 'overlay:notice';

export const SHOW_OVERLAY_COMMAND = 'show_capture_overlay';
export const HIDE_OVERLAY_COMMAND = 'hide_capture_overlay';
export const RESIZE_OVERLAY_COMMAND = 'resize_capture_overlay';
export const UPDATE_OVERLAY_SOURCE_COMMAND = 'update_overlay_source';
export const SHOW_OVERLAY_NOTICE_COMMAND = 'show_capture_notice';

// v2.8 §20 Track B: collect-mode (staging toast) event/command names. The overlay
// listens for `collect:open` to render staging UI and `collect:append` to add items;
// it emits `collect:closed` back to main so the main window can clear its mode flag.
export const COLLECT_OPEN_EVENT = 'collect:open';
export const COLLECT_APPEND_EVENT = 'collect:append';
export const COLLECT_CLOSED_EVENT = 'collect:closed';
export const SHOW_COLLECT_OVERLAY_COMMAND = 'show_collect_overlay';
export const APPEND_COLLECT_ITEM_COMMAND = 'append_collect_item';

export interface CollectAppendPayload {
  text: string;
  source: string | null;
}

// Emitted by the overlay back to main once the staging toast closes (Send completed,
// or Cancel discarded). Carries the new block (when Send succeeded) so main can drop
// it into its blocksStore and focus the window. `discarded` = true means user cancelled
// and nothing was written.
export type CollectClosedPayload =
  | {
      kind: 'sent';
      block: Block;
      threadId: string;
    }
  | { kind: 'discarded' };

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
  | {
      kind: 'redirect';
      oldBlockId: string;
      oldThreadId: string;
      newBlock: Block;
      targetThreadId: string;
    }
  | {
      kind: 'save-as-new';
      oldBlockId: string;
      oldThreadId: string;
      newBlock: Block;
      newThread: Thread;
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
