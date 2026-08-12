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
 *   * **Codex** — ⚠️⚠️ **nothing. `@spool` was removed on 2026-08-12 after three measurements,
 *     and the reason must survive here or somebody will add it back.**
 *     ① A pasted `@spool` is inert: the client builds a mention when the user PICKS it out of
 *     the picker, not from the characters, so no clipboard can carry one. ② The entry that
 *     picker offered for Spool was not this server at all — it serialised as
 *     `plugin://computer-use@openai-bundled?app=com.oceanjin.spool`, i.e. OpenAI's Computer
 *     Use plugin pointed at the Spool app ("reading the screen and performing UI actions").
 *     Pasting it produced a real chip, the model named the project back, and it still read
 *     nothing: 「没有获得 Spool 内部内容的读取/操作接口」. ③ The reason there was no connector to
 *     mention: that picker lists **plugins** (`[plugins."name@marketplace"]` in
 *     `~/.codex/config.toml`), while Spool installs itself as a plain `[mcp_servers.spool]`
 *     entry — two registries, one namespace.
 *
 *     ⚠️⚠️ **Later the same day `@spool` was seen working, and it still does not belong here.**
 *     Spool was packaged as a codex plugin and installed on one machine; after that the picker
 *     did resolve `plugin://spool@spool`, and in a Codex conversation the mention addressed
 *     this server. **It works because that machine has the plugin installed by hand.** Ocean
 *     decided on 2026-08-12 not to ship the plugin with the app (the reason it was built —
 *     reaching ordinary ChatGPT chats — is architecturally impossible, see the row comment in
 *     MCP_CLIENTS). A syntax that only works for the one person who hand-installed something
 *     is not an addressing rule; it is a trap for everybody else, who would paste `@spool` and
 *     get plain text. **If the plugin ever ships with the app, this bullet is the place to
 *     revisit — and not before.**
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
 * ⚠️ `slash` is a complete invocation — the prompt on the other end arrives with the project's
 * overview already embedded, which no sentence on a clipboard can carry. A prefix the user
 * finishes was the other shape this table held; it is gone with `@spool`, and it should only
 * come back attached to a client where somebody watched a pasted prefix actually address the
 * server.
 */
type Addressing = { kind: 'slash'; command: string };

const HOW_TO_ADDRESS: Partial<Record<McpClient, Addressing>> = {
  'claude-code': { kind: 'slash', command: '/mcp__spool__catch_up' },
};

/** What the clipboard will hold for this client — the UI needs it to say what to do next. */
export type AddressingKind = 'slash' | 'plain';

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
  return t('Spool 里的「{title}」：', { title: name });
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
