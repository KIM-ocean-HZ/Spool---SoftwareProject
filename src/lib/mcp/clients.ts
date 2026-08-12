import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { t } from '@/lib/i18n';

// The AI clients Spool can wire itself into, shared by the two surfaces that care.
//
// This table lived inside Settings/McpConfig while connecting was the only thing anyone did
// with it. DESIGN_WORKBENCH §9.13 added a second reader — 项目管理's 「问 AI」 button, which
// needs to know which clients are ALREADY connected so it can offer them — so it moved here
// rather than being copied. The Rust side's own table (mcp.rs client_config_paths) is the
// authority on where each config file lives; this is only the user-facing half.

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
  { key: 'codex', label: 'ChatGPT / Codex' },
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

/**
 * How each client is addressed **in its own chat box**, so that one paste lands on Spool
 * instead of on whatever the model would otherwise reach for.
 *
 * ⚠️ **A client is in this table only when its own vendor documents the syntax, or somebody
 * watched it work.** There is no shared convention here to fall back on — `@` in Claude Code
 * opens a FILE path, and in Cursor / VS Code / Windsurf it pulls in files or chat
 * participants, so a guessed prefix sends the client hunting for a file called `spool`, which
 * is worse than not naming the server at all. An unlisted client gets the plain sentence.
 *
 * What is known, and how:
 *
 *   * **ChatGPT / Codex** — `@spool` (Ocean, 2026-08-12: 「chatgpt @spool 可以指定使用
 *     spool」). This is the only route Codex has: it was measured on 2026-08-11 never to send
 *     `prompts/list` at all, so its slash menu will never show a Spool prompt.
 *     ⚠️⚠️ **A pasted `@spool` is inert** (Ocean, measured 2026-08-12: 「@spool 首先会被读成
 *     普通文字，需要在输入框底下选择带着 spool logo 的那一条之后，才会变成 MCP 专用」). The
 *     mention only becomes a mention when the user picks Spool out of the client's own
 *     picker — no clipboard can do that, because the client builds the reference on
 *     selection, not on the characters. So what goes on the clipboard is an **opener the
 *     user finishes**, and the UI has to say the picker step out loud (`addressingKind`
 *     drives that copy). Leaving it silent would be the worse failure: the paste looks
 *     right, sends as plain text, and the model answers from nothing.
 *   * **Claude Code** — `/mcp__<server>__<prompt>`, Anthropic's own documented format
 *     (code.claude.com/docs/en/mcp, checked 2026-08-12), with arguments passed space-separated
 *     after it and quoted when they contain spaces. The server key is `spool` because Spool
 *     writes that entry itself (mcp.rs `configure_client`), and `catch_up` is a real prompt
 *     with a `project` argument.
 *   * **Claude Desktop** — prompts and resources arrive through the ＋ menu, not by typing.
 *     Nothing to put in a clipboard, so it stays out.
 *   * **VS Code / Cursor / Windsurf** — VS Code's docs give `/<server>.<prompt>` while older
 *     ones give `/mcp.<server>.<prompt>`; which one a given install answers to is a version
 *     question nobody here has measured. Out until somebody sees one work.
 *
 * ⚠️ `mention` prefixes an opener the user finishes; `slash` is a complete invocation — the
 * prompt on the other end arrives with the project's overview already embedded, which no
 * sentence on a clipboard can carry.
 */
type Addressing =
  | { kind: 'mention'; prefix: string }
  | { kind: 'slash'; command: string };

const HOW_TO_ADDRESS: Partial<Record<McpClient, Addressing>> = {
  codex: { kind: 'mention', prefix: '@spool' },
  'claude-code': { kind: 'slash', command: '/mcp__spool__catch_up' },
};

/** What the clipboard will hold for this client — the UI needs it to say what to do next. */
export type AddressingKind = 'mention' | 'slash' | 'plain';

export const addressingKind = (client: McpClient): AddressingKind =>
  HOW_TO_ADDRESS[client]?.kind ?? 'plain';

