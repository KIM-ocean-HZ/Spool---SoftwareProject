import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import { toast } from '@/stores/toastStore';
import { basename, parentDirName, pathIsDir } from '@/lib/utils/openTarget';
import type { AttachmentKind } from '@/lib/db/attachments';

interface UseThreadDropTargetArgs {
  // Root DOM node the drop bridge is scoped to. We only react to drags whose position
  // lies inside this node — otherwise sibling panels (sidebar, header) would steal
  // events that belong to other regions.
  rootRef: RefObject<HTMLElement>;
  threadId: string;
}

// What the cursor is currently over within the timeline.
type DropResolution =
  | { kind: 'outside' }
  | { kind: 'block'; blockId: string }
  | { kind: 'empty' };

// CSS-pixel point relative to the webview viewport, as returned by the Rust
// `cursor_in_main_webview` command.
interface WebviewPoint {
  x: number;
  y: number;
}

const DEV = import.meta.env.DEV;

// Per PLAN_EN.md §9.6 / Phase 6:
//   - drop onto an existing block → attach
//   - drop into empty timeline space → new text block (content = first path's
//     basename) carrying all attachments.
//
// Hit-testing uses the *cursor* position (via Rust `cursor_in_main_webview`), not the
// drag event's own `position`. onDragDropEvent's position has an ambiguous reference
// frame — offset by the native title bar and inconsistently physical/logical across
// Tauri versions — which landed the hit-test above the real cursor. cursor_position
// minus the window's content-area origin is exact. `enter`/`over` events drive the
// drop highlight (useDropStore) so the user sees the landing spot before releasing.
export function useThreadDropTarget({ rootRef, threadId }: UseThreadDropTargetArgs): void {
  const append = useBlocksStore((s) => s.append);
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

    const blockIdAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const owner = (el as HTMLElement).closest('[data-block-id]');
      return owner ? owner.getAttribute('data-block-id') : null;
    };

    const resolve = (cssX: number, cssY: number): DropResolution => {
      if (!containsPoint(cssX, cssY)) return { kind: 'outside' };
      const blockId = blockIdAt(cssX, cssY);
      return blockId ? { kind: 'block', blockId } : { kind: 'empty' };
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
        const { setTarget, clear } = useDropStore.getState();
        if (!pt) {
          clear();
          return;
        }
        const r = resolve(pt.x, pt.y);
        if (r.kind === 'outside') clear();
        else if (r.kind === 'block') setTarget(r.blockId, false);
        else setTarget(null, true);
      } finally {
        highlightBusy = false;
      }
    };

    const handleDrop = async (paths: string[]): Promise<void> => {
      if (paths.length === 0) return;
      const pt = await cursorPoint();
      if (!pt) return;
      const r = resolve(pt.x, pt.y);
      if (DEV) {
        console.info(
          '[drop] at',
          pt,
          '->',
          r.kind,
          r.kind === 'block' ? r.blockId : '',
        );
      }
      if (r.kind === 'outside') return; // outside our pane → not our event

      // Classify every path once (filesystem stat is cheap; parallelizing keeps the
      // drop responsive even when 20+ files land at once).
      const kinds = await Promise.all(
        paths.map(
          async (p): Promise<AttachmentKind> => ((await pathIsDir(p)) ? 'folder' : 'file'),
        ),
      );

      try {
        let blockId = r.kind === 'block' ? r.blockId : null;
        if (!blockId) {
          // Empty-space drop = the former "file anchor": create a new text block whose
          // content names the first artifact. With multiple files in one drop, the
          // remaining ones attach to that same new block.
          const first = paths[0]!;
          const b = await append({
            threadId: threadIdRef.current,
            kind: 'text',
            content: basename(first),
            // Record where the file came from (its containing folder) as the block's
            // source, so the origin shows on the block and in pack output.
            source: parentDirName(first) || null,
          });
          blockId = b.id;
        }
        for (let i = 0; i < paths.length; i++) {
          const target = paths[i]!;
          await attach({
            blockId,
            kind: kinds[i]!,
            target,
            label: basename(target),
          });
        }
      } catch (e) {
        console.error('[drop] attach failed', e);
        toast.error('附加失败：' + (e instanceof Error ? e.message : String(e)));
      }
    };

    void (async () => {
      const dispose = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === 'enter' || p.type === 'over') {
          void paintHighlight();
        } else if (p.type === 'leave') {
          useDropStore.getState().clear();
        } else if (p.type === 'drop') {
          useDropStore.getState().clear();
          void handleDrop(p.paths);
        }
      });
      if (disposed) dispose();
      else unlisten = dispose;
    })();

    return () => {
      disposed = true;
      useDropStore.getState().clear();
      if (unlisten) unlisten();
    };
    // rootRef.current is stable across the lifetime of the consumer; we deliberately
    // exclude `append`/`attach` because zustand's bound actions are stable too — keeping
    // the dep list minimal avoids the listener-churn race noted above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
