// DESIGN_WORKBENCH §3 — the two rails.
//
// Ocean 2026-08-06: "建议加入右侧边栏……学习vscode,左右两侧边栏都可以拖移或者隐藏".
// ⚠️ 2026-08-11 he took half of that back: 「左侧边栏改成无法拖移，只有右边栏可以移动」. Both
// still COLLAPSE — what went away is dragging the left one to an arbitrary width.
//
// The rail's width persists, which is the whole point of a draggable rail — but it persists
// into settings.json, a file the user can (and does) edit by hand, and which also survives a
// screen change. So it is clamped on the way out of storage rather than trusted: a stored
// 6000 on a 1280px display would otherwise leave the reading column at zero with no visible
// handle to drag back.

/** The sidebar's width on a roomy window — **its ceiling, not a constant.**
 *
 *  §9.13 — narrowed with the window enlargement (Ocean 2026-08-07: 「默认窗口放大一些，然后
 *  左边栏右边栏都变窄，把位置阔给工作区」). 280 → 240.
 *
 *  §9.13.6-bis — 240 → 260, after Ocean saw it (2026-08-07 晚: 「左边栏再 +20 宽度」).
 *  The window grew by the same 40 the two rails took, so the reading column keeps the
 *  share it had: 「目前的中间工作区是合适的相对宽度」.
 *
 *  ⚠️⚠️ **2026-08-11: the sidebar stopped being draggable** (Ocean: 「左侧边栏改成无法拖移，
 *  只有右边栏可以移动，固定成最佳显示状态」). It holds a fixed set of things — the name, the
 *  spool panel, project rows — none of which get better with more room, and the panel up top
 *  is now laid out AGAINST this number (SpoolCard: two lines beside the meter; SpoolMeter:
 *  how many filled spools fit on the second one). The right rail is still draggable; it holds
 *  prose, which does.
 *
 *  ⚠️ Changing this number means re-measuring that panel — HANDOFF §6.2-sexies. It is no
 *  longer just a starting point the user can drag away from.
 *
 *  §0.12 — 260 → 300 (Ocean 2026-08-11: 「左侧边栏做宽一点」). Wider is the safe direction for
 *  everything laid out against this number: SpoolCard's two lines have more room, not less,
 *  and FilledSpools' cap of 4 marks stays valid (measured at 260 — at 300 it is conservative).
 *
 *  ⚠️⚠️ **Same day, an hour later: 300 was right full-screen and too fat in the default
 *  window** (Ocean: 「全屏下宽度合适，但是默认的非全屏状态两侧边栏都特别宽」). Both readings are
 *  true, and the reason is that this was a CONSTANT while the window is not. On his display
 *  (1800 logical points) a full-screen window leaves the reading column 1280px and the rails
 *  take 29% of the width; the default 1360 window leaves it 840 and the rails take 38% — the
 *  same pixels, a different share of the screen, and share is what the eye reads.
 *
 *  So the rails scale with the window between a floor and this ceiling (see SIDEBAR_SHARE).
 *  It is still not draggable — 「固定成最佳显示状态」 asked for the user not to have to choose
 *  a width, which is not the same as the width never changing. */
export const SIDEBAR_WIDTH = 300;

/** The width the sidebar never scales BELOW — distinct from MIN_SIDEBAR_WIDTH, which is the
 *  emergency squeeze's floor on a window too small for everything.
 *
 *  260 is not a taste: it is the width SpoolCard and SpoolMeter were laid out and measured
 *  against for the whole of 2026-08-10/11 (two declared lines beside the meter; at most four
 *  filled-spool marks on the second one). Scaling below it would put those measurements
 *  somewhere they were never checked. Above it there is only slack. */
export const BASE_SIDEBAR_WIDTH = 260;

/** Where the value panel's top edge sits, measured down from the top of the rail.
 *
 *  ⚠️⚠️ **A hard-coded coupling to markup in another file**, which is why it is written as the
 *  arithmetic rather than as the answer. Every term names the class it comes from; if any of
 *  those classes change, this changes with them, and nothing else will tell you — a wrong
 *  number here does not fail, it just stops lining up. */
const RAIL_HEADER_HEIGHT = 20 + 36 + 24; // Sidebar header: pt-5 + text-3xl line-height + pb-6
const PINNED_ROW_HEIGHT = 6 + 20 + 6; //    项目管理/周回顾 row: py-1.5 + text-sm line-height
const PINNED_ROWS = 2; //                   项目管理, 周回顾
const PANEL_MARGIN_TOP = 10; //             SpoolCard: mt-2.5
const PANEL_TOP_Y = RAIL_HEADER_HEIGHT + PINNED_ROWS * PINNED_ROW_HEIGHT + PANEL_MARGIN_TOP;

/** How tall the centre column's top bar is, so that **its bottom rule lands on the value
 *  panel's top edge** — Ocean 2026-08-11, correcting a first attempt that had pushed the whole
 *  header down instead: 「工作区顶部区域的底边和价值面板的顶边对齐，它的顶部内容还是在顶部，
 *  只是间距可以宽松一点」. The content stays where it was; the bar grows under it.
 *
 *  ⚠️ The `+ 1` is the header's own bottom border. A border-box of height H puts that border on
 *  row H-1, and the panel's top border is on row PANEL_TOP_Y — so the two rules are the same
 *  row, and read as one line crossing the window, only at PANEL_TOP_Y + 1.
 *
 *  ⚠️ Used as a **min-height**, not a height: it guarantees the alignment while letting the bar
 *  grow if its own content ever needs more (a summary being edited turns one line into two).
 *  The spacing inside was loosened to fill most of it, so the slack it absorbs is small.
 *
 *  ⚠️ Deliberately NOT measured at runtime off a ref to the panel: SpoolCard returns null until
 *  its counts come back, so the header would settle into place a frame late on every launch. */