/**
 * What 「问 AI」 puts on the clipboard: **an opening, not a question.**
 *
 * ⚠️ Titles only, never ids — the hard naming rule the MCP server opens every pack with. A
 * prompt carrying `sbC2zgTo…` would teach the model to say ids back to the user.
 *
 * 2026-08-12, Ocean, having used it: 「这个提示词太长了，只能提供一个前置提示词…后文让用户
 * 自己写，每个用户的诉求不一样」. It used to paste a whole three-part question ("where am I
 * stuck / what is settled / what next"), which is one user's need written into everybody's
 * clipboard — and the longer it was, the more of it had to be deleted before it could become
 * anybody else's question. What is left is the part no user should have to type: which
 * project, said the way this client understands.
 */
export const askPrompt = (title: string, client?: McpClient): string => {
  const name = title.trim() || t('无标题');
  const how = client ? HOW_TO_ADDRESS[client] : undefined;
  // Claude Code parses arguments space-separated, so a title has to arrive as one quoted
  // token; a title carrying its own quote would end the token early, and dropping that
  // character costs nothing (the prompt matches on part of a title anyway).
  if (how?.kind === 'slash') return `${how.command} "${name.replace(/"/g, '')}"`;
  // The colon is the whole point of the shape: it ends Spool's half and hands the caret over.
  // ⚠️ Two whole keys rather than one nested inside the other — the English word order puts
  // "project" after the title, so a fragment translated on its own cannot be dropped in.
  return how
    ? `${how.prefix} ${t('「{title}」：', { title: name })}`
    : t('Spool 里的「{title}」：', { title: name });
};

/**
 * Bring a client to the front and nothing else.
 *
 * Returns whether anything was focused. `false` means Spool cannot open it — Claude Code is a
 * CLI and which terminal it lives in is not knowable from here (lib.rs focus_mcp_client).
 */
export const focusClient = (client: McpClient): Promise<boolean> =>
  invoke<boolean>('focus_mcp_client', { client });

/**
 * One click, both halves: the question goes on the clipboard and the client comes forward.
 *
 * Returns whether the app was actually focused, same as `focusClient`.
 */
export const askInClient = async (
  client: McpClient,
  threadTitle: string,
): Promise<boolean> => {
  await writeText(askPrompt(threadTitle, client));
  return focusClient(client);
};

/** One connected client, as both surfaces that offer a client need it. */
export interface ConnectedClient {
  /** A key from MCP_CLIENTS where the server recognised the product; the name the client
   *  reported for itself where it did not. */
  key: string;
  label: string;
  /** When it last called a tool, or null if it has not connected since Spool started
   *  recording (mcp.rs `record_client_seen` — an old, still-running child never re-connects). */
  lastSeen: number | null;
  /** Whether Spool can address it: put the question on the clipboard and open the app.
   *  False for a client the server could not identify — there is no app to open. */
  addressable: boolean;
}

/**
 * Every client that is reachable right now, newest use first.
 *
 * Two half-truths merged into one list. The config read says an entry EXISTS; the heartbeat
 * says somebody USED it — and on 2026-08-11 those disagreed for twenty hours (CASE_STUDY
 * LEDGER §3.33). A client counts as connected if either half says so:
 *
 *   * configured but never seen — normal right after 一键接入, and the row is what tells the
 *     user to go and use it;
 *   * seen but not configured — a client Spool did not write the config for (someone added
 *     `spool` by hand), which is still a client that can be asked.
 */
export const readConnectedClients = async (): Promise<ConnectedClient[]> => {
  const [statuses, seen] = await Promise.all([readClientStatuses(), readClientsSeen()]);
  const rows: ConnectedClient[] = MCP_CLIENTS.filter(
    ({ key }) => isConnected(statuses[key]) || key in seen,
  ).map(({ key, label }) => ({
    key,
    label,
    lastSeen: seen[key]?.last_seen ?? null,
    addressable: true,
  }));
  // Clients the server could not put a name to are listed as themselves rather than dropped
  // — that is how the mapping table gets corrected (mcp.rs `client_key_from_info`).
  for (const [key, v] of Object.entries(seen)) {
    if (rows.some((r) => r.key === key)) continue;
    rows.push({ key, label: v.label || key, lastSeen: v.last_seen, addressable: false });
  }
  return rows.sort((a, b) => (b.lastSeen ?? -1) - (a.lastSeen ?? -1));
};
