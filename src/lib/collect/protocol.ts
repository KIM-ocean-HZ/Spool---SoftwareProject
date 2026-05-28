// Cross-window contract for the §20.9 collect-mode panel (window label "collect").
//
// Three Tauri webview windows (main / overlay / collect) can't share JavaScript state,
// so they coordinate via Tauri events + invoke commands. This module is the single
// source of truth for the collect window's contract, mirroring lib/capture/overlayProtocol.ts.
//
// The command names must stay in sync with src-tauri/src/collect.rs.
//
// Step 5a wires only the open/close lifecycle. The staging-append event + the richer
// `collect:closed` payload (carrying the merged block on Send) land in 5b.

// main → Rust: show / hide / resize the dedicated collect panel window.
export const OPEN_COLLECT_PANEL_COMMAND = 'open_collect_panel';
export const CLOSE_COLLECT_PANEL_COMMAND = 'close_collect_panel';
export const RESIZE_COLLECT_PANEL_COMMAND = 'resize_collect_panel';

// Rust → collect window: long-press fired and the window was shown; the panel resets to
// a fresh staging session.
export const COLLECT_OPEN_EVENT = 'collect:open';

// collect window → main: the panel closed (user Discarded; 5b adds the Send variant), so
// main clears its `panelOpen` flag.
export const COLLECT_CLOSED_EVENT = 'collect:closed';

export type CollectClosedPayload = { kind: 'discarded' };
