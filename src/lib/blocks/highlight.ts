// v2.8 §20.5 (Track B) — select-to-highlight.
//
// Plain-text Markdown markers (==…==) wrapped around a span the user selected. Storage is
// the block's `content` string, not a separate field: the markers survive editing, search,
// merge, etc. by riding the existing text pipeline. This module is intentionally isolated
// so a §20.8 kill cut is one revert: the regex, the wrap helper, the renderer, and the
// pack-header line are the only touch-points.
//
// ⚠️⚠️ 2026-08-19 (Ocean:「标为重点的功能有类似问题，只能划一行，修复」). TWO separate defects
// made a multi-line highlight impossible, and fixing either alone would have left it broken:
//
//   ① **The regex could not match one.** `/==(.+?)==/` — `.` does not match `\n`, so
//      `==第一行\n第二行==` stored perfectly well and then rendered as literal `==` markers
//      around unhighlighted text. This is the half that made it look like a one-line feature.
//   ② **The selection could not be located.** The old wrap took the selected STRING and did
//      `content.indexOf(...)`. The renderer drops `**`, `==` and `## `, so any selection
//      crossing one of them is text that appears nowhere in `content` — and across lines the
//      DOM adds breaks of its own. The wrap silently no-opped.
//
// ① is the regex below. ② is why every function here now takes a character RANGE instead of
// a string: the caller maps its selection to raw offsets once (selectionRange.ts) and the
// same range drives corrections and highlights alike. One notion of "which words", not two.

/** ⚠️ `[\s\S]` rather than `.` — see ① above. Non-greedy, so two highlights on one line stay
 *  two. Code fences are already excluded by the tokenizer (`isRaw`), which is what keeps a
 *  literal `a == b` inside a fenced block from becoming a highlight. */
export const HIGHLIGHT_RE = /==([\s\S]+?)==/g;

const MARKER = '==';

// Trim whitespace before deciding whether the selection is wrap-worthy. A selection that
// is only whitespace or only newlines is rejected outright so the floating prompt either
// no-ops or never appears.
export const isHighlightable = (selected: string): boolean => selected.trim().length > 0;

export interface WrapResult {
  // Updated content string with `==…==` around the selection, OR the original content
  // unchanged when the wrap was a no-op.
  content: string;
  // True when content was actually modified; false signals the caller to skip the DB write.
  changed: boolean;
}

/** The selection's range with leading/trailing whitespace shaved off, so a sloppy drag does
 *  not store `==  text ==`. Null when nothing but whitespace was selected. */
export const trimRange = (
  content: string,
  start: number,
  end: number,
): { start: number; end: number } | null => {
  let s = Math.max(0, start);
  let e = Math.min(content.length, end);
  while (s < e && /\s/.test(content[s]!)) s += 1;
  while (e > s && /\s/.test(content[e - 1]!)) e -= 1;
  return e > s ? { start: s, end: e } : null;
};

/** The `==…==` match that already covers this range, or null. Used both to decide whether
 *  the next click wraps or unwraps, and to know which markers to take off. */
const enclosingHighlight = (
  content: string,
  start: number,
  end: number,
): { start: number; end: number } | null => {
  for (const m of content.matchAll(HIGHLIGHT_RE)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    // Inner span, markers excluded — a selection sitting anywhere inside it counts.
    if (start >= s + 2 && end <= e - 2) return { start: s, end: e };
  }
  return null;
};

/** True iff this range already sits inside a highlight. Drives the UI toggle: the button
 *  tells the user whether the next click will add or remove, before they press it. */
export const rangeIsHighlighted = (content: string, start: number, end: number): boolean => {
  const t = trimRange(content, start, end);
  return t ? enclosingHighlight(content, t.start, t.end) !== null : false;
};

/** Wrap the range in `==` markers.
 *
 *  ⚠️ Any `==` already INSIDE the range is dropped first. Selecting a paragraph that
 *  contains a previous highlight is an ordinary thing to do, and the alternative — refusing,
 *  or nesting — either does nothing or writes markers the renderer cannot read back. What
 *  the user means is "all of this is the important part", so that is what gets stored. */
const wrapRange = (content: string, start: number, end: number): WrapResult => {
  const inner = content.slice(start, end).split(MARKER).join('');
  if (inner.trim().length === 0) return { content, changed: false };
  return {
    content: content.slice(0, start) + MARKER + inner + MARKER + content.slice(end),
    changed: true,
  };
};

/** Remove the markers of the highlight that covers this range. */
const unwrapAt = (content: string, span: { start: number; end: number }): WrapResult => ({
  content:
    content.slice(0, span.start) + content.slice(span.start + 2, span.end - 2) + content.slice(span.end),
  changed: true,
});

/** Single entry point for both the floating prompt and the toolbar button: wrap a plain
 *  range, unwrap one that already sits inside a highlight. */
export const toggleHighlightRange = (
  content: string,
  start: number,
  end: number,
): WrapResult => {
  const t = trimRange(content, start, end);
  if (!t) return { content, changed: false };
  const covering = enclosingHighlight(content, t.start, t.end);
  return covering ? unwrapAt(content, covering) : wrapRange(content, t.start, t.end);
};
