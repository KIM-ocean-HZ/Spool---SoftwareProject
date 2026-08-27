// Cross-window contract for the Phase 5 capture overlay.
//
// Since 2026-08-01 the overlay is not just another window — it is another PROCESS
// (`spool --overlay`, DESIGN_CAPTURE_HELPER_PROCESS), so the two sides share neither
// JavaScript state nor an event bus. Rust relays between them over the helper's
// stdin/stdout; the event names below are what each side sees locally, unchanged.
// This file stays the single source of truth for those names and payload shapes —
// main produces SHOW + SOURCE_UPDATE; overlay produces ACTION.
//
// The Rust command names + the OverlayCapturePayload field shape must stay in sync
// with src-tauri/src/capture.rs (where serde renames to camelCase).

import type { UndoOpKind } from '@/lib/undo/undoLog';
import type { Block, CreateBlockArgs } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';

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
// The overlay process keeps no settings store of its own (a second writer to
// settings.json is the same hazard as a second writer to the database), so Rust reads the
// user's language out of settings.json and pushes it in with every show.
export const OVERLAY_LANGUAGE_EVENT = 'overlay:language';
// 情人节限定版 (2026-08-19) — the theme rides in on the same channel, for the same reason.
// ⚠️ It CANNOT come from the `settings:changed` broadcast the main window emits: since
// 2026-08-01 the overlay is a separate PROCESS (src-tauri/src/overlay.rs), and a Tauri event
// does not cross a process boundary — nor could this window load settings.json if it wanted
// to, because capabilities/overlay.json grants it no `store:` permission. That is exactly how
// this shipped broken: the theme was wired to a mechanism that stopped existing.
export const OVERLAY_THEME_EVENT = 'overlay:theme';
// 休息提醒 (Ocean 2026-08-22) — 「跳弹窗…不跳主窗」. The break card floats over whatever the
// user is actually in, because since the 2026-08-21 criterion rewrite a sitting no longer has
// to be spent inside Spool to count. Carries OverlayBreakPayload.
export const OVERLAY_BREAK_EVENT = 'overlay:break';

export const SHOW_OVERLAY_COMMAND = 'show_capture_overlay';
export const HIDE_OVERLAY_COMMAND = 'hide_capture_overlay';
export const RESIZE_OVERLAY_COMMAND = 'resize_capture_overlay';
export const UPDATE_OVERLAY_SOURCE_COMMAND = 'update_overlay_source';
export const SHOW_OVERLAY_NOTICE_COMMAND = 'show_capture_notice';
export const SHOW_UNDO_OVERLAY_COMMAND = 'show_undo_overlay';
export const SHOW_BREAK_OVERLAY_COMMAND = 'show_break_reminder';
// The main window comes up because the user clicked the break card — never on its own.
// ⛔ See capture.rs raise_main_window for the two routes to this that are measured dead.
export const RAISE_MAIN_WINDOW_COMMAND = 'raise_main_window';
// Disarms the click-outside dismiss watch when the user starts dragging the toast (so the
// relocated toast isn't dismissed by a click on its new position).
export const DISARM_DISMISS_COMMAND = 'disarm_capture_dismiss';

// -- Database proxy (2026-08-01, DESIGN_CAPTURE_HELPER_PROCESS §3.3) -----------------
//
// 🚨 The overlay process must never open SQLite: getDb() runs migrateSchema +
// seedDefaults, and two processes doing that is the precondition of the 2026-05-29 data
// wipe rebuilt. So the toast's DB work is sent to the MAIN window, which owns the only
// connection, and the answer comes back. The overlay's call sites keep their ordinary
// signatures — see src/overlay/db.ts (client) and src/hooks/useOverlayDbHost.ts (server).

// Overlay → main window, carrying { id, op, args }; main → overlay carries the reply.
export const OVERLAY_DB_REQUEST_EVENT = 'overlay:db-request';
export const OVERLAY_DB_REPLY_EVENT = 'overlay:db-reply';
export const OVERLAY_DB_REQUEST_COMMAND = 'overlay_db_request';
export const OVERLAY_DB_REPLY_COMMAND = 'overlay_db_reply';

// One entry per DB call the toast makes: the argument object it sends and what it gets
// back. Keeping both halves in one map is what lets the client and the server share a
// single type and stay honest with each other.
export interface OverlayDbOps {
  updateBlockAnnotation: { args: { blockId: string; annotation: string | null }; result: null };
  deleteBlock: { args: { blockId: string }; result: null };
  togglePin: { args: { blockId: string }; result: boolean };
  createBlock: { args: CreateBlockArgs; result: Block };
  listWorkspaces: { args: Record<string, never>; result: Workspace[] };
  listAllThreads: { args: Record<string, never>; result: Thread[] };
}

export type OverlayDbOp = keyof OverlayDbOps;

export interface OverlayDbRequest {
  id: number;
  op: OverlayDbOp;
  args: unknown;
}

export interface OverlayDbReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

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
  /** ⭐ 长按 ⌥ 那一路（2026-08-27，Ocean:「长按 ⌥ 弹同一个浮窗，但正文是空的、给人直接写」）。
   *
   *  ⚠️ 这一路和捕捉最大的不同：**块还没存**。捕捉是「先落库再弹窗」（剪贴板里的东西
   *  丢不得），而这一条的正文还在人脑子里 —— 先存一个空块，等他按 Esc 就成了库里一条谁也
   *  不想要的空记录。⇒ `blockId` 在这一路是空串，写完了才由浮窗自己 `createBlock`。
   *
   *  ⚠️ 来源留空 = pack 里的 💭 Personal（权重最高的那一类），这是 Ocean 要的。 */
  noteMode?: boolean;
}

export interface OverlaySourceUpdate {
  blockId: string;
  source: string;
}

// Failure feedback shown in the overlay (so the user sees it even when the main
// window is hidden). 'empty' = clipboard was empty after retries; 'no-target' = no
// capture-target thread set; 'error' = unexpected failure with a human message.
// 休息提醒 (2026-08-22). `workMinutes` is the interval that just elapsed, so the card can
// name the real number instead of a hard-coded hour — Settings owns that value.
export interface OverlayBreak {
  workMinutes: number;
}

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
    }
  // ⭐ 长按 ⌥ 写完了一条笔记。⚠️ 库已经由浮窗写好了（`createBlock` 走 DB 桥），
  // 这一条只是让主窗把它并进自己的 store —— 和 'redirect' 里的 newBlock 同一个道理。
  | { kind: 'note-created'; block: Block; threadId: string }
  // 休息提醒 (2026-08-22): the user clicked the break card. Main brings its window up and
  // puts the lock on — in that order, so the five minutes start where the user can see them.
  | { kind: 'break-open' }
  // …or dismissed it. ⚠️ The streak resets either way and nothing is re-shown: the product's
  // 「quiet」 rule says a thing once. A reminder that keeps coming back is a reminder people
  // learn to close without reading, and then it is worth less than not sending it.
  | { kind: 'break-skip' };
