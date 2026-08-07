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

const LABELS: Record<McpClient, string> = Object.fromEntries(
  MCP_CLIENTS.map(({ key, label }) => [key, label]),
) as Record<McpClient, string>;

export const clientLabel = (key: McpClient): string => LABELS[key] ?? key;

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

/**
 * The question 「问 AI」 puts on the clipboard.
 *
 * ⚠️ Titles only, never ids — the hard naming rule the MCP server opens every pack with. A
 * prompt carrying `sbC2zgTo…` would teach the model to say ids back to the user.
 *
 * It names the project and then asks for the three things a project is for. Deliberately not
 * a tool name: the client picks the tool, and a prompt that says `get_pack` ages the moment
 * the tool surface changes.
 */
export const askPrompt = (title: string): string =>
  t(
    '读一下我 Spool 里「{title}」这个项目的完整脉络，然后告诉我三件事：我卡在哪、已经定下来了什么、接下来该做什么。',
    { title: title.trim() || t('无标题') },
  );

/**
 * One click, both halves: the question goes on the clipboard and the client comes forward.
 *
 * Returns whether the app was actually focused. `false` means the prompt is copied but the
 * user has to switch by hand — Claude Code is a CLI and Spool does not know which terminal
 * it lives in (lib.rs focus_mcp_client).
 */
export const askInClient = async (
  client: McpClient,
  threadTitle: string,
): Promise<boolean> => {
  await writeText(askPrompt(threadTitle));
  return invoke<boolean>('focus_mcp_client', { client });
};
