import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import {
  readClipboardText,
  readForegroundApp,
  type ForegroundApp,
} from '@/lib/capture/clipboard';
import { ingestCapture } from '@/lib/capture/ingest';
import {
  OVERLAY_ACTION_EVENT,
  SHOW_OVERLAY_COMMAND,
  SHOW_OVERLAY_NOTICE_COMMAND,
  UPDATE_OVERLAY_SOURCE_COMMAND,
  type CaptureOverlayPayload,
  type OverlayAction,
  type OverlayNotice,
} from '@/lib/capture/overlayProtocol';
import { updateBlockSource } from '@/lib/db/blocks';
import { useBlocksStore } from '@/stores/blocksStore';
import { buildPreview, useCaptureStore } from '@/stores/captureStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { toast } from '@/stores/toastStore';
import { buildCaptureUndo, useUndoStore } from '@/stores/undoStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import { runRedo, runUndo } from '@/hooks/useUndo';
import { t } from '@/lib/i18n';

// Max wait in the *hot path* for the parallel foreground-app query. If osascript hasn't
// answered by then, we skip focus restoration this round — better to show the toast
// promptly than to delay it. After warm-up osascript typically responds in <30ms.
const FRONTMOST_HOT_PATH_MS = 80;
// Cap for the source-backfill consumer of the same query. Generous because backfill
// runs off the hot path; if osascript hangs, we just leave source=null. Sized for the
// two sequential osascript calls (frontmost process, then browser tab title).
const FRONTMOST_BACKFILL_MS = 2200;
const CLIPBOARD_RETRY_DELAYS_MS = [120, 240]; // up to 3 attempts total

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const readClipboardWithRetry = async (): Promise<string> => {
  const first = await readClipboardText();
  if (first) return first;
  for (const delay of CLIPBOARD_RETRY_DELAYS_MS) {
    await sleep(delay);
    const next = await readClipboardText();
    if (next) return next;
  }
  return '';
};

const DEV = import.meta.env.DEV;
const tlog = (label: string, t0: number, extra?: string): void => {
  if (!DEV) return;
  const dt = Math.round(performance.now() - t0);
  console.info(`[capture] ${label} +${dt}ms${extra ? ` ${extra}` : ''}`);
};

const showNoticeInOverlay = (payload: OverlayNotice): void => {
  void invoke(SHOW_OVERLAY_NOTICE_COMMAND, { payload }).catch((e) => {
    console.error('[capture] show_capture_notice failed', e, 'notice was:', payload);
  });
};

