import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Forward, Pin, RotateCcw, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Block } from '@/lib/db/blocks';
// 🚨 Not @/lib/db — this process never opens SQLite (DESIGN_CAPTURE_HELPER_PROCESS §3.3).
// These proxy to the main window's one connection; see src/overlay/db.ts.
import {
  createBlock,
  deleteBlock,
  listAllThreads,
  listWorkspaces,
  togglePin as togglePinDb,
  updateBlockAnnotation,
} from './db';
import {
  DISARM_DISMISS_COMMAND,
  HIDE_OVERLAY_COMMAND,
  OVERLAY_ACTION_EVENT,
  OVERLAY_DISMISS_EVENT,
  OVERLAY_LANGUAGE_EVENT,
  OVERLAY_THEME_EVENT,
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
import type { Workspace } from '@/lib/db/workspaces';
import { isImeComposing } from '@/lib/utils/ime';
import { useAppliedTheme } from '@/hooks/useTheme';
import { themeOrDefault } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { t, useT } from '@/lib/i18n';
import { IS_MAC } from '@/lib/platform';

// Note-first (2026-07-31, DESIGN_CAPTURE_NOTE_FIRST): the toast opens with the note
// editor visible and focused — capture invites a thought, typing is zero-friction.
// Enter commits (Shift+Enter = newline), click-outside keeps a non-empty draft and
// skips the note otherwise, Esc discards. The dwell below only applies while the
// note box is EMPTY and untouched; any typed text keeps the toast up.
const TOAST_AUTO_DISMISS_MS = 8000;
const NOTICE_AUTO_DISMISS_MS = 2200;
// v2.9 §9.13: undo/redo confirmation dwell — short, paused on hover so the user can click 重做.
const UNDO_AUTO_DISMISS_MS = 2500;

const UNDO_OP_LABEL: Record<OverlayUndoPayload['op'], string> = {
  capture: '捕获',
  create: '写下的一条',
  merge: '合并',
  delete: '删除',
  highlight: '高亮',
  thread_delete: '删除项目',
  thread_delete_many: '删除多个项目',
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
  // Each platform names its built-in gesture — double-tap ⌥ on macOS, double-tap Ctrl on
  // Windows — the same one this notice just came from. (A user who rebound capture to a chord
  // instead sees "double-tap" wording that is one step off, the same as on macOS; the helper
  // process does not read settings.json, so it cannot know which they used.)
  if (n.kind === 'empty')
    return IS_MAC
      ? t('剪贴板为空 — 先按 ⌘C 复制要捕捉的内容，再双击 ⌥')
      : t('剪贴板为空 — 先按 Ctrl+C 复制要捕捉的内容，再双击 Ctrl');
  if (n.kind === 'no-target') return t('没有捕捉目标 — 打开 Spool 在项目顶栏点「捕捉到此」');
  return n.msg ?? t('捕捉失败');
};

export default function CaptureOverlay() {
  const tr = useT();
  // 情人节限定版 (2026-08-19) — the toast is a separate window with its own bundle, so it applies
  // the theme onto its own root. WHERE the theme comes from is the effect further down, not
  // this call: it is pushed in from Rust with every show, exactly like the language.
  // ⚠️⚠️ It was written the other way round first — `useAppliedTheme()` alone, on the belief
  // that this window "reads the same settings.json and re-reads on the `settings:changed`
  // broadcast". **Neither half of that is true here**, and the result shipped as a 经典 toast
  // in a 情人节 build (Ocean 2026-08-19: 「捕捉浮窗仍然是classic的ui啊」). Since 2026-08-01 this
  // is a separate PROCESS, so that broadcast never arrives; and capabilities/overlay.json grants
  // no `store:` permission, so the store's load() cannot read the file even when something does
  // call it. The store therefore sat on its default — 经典 — forever.
  // ⚠️ It needs this to be right for a reason the main window does not have: the toast is drawn
  // over whatever app the user was copying from, so a cream card in a pink build would be the
  // one piece of Spool visible on someone else's screen and the one piece that did not match.
  useAppliedTheme();
  const [content, setContent] = useState<OverlayContent>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [threadsByWs, setThreadsByWs] = useState<Record<string, Thread[]>>({});
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Note-first (2026-07-31): the note editor is part of the toast's default state —
  // `expanded` flips to true on every fresh capture (the Rust side hands the overlay
  // keyboard focus at the same moment). It only exists as state so the undo/notice
  // cards can render without the editor.
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

  // The overlay runs in its own process and deliberately keeps no settings store of its
  // own: a second writer to settings.json is the same class of hazard as a second writer
  // to the database (DESIGN_CAPTURE_HELPER_PROCESS §3.3). Rust reads the user's language
  // and theme out of settings.json and pushes them with every show, so a switch in the main
  // window reaches the next toast.
  // ⚠️ Both land BEFORE the content event that makes the card appear (overlay.rs emits in that
  // order, and Tauri delivers to one window in order), and the card renders nothing until then
  // — so the first paint is already right and there is no 经典→情人节 flash to chase.
  // ⚠️ `themeOrDefault`, not the raw string: settings.json is hand-editable, and an unknown
  // name written onto <html> would match no stylesheet at all — a half-painted card floating
  // over someone else's app. Same guard the main window's settings load applies.
  useEffect(() => {
    let unlisten: Array<() => void> = [];
    let cancelled = false;
    void (async () => {
      const disposers = await Promise.all([
        listen<'zh' | 'en'>(OVERLAY_LANGUAGE_EVENT, (e) => {
          useSettingsStore.setState({ language: e.payload });
        }),
        listen<string>(OVERLAY_THEME_EVENT, (e) => {
          useSettingsStore.setState({ theme: themeOrDefault(e.payload) });
        }),
      ]);
      if (cancelled) disposers.forEach((d) => d());
      else unlisten = disposers;
    })();
    return () => {
      cancelled = true;
      unlisten.forEach((d) => d());
    };
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
        // Note-first: every fresh capture opens with a clean, focused note editor —
        // the previous capture's draft/pin state never bleeds into this one.
        setExpanded(true);
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

  // Auto-dismiss timer. Paused while the pointer is over the card, the picker is
  // open, or the note box has ANY text (note-first: typed thoughts never vanish on a
  // timer — Enter / click-outside / Esc finish them). An empty, untouched toast goes
  // away on its own. Notices use a slightly shorter timeout since there's nothing to
  // interact with on them.
  //
  // ⚠️ Ocean, Windows 验收 2026-08-18 #2: 「弹窗一直不消失」. The draft is the CAPTURE TOAST's
  // pause, and only a fresh capture clears it — finishing a note with Enter commits it and
  // leaves the text in state. So the first undo/notice card after any annotated capture
  // inherited a non-empty draft it does not even render, and never timed out. That also
  // stranded the global ⌘Z/Ctrl+Z this process holds while a card is up (capture.rs
  // unregisters it on hide, and the hide never came) — which is the whole of #3: the
  // shortcut recorder could not see Ctrl+Z because the OS was still handing it to us.
  useEffect(() => {
    if (!content) return;
    if (hover || pickerOpen) return;
    if (content.kind === 'toast' && annotationDraft.length > 0) return;
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
  }, [content, hover, pickerOpen, annotationDraft]);

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

  // Esc dismisses while a toast is showing. Note-first semantics: Esc is the explicit
  // "no note" exit, so the draft is DISCARDED (click-outside is the ambient exit and
  // keeps a non-empty draft — see the dismiss listener below).
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent): void => {
      // Esc during an IME composition (in the note editor) only cancels the
      // composition — it must not dismiss the toast mid-note.
      if (isImeComposing(e)) return;
      if (e.key === 'Escape') {
        pendingNoteRef.current = null;
        setContent(null);
        setExpanded(false);
        hideOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content]);

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

  // Note-first: focus the annotation textarea the moment the toast (re)renders with
  // the editor open. DOM focus is recorded whether or not the window is key yet, so it
  // is already in place by the time show_capture_overlay takes the foreground (see its
  // "Note-first activation" section) and typing flows straight into the note.
  // Keyed on content too: a rapid re-capture re-runs this even though `expanded`
  // never flipped back to false in between.
  useEffect(() => {
    if (expanded && annotationRef.current) {
      annotationRef.current.focus();
    }
  }, [expanded, content]);

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

  // Note-first exits. Finish (Enter / 完成): commit the draft and dismiss — the user
  // is done with this capture, focus goes back to their app (Rust side of hide).
  // Cancel (Esc): discard the draft and dismiss.
  const finishNote = (): void => {
    flushPendingNote();
    setContent(null);
    setExpanded(false);
    hideOverlay();
  };
  const cancelNote = (): void => {
    pendingNoteRef.current = null;
    setAnnotationDraft('');
    setContent(null);
    setExpanded(false);
    hideOverlay();
  };

  return (
    /* ⚠️ `capture-bloom` is a bare marker class with NO rule behind it in 经典 — the only rule
       that matches it lives under `[data-theme='valentine']` (overlay/style.css), where it lays
       one of the background painting's peonies into this card's right-hand column. Same
       construction as `rail-wash` in the main window, for the same reason: the shipped card keeps
       every class it shipped with, so 经典 cannot shift by a shade.
       ⚠️ The notice and undo strips above deliberately do not carry it — their one line of text
       runs edge to edge, which is where the flower would have to go. The measured reason is in
       overlay/style.css. */
    <div
      ref={cardRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overlay-in capture-bloom relative w-full rounded-lg border border-line-strong bg-paper"
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
          Drag to move. The note editor below is always open (note-first). */}
      <div
        className="cursor-grab px-3.5 pb-2 pt-2.5 pr-14 active:cursor-grabbing"
        onMouseDown={startToastDrag}
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

      {/* Note editor — open and focused from the moment the toast appears (note-first).
          Enter commits + dismisses (Shift+Enter = newline); Esc discards + dismisses;
          clicking outside the toast keeps a non-empty draft. No onBlur commit: in-toast
          clicks (pin / redirect / drag) blur the textarea but must not end the capture —
          the per-keystroke ref mirror below is what the eventual dismiss path flushes. */}
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
            onKeyDown={(e) => {
              if (isImeComposing(e.nativeEvent)) {
                // Composition keys (Enter confirms, Esc cancels the IME): swallow so
                // neither the commit below nor the window-level Esc can fire mid-IME.
                e.stopPropagation();
                return;
              }
              // ⌘Z, 丙 (Ocean 2026-08-15). With text in the box this is the ordinary
              // "undo my typing" every app has, so it is handed to the textarea untouched;
              // with the box empty there is nothing here to undo, so it means the capture.
              //
              // ⚠️ Reachable only because capture.rs does NOT claim ⌘Z globally when the
              // toast takes the foreground — a global shortcut fires before the webview.
              // ⚠️ ⇧⌘Z is redo and never ends a capture.
              if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                if (e.currentTarget.value.length > 0) return;
                e.preventDefault();
                onUndo();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishNote();
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // the window-level Esc would double-dismiss
                cancelNote();
              }
            }}
            placeholder={tr('留一句想法…（Enter 保存，Esc 跳过）')}
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

      {/* Footer — concise, icon-only: ↩ undo, ⤳ redirect (dropdown).
          ⚠️ The ⌘Z half of 丙 is advertised on the undo button's tooltip rather than in the
          note box's placeholder (Ocean 2026-08-15): at 340px a third bracketed hint wraps
          the box taller, and the placeholder disappears the moment the user starts typing —
          which is exactly when they might reach for ⌘Z. The key belongs on the button that
          already does the same thing. */}
      <div className="flex items-center gap-1 border-t border-line bg-paper-2/30 px-2 py-1">
        <button
          onClick={() => void onUndo()}
          className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
          title={tr('撤销刚才的捕捉 · ⌘Z')}
          aria-label={tr('撤销')}
        >
          <RotateCcw size={13} />
        </button>

        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
            title={tr('改投到其它项目')}
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
