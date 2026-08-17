import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Thread } from '@/lib/db/threads';
import { useRailDragStore } from '@/stores/railDragStore';
import { useThreadsStore } from '@/stores/threadsStore';

// Dragging a project row into a workspace, on pointer events rather than HTML5
// drag-and-drop.
//
// ⚠️⚠️ **Do not put `draggable` back on the row.** HTML5 drag-and-drop cannot work inside
// this app at all. Tauri installs a native drag-drop handler on the WKWebView (window
// config `dragDropEnabled`, default true) and wry's macOS implementation
// (wkwebview/drag_drop.rs) overrides `draggingEntered:` / `draggingUpdated:` /
// `performDragOperation:` and **never calls super** once the handler claims the event —
// which tauri-runtime-wry does unconditionally (it always returns `true`). So for ANY drag
// over the webview, ours included:
//   · the OS is told NSDragOperationCopy  → that is the green ＋ badge the user sees,
//   · the drop is swallowed              → the page never gets `dragover` or `drop`.
// The row's `dragstart` still fires (that is WebKit's source side), which is why the drag
// looked alive and did nothing.
//
// ⚠️ Turning `dragDropEnabled` off is NOT the fix: that same native handler is how a file
// dragged out of Finder reaches useThreadDropTarget with a real path. An HTML5 file drop
// hands the webview a File with no path, and the project files feature stores paths.
//
// So the rail drives its own drag. It costs a ghost and an auto-scroll (both below) and
// buys back a gesture that does not depend on which layer of the stack owns the event.

/** DOM attribute a workspace marks its drop zone with; the value is the workspace id. */
export const DROP_WORKSPACE_ATTR = 'data-drop-workspace';
/** DOM attribute on the rail's scrolling element, so a drag can scroll it. */
export const RAIL_SCROLLER_ATTR = 'data-rail-scroller';

/** How far the pointer must travel before a press stops being a click and becomes a drag. */
const THRESHOLD_PX = 4;
/** Distance from the scroller's edge at which a drag starts scrolling the rail. */
const EDGE_PX = 36;
/** Pixels per frame it scrolls there. */
const SCROLL_STEP_PX = 10;

/**
 * Which of `ids` a drop on `workspaceId` would actually move: rows that exist, and that are
 * not already in that workspace. Dropping a selection onto the workspace half of it already
 * lives in moves the other half and leaves the rest alone.
 */
export function threadsToMove(
  ids: string[],
  all: Thread[],
  workspaceId: string,
): string[] {
  return ids.filter((id) => all.some((t) => t.id === id && t.workspaceId !== workspaceId));
}

/**
 * Stop a press on a project row from painting a text selection across the rail.
 *
 * ⚠️ `select-none` on the ROW is not enough, which is what Ocean saw: 「拖移会选中文字，导致
 * 左侧边栏的文本全是蓝色的」. A selection is extended by where the pointer GOES, not only by
 * where it started — the row it left is unselectable, every workspace heading and 最近 row it
 * travels over is not. So the suppression has to cover everything the pointer can cross.
 *
 * Two mechanisms because they cover different halves: `user-select: none` on `body` is what
 * the renderer consults as the pointer moves, and cancelling `selectstart` is what stops one
 * from ever beginning. Neither alone was enough — the first missed the selection that had
 * already begun before it was applied.
 *
 * ⚠️ It deliberately does NOT clear an existing selection: the user may have text selected in
 * the reading column, and reaching for a project in the rail is no reason to throw it away.
 */
const blockSelectStart = (e: Event): void => e.preventDefault();

const suppressSelection = (on: boolean): void => {
  const style = document.body.style;
  if (on) {
    style.setProperty('user-select', 'none');
    style.setProperty('-webkit-user-select', 'none');
    document.addEventListener('selectstart', blockSelectStart);
  } else {
    style.removeProperty('user-select');
    style.removeProperty('-webkit-user-select');
    document.removeEventListener('selectstart', blockSelectStart);
  }
};

/**
 * Begin a rail drag from a `pointerdown` on a project row. Does nothing visible until the
 * pointer passes THRESHOLD_PX — up to that point the press is still a click, and the row's
 * own onClick handles it.
 */
export function startRailDrag(
  event: ReactPointerEvent<HTMLElement>,
  ids: string[],
  label: string,
): void {
  if (event.button !== 0 || ids.length === 0) return;

  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let x = startX;
  let y = startY;
  let frame = 0;

  // ⚠️ From the press, not from the threshold. A selection starts on the first pixel of
  // movement, so suppressing it once the drag is confirmed is already too late — the smear
  // exists, and clearing it after the fact is a flicker the user sees.
  suppressSelection(true);

  // The ghost is pointer-events:none, so it never hit-tests as the thing under the cursor.
  const hit = (): string | null =>
    document
      .elementFromPoint(x, y)
      ?.closest(`[${DROP_WORKSPACE_ATTR}]`)
      ?.getAttribute(DROP_WORKSPACE_ATTR) ?? null;

  const paint = (): void => useRailDragStore.getState().move(x, y, hit());

  // Auto-scroll: the rail is taller than the window in any real library, so without this a
  // project can only be dropped on a workspace that already happens to be on screen.
  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    const scroller = document.querySelector(`[${RAIL_SCROLLER_ATTR}]`);
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    if (x < r.left || x > r.right) return;
    const dy = y < r.top + EDGE_PX ? -SCROLL_STEP_PX : y > r.bottom - EDGE_PX ? SCROLL_STEP_PX : 0;
    if (dy === 0) return;
    scroller.scrollTop += dy;
    paint(); // rows moved under a cursor that did not — the target changed without a move event
  };

  const onMove = (e: PointerEvent): void => {
    x = e.clientX;
    y = e.clientY;
    if (!dragging) {
      if (Math.abs(x - startX) < THRESHOLD_PX && Math.abs(y - startY) < THRESHOLD_PX) return;
      dragging = true;
      useRailDragStore.getState().begin(ids, label, x, y);
      frame = requestAnimationFrame(tick);
    }
    paint();
  };

  const finish = (drop: boolean): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    // ⚠️ Before the early return: a press that never became a drag suppressed selection too.
    suppressSelection(false);
    if (!dragging) return;
    cancelAnimationFrame(frame);
    const target = drop ? hit() : null;
    useRailDragStore.getState().end();

    // The `click` that follows this pointerup would otherwise land on the row and open it —
    // a drag that ends where it started must not double as a click. Removing the listener on
    // the next task is what keeps it from eating a later, genuine click: the compatibility
    // click is dispatched with the pointerup, before any timeout can run.
    const eatClick = (e: MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', eatClick, true);
    setTimeout(() => window.removeEventListener('click', eatClick, true), 0);

    if (!target) return;
    const all = Object.values(useThreadsStore.getState().threadsByWorkspace).flat();
    const moving = threadsToMove(ids, all, target);
    if (moving.length > 0) void useThreadsStore.getState().moveMany(moving, target);
  };

  const onUp = (): void => finish(true);
  const onCancel = (): void => finish(false);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') finish(false);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
}