const applyOverlayAction = (action: OverlayAction): void => {
  if (action.kind === 'undo') {
    // §9.13: the capture toast's Undo and Cmd+Z hit the SAME machinery. The overlay no
    // longer deletes the block itself — it asks the main window to run undoStore.undo(),
    // which reverses the op, refreshes blocksStore, and replaces the toast with the undo
    // confirmation card (shown in the overlay, over the user's current window).
    void runUndo();
    return;
  }
  if (action.kind === 'redo') {
    // §9.13: 重做 button on the undo-confirmation card → re-apply the last undone op.
    void runRedo();
    return;
  }
  if (action.kind === 'redirect') {
    useBlocksStore.setState((s) => {
      const oldList = s.byThread[action.oldThreadId] ?? [];
      const newList = s.byThread[action.targetThreadId] ?? [];
      return {
        byThread: {
          ...s.byThread,
          [action.oldThreadId]: oldList.filter((b) => b.id !== action.oldBlockId),
          [action.targetThreadId]: [...newList, action.newBlock],
        },
      };
    });
    // §9.13: the capture undo entry still points at the OLD block id, which redirect just
    // deleted — Cmd+Z would "succeed" against a nonexistent row and leave the real block.
    // Retarget the ring: drop entries for the old block, record the new one as the capture.
    useUndoStore.getState().invalidateForBlock(action.oldBlockId);
    useUndoStore.getState().pushUndo(
      buildCaptureUndo({
        blockId: action.newBlock.id,
        threadId: action.targetThreadId,
        content: action.newBlock.content,
      }),
    );
    void useThreadsStore.getState().patch(action.targetThreadId, {});
    return;
  }
  if (action.kind === 'suggestion-move') {
    // The DB reparent already happened in the overlay; mirror it into the stores.
    // Main holds the full Block under the old thread, so we just move that object.
    useBlocksStore.setState((s) => {
      const oldList = s.byThread[action.oldThreadId] ?? [];
      const moved = oldList.find((b) => b.id === action.blockId);
      const newList = s.byThread[action.newThreadId] ?? [];
      return {
        byThread: {
          ...s.byThread,
          [action.oldThreadId]: oldList.filter((b) => b.id !== action.blockId),
          [action.newThreadId]: moved
            ? [...newList, { ...moved, threadId: action.newThreadId }]
            : newList,
        },
      };
    });
    void useThreadsStore.getState().patch(action.newThreadId, {});
    useCaptureStore.getState().setFlash(action.newThreadId, action.blockId);
    return;
  }
  if (action.kind === 'pin') {
    // v2.8 §20.6: pin toggled from the expanded capture toast. DB write done in overlay.
    useBlocksStore.setState((s) => {
      const list = s.byThread[action.threadId];
      if (!list) return s;
      return {
        byThread: {
          ...s.byThread,
          [action.threadId]: list.map((b) =>
            b.id === action.blockId ? { ...b, pinned: action.pinned } : b,
          ),
        },
      };
    });
    return;
  }
  if (action.kind === 'annotate') {
    // v2.8 §20.6: annotation written from the expanded capture toast. DB write done in overlay.
    useBlocksStore.setState((s) => {
      const list = s.byThread[action.threadId];
      if (!list) return s;
      return {
        byThread: {
          ...s.byThread,
          [action.threadId]: list.map((b) =>
            b.id === action.blockId ? { ...b, annotation: action.annotation } : b,
          ),
        },
      };
    });
  }
};

