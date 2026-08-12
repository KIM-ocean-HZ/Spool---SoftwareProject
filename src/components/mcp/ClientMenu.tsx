import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import {
  askInClient,
  focusClient,
  readConnectedClients,
  type ConnectedClient,
  type McpClient,
} from '@/lib/mcp/clients';
import { formatRelative } from '@/lib/utils/time';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

// 2026-08-12 (Ocean: 「MCP 选择可以放入已经链接的所有客户端…对应的，项目管理的问 AI 也使用
// 同一个接口」) — the one list of AI clients, shared by the two places that offer them: the
// rail's MCP row and 项目管理's 「问 AI」.
//
// They had grown apart on the thing that matters most: 问 AI listed whatever the CONFIG said
// was hooked up, while the rail listed whatever had actually CONNECTED — so a client could be
// offered in one and missing from the other on the same machine. `readConnectedClients` merges
// the two halves once, and both surfaces render this.
//
// ⚠️ What one click does depends on whether there is a project in front of the user: with one,
// the question — already addressed to Spool in that client's own syntax (clients.ts
// HOW_TO_ADDRESS) — goes on the clipboard and the app comes forward; without one, this is
// purely 「跳过去」 and nothing is copied. Copying a question about no particular project would
// put a sentence naming 「无标题」 on his clipboard, which is worse than copying nothing.

interface Props {
  /** The project the question is about, or null when no project is open — then this is
   *  navigation only. */
  threadTitle: string | null;
  /** Shown above the list, and only when there is a list. */
  heading?: string;
  /** Called as soon as a row is picked, so the caller can close its popover. */
  onPicked?: () => void;
}

export default function ClientMenu({ threadTitle, heading, onPicked }: Props): JSX.Element {
  const t = useT();
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const openSettings = useSettingsStore((s) => s.openPanel);
  const [rows, setRows] = useState<ConnectedClient[] | null>(null);

  // Read on mount — this component mounts when the menu opens, which is also the freshest
  // moment: the user may have connected a client since the app started.
  useEffect(() => {
    void readConnectedClients().then(setRows);
  }, []);

  const pick = async (row: ConnectedClient): Promise<void> => {
    onPicked?.();
    const client = row.key as McpClient;
    try {
      const focused = threadTitle
        ? await askInClient(client, threadTitle)
        : await focusClient(client);
      if (threadTitle) {
        toast.notice(
          focused
            ? t('问题已复制，{app} 已经在前面了——⌘V 回车就行', { app: row.label })
            : t('问题已复制——在你的终端里粘上就行'),
        );
      } else if (focused) {
        toast.notice(t('{app} 已经在前面了', { app: row.label }));
      } else {
        toast.notice(t('{app} 是终端里的，Spool 打不开它', { app: row.label }));
      }
    } catch (e) {
      toast.error(
        t('打不开 {app}：{msg}', {
          app: row.label,
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  /** 「还没连上过」 is not a blank: a client can be hooked up and never used, and saying so
   *  is what tells the user this row is the one to go and try. */
  const when = (row: ConnectedClient): string =>
    row.lastSeen === null ? t('还没连上过') : formatRelative(row.lastSeen);

  if (rows === null) {
    return <p className="px-3 py-1.5 text-[11px] text-muted">{t('看看接了哪些…')}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-[11px] leading-relaxed text-muted">
          {mcpEnabled
            ? t('还没有接上的 AI 软件。去设置里一键接一个，这里就能用了。')
            : t('MCP 服务还没打开。去设置里打开并接一个 AI 软件，这里就能用了。')}
        </p>
        <button
          type="button"
          onClick={() => {
            onPicked?.();
            openSettings();
          }}
          className="mt-1.5 text-[11px] text-accent transition-opacity hover:opacity-80"
        >
          {t('打开设置')}
        </button>
      </div>
    );
  }

  return (
    <>
      {heading && (
        <p className="px-3 pb-1 text-[10px] uppercase tracking-wide text-muted">{heading}</p>
      )}
      {rows.map((row) =>
        row.addressable ? (
          <button
            key={row.key}
            type="button"
            onClick={() => void pick(row)}
            title={
              threadTitle
                ? t('把这个项目的问题复制好，并跳到 {app}', { app: row.label })
                : t('跳到 {app}', { app: row.label })
            }
            className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-[11px] text-ink-2 transition-colors hover:bg-paper-2 hover:text-accent"
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="flex-none font-mono text-[10px] text-muted">{when(row)}</span>
          </button>
        ) : (
          // Not one of the six: the server saw it connect but could not tell which product it
          // is, so there is no app to open and no config to read. Listed anyway — an
          // unrecognised client is a name to add to mcp.rs `client_key_from_info`, and it is
          // only visible here.
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px] text-muted"
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="flex-none font-mono text-[10px]">{when(row)}</span>
          </div>
        ),
      )}
      {/* Said once, under the list, rather than crammed onto the row: Claude Code is a CLI and
          Spool does not know which terminal it lives in (lib.rs focus_mcp_client). */}
      {rows.some((r) => r.key === 'claude-code') && (
        <p className="px-3 pb-1 pt-1 text-[10px] leading-relaxed text-muted">
          {t('Claude Code 在终端里，Spool 只能帮你复制。')}
        </p>
      )}
    </>
  );
}
