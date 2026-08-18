// 情人节限定版 (2026-08-19) — the heart itself, as data. Two components draw it (the sidebar meter
// and the break card), in different folders, so it lives here rather than being exported from one
// of them and imported sideways by the other. Three copies of a heart would be three hearts.

/** A heart whose bounding box is EXACTLY x ∈ [-1, 1], y ∈ [-1, 1].
 *
 *  ⚠️⚠️ That exactness is the whole design of this path, and it is why the curve is written the
 *  long way (six cubics) rather than with the usual two-lobes-and-a-point shortcut. A cubic is
 *  bounded by the convex hull of its control points, so:
 *    - every control point here has |x| ≤ 1 and |y| ≤ 1, which BOUNDS the shape to the unit box;
 *    - the four extremes (bottom tip, left, right, the two lobe tops) are curve ENDPOINTS with
 *      horizontal or vertical tangents, which is what makes the shape actually REACH the box.
 *
 *  So `scale(s)` produces a mark exactly 2s × 2s centred on the origin, and every placement at
 *  every call site is arithmetic rather than a number someone nudged until it looked centred.
 *
 *  ⚠️ This was learned the expensive way: the first draft put control points at ±1.30, which the
 *  curve never reaches — so the mark was smaller than its arithmetic said AND the lobe tops
 *  clipped against the top edge of the sidebar meter's 40×36 box. If this path is ever redrawn,
 *  the invariant to preserve is not 「looks like a heart」, it is 「touches all four sides of the
 *  unit box and leaves none of it」. */
export const HEART_PATH = [
  'M 0 1',
  'C -0.45 0.55 -1 0.1 -1 -0.25',
  'C -1 -0.62 -0.78 -1 -0.5 -1',
  'C -0.28 -1 -0.05 -0.78 0 -0.55',
  'C 0.05 -0.78 0.28 -1 0.5 -1',
  'C 0.78 -1 1 -0.62 1 -0.25',
  'C 1 0.1 0.45 0.55 0 1',
  'Z',
].join(' ');

/** Ocean's undiluted deep rose, from the palette he gave on 2026-08-19.
 *
 *  ⚠️ Deliberately a literal and NOT `var(--accent)`. `--accent` is this same hue darkened and
 *  desaturated (tokens.css explains the split) because it has to carry 11px text at 4.5 : 1; the
 *  heart is the one mark in this theme that is a PICTURE rather than an interface element, so it
 *  gets the paint range his brief hands to petals. A picture has no contrast requirement to meet.
 *
 *  ⚠️ It is a literal rather than a token for the same reason it is not `--accent`: a token would
 *  invite some future theme to redefine it, and then this file would be drawing that theme's
 *  colour under this theme's name. Nothing outside 情人节 ever draws this shape. */
export const HEART_ROSE = '#e66d98';
