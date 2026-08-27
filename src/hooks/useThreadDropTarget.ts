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

/** 多久没有收到 `over` 就认定「拖拽已经不在这儿了」。见下面 feedWatchdog 那段。 */
const DRAG_IDLE_MS = 900;

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

    // ⛔⛔ 2026-08-27（Ocean:「底下那个虚线框，没有拖拽的时候也冒出来」）——**看门狗**。
    //
    // 病根：`overThread` 只在 `leave` 和 `drop` 上复位，而**这两个事件都不保证会来**。
    // 拖拽在窗口外面松手、拖到别的 Space、拖回访达自己那儿取消，系统只是不再往这个
    // webview 发 `over` 了 —— 没有 `leave`。于是那个「松开…」的框就一直挂在那儿，
    // 而这时候根本没有人在拖任何东西。
    //
    // ⚠️ 修法不是「再补几个复位点」（那是把同一个赌下三次）：改成**只要还在拖，就一直
    // 有人喂它**。macOS 在拖拽停在窗口里不动时仍然会周期性地发 `draggingUpdated`
    // （`wantsPeriodicDraggingUpdates` 默认就是 YES），所以「一段时间没有 over」这件事
    // 只可能意味着拖拽已经不在这儿了。
    // ⚠️ 900ms：比周期性更新的间隔（约 200ms）宽出好几倍，⛔ 又短到不会让那个框在屏幕上
    // 赖着不走。
    let idle: ReturnType<typeof setTimeout> | null = null;
    const clearIdle = (): void => {
      if (idle !== null) {
        clearTimeout(idle);
        idle = null;
      }
    };
    const feedWatchdog = (): void => {
      clearIdle();
      idle = setTimeout(() => {
        idle = null;
        useDropStore.getState().setOverThread(false);
      }, DRAG_IDLE_MS);
    };

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
          feedWatchdog();
          void paintHighlight();
        } else if (p.type === 'leave') {
          clearIdle();
          useDropStore.getState().setOverThread(false);
        } else if (p.type === 'drop') {
          clearIdle();
          useDropStore.getState().setOverThread(false);
          void handleDrop(p.paths);
        }
      });
      if (disposed) dispose();
      else unlisten = dispose;
    })();

    return () => {
      disposed = true;
      clearIdle();
      useDropStore.getState().setOverThread(false);
      if (unlisten) unlisten();
    };
    // rootRef.current is stable across the lifetime of the consumer; we deliberately
    // exclude `append`/`attach` because zustand's bound actions are stable too — keeping
    // the dep list minimal avoids the listener-churn race noted above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
