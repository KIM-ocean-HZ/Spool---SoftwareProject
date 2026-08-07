// DESIGN_WORKBENCH §3 — the two rails.
//
// Ocean 2026-08-06: "建议加入右侧边栏……学习vscode,左右两侧边栏都可以拖移或者隐藏".
//
// Widths persist, which is the whole point of a draggable rail — but they persist into
// settings.json, a file the user can (and does) edit by hand, and which also survives a
// screen change. So every width is clamped on the way out of storage rather than trusted:
// a stored 6000 on a 1280px display would otherwise leave the reading column at zero with
// no visible handle to drag back.

/** §9.13 — narrowed again with the window enlargement (Ocean 2026-08-07:
 *  「默认窗口放大一些，然后左边栏右边栏都变窄，把位置阔给工作区」). 280 → 240.
 *
 *  §9.13.6-bis — 240 → 260, after Ocean saw it (2026-08-07 晚: 「左边栏再 +20 宽度」).
 *  The window grew by the same 40 the two rails took, so the reading column keeps the
 *  share it had: 「目前的中间工作区是合适的相对宽度」. */
export const DEFAULT_SIDEBAR_WIDTH = 260;
/** §9.2 R1 — Ocean, after using it: 「右侧栏……展开时窄一点，比左侧栏窄，让中间操作区更大」.
 *  It shipped WIDER than the sidebar (320 against 280, floor 260 against 200), which is the
 *  opposite of what the rail is for: the sidebar is how you navigate, the rail is commentary
 *  on what is open. Both numbers are under their sidebar counterparts now, and the
 *  `rail_is_narrower_than_the_sidebar` test is what keeps them there.
 *
 *  §9.13: 250 → 210, in the same pass that took the sidebar to 240. The rail lost its
 *  whole-library half (BoardRail is gone) and its folds, so it has less to hold.
 *
 *  §9.13.6-bis: 210 → 220 (Ocean 2026-08-07 晚, 「右边栏 220」). 210 was a number I picked
 *  and he had not seen; at 210 lines like 「跑一次，结果留在这里等你过目。」 broke into
 *  crumbs. Still under the sidebar, which is what `rail_is_narrower_than_the_sidebar` asks. */
export const DEFAULT_RAIL_WIDTH = 220;

export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 480;
export const MIN_RAIL_WIDTH = 180;
export const MAX_RAIL_WIDTH = 480;

/** The reading column never goes below this, whatever the rails would like. It is what the
 *  product is for; the rails are commentary on it.
 *
 *  Raised from 360 with R1 (§9.2 asks whether it is enough): 「让中间操作区更大」 is the
 *  POINT of that change, not a side effect, so the floor that enforces it moves too. At 420
 *  a block of prose still gets a readable measure once the 6px padding is off it.
 *
 *  §9.13: 420 → 520, because 「中间的工作区看起来还是太臃肿了」 was about the *measure*, not
 *  the pixel count — a wider floor is what stops both rails from eating back into it on a
 *  laptop screen. Below this the rails give, in the order resolveLayout defines. */
export const MIN_CENTRE_WIDTH = 520;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Resolve the two rail widths against the window actually available.
 *
 * The order matters: each rail is first clamped to its own range, and only then does the
 * centre column's minimum get to shrink them. Without that second pass, opening the right
 * rail on a narrow window squeezes the thread view to nothing — which reads as a bug, not
 * as a layout choice.
 *
 * A rail that is collapsed contributes zero and is not squeezed: collapsing is the user's
 * own answer to "not enough room".
 */
export const resolveLayout = (input: {
  windowWidth: number;
  sidebarWidth: number;
  railWidth: number;
  sidebarCollapsed: boolean;
  railCollapsed: boolean;
}): { sidebar: number; rail: number } => {
  const sidebar = input.sidebarCollapsed
    ? 0
    : clamp(input.sidebarWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  const rail = input.railCollapsed ? 0 : clamp(input.railWidth, MIN_RAIL_WIDTH, MAX_RAIL_WIDTH);

  const over = sidebar + rail + MIN_CENTRE_WIDTH - input.windowWidth;
  if (over <= 0) return { sidebar, rail };

  // Not enough room. Take it from the right rail first — it is the newer, more optional
  // surface, and the sidebar is how you navigate at all. Each still respects its floor,
  // so on a genuinely tiny window both sit at their minimum and the centre takes the rest.
  const railAfter = Math.max(rail === 0 ? 0 : MIN_RAIL_WIDTH, rail - over);
  const stillOver = over - (rail - railAfter);
  const sidebarAfter =
    stillOver <= 0
      ? sidebar
      : Math.max(sidebar === 0 ? 0 : MIN_SIDEBAR_WIDTH, sidebar - stillOver);
  return { sidebar: sidebarAfter, rail: railAfter };
};
