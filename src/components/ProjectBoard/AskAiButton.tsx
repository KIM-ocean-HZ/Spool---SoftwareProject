import { MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  askInClient,
  clientLabel,
  isConnected,
  MCP_CLIENTS,
  readClientStatuses,
  type McpClient,
  type McpClientStatus,
} from '@/lib/mcp/clients';
import { useT } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

// DESIGN_WORKBENCH §9.13 — 「一键问 AI」.
//
// Ocean 2026-08-07: 「MCP 对话有摩擦，项目管理刚好可以一键进行提问」. The friction he means is
// real and it is not in Spool: you have a project in front of you, and asking your AI about
// it means switching apps, opening a chat, and typing out which project you mean — every
// time, and the AI has no idea which one you meant until you say its name exactly.
//
// He sketched three shapes for the fix. **Two of them cannot be built, and the reason is
// worth keeping written down so nobody re-litigates it:**
//
//   1. 「MCP 已经进入新对话窗口，并且标好 spool#xxx 项目名称，等待用户直接输入提示词」 —
//      nothing lets one app compose into another app's chat box. Claude Desktop, Cursor and
//      ChatGPT expose no automation surface for it.
//   3. 「MCP 和 Spool 有更便捷的协议，可以 Spool 控制选择指定项目」 — MCP is a *server*
//      protocol. The client calls us; we cannot call the client, and it has no "open a
//      conversation about X" verb to call even if we could.
//
// Which leaves his #2, 「提示用户项目名已经在粘贴板，然后跳到了软件让用户开始工作」, and that
// one is honest and complete: the question — already naming the project — goes on the
// clipboard, and the app comes forward. ⌘V, return.
//
// ⚠️ Only clients that are ALREADY connected are listed. An entry that opened an app which
// then could not read the library would be worse than no entry: the failure would look like
// Spool losing the user's notes. Settings → MCP is where connecting happens, and the menu
// says so when the list is empty.

export default function AskAiButton({ threadTitle }: { threadTitle: string }) {
  const t = useT();
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const openSettings = useSettingsStore((s) => s.openPanel);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<McpClient, McpClientStatus | null> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Read on open, not on mount: the board can list dozens of projects and this is six
  // file reads per row. It is also the freshest moment — the user may have connected a
  // client since the app started.
  useEffect(() => {
    if (!open) return;
    void readClientStatuses().then(setStatuses);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ask = async (client: McpClient): Promise<void> => {
    setOpen(false);
    try {
      const focused = await askInClient(client, threadTitle);
      toast.notice(
        focused
          ? t('问题已复制，{app} 已经在前面了——⌘V 回车就行', { app: clientLabel(client) })
          : t('问题已复制——在你的终端里粘上就行'),
      );
    } catch (e) {
      toast.error(
        t('打不开 {app}：{msg}', {
          app: clientLabel(client),
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  const connected = statuses
    ? MCP_CLIENTS.filter(({ key }) => isConnected(statuses[key]))
    : [];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('把这个项目的问题复制好，并跳到你的 AI 软件')}
        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-paper hover:text-accent"
      >
        <MessagesSquare size={12} />
        {t('问 AI')}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-line-strong bg-paper py-1"
          style={{ boxShadow: 'var(--shadow-toast)' }}
        >
          {statuses === null ? (
            <p className="px-3 py-1.5 text-[11px] text-muted">{t('看看接了哪些…')}</p>
          ) : connected.length === 0 ? (
            <div className="px-3 py-2">
              <p className="text-[11px] leading-relaxed text-muted">
                {mcpEnabled
                  ? t('还没有接上的 AI 软件。去设置里一键接一个，这里就能用了。')
                  : t('MCP 服务还没打开。去设置里打开并接一个 AI 软件，这里就能用了。')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openSettings();
                }}
                className="mt-1.5 text-[11px] text-accent transition-opacity hover:opacity-80"
              >
                {t('打开设置')}
              </button>
            </div>
          ) : (
            <>
              <p className="px-3 pb-1 text-[10px] uppercase tracking-wide text-muted">
                {t('拿哪个问？')}
              </p>
              {connected.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void ask(key)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] text-ink-2 transition-colors hover:bg-paper-2 hover:text-accent"
                >
                  <span className="min-w-0 truncate">{label}</span>
                  {/* Claude Code is a terminal program — Spool does not know which terminal,
                      so it copies and says so rather than opening the wrong one. */}
                  {key === 'claude-code' && (
                    <span className="flex-none text-[10px] text-muted">{t('只复制')}</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
