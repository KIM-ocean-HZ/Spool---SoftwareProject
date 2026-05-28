import type { Block } from '@/lib/db/blocks';

// Cross-window contract for the §20.9 collect-mode panel (window label "collect").
//
// Three Tauri webview windows (main / overlay / collect) can't share JavaScript state,
// so they coordinate via Tauri events + invoke commands. This module is the single
// source of truth for the collect window's contract, mirroring lib/capture/overlayProtocol.ts.
//
// The command names must stay in sync with src-tauri/src/collect.rs.

// main → Rust: show / hide / resize the dedicated collect panel window, and forward a
// captured-while-collecting item into it.
export const OPEN_COLLECT_PANEL_COMMAND = 'open_collect_panel';
export const CLOSE_COLLECT_PANEL_COMMAND = 'close_collect_panel';
export const RESIZE_COLLECT_PANEL_COMMAND = 'resize_collect_panel';
export const APPEND_COLLECT_ITEM_COMMAND = 'append_collect_item';

// Rust → collect window: long-press fired and the window was shown; the panel resets to
// a fresh staging session.
export const COLLECT_OPEN_EVENT = 'collect:open';
// Rust → collect window: a ⌥-capture landed while the panel is open (main forwarded the
// clipboard text + source); the panel stages it as a new item.
export const COLLECT_APPEND_EVENT = 'collect:append';
// collect window → main: the panel closed. `discarded` = nothing written; `sent` carries
// the merged block so main mirrors it into its stores and pushes the collect_send undo
// entry into the MAIN undo ring (§9.13 cross-window contract).
export const COLLECT_CLOSED_EVENT = 'collect:closed';

export interface CollectAppendPayload {
  text: string;
  source: string | null;
}

export type CollectClosedPayload =
  | { kind: 'discarded' }
  | { kind: 'sent'; block: Block; threadId: string };
