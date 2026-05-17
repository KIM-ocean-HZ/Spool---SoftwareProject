import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { ChevronDown, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '@/lib/db/blocks';
import { createBlock, deleteBlock } from '@/lib/db/blocks';
import {
  HIDE_OVERLAY_COMMAND,
  OVERLAY_ACTION_EVENT,
  OVERLAY_NOTICE_EVENT,
  OVERLAY_SHOW_EVENT,
  OVERLAY_SOURCE_UPDATE_EVENT,
  RESIZE_OVERLAY_COMMAND,
  type CaptureOverlayPayload,
  type OverlayAction,
  type OverlayNotice,
  type OverlaySourceUpdate,
} from '@/lib/capture/overlayProtocol';
import type { Thread } from '@/lib/db/threads';
import { createThread, listAllThreads } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { listWorkspaces } from '@/lib/db/workspaces';

const TOAST_AUTO_DISMISS_MS = 2500;
const NOTICE_AUTO_DISMISS_MS = 2200;
// Window dimensions must match Rust's OVERLAY_WIDTH / OVERLAY_HEIGHT_COLLAPSED in
// capture.rs. The toast fills the window width (340). The window is top-right
// anchored, so growing the height (picker open) extends downward — picker dropdown
// opens downward from the action row.
const HEIGHT_COLLAPSED = 100;
const HEIGHT_EXPANDED = 400;

const hideOverlay = (): void => {
  void invoke(HIDE_OVERLAY_COMMAND).catch((e) => {
    console.warn('hide_capture_overlay failed', e);
  });
};

const resizeOverlay = (height: number): void => {
  void invoke(RESIZE_OVERLAY_COMMAND, { height }).catch((e) => {
    console.warn('resize_capture_overlay failed', e);
  });
};

const emitAction = (action: OverlayAction): void => {
  void emit(OVERLAY_ACTION_EVENT, action).catch((e) => {
    console.warn('overlay:action emit failed', e);
  });
};

// Discriminated content state. Toast (successful capture) and notice (failure) are
// mutually exclusive: only one ever shows at a time. Using a single state field
// makes the "replace previous content" semantics atomic.
type OverlayContent =
  | { kind: 'toast'; data: CaptureOverlayPayload }
  | { kind: 'notice'; data: OverlayNotice }
  | null;

const noticeText = (n: OverlayNotice): string => {
  if (n.kind === 'empty') return '剪贴板为空 — 试试先按 ⌘C 复制要捕捉的内容，再按 ⌘⇧C';
  if (n.kind === 'no-target') return '没有捕捉目标脉络 — 打开 Spool 在脉络顶栏点"设为目标"';
  return n.msg ?? '捕捉失败';
};

export default function CaptureOverlay() {
  const [content, setContent] = useState<OverlayContent>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [threadsByWs, setThreadsByWs] = useState<Record<string, Thread[]>>({});
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const refresh = async (): Promise<void> => {
    try {
      const [ws, ts] = await Promise.all([listWorkspaces(), listAllThreads()]);
      setWorkspaces(ws);
      const grouped: Record<string, Thread[]> = {};
      for (const t of ts) {
        if (!grouped[t.workspaceId]) grouped[t.workspaceId] = [];
        grouped[t.workspaceId]!.push(t);
      }
      setThreadsByWs(grouped);
    } catch (e) {
      console.error('[overlay] refresh failed', e);
    }
  };

  // Listen for new capture payloads from Rust.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<CaptureOverlayPayload>(OVERLAY_SHOW_EVENT, (e) => {
        setContent({ kind: 'toast', data: e.payload });
        setHover(false);
        setPickerOpen(false);
        void refresh();
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Listen for failure notices (clipboard empty / no target / error). These show
  // in the overlay so the user gets feedback even when the main window is hidden.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<OverlayNotice>(OVERLAY_NOTICE_EVENT, (e) => {
        setContent({ kind: 'notice', data: e.payload });
        setHover(false);
        setPickerOpen(false);
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Listen for source backfill updates from the main window.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<OverlaySourceUpdate>(OVERLAY_SOURCE_UPDATE_EVENT, (e) => {
        setContent((current) => {
          if (!current || current.kind !== 'toast') return current;
          if (current.data.blockId !== e.payload.blockId) return current;
          return { kind: 'toast', data: { ...current.data, source: e.payload.source } };
        });
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Auto-dismiss timer. Paused while the pointer is over the card OR the picker is
  // open. Notices use a slightly shorter timeout since there's nothing to interact
  // with on them.
  useEffect(() => {
    if (!content) return;
    if (hover || pickerOpen) return;
    const ms = content.kind === 'notice' ? NOTICE_AUTO_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
    const t = setTimeout(() => {
      setContent(null);
      hideOverlay();
    }, ms);
    return () => clearTimeout(t);
  }, [content, hover, pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  // Sync window height to picker state. Window is top-anchored so growing the
  // height extends the bottom edge downward; the toast itself stays put.
  useEffect(() => {
    resizeOverlay(pickerOpen ? HEIGHT_EXPANDED : HEIGHT_COLLAPSED);
  }, [pickerOpen]);

  const inboxWs = useMemo(
    () => workspaces.find((w) => (w.title || '').includes('收件箱')) ?? workspaces[0],
    [workspaces],
  );

  if (!content) return null;

  if (content.kind === 'notice') {
    return (
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="overlay-in mx-auto w-full rounded-lg border border-line-strong bg-paper px-3.5 py-2.5 font-ui text-[12px] leading-snug text-muted"
        style={{ boxShadow: 'var(--shadow-toast)' }}
      >
        {noticeText(content.data)}
      </div>
    );
  }

  const toast = content.data;

  const onUndo = async (): Promise<void> => {
    try {
      await deleteBlock(toast.blockId);
    } catch (e) {
      console.error('[overlay] undo failed', e);
      return;
    }
    emitAction({ kind: 'undo', blockId: toast.blockId, threadId: toast.threadId });
    setContent(null);
    hideOverlay();
  };

  // Move the just-captured block to a different (existing) thread. We delete +
  // recreate rather than UPDATE thread_id so the new block gets a fresh created_at
  // that puts it at the bottom of the target thread's feed.
  const onRedirect = async (targetThreadId: string): Promise<void> => {
    if (targetThreadId === toast.threadId) {
      setPickerOpen(false);
      return;
    }
    let newBlock: Block;
    try {
      await deleteBlock(toast.blockId);
      newBlock = await createBlock({
        threadId: targetThreadId,
        kind: 'text',
        content: toast.fullContent,
        source: toast.source,
      });
    } catch (e) {
      console.error('[overlay] redirect failed', e);
      return;
    }
    emitAction({
      kind: 'redirect',
      oldBlockId: toast.blockId,
      oldThreadId: toast.threadId,
      newBlock,
      targetThreadId,
    });
    setPickerOpen(false);
    setContent(null);
    hideOverlay();
  };

  const onSaveAsNew = async (): Promise<void> => {
    if (!inboxWs) return;
    let newThread: Thread;
    let newBlock: Block;
    try {
      newThread = await createThread(inboxWs.id, '');
      await deleteBlock(toast.blockId);
      newBlock = await createBlock({
        threadId: newThread.id,
        kind: 'text',
        content: toast.fullContent,
        source: toast.source,
      });
    } catch (e) {
      console.error('[overlay] save-as-new failed', e);
      return;
    }
    emitAction({
      kind: 'save-as-new',
      oldBlockId: toast.blockId,
      oldThreadId: toast.threadId,
      newBlock,
      newThread,
    });
    setContent(null);
    hideOverlay();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overlay-in w-full rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      <div className="px-3.5 pt-3">
        <div className="font-ui text-[14px] leading-snug text-ink">
          <span className="text-muted">「</span>
          {toast.preview}
          <span className="text-muted">」</span>
        </div>
        <div className="mt-1.5 text-[11px] text-muted">
          已存入 <span className="text-ink">{toast.workspaceTitle}</span>
          <span className="text-muted/60"> / </span>
          <span className="text-ink">{toast.threadTitle}</span>
          {toast.source && (
            <>
              <span className="text-muted/60"> · </span>
              <span className="text-ink-2">来自 {toast.source}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 border-t border-line px-2 py-1.5 text-[11px]">
        <button
          onClick={() => void onUndo()}
          className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper-2 hover:text-ink"
          title="撤销刚才的捕捉"
        >
          <RotateCcw size={11} />
          <span>撤销</span>
        </button>

        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper-2 hover:text-ink"
            title="改投到其它脉络"
          >
            <span>改投</span>
            <ChevronDown size={11} />
          </button>
          {pickerOpen && (
            <div
              className="absolute left-0 top-full mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-line-strong bg-paper py-1"
              style={{ boxShadow: 'var(--shadow-toast)' }}
            >
              {workspaces.map((ws) => {
                const list = (threadsByWs[ws.id] ?? []).filter((t) => t.status !== 'done');
                if (list.length === 0) return null;
                return (
                  <div key={ws.id} className="py-0.5">
                    <div className="px-2.5 py-0.5 font-serif text-[11px] text-muted">
                      {ws.title || '未命名'}
                    </div>
                    {list.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => void onRedirect(t.id)}
                        disabled={t.id === toast.threadId}
                        className={`block w-full truncate px-2.5 py-1 text-left text-xs ${
                          t.id === toast.threadId
                            ? 'cursor-default text-muted/70'
                            : 'text-ink hover:bg-paper-2'
                        }`}
                      >
                        {t.title.trim() || '无标题'}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => void onSaveAsNew()}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper-2 hover:text-accent"
          title="把这条作为新脉络的第一块"
        >
          <Plus size={11} />
          <span>另存为新脉络</span>
        </button>
      </div>
    </div>
  );
}
