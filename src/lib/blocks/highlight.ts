// v2.8 §20.5 (Track B) — select-to-highlight.
//
// Plain-text Markdown markers (==…==) wrapped around a span the user selected. Storage is
// the block's `content` string, not a separate field: the markers survive editing, search,
// merge, etc. by riding the existing text pipeline. This module is intentionally isolated
// so a §20.8 kill cut is one revert: the regex, the wrap helper, the renderer, and the
// pack-header line are the only touch-points.
//
// Limitation (acknowledged for Track B): `wrapHighlight` finds the first occurrence of the
// selected substring inside `content`. If the same phrase appears twice in one block and
// the user selects the second instance, the first one gets wrapped instead. The block has
// to be quite repetitive for this to bite, and the dogfooding kill criterion (§20.8) will
// reveal whether it matters before we sink time into a DOM-offset mapping.

export const HIGHLIGHT_RE = /==(.+?)==/g;

const MARKER = '==';

const containsMarker = (s: string): boolean => s.includes(MARKER);

// Trim whitespace before deciding whether the selection is wrap-worthy. A selection that
// is only whitespace, only newlines, or contains nested markers is rejected outright so
// the floating prompt either no-ops or never appears.
export const isHighlightable = (selected: string): boolean => {
  if (selected.trim().length === 0) return false;
  if (containsMarker(selected)) return false;
  return true;
};

export interface WrapResult {
  // Updated content string with `==…==` around the selection, OR the original content
  // unchanged when the wrap was a no-op (selection not found, already highlighted, etc.).
  content: string;
  // True when content was actually modified; false signals the caller to skip the DB write.
  changed: boolean;
}

// Wrap the first occurrence of `selected` inside `content` with == markers, IF the
// surrounding characters aren't already == (so the wrap doesn't nest). Returns the new
// content and a `changed` flag. Selection-validation precondition: `isHighlightable`
// should be true; this helper enforces the rest defensively.
export const wrapHighlight = (content: string, selected: string): WrapResult => {
  if (!isHighlightable(selected)) return { content, changed: false };
  const idx = content.indexOf(selected);
  if (idx === -1) return { content, changed: false };
  const before = content.slice(Math.max(0, idx - 2), idx);
  const afterStart = idx + selected.length;
  const after = content.slice(afterStart, afterStart + 2);
  // Already-highlighted (==...selected...==): no-op rather than nesting markers.
  if (before === MARKER && after === MARKER) return { content, changed: false };
  const next = content.slice(0, idx) + MARKER + selected + MARKER + content.slice(afterStart);
  return { content: next, changed: true };
};

// True iff the first occurrence of `selected` (or its bare form if the user picked up
// the markers in their selection) sits inside an existing `==…==` highlight. Drives the
// UI toggle: highlight button reads this to decide whether the next click should wrap
// or unwrap. When `selected` came from a DOM `Selection` inside a `<mark>`, it's already
// the bare inner text — the .replace below is the safety net for textarea selections
// where the user may have included the == markers in the range.
export const isCurrentlyHighlighted = (content: string, selected: string): boolean => {
  const bare = selected.replace(/=/g, '').trim();
  if (!bare) return false;
  const idx = content.indexOf(bare);
  if (idx === -1) return false;
  const before = content.slice(Math.max(0, idx - 2), idx);
  const after = content.slice(idx + bare.length, idx + bare.length + 2);
  return before === MARKER && after === MARKER;
};

// Remove the `==…==` markers around the first occurrence of `selected`. Inverse of
// wrapHighlight: returns { changed: false } when no surrounding markers exist, so the
// caller can treat this as a no-op without an extra branch.
export const unwrapHighlight = (content: string, selected: string): WrapResult => {
  const bare = selected.replace(/=/g, '').trim();
  if (!bare) return { content, changed: false };
  const idx = content.indexOf(bare);
  if (idx === -1) return { content, changed: false };
  const before = content.slice(Math.max(0, idx - 2), idx);
  const after = content.slice(idx + bare.length, idx + bare.length + 2);
  if (before !== MARKER || after !== MARKER) return { content, changed: false };
  const next = content.slice(0, idx - 2) + bare + content.slice(idx + bare.length + 2);
  return { content: next, changed: true };
};

// Single entry-point used by both the floating prompt and the toolbar button: wrap if
// the current selection is plain text, unwrap if it sits inside an existing highlight.
// Keeps the toggle logic in one place rather than scattering wrap/unwrap branches
// across call sites.
export const toggleHighlight = (content: string, selected: string): WrapResult => {
  if (isCurrentlyHighlighted(content, selected)) {
    return unwrapHighlight(content, selected);
  }
  return wrapHighlight(content, selected);
};
