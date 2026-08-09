import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import { toast } from '@/stores/toastStore';
import { basename, pathIsDir } from '@/lib/utils/openTarget';
import type { AttachmentKind } from '@/lib/db/attachments';
import { t } from '@/lib/i18n';

interface UseThreadDropTargetArgs {
  // Root DOM node the drop bridge is scoped to. We only react to drags whose position
  // lies inside this node — otherwise sibling panels (sidebar, header) would steal
  // events that belong to other regions.
  rootRef: RefObject<HTMLElement>;
  threadId: string;
}

// CSS-pixel point relative to the webview viewport, as returned by the Rust
// `cursor_in_main_webview` command.
interface WebviewPoint {
  x: number;
  y: number;
}

const DEV = import.meta.env.DEV;

// Per PLAN_EN.md §9.6 / Phase 6, as revised by DESIGN_PROJECT_FILES (v15): dropping files
// anywhere in the timeline adds them to THIS PROJECT's files. There is no longer a
// distinction between dropping on a block and dropping in empty space — a file does not
// belong to a block any more, so both meant the same thing.
//
// ⚠️ The old empty-space behaviour (invent a text block named after the file, hang the
// attachment off it) is gone with it. That block existed only to give an attachment
// somewhere to live; a project's file list is now that somewhere.
//
// Hit-testing uses the *cursor* position (via Rust `cursor_in_main_webview`), not the
// drag event's own `position`. onDragDropEvent's position has an ambiguous reference
// frame — offset by the native title bar and inconsistently physical/logical across
// Tauri versions — which landed the hit-test above the real cursor. cursor_position
// minus the window's content-area origin is exact. `enter`/`over` events drive the
// drop highlight (useDropStore) so the user sees the landing spot before releasing.
export function useThreadDropTarget({ rootRef, threadId }: UseThreadDropTargetArgs): void {
  const attach = useBlocksStore((s) => s.attach);

  // Stable thread id via ref so the listener doesn't churn on every render — Tauri's
  // unlisten() would otherwise drop in-flight `drop` events on the floor.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    // Skips a highlight repaint while a previous cursor query is still in flight —
    // a natural rate-limit to IPC speed so rapid `over` events can't pile up.
    let highlightBusy = false;

    const containsPoint = (x: number, y: number): boolean => {
      const root = rootRef.current;
      if (!root) return false;
      const r = root.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    // Cursor position in CSS px relative to the webview viewport — the exact space
    // document.elementFromPoint expects. See the module comment for why we don't use
    // the drag event's position.
    const cursorPoint = async (): Promise<WebviewPoint | null> => {
      try {
        return await invoke<WebviewPoint | null>('cursor_in_main_webview');
      } catch (e) {
        console.warn('[drop] cursor query failed', e);
        return null;
      }
    };

    const paintHighlight = async (): Promise<void> => {
      if (highlightBusy) return;
      highlightBusy = true;
      try {
        const pt = await cursorPoint();
        const { setOverThread } = useDropStore.getState();
        setOverThread(pt ? containsPoint(pt.x, pt.y) : false);
      } finally {
        highlightBusy = false;
      }
    };

    const handleDrop = async (paths: string[]): Promise<void> => {
      if (paths.length === 0) return;
      const pt = await cursorPoint();
      if (!pt) return;
      const inside = containsPoint(pt.x, pt.y);
      if (DEV) console.info('[drop] at', pt, '-> inside:', inside);
      if (!inside) return; // outside our pane → not our event

      // Classify every path once (filesystem stat is cheap; parallelizing keeps the
      // drop responsive even when 20+ files land at once).
      const kinds = await Promise.all(
        paths.map(
          async (p): Promise<AttachmentKind> => ((await pathIsDir(p)) ? 'folder' : 'file'),
        ),
      );

      try {
        for (let i = 0; i < paths.length; i++) {
          const target = paths[i]!;
          await attach({
            threadId: threadIdRef.current,
            kind: kinds[i]!,
            target,
            label: basename(target),
          });
        }
      } catch (e) {
        console.error('[drop] attach failed', e);
        toast.error(t('附加失败：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
      }
    };

    void (async () => {
      const dispose = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === 'enter' || p.type === 'over') {
          void paintHighlight();
        } else if (p.type === 'leave') {
          useDropStore.getState().setOverThread(false);
        } else if (p.type === 'drop') {
          useDropStore.getState().setOverThread(false);
          void handleDrop(p.paths);
        }
      });
      if (disposed) dispose();
      else unlisten = dispose;
    })();

    return () => {
      disposed = true;
      useDropStore.getState().setOverThread(false);
      if (unlisten) unlisten();
    };
    // rootRef.current is stable across the lifetime of the consumer; we deliberately
    // exclude `append`/`attach` because zustand's bound actions are stable too — keeping
    // the dep list minimal avoids the listener-churn race noted above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
