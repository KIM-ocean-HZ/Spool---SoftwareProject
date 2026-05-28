import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { ChevronDown, MessageSquarePlus, Pin, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import RouteSuggestion from '@/components/Capture/RouteSuggestion';
import type { Block } from '@/lib/db/blocks';
import {
  createBlock,
  deleteBlock,
  togglePin as togglePinDb,
  updateBlockAnnotation,
} from '@/lib/db/blocks';
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
import { useSettingsStore } from '@/stores/settingsStore';

// v2.8 §20.6: longer dwell so the user has time to decide whether to expand for
// pin/note. Click-anywhere-on-toast → expand (deliberate); × button or Esc →
// dismiss; this fallback applies only when the user never touched the toast.
// Increased from 2.5s (too short for note typing) to 8s on Ocean's feedback.
const TOAST_AUTO_DISMISS_MS = 8000;
const NOTICE_AUTO_DISMISS_MS = 2200;
// Window width must match Rust's OVERLAY_WIDTH (capture.rs). Heights are now
// driven by ResizeObserver to match the toast's actual rendered height — fixes a
// dogfooding bug where long attribution lines wrapped past the fixed 100px and
// clipped the toast's bottom rounded corner. The picker dropdown extends outside
// the toast's flow (absolute-positioned), so its open state needs an extra
// allowance the observer can't see.
const PICKER_DROPDOWN_ALLOWANCE = 300;
// Tiny extra so the box-shadow isn't clipped by the bottom edge of the window.
const SHADOW_ALLOWANCE = 8;

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
  // True while a RouteSuggestion bubble is showing — pauses auto-dismiss so the
  // user can actually act on it (§11.5).
  const [suggestionActive, setSuggestionActive] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // v2.8 §20.6: pin/note expansion. The toast's default state is byte-for-byte the
  // glanceable card; pin + annotation controls appear ONLY after a deliberate click
  // on the toast body. The click also disables auto-dismiss (user has engaged), and
  // a × button + Esc become the only ways to dismiss until they finish.
  const [expanded, setExpanded] = useState(false);
  // Local mirrors so pin/annotate writes feel instant; cross-window sync follows.
  const [pinned, setPinned] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState('');
  const annotationRef = useRef<HTMLTextAreaElement>(null);
  // ResizeObserver target — the visible card root. Used to match the OS window
  // height to the toast's actual rendered height so the rounded bottom corner
  // is always visible regardless of attribution-line wrap or expansion state.
  const cardRef = useRef<HTMLDivElement>(null);

  // The overlay window has its own JS context, so it must load settings + probe
  // Ollama itself for RouteSuggestion's isAiAvailable() gate.
  useEffect(() => {
    void (async () => {
      await useSettingsStore.getState().load();
      await useSettingsStore.getState().detectOllama();
    })();
  }, []);

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
        setSuggestionActive(false);
        // v2.8 §20.6: each fresh capture starts collapsed and resets pin/note state —
        // a previous expansion never bleeds into the next capture.
        setExpanded(false);
        setPinned(false);
        setAnnotationDraft('');
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
        setSuggestionActive(false);
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
  // open OR the user has expanded for pin/note (v2.8 §20.6 — a deliberate click
  // engages the toast and the fallback no longer applies). Notices use a slightly
  // shorter timeout since there's nothing to interact with on them.
  useEffect(() => {
    if (!content) return;
    if (hover || pickerOpen || suggestionActive || expanded) return;
    const ms = content.kind === 'notice' ? NOTICE_AUTO_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
    const t = setTimeout(() => {
      setContent(null);
      hideOverlay();
    }, ms);
    return () => clearTimeout(t);
  }, [content, hover, pickerOpen, suggestionActive, expanded]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  // Auto-size the OS window to the toast's actual rendered height (plus shadow +
  // optional picker-dropdown allowance). Fixes the "bottom not rounded" dogfooding
  // bug: long workspace/thread names wrapped the attribution to multiple lines and
  // pushed the toast taller than the old fixed 100px, clipping the bottom corner.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = (): void => {
      const cardH = Math.ceil(el.getBoundingClientRect().height);
      const allow = (pickerOpen ? PICKER_DROPDOWN_ALLOWANCE : 0) + SHADOW_ALLOWANCE;
      resizeOverlay(cardH + allow);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, expanded, pickerOpen]);

  // v2.8 §20.6: Esc dismisses while a toast is showing (the only window-level
  // keystroke we listen for, so the overlay still feels glanceable / non-blocking).
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setContent(null);
        setExpanded(false);
        hideOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content]);

  // Focus the annotation textarea on expand so the user can start typing without an
  // extra click. The pin button keeps tab-order priority by being declared first.
  useEffect(() => {
    if (expanded && annotationRef.current) {
      annotationRef.current.focus();
    }
  }, [expanded]);

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

  // v2.9 §9.13: route through the main window's shared undo machinery instead of deleting
  // the block here. The main window owns the undo log (it wrote the capture block), so it
  // pops the entry, reverses it, and shows the UndoToast — same path as Cmd+Z.
  const onUndo = (): void => {
    emitAction({ kind: 'undo' });
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

  // The user accepted a RouteSuggestion: the block's thread_id is already updated
  // and the cross-window action emitted by RouteSuggestion. Here we just re-point
  // the toast's "已存入" attribution to the destination thread.
  const onSuggestionMoved = (target: {
    threadId: string;
    threadTitle: string;
    workspaceTitle: string;
  }): void => {
    setContent((current) => {
      if (!current || current.kind !== 'toast') return current;
      return {
        kind: 'toast',
        data: {
          ...current.data,
          threadId: target.threadId,
          threadTitle: target.threadTitle,
          workspaceTitle: target.workspaceTitle,
        },
      };
    });
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

  // v2.8 §20.6: pin the just-captured block from the expanded toast. Local state
  // updates immediately so the icon feedback feels instant; DB write + cross-window
  // sync follow. togglePinDb returns the new value — we trust it over the local guess.
  const onTogglePin = async (): Promise<void> => {
    const optimistic = !pinned;
    setPinned(optimistic);
    let next: boolean;
    try {
      next = await togglePinDb(toast.blockId);
    } catch (e) {
      console.error('[overlay] pin toggle failed', e);
      setPinned(!optimistic); // revert
      return;
    }
    setPinned(next);
    emitAction({
      kind: 'pin',
      blockId: toast.blockId,
      threadId: toast.threadId,
      pinned: next,
    });
  };

  // v2.8 §20.6: annotate the just-captured block from the expanded toast. Commits
  // on blur so the user can write a multi-line note without each keystroke writing.
  const onCommitAnnotation = async (): Promise<void> => {
    const trimmed = annotationDraft.trim();
    const next: string | null = trimmed.length > 0 ? trimmed : null;
    try {
      await updateBlockAnnotation(toast.blockId, next);
    } catch (e) {
      console.error('[overlay] annotation save failed', e);
      return;
    }
    emitAction({
      kind: 'annotate',
      blockId: toast.blockId,
      threadId: toast.threadId,
      annotation: next,
    });
  };

  const dismissToast = (): void => {
    setContent(null);
    setExpanded(false);
    hideOverlay();
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overlay-in relative w-full rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      {/* × close — explicit dismiss. */}
      <button
        type="button"
        onClick={dismissToast}
        title="关闭 (Esc)"
        aria-label="关闭"
        className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted/70 hover:bg-paper-2 hover:text-ink"
      >
        <X size={11} />
      </button>

      <div className="px-3.5 pb-2 pt-3 pr-7">
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
        {/* v2.8 §20.6 follow-up: explicit affordance for the expand interaction.
            Dogfooding showed users didn't realise clicking the toast body opened
            a pin/note panel. Now an inline "+ 添加批注·置顶" button advertises it
            with a chevron; the prior click-anywhere-to-expand model was an
            invisible behaviour and is removed. */}
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="点击展开：可置顶 / 添加批注"
            className="mt-1.5 flex items-center gap-1 rounded text-[11px] text-muted hover:text-accent"
          >
            <MessageSquarePlus size={11} />
            <span>添加批注 · 置顶</span>
            <ChevronDown size={11} />
          </button>
        )}
      </div>

      {/* v2.8 §20.6: pin + annotation surface, mounted only after the user clicks
          the explicit affordance above. Default state never shows these controls
          so the toast stays glanceable per §10.3. */}
      {expanded && (
        <div className="border-t border-line px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => void onTogglePin()}
              title={pinned ? '取消置顶' : '标为重点 (置顶)'}
              aria-label={pinned ? '取消置顶' : '置顶'}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                pinned
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line-strong bg-paper text-muted hover:border-accent hover:text-accent'
              }`}
            >
              <Pin size={11} className={pinned ? 'fill-current' : ''} />
            </button>
            <textarea
              ref={annotationRef}
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              onBlur={() => void onCommitAnnotation()}
              placeholder="批注（可选） — Tab 或点击外部保存"
              rows={2}
              spellCheck={false}
              className="flex-1 resize-none rounded-md border border-line bg-paper-2/40 px-2 py-1.5 font-ui text-[12px] leading-[1.5] text-ink-2 placeholder:text-muted/70 outline-none focus:border-line-strong focus:bg-paper focus:text-ink"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-line bg-paper-2/30 px-2 py-1.5 text-[11px]">
        <button
          onClick={() => void onUndo()}
          className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
          title="撤销刚才的捕捉"
        >
          <RotateCcw size={11} />
          <span>撤销</span>
        </button>

        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
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
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-paper hover:text-accent"
          title="把这条作为新脉络的第一块"
        >
          <Plus size={11} />
          <span>另存为新脉络</span>
        </button>
      </div>

      <RouteSuggestion
        key={toast.blockId}
        toast={toast}
        workspaces={workspaces}
        onMoved={onSuggestionMoved}
        onActiveChange={setSuggestionActive}
      />
    </div>
  );
}
