// 2026-08-19 (Ocean) — map a DOM selection back to a character range in the ORIGINAL
// content string.
//
// Why this exists. The first cut of manual corrections located the selection by
// `content.indexOf(selected)`, and refused when it missed:
// 「这段选区跨了格式标记，Spool 定位不到原句。请只选一句完整的原文。」
// Ocean:「为什么不能选整段进行修改？所有更正的逻辑应该一样」— and he is right. The renderer
// drops `**`, `==`, `## ` and the list dashes, so ANY selection crossing one of them is
// text that never appears verbatim in `content`. Selecting a whole paragraph is the normal
// thing to do, and it was the case that failed. The refusal was the tool asking the user to
// work around it.
//
// So the mark is no longer found by searching for the words. `ContentRuns` stamps each run
// with its raw start offset (`data-o`), and marker characters never reach a run — so
// `text.length === end - start` inside one, and an offset within a run's text node maps to
// a raw offset by simple addition. The quote stored is then `content.slice(start, end)`,
// which is verbatim raw content **including** whatever markers the selection spanned. That
// keeps one contract for every writer: `corrected_quote` is always something that occurs in
// the block, which is exactly what mcp.rs's `check_quote_occurs` demands of an AI.

/** The `data-o` carrier for a node, or null if the node sits outside every run (a bullet
 *  glyph, a heading's own padding — things the renderer draws rather than slices). */
const runAncestor = (node: Node | null, root: HTMLElement): HTMLElement | null => {
  let el: HTMLElement | null =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node?.parentElement ?? null);
  while (el && root.contains(el)) {
    if (el.dataset.o != null) return el;
    el = el.parentElement;
  }
  return null;
};

/** Characters of `el`'s text that precede `node`/`offset` in document order. A run element
 *  normally holds exactly one text node; this walk keeps the answer right if React ever
 *  splits it (it does, when a run is also a hit or a highlight). */
const textOffsetWithin = (el: HTMLElement, node: Node, offset: number): number => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let n = walker.nextNode();
  while (n) {
    if (n === node) return seen + offset;
    seen += n.textContent?.length ?? 0;
    n = walker.nextNode();
  }
  // The endpoint is the element itself (selection landed on a boundary): `offset` counts
  // child nodes there, so "everything" is the honest answer for a trailing boundary.
  return offset === 0 ? 0 : seen;
};

/** Raw offset for one endpoint, or null when it cannot be placed inside a run. */
const rawOffset = (root: HTMLElement, node: Node, offset: number, end: boolean): number | null => {
  const el = runAncestor(node, root);
  if (el) return Number(el.dataset.o) + textOffsetWithin(el, node, offset);
  // Endpoint outside any run — e.g. the selection starts on a drawn bullet, or on the gap
  // between two paragraphs. Snap outward to the nearest run so the user's intent survives:
  // a start snaps to the beginning of the next run, an end to the finish of the previous.
  const runs = [...root.querySelectorAll<HTMLElement>('[data-o]')];
  if (runs.length === 0) return null;
  const pos = (r: HTMLElement): number =>
    node.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
  if (end) {
    const before = runs.filter((r) => pos(r) < 0).pop();
    return before ? Number(before.dataset.o) + (before.textContent?.length ?? 0) : null;
  }
  const after = runs.find((r) => pos(r) > 0);
  return after ? Number(after.dataset.o) : null;
};

/** The selection's range in `content` coordinates, or null if it is not inside `root` at
 *  all. Callers slice `content` with it — never `sel.toString()`, which is the rendered
 *  text and is missing every marker the range spans. */
export const rawRangeFromSelection = (
  root: HTMLElement,
  sel: Selection,
): { start: number; end: number } | null => {
  if (sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const start = rawOffset(root, range.startContainer, range.startOffset, false);
  const end = rawOffset(root, range.endContainer, range.endOffset, true);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
};
