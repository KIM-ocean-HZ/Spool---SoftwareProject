import type { Block } from '@/lib/db/blocks';
import type { StagingItem } from './stagingBuffer';

// Cross-window contract for the §20.9 collect-mode panel (window label "collect").
//
// Three Tauri webview windows (main / overlay / collect) can't share JavaScript state,
// so they coordinate via Tauri events + invoke commands. This module is the single
// source of truth for the collect window's contract, mirroring lib/capture/overlayProtocol.ts.
//
// The command names must stay in sync with src-tauri/src/collect.rs.

// main → Rust: show / hide / resize / reposition the dedicated collect panel window, and
// forward a captured-while-collecting item into it.
export const OPEN_COLLECT_PANEL_COMMAND = 'open_collect_panel';
export const CLOSE_COLLECT_PANEL_COMMAND = 'close_collect_panel';
export const RESIZE_COLLECT_PANEL_COMMAND = 'resize_collect_panel';
export const REPOSITION_COLLECT_PANEL_COMMAND = 'reposition_collect_panel';
export const APPEND_COLLECT_ITEM_COMMAND = 'append_collect_item';

// Rust → collect window: long-press fired and the window was shown; the panel resets to
// a fresh staging session.
export const COLLECT_OPEN_EVENT = 'collect:open';
// Rust → collect window: a ⌥-capture landed while the panel is open (main forwarded the
// clipboard text + source); the panel stages it as a new item.
export const COLLECT_APPEND_EVENT = 'collect:append';
// collect window → main: the panel closed. `discarded` = nothing written; `sent` carries
// the merged block (so main mirrors it + pushes the collect_send undo entry into the MAIN
// undo ring) plus the pre-merge staging items (so an undo can re-stage them — §9.13).
export const COLLECT_CLOSED_EVENT = 'collect:closed';
// collect window → main: Cmd+Z was pressed in the panel and its local sub-undo log was
// empty, so fall through to the main undo ring (§9.13).
export const COLLECT_UNDO_MAIN_EVENT = 'collect:undo-main';
// main → collect window: a collect_send op was undone while the panel is open and empty,
// so re-stage the original items (§9.13).
export const COLLECT_RESTAGE_EVENT = 'collect:restage';
// Rust → collect window: a single clean ⌥ tap while the panel is open (§20.9 v2.10) —
// toggle the panel between the compact pill and the full card.
export const COLLECT_TOGGLE_COLLAPSE_EVENT = 'collect:toggle-collapse';
// main → collect window: the capture target changed (sidebar / header / tray toggle, §9.2).
// The panel re-reads the target so its destination header stays current while open — the
// toggle is a pure state change (§9.2), so the target can move mid-session. No payload; the
// collect window has its own DB access and re-queries the target itself.
export const CAPTURE_TARGET_CHANGED_EVENT = 'capture-target:changed';

export interface CollectAppendPayload {
  text: string;
  source: string | null;
}

export type CollectClosedPayload =
  | { kind: 'discarded' }
  // Send merges the buffer into ONE block (per-item annotations kept as inline segments).
  // `items` are the pre-send staging items, kept so an undo can re-stage them (§9.13).
  | { kind: 'sent'; block: Block; threadId: string; items: StagingItem[] };

export interface CollectRestagePayload {
  items: StagingItem[];
}
