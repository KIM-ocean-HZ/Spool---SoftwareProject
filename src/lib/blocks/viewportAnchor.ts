// Which block is the reader actually looking at?
//
// Three features need this answer and NONE of them had one before (WORKPLAN §2.V1 checked
// the same thing): V2's ↓/↑ need a starting point when the user has not clicked anything
// yet, V2's scale rail needs to light the right tick, and V1 needs an anchor to remember a
// project's reading position by.
//
// ⚠️ `BlockFeed.tsx`'s `selectionAnchor` / `marqueeOriginContent` are NOT this. Those are
// the drag-marquee's anchors — a selection origin in content coordinates. Reaching for one
// of them here would silently tie reading position to whatever the user last shift-clicked.
//
// The answer is read off the DOM rather than tracked in state on purpose: the feed's
// mounted set already IS the source of truth (BlockFeed renders `[data-block-id]` in feed
// order, tail-window included), so nothing can drift out of sync with it. Same technique
// the drag-marquee already uses per frame.
export const topmostVisibleBlockId = (container: HTMLElement | null): string | null => {
  if (!container) return null;
  const fold = container.getBoundingClientRect().top;
  for (const el of container.querySelectorAll<HTMLElement>('[data-block-id]')) {
    // DOM order is feed order, so the first block whose bottom has not yet passed above
    // the fold is the topmost one still on screen — no need to compare the rest.
    if (el.getBoundingClientRect().bottom > fold) return el.dataset.blockId ?? null;
  }
  return null;
};

// Every block currently mounted, in feed order, with the offset each one sits at inside the
// scroll container's content box. The scale rail draws from this; it deliberately describes
// the MOUNTED set rather than the thread's full history, because that set is exactly what
// the container can scroll to (past BlockFeed's 200-block tail window, older blocks are one
// 「查看更早的」click away and genuinely are not scrollable yet).
export const mountedBlockIds = (container: HTMLElement | null): string[] => {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>('[data-block-id]')]
    .map((el) => el.dataset.blockId)
    .filter((id): id is string => Boolean(id));
};

// Scroll a block to the top of the feed, the way arriving at a block should look: it lands
// where reading starts, not wherever `scrollIntoView` decides is nearest.
export const scrollBlockIntoView = (
  container: HTMLElement | null,
  blockId: string,
  behavior: ScrollBehavior = 'smooth',
): void => {
  if (!container) return;
  const el = container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!el) return;
  const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  // A small breathing margin so the landed block does not sit flush against the top edge.
  container.scrollTo({ top: container.scrollTop + delta - 8, behavior });
};

// The two pure decisions the DOM shells above feed into, kept out here because they are the
// parts that can be wrong in a way nobody sees: everything else in this file is a rect read.
// (This project runs vitest with no DOM environment on purpose — see MarkdownContent.test.tsx
// — so a decision that stays inside an event handler is a decision that never gets tested.)

/** Where ↓ / ↑ land. `from` is the current cursor, or null when the user has not picked
 *  anything yet — in which case the caller passes the topmost visible block instead.
 *  ⚠️ Clamped at both ends, never wrapped: pressing ↓ on the newest block stays there.
 *  Wrapping around to the top of a long project is a jump the reader did not ask for and
 *  cannot undo by eye. */
export const stepBlockIndex = (
  ids: readonly string[],
  from: string | null,
  step: 1 | -1,
): string | null => {
  if (ids.length === 0) return null;
  const at = from === null ? -1 : ids.indexOf(from);
  // An unknown or absent cursor means "start at the near end and take one step in".
  if (at === -1) return (step === 1 ? ids[0] : ids[ids.length - 1]) ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, at + step))] ?? null;
};

/** 指针停在哪一根刻度上。`y` 是**从第一根刻度的上沿**量起的像素数，`heights` 是每根各自
 *  占的高度（刻度条上的透镜让它们不等高 —— 见 ScaleRail）。
 *
 *  ⭐⭐ 2026-08-25（Ocean:「确保每一个刻度代表一个 block」）—— 它换掉的是 `ratioToBlockIndex`：
 *  那一版拿 `y / 总高 × (n-1)` 算，**只有每根等高时才成立**。透镜一开，当前那根摊开成十几个
 *  像素、远处的挤到两三个像素，于是点中的那一根和跳过去的那一块**根本不是同一块** ——
 *  越靠近正在读的地方错得越远。
 *  ⚠️ 两端一律夹住：拖出刻度条外面要停在第一根/最后一根，而不是什么都不返回。 */
export const indexAtOffset = (heights: readonly number[], y: number): number => {
  if (heights.length === 0) return -1;
  if (y < 0) return 0;
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    acc += heights[i] ?? 0;
    if (y < acc) return i;
  }
  return heights.length - 1;
};