export function useCapture(): void {
  const inFlightRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose = await listen<unknown>('capture-trigger', async (e) => {
        const t0 = performance.now();
        // Payload `true` marks the user-bound global-shortcut path (set in lib.rs; no
        // default binding since 2026-07-07); a unit/null payload is the double-tap ⌥
        // path (double_tap.rs).
        const viaShortcut = e.payload === true;
        if (DEV) console.info('[capture] trigger', viaShortcut ? '(shortcut)' : '(⌥⌥)');
        if (inFlightRef.current) {
          if (DEV) console.info('[capture] drop: previous handler still running');
          return;
        }
        inFlightRef.current = true;
        // Start the foreground-app query in parallel with clipboard read & DB write —
        // by the time we're ready to invoke show, this is usually already resolved.
        // Single shared promise, consumed twice (hot-path for focus restore, slow-path
        // for source backfill), so we only spawn osascript once per capture.
        const frontmostPromise: Promise<ForegroundApp | null> = readForegroundApp();
        try {
          const text = await readClipboardWithRetry();
          tlog('clipboard read', t0, `len=${text.length}`);
          if (!text) {
            showNoticeInOverlay({ kind: 'empty' });
            return;
          }

          const result = await ingestCapture(text, null);
          tlog('block insert', t0);
          if (!result) {
            showNoticeInOverlay({ kind: 'no-target' });
            return;
          }

          useBlocksStore.setState((s) => ({
            byThread: {
              ...s.byThread,
              [result.threadId]: [...(s.byThread[result.threadId] ?? []), result.block],
            },
          }));

          // §9.13: record the capture so Cmd+Z (and the toast's Undo, which now routes
          // through the same undoStore) can delete the block. Pushed here in the main
          // window — the capture DB write happens here, not in the overlay.
          useUndoStore.getState().pushUndo(
            buildCaptureUndo({
              blockId: result.block.id,
              threadId: result.threadId,
              content: result.block.content,
            }),
          );

          const ws = useWorkspacesStore
            .getState()
            .workspaces.find((w) => w.id === result.workspaceId);

          useCaptureStore.getState().setFlash(result.threadId, result.block.id);
          // 拍板点 5: first capture ever on a fresh install → arm the one-time closing
          // line under that block. No-op on every later capture and on every library
          // that predates the flag.
          useCaptureStore.getState().noteCapture(result.block.id);

          // Wait briefly for the frontmost query so Rust can re-activate that app
          // after show(). If it hasn't answered yet, ship the show without — better
          // toast latency than focus restoration on this one capture.
          const frontmostHot = await Promise.race([
            frontmostPromise,
            sleep(FRONTMOST_HOT_PATH_MS).then(() => null),
          ]);
          const prevSourceApp = frontmostHot?.app ?? null;
          tlog('frontmost (hot)', t0, `app=${prevSourceApp ?? '<timeout>'}`);

          const payload: CaptureOverlayPayload = {
            blockId: result.block.id,
            threadId: result.threadId,
            workspaceId: result.workspaceId,
            workspaceTitle: ws?.title.trim() || t('收件箱'),
            threadTitle: result.threadTitle.trim() || t('未命名'),
            preview: buildPreview(text),
            fullContent: text,
            source: null,
            prevSourceApp,
          };
          void invoke(SHOW_OVERLAY_COMMAND, { payload }).catch((e) => {
            console.error('[capture] show_capture_overlay failed', e);
          });
          tlog('overlay shown', t0);

          void useThreadsStore.getState().patch(result.threadId, {});

          // Async backfill of source. Reuses the same frontmostPromise — the osascript
          // call already started in parallel, this just waits longer for it.
          void (async () => {
            const frontmost = await Promise.race([
              frontmostPromise,
              sleep(FRONTMOST_BACKFILL_MS).then(() => null),
            ]);
            const source = frontmost?.source ?? null;
            if (!source) return;
            try {
              await updateBlockSource(result.block.id, source);
            } catch (e) {
              console.warn('source backfill failed', e);
              return;
            }
            useBlocksStore.setState((s) => {
              const list = s.byThread[result.threadId];
              if (!list) return s;
              return {
                byThread: {
                  ...s.byThread,
                  [result.threadId]: list.map((b) =>
                    b.id === result.block.id ? { ...b, source } : b,
                  ),
                },
              };
            });
            void invoke(UPDATE_OVERLAY_SOURCE_COMMAND, {
              blockId: result.block.id,
              source,
            }).catch((e) => console.warn('update_overlay_source failed', e));
          })();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[capture] failed', e);
          showNoticeInOverlay({ kind: 'error', msg: t('捕捉失败：{msg}', { msg }) });
        } finally {
          inFlightRef.current = false;
          if (DEV) console.info('[capture] finally: inFlight cleared');
        }
      });
      if (cancelled) {
        dispose();
      } else {
        unlisten = dispose;
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<OverlayAction>(OVERLAY_ACTION_EVENT, (e) => {
        applyOverlayAction(e.payload);
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // §9.13: Rust emits `undo-trigger` when the global undo shortcut fires (registered only
  // while a toast is up). Run the same reversal as Cmd+Z / the toast's Undo button —
  // runUndo replaces the capture toast with the undo-confirmation card in the overlay, so
  // the user gets feedback over their current window without switching back to Spool.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen('undo-trigger', () => {
        void runUndo();
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // §19.4: Rust emits `capture-disabled` when macOS has disabled the CGEventTap
  // and the in-place self-heal didn't stick. Surface a one-time notice so the user
  // knows to restart Spool; a user-bound capture shortcut keeps working meanwhile.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen('capture-disabled', () => {
        toast.error(t('双击 ⌥ 捕捉已停止 — 请重启 Spool 重新启用。'));
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
