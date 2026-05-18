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
  | { kind: 'undo'; blockId: string; threadId: string }
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
    };
