import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Forward, Pin, RotateCcw, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Block } from '@/lib/db/blocks';
import {
  createBlock,
  deleteBlock,
  togglePin as togglePinDb,
  updateBlockAnnotation,
} from '@/lib/db/blocks';
import {
  DISARM_DISMISS_COMMAND,
  HIDE_OVERLAY_COMMAND,
  OVERLAY_ACTION_EVENT,
  OVERLAY_DISMISS_EVENT,
  OVERLAY_NOTICE_EVENT,
  OVERLAY_SHOW_EVENT,
  OVERLAY_SOURCE_UPDATE_EVENT,
  OVERLAY_UNDO_EVENT,
  RESIZE_OVERLAY_COMMAND,
  type CaptureOverlayPayload,
  type OverlayAction,
  type OverlayNotice,
  type OverlaySourceUpdate,
  type OverlayUndoPayload,
} from '@/lib/capture/overlayProtocol';
import type { Thread } from '@/lib/db/threads';
import { listAllThreads } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { listWorkspaces } from '@/lib/db/workspaces';
import { isImeComposing } from '@/lib/utils/ime';
import { useSettingsStore } from '@/stores/settingsStore';
import { t, useT } from '@/lib/i18n';

// v2.8 §20.6: longer dwell so the user has time to decide whether to expand for
// pin/note. Click-anywhere-on-toast → expand (deliberate); × button or Esc →
// dismiss; this fallback applies only when the user never touched the toast.
// Increased from 2.5s (too short for note typing) to 8s on Ocean's feedback.
const TOAST_AUTO_DISMISS_MS = 8000;
const NOTICE_AUTO_DISMISS_MS = 2200;
// v2.9 §9.13: undo/redo confirmation dwell — short, paused on hover so the user can click 重做.
const UNDO_AUTO_DISMISS_MS = 2500;

const UNDO_OP_LABEL: Record<OverlayUndoPayload['op'], string> = {
  capture: '捕获',
  merge: '合并',
  delete: '删除',
  collect_send: '暂存合并',
  highlight: '高亮',
  thread_delete: '删除项目',
  workspace_delete: '删除工作区',
  forward: '复制',
  empty: '',
};
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

// Drag the toast by its body so it can be moved off content it's covering. Disarms the
// click-outside dismiss watch first (the frame is about to go stale — see capture.rs).
const startToastDrag = (e: ReactMouseEvent): void => {
  if (e.button !== 0) return;
  void invoke(DISARM_DISMISS_COMMAND).catch(() => {});
  void getCurrentWindow()
    .startDragging()
    .catch((err) => console.warn('[overlay] toast drag failed', err));
};

// Discriminated content state. Toast (successful capture) and notice (failure) are
// mutually exclusive: only one ever shows at a time. Using a single state field
// makes the "replace previous content" semantics atomic.
type OverlayContent =
  | { kind: 'toast'; data: CaptureOverlayPayload }
  | { kind: 'notice'; data: OverlayNotice }
  | { kind: 'undo'; data: OverlayUndoPayload }
  | null;

const noticeText = (n: OverlayNotice): string => {
  if (n.kind === 'empty') return t('剪贴板为空 — 先按 ⌘C 复制要捕捉的内容，再双击 ⌥');
  if (n.kind === 'no-target') return t('没有捕捉目标脉络 — 打开 Spool 在脉络顶栏点"设为目标"');
  return n.msg ?? t('捕捉失败');
};

