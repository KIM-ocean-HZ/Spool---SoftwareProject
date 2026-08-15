import { invoke } from '@tauri-apps/api/core';

// The AI clients Spool can wire itself into.
//
// This table lived inside Settings/McpConfig while connecting was the only thing anyone did
// with it. DESIGN_WORKBENCH §9.13 added a second reader — 项目管理's 「问 AI」 button — so it
// moved here rather than being copied; that reader is gone (2026-08-15) and Settings is again
// the only one, but the file stays split: the Rust side's own table (mcp.rs
// client_config_paths) is the authority on where each config file lives, and this is the
// user-facing half of the same thing.
//
// ⚠️⚠️ **What this file no longer holds, and what it would cost to write again.**
// Until 2026-08-15 it also carried `HOW_TO_ADDRESS` — how to name Spool inside each client's
// own chat box — plus `askPrompt` / `askInClient` / `focusClient` / `readConnectedClients`,
// which put an opener on the clipboard and brought that client forward. All of it went with
// the 「帮用户去别的 AI 里点名 Spool」 route (RightRail/McpBar's header has Ocean's reasoning).
//
// The table was three measurements deep, not a guess, and re-deriving it is the expensive
// part. **Before anyone builds an addressing feature again, read those measurements rather
// than re-running them** — `docs/HANDOFF.md §0-now.3-ter…septies` and
// `docs/CASE_STUDY_LEDGER.md §3.39–3.41`. The three that cost the most:
//   ① A pasted `@spool` is inert in Codex — the client builds a mention when the user PICKS
//      one, never from characters, so no clipboard can carry one.
//   ② Claude Code's `/` menu SHOWS `/spool:catch_up (MCP)` but only answers to
//      `/mcp__spool__catch_up`, and it splits arguments on whitespace with quotes passed
//      through verbatim — so a quoted title matches nothing at all.
//   ③ There is no shared convention to fall back on: `@` opens a FILE path in Claude Code and
//      pulls in files or chat participants in Cursor / VS Code / Windsurf, so a guessed prefix
//      is worse than naming nothing.

/** 2026-07-31 (Ocean): Claude Code promoted to a first-class one-click target, and the
 *  other popular clients that keep their MCP servers in a plain JSON file joined it. */
export type McpClient =
  | 'claude'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'codex';

/** §20.12 one-click hookup: per-client connection state shown as a badge. "written" is a
 *  UI-only refinement of "configured" — the entry now points at this binary, but the client
 *  reads its config at launch, so a restart note is the truth. */
export type McpClientStatus =
  | 'not-installed'
  | 'unconfigured'
  | 'configured'
  | 'stale'
  | 'written';

export const MCP_CLIENTS: { key: McpClient; label: string }[] = [
  { key: 'claude', label: 'Claude Desktop' },
  { key: 'claude-code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  // Microsoft's brand rules forbid the "VS Code" / "vscode" short forms; the full
  // product name is the only permitted spelling (docs/DESIGN_MCP_ECOSYSTEM.md §3.4).
  { key: 'vscode', label: 'Visual Studio Code' },
  { key: 'windsurf', label: 'Windsurf' },
  // ⚠️ This row said 「ChatGPT / Codex」 until 2026-08-12, on the reasoning that one config
  // file (`~/.codex/config.toml`) feeds both products. The file really is shared; the
  // capability is not. An ordinary ChatGPT conversation is hosted, and a hosted chat cannot
  // connect to a local stdio MCP server at all — OpenAI documents this
  // (learn.chatgpt.com/docs/extend/mcp: hosted chats get remote, HTTPS-backed tools only),
  // and it was measured here the same day: that turn opened no local thread, started no
  // `spool --mcp`, and Spool's heartbeat recorded no tool call. The surfaces that CAN run a
  // local server are Codex inside the ChatGPT desktop app, the Codex CLI, and the IDE
  // extension — which is what this row now names. `McpConfig` carries the sentence that
  // keeps it findable for someone looking for the word "ChatGPT".
  { key: 'codex', label: 'Codex' },
];

/** Reachable right now: the entry is in that client's config and points at this binary.
 *  `written` counts — the file is correct, the client just has not restarted yet. */
export const isConnected = (s: McpClientStatus | null | undefined): boolean =>
  s === 'configured' || s === 'written';

/** Read every client's state in one pass. Failures come back as null rather than throwing:
 *  a client whose config we cannot read is simply not offered. */
export const readClientStatuses = async (): Promise<
  Record<McpClient, McpClientStatus | null>
> => {
  const entries = await Promise.all(
    MCP_CLIENTS.map(async ({ key }) => {
      try {
        return [key, await invoke<McpClientStatus>('mcp_client_status', { client: key })] as const;
      } catch (e) {
        console.warn('[mcp] client status failed', key, e);
        return [key, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<McpClient, McpClientStatus | null>;
};

/** One row of the heartbeat file the MCP server keeps (mcp.rs `record_client_seen`). */
export type ClientSeen = { label: string; last_seen: number };

/**
 * When each client last actually connected — the other half of the badge.
 *
 * `readClientStatuses` above reads the client's own config file, so it can only say whether
 * an entry exists. On 2026-08-11 that read green for a client that had not connected in
 * twenty hours, and two acceptance runs wrote nothing at all (CASE_STUDY_LEDGER §3.33). Only
 * the server sees the truth, and it records it on every `initialize`.
 *
 * Keys are the six client ids where the server could identify the product, and the client's
 * own name where it could not — so an unrecognised client is visible rather than silently
 * dropped into no row at all.
 */
export const readClientsSeen = async (): Promise<Record<string, ClientSeen>> => {
  try {
    return await invoke<Record<string, ClientSeen>>('mcp_clients_seen');
  } catch (e) {
    console.warn('[mcp] client heartbeat read failed', e);
    return {};
  }
};