export const CENTRE_HEADER_HEIGHT = PANEL_TOP_Y + 1;
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
 *  and he had not seen; at 210 lines like 「跑一次，结果留在这里等你过目。」 broke into crumbs.
 *
 *  ⚠️⚠️ **2026-08-11: 220 → 340, and the R1 rule above is reversed** (「右侧边栏增加宽度，做成
 *  比左边栏宽一点」). See RAIL_LEAD_OVER_SIDEBAR, which is what actually enforces it — this
 *  constant is only where a rail that has never been dragged starts. 340 = the sidebar's
 *  ceiling (300) plus that lead, so a fresh install opens already obeying the floor. */
export const DEFAULT_RAIL_WIDTH = 340;

/** Not a drag floor any more — the sidebar has no handle. It is the width the emergency
 *  squeeze below is allowed to take it down to on a window too small to hold everything. */
export const MIN_SIDEBAR_WIDTH = 200;

/** ⚠️⚠️ **The rail's floor is now the sidebar's width plus this, and that REVERSES a rule.**
 *
 *  §9.2 R1 (Ocean 2026-08-07): 「右侧栏……展开时窄一点，比左侧栏窄，让中间操作区更大」 — and a
 *  test named `rail_is_narrower_than_the_sidebar` has been holding it ever since.
 *  2026-08-11 he reversed it: 「右侧边栏增加宽度，做成比左边栏宽一点」. Recorded rather than
 *  quietly swapped, because the old rule had a reason (navigation is a list of short titles;
 *  the reading column is what the product is for) and the new one is a judgement he made after
 *  four months of using both. The test is inverted, with the same two dates on it.
 *
 *  ⚠️ It is a FLOOR, not a width: the rail keeps its handle, so this only stops it going
 *  under the sidebar. Dragging wider still works, and a width the user dragged is never
 *  overridden — that was the 2026-08-11 regression (see resolveLayout). */
export const RAIL_LEAD_OVER_SIDEBAR = 40;

/** The absolute floor, used only by the emergency squeeze on a window too small for
 *  everything. ⚠️ Below the sidebar on purpose: when there is genuinely no room, "narrower
 *  than the sidebar" beats "not visible at all". */
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

/** What share of the window the sidebar may take before its own floor and ceiling apply.
 *
 *  A sixth, so that a full-screen window on the display this was tuned on (1800pt) lands
 *  exactly on the width Ocean approved there: 1800/6 = 300. A fraction rather than a ratio
 *  against a reference width on purpose — a hard-coded 1800 would be this laptop baked into
 *  the product. (The rail has no share of its own: it has a handle, so its width is the
 *  user's, and only its floor is computed.) */
const SIDEBAR_SHARE = 1 / 6;

const sidebarFor = (windowWidth: number): number =>
  clamp(Math.round(windowWidth * SIDEBAR_SHARE), BASE_SIDEBAR_WIDTH, SIDEBAR_WIDTH);

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
 *
 * ⚠️ `railMin` comes back with the widths because the drag handle needs the SAME floor this
 * function applies. Two copies of that number is how a handle ends up able to drag somewhere
 * the layout refuses to follow — which looks exactly like the rail being stuck.
 */
export const resolveLayout = (input: {
  windowWidth: number;
  railWidth: number;
  sidebarCollapsed: boolean;
  railCollapsed: boolean;
}): { sidebar: number; rail: number; railMin: number } => {
  const sidebar = input.sidebarCollapsed ? 0 : sidebarFor(input.windowWidth);
  // The rail is wider than the sidebar as of 2026-08-11 (RAIL_LEAD_OVER_SIDEBAR). Measured
  // against the sidebar's width for THIS window rather than against a constant, so the pair
  // keeps its relationship at every size; falls back to the plain floor when the sidebar is
  // collapsed and there is nothing to be wider than.
  const railFloor = sidebar === 0 ? MIN_RAIL_WIDTH : sidebar + RAIL_LEAD_OVER_SIDEBAR;
  // ⚠️⚠️ **The rail takes no window-share cap, and that is a fix, not an omission.** One was
  // added on 2026-08-11 to answer 「两侧边栏都特别宽」 and it broke dragging within the hour:
  // capping a stored 188 to 180 meant every drag wrote a number the cap immediately undid, so
  // the handle moved and the rail did not — plus a re-render per pointer move with nothing to
  // show for it. A width the user set by hand outranks a rule about widths. The sidebar can be
  // scaled precisely BECAUSE it has no handle; this one has one, so the answer to "too wide"
  // is already in the user's hands.
  const rail = input.railCollapsed ? 0 : clamp(input.railWidth, railFloor, MAX_RAIL_WIDTH);

  const over = sidebar + rail + MIN_CENTRE_WIDTH - input.windowWidth;
  if (over <= 0) return { sidebar, rail, railMin: railFloor };

  // Not enough room. Take it from the right rail first — it is the newer, more optional
  // surface, and the sidebar is how you navigate at all. Each still respects its floor,
  // so on a genuinely tiny window both sit at their minimum and the centre takes the rest.
  const railAfter = Math.max(rail === 0 ? 0 : MIN_RAIL_WIDTH, rail - over);
  const stillOver = over - (rail - railAfter);
  const sidebarAfter =
    stillOver <= 0
      ? sidebar
      : Math.max(sidebar === 0 ? 0 : MIN_SIDEBAR_WIDTH, sidebar - stillOver);
  return { sidebar: sidebarAfter, rail: railAfter, railMin: Math.min(railFloor, railAfter) };
};