export default function CaptureOverlay() {
  const tr = useT();
  const [content, setContent] = useState<OverlayContent>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [threadsByWs, setThreadsByWs] = useState<Record<string, Thread[]>>({});
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  // Latest pending note, mirrored to a ref so a dismiss path can flush it. A toast note
  // only committed on the textarea's onBlur — but clicking outside (the documented
  // "点击外部保存"), Esc, and × all unmount the textarea via setContent(null), and React
  // never fires onBlur on unmount, so the note was silently lost. flushPendingNote reads
  // this ref (never a stale closure) and is called on every dismiss path + onBlur.
  const pendingNoteRef = useRef<{ blockId: string; threadId: string; draft: string } | null>(null);

  // v2.8 §20.6: flush a pending toast note to the DB + main window. Stable (reads only the
  // ref + module-level fns) so the dismiss listeners can call it without a stale draft, and
  // fire-and-forget — the webview stays alive when the window hides, so the write completes
  // even after the toast unmounts. No-op unless the user actually typed a note. Clears the
  // ref first so the multiple dismiss paths can't double-write.
  const flushPendingNote = useCallback((): void => {
    const p = pendingNoteRef.current;
    pendingNoteRef.current = null;
    if (!p) return;
    const trimmed = p.draft.trim();
    const next: string | null = trimmed.length > 0 ? trimmed : null;
    void updateBlockAnnotation(p.blockId, next)
      .then(() => emitAction({ kind: 'annotate', blockId: p.blockId, threadId: p.threadId, annotation: next }))
      .catch((e) => console.error('[overlay] annotation save failed', e));
  }, []);
  // ResizeObserver target — the visible card root. Used to match the OS window
  // height to the toast's actual rendered height so the rounded bottom corner
  // is always visible regardless of attribution-line wrap or expansion state.
  const cardRef = useRef<HTMLDivElement>(null);

  // The overlay window has its own JS context, so it must load settings itself
  // (language, …).
  useEffect(() => {
    void useSettingsStore.getState().load();
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
        // Save a still-pending note from the previous toast before this capture replaces it
        // (rapid re-capture without dismissing would otherwise drop it).
        flushPendingNote();
        setContent({ kind: 'toast', data: e.payload });
        setHover(false);
        setPickerOpen(false);
        // v2.8 §20.6: each fresh capture starts collapsed and resets pin/note state —
        // a previous expansion never bleeds into the next capture.
        setExpanded(false);
        setPinned(false);
        setAnnotationDraft('');
        pendingNoteRef.current = null;
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

  // v2.9 §9.13: undo/redo confirmation pushed from the main window after a reversal.
  // Shown here so it floats over the user's current app, replacing any capture toast.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<OverlayUndoPayload>(OVERLAY_UNDO_EVENT, (e) => {
        setContent({ kind: 'undo', data: e.payload });
        setHover(false);
        setPickerOpen(false);
        setExpanded(false);
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
    if (hover || pickerOpen || expanded) return;
    const ms =
      content.kind === 'notice'
        ? NOTICE_AUTO_DISMISS_MS
        : content.kind === 'undo'
          ? UNDO_AUTO_DISMISS_MS
          : TOAST_AUTO_DISMISS_MS;
    const t = setTimeout(() => {
      setContent(null);
      hideOverlay();
    }, ms);
    return () => clearTimeout(t);
  }, [content, hover, pickerOpen, expanded]);

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
      // Esc during an IME composition (in the note editor) only cancels the
      // composition — it must not dismiss the toast mid-note.
      if (isImeComposing(e)) return;
      if (e.key === 'Escape') {
        flushPendingNote();
        setContent(null);
        setExpanded(false);
        hideOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content, flushPendingNote]);

  // v2.9 §9.13: Rust's mouse-down tap fires this when the user clicks outside the toast
  // (resuming work). Dismiss the same way Esc / × does — let the user keep working.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen(OVERLAY_DISMISS_EVENT, () => {
        flushPendingNote();
        setContent(null);
        setExpanded(false);
        hideOverlay();
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [flushPendingNote]);

  // Focus the annotation textarea on expand so the user can start typing without an
  // extra click. The pin button keeps tab-order priority by being declared first.
  useEffect(() => {
    if (expanded && annotationRef.current) {
      annotationRef.current.focus();
    }
  }, [expanded]);

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

  if (content.kind === 'undo') {
    const u = content.data;
    const verb = u.mode === 'redone' ? tr('已重做') : tr('已撤销');
    const label = u.op === 'empty' ? tr('没有可撤销的操作') : `${verb}:${tr(UNDO_OP_LABEL[u.op])}`;
    return (
      <div
        ref={cardRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="overlay-in flex w-full items-center gap-2 rounded-lg border border-line-strong bg-paper px-3.5 py-2.5"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        role="status"
      >
        <RotateCcw size={13} className="shrink-0 text-muted" />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="shrink-0 font-ui text-[13px] text-ink">{label}</span>
          {u.op !== 'empty' && u.preview && (
            <span className="min-w-0 truncate font-ui text-[12px] text-muted">
              「{u.preview}」
            </span>
          )}
        </div>
        {u.canRedo && (
          <button
            type="button"
            onClick={() => emitAction({ kind: 'redo' })}
            title={tr('重做刚才的撤销')}
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 font-ui text-[11px] text-muted hover:bg-paper-2 hover:text-ink"
          >
            <RotateCw size={11} />
            <span>{tr('重做')}</span>
          </button>
        )}
      </div>
    );
  }

  const toast = content.data;

  // v2.9 §9.13: route through the main window's shared undo machinery. The main window
  // reverses the op, then pushes the undo-confirmation card back into this overlay
  // (replacing this toast) — so we just emit and let that replacement happen; no local
  // hide (which would flash the window closed then open again).
  const onUndo = (): void => {
    emitAction({ kind: 'undo' });
  };

  // Move the just-captured block to a different (existing) thread. We delete +
  // recreate rather than UPDATE thread_id so the new block gets a fresh created_at
  // that puts it at the bottom of the target thread's feed. Pin + note the user
  // already made on this toast ride along: annotationDraft mirrors the note whether
  // it's still pending or was committed to the old block, and pendingNoteRef is
  // cleared first so no dismiss path writes to the deleted block afterwards.
  const onRedirect = async (targetThreadId: string): Promise<void> => {
    if (targetThreadId === toast.threadId) {
      setPickerOpen(false);
      return;
    }
    const note = annotationDraft.trim();
    pendingNoteRef.current = null;
    let newBlock: Block;
    try {
      await deleteBlock(toast.blockId);
      newBlock = await createBlock({
        threadId: targetThreadId,
        kind: 'text',
        content: toast.fullContent,
        source: toast.source,
        annotation: note.length > 0 ? note : null,
        pinned,
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

  const dismissToast = (): void => {
    flushPendingNote();
    setContent(null);
    setExpanded(false);
    hideOverlay();
  };

  // Finish editing the note: commit + collapse (so auto-dismiss can resume). Cancel: discard
  // the draft + collapse. Same shape as a block's annotation editor (§3.6 unification).
  const finishNote = (): void => {
    flushPendingNote();
    setExpanded(false);
  };
  const cancelNote = (): void => {
    pendingNoteRef.current = null;
    setAnnotationDraft('');
    setExpanded(false);
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overlay-in relative w-full rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      {/* Top-right cluster: one-click 📌 pin (no longer bundled with the note) + × close. */}
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void onTogglePin()}
          title={pinned ? tr('取消置顶') : tr('置顶')}
          aria-label={pinned ? tr('取消置顶') : tr('置顶')}
          className={`rounded p-1 transition-colors ${
            pinned ? 'text-accent' : 'text-muted/70 hover:bg-paper-2 hover:text-ink'
          }`}
        >
          <Pin size={12} className={pinned ? 'fill-current' : ''} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={dismissToast}
          title={tr('关闭 (Esc)')}
          aria-label={tr('关闭')}
          className="rounded p-1 text-muted/70 hover:bg-paper-2 hover:text-ink"
        >
          <X size={11} />
        </button>
      </div>

      {/* Body — the captured content takes the lead; attribution is a quiet condensed line.
          Drag to move; double-click anywhere to reveal the note editor (no visible affordance,
          per the redesign — keeps the toast clean). */}
      <div
        className="cursor-grab px-3.5 pb-2 pt-2.5 pr-14 active:cursor-grabbing"
        onMouseDown={startToastDrag}
        onDoubleClick={() => setExpanded(true)}
        title={tr('双击添加批注')}
      >
        <div className="line-clamp-2 whitespace-pre-wrap break-words font-ui text-[14px] leading-snug text-ink">
          {toast.fullContent}
        </div>
        <div
          className="mt-1 truncate font-mono text-[10px] text-muted"
          title={`${toast.workspaceTitle} / ${toast.threadTitle}${toast.source ? ` · ${toast.source}` : ''}`}
        >
          {toast.workspaceTitle}
          <span className="text-muted/50"> / </span>
          {toast.threadTitle}
          {toast.source && <span className="text-muted/50"> · {toast.source}</span>}
        </div>
      </div>

      {/* Note editor — revealed by double-clicking the body. Enter = newline; 「完成」 (or
          click-away / Tab) commits; Esc cancels — identical to a block's annotation (§3.6). */}
      {expanded && (
        <div className="border-t border-line px-3.5 py-2.5">
          <textarea
            ref={annotationRef}
            value={annotationDraft}
            onChange={(e) => {
              setAnnotationDraft(e.target.value);
              // Mirror the draft into the ref each keystroke so a click-away / dismiss path
              // (which may not fire onBlur) can still flush it.
              pendingNoteRef.current = {
                blockId: toast.blockId,
                threadId: toast.threadId,
                draft: e.target.value,
              };
            }}
            onBlur={finishNote}
            onKeyDown={(e) => {
              if (isImeComposing(e.nativeEvent)) {
                // Composition-cancel Esc: swallow it so the window-level Esc can't
                // dismiss the toast either; the IME handles the key itself.
                e.stopPropagation();
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // keep the window-level Esc from dismissing the toast
                cancelNote();
              }
            }}
            placeholder={tr('批注（可选）')}
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-line bg-paper-2/40 px-2 py-1.5 font-ui text-[12px] leading-[1.5] text-ink-2 placeholder:text-muted/70 outline-none focus:border-line-strong focus:bg-paper focus:text-ink"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // don't blur the textarea first
              onClick={finishNote}
              className="rounded-md border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent hover:bg-accent/10"
            >
              {tr('完成')}
            </button>
          </div>
        </div>
      )}

      {/* Footer — concise, icon-only: ↩ undo, ⤳ redirect (dropdown). */}
      <div className="flex items-center gap-1 border-t border-line bg-paper-2/30 px-2 py-1">
        <button
          onClick={() => void onUndo()}
          className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
          title={tr('撤销刚才的捕捉')}
          aria-label={tr('撤销')}
        >
          <RotateCcw size={13} />
        </button>

        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
            title={tr('改投到其它脉络')}
            aria-label={tr('改投')}
          >
            <Forward size={13} />
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
                      {ws.title || tr('未命名')}
                    </div>
                    {list.map((th) => (
                      <button
                        key={th.id}
                        onClick={() => void onRedirect(th.id)}
                        disabled={th.id === toast.threadId}
                        className={`block w-full truncate px-2.5 py-1 text-left text-xs ${
                          th.id === toast.threadId
                            ? 'cursor-default text-muted/70'
                            : 'text-ink hover:bg-paper-2'
                        }`}
                      >
                        {th.title.trim() || tr('无标题')}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
