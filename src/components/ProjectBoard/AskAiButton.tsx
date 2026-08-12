import { MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ClientMenu from '@/components/mcp/ClientMenu';
import { useT } from '@/lib/i18n';

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
//
// 2026-08-12 (Ocean: 「项目管理的问 AI 也使用同一个接口」) — the list itself, and what a click
// on it does, now live in components/mcp/ClientMenu, shared with the rail's MCP row. This file
// is the button and the popover around it.
//
// ⚠️ The menu is mounted only while open, and that is load-bearing: it reads seven files when
// it mounts, and the board can list dozens of projects — one of these buttons per row.

export default function AskAiButton({ threadTitle }: { threadTitle: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-line-strong bg-paper py-1"
          style={{ boxShadow: 'var(--shadow-toast)' }}
        >
          <ClientMenu
            threadTitle={threadTitle}
            heading={t('拿哪个问？')}
            onPicked={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
