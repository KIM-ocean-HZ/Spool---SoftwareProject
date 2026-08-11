import { describe, expect, it } from 'vitest';
import {
  BASE_SIDEBAR_WIDTH,
  DEFAULT_RAIL_WIDTH,
  MAX_RAIL_WIDTH,
  MIN_CENTRE_WIDTH,
  MIN_RAIL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH,
  resolveLayout,
} from './layout';

// DESIGN_WORKBENCH §3. The rail's width comes out of settings.json, which the user can edit
// by hand and which outlives the screen it was set on — so the property under test is that no
// stored value can produce a layout the user cannot get out of.
describe('resolveLayout', () => {
  // Full screen on the display this was tuned on (1800 logical points) — the width at which
  // Ocean approved 300/220. `resolveLayout` is share-based now, so a test that wants the
  // ceiling has to say WHICH window it is asking about.
  const roomy = {
    windowWidth: 1800,
    railWidth: DEFAULT_RAIL_WIDTH,
    sidebarCollapsed: false,
    railCollapsed: false,
  };
  /** The app's default window — the one 「非全屏状态」 refers to. */
  const DEFAULT_WINDOW = 1360;

  // §9.2 R1, and the reason it is a test rather than a comment: the rail shipped WIDER than
  // the sidebar, and nothing caught it until Ocean had used it.
  it('keeps the rail narrower than the sidebar', () => {
    expect(DEFAULT_RAIL_WIDTH).toBeLessThan(SIDEBAR_WIDTH);
    expect(MIN_RAIL_WIDTH).toBeLessThan(MIN_SIDEBAR_WIDTH);
  });

  // Ocean 2026-08-11: 「左侧边栏改成无法拖移……固定成最佳显示状态」. The sidebar takes no width
  // input at all, so nothing a user does — or a stale settings.json holds — can move it.
  // What DOES move it is the window, and only the window.
  it('gives the sidebar a width the user cannot influence', () => {
    expect(resolveLayout(roomy).sidebar).toBe(SIDEBAR_WIDTH);
    expect(resolveLayout({ ...roomy, railWidth: 9000 }).sidebar).toBe(SIDEBAR_WIDTH);
    expect(resolveLayout({ ...roomy, railCollapsed: true }).sidebar).toBe(SIDEBAR_WIDTH);
  });

  it('leaves sane widths alone when there is room', () => {
    expect(resolveLayout(roomy)).toEqual({
      sidebar: SIDEBAR_WIDTH,
      rail: DEFAULT_RAIL_WIDTH,
    });
  });

  // ⭐ The bug this file exists to prevent coming back. Ocean 2026-08-11: 「全屏下宽度合适，但是
  // 默认的非全屏状态两侧边栏都特别宽」 — the widths were constants, so shrinking the window left
  // the rails the same pixels and handed them a bigger SHARE of a smaller screen.
  it('gives the rails less of a smaller window, not the same pixels', () => {
    const full = resolveLayout(roomy);
    const windowed = resolveLayout({ ...roomy, windowWidth: DEFAULT_WINDOW });
    expect(windowed.sidebar).toBeLessThan(full.sidebar);
    expect(windowed.rail).toBeLessThan(full.rail);
    // …and the reading column keeps more of the window than the old constants gave it.
    const underConstants = (SIDEBAR_WIDTH + DEFAULT_RAIL_WIDTH) / DEFAULT_WINDOW;
    const now = (windowed.sidebar + windowed.rail) / DEFAULT_WINDOW;
    expect(now).toBeLessThan(underConstants);

    // ⚠️ It does NOT reach the full-screen share, and that is a stated cost rather than a
    // near miss: at 1360 both floors bind (260 + 180), so the rails still take ~32% against
    // ~29% full-screen. Pure proportion would want 227 + 166, which is under the width
    // SpoolCard was measured at and under the rail's own minimum. The floors win; this test
    // records that they do, so nobody "fixes" the remainder by lowering them silently.
    expect(now).toBeGreaterThan((full.sidebar + full.rail) / roomy.windowWidth);
  });

  // The floor that protects SpoolCard/SpoolMeter: those were laid out and measured at 260,
  // so scaling must stop there rather than carrying them somewhere never checked. (The
  // emergency squeeze may still go below it — that is a different floor, MIN_SIDEBAR_WIDTH.)
  it('never scales the sidebar below the width its panel was measured at', () => {
    for (const windowWidth of [1200, 1360, 1440, 1600, 1800, 2560]) {
      const { sidebar } = resolveLayout({ ...roomy, windowWidth });
      expect(sidebar).toBeGreaterThanOrEqual(BASE_SIDEBAR_WIDTH);
      expect(sidebar).toBeLessThanOrEqual(SIDEBAR_WIDTH);
    }
  });

  it('collapsed rails take no space and are not squeezed', () => {
    expect(resolveLayout({ ...roomy, railCollapsed: true }).rail).toBe(0);
    expect(resolveLayout({ ...roomy, sidebarCollapsed: true }).sidebar).toBe(0);
    // A tiny window with both collapsed still reports zeros rather than negatives.
    const tiny = resolveLayout({
      ...roomy,
      windowWidth: 300,
      sidebarCollapsed: true,
      railCollapsed: true,
    });
    expect(tiny).toEqual({ sidebar: 0, rail: 0 });
  });

  it('clamps a width that settings.json should never have held', () => {
    expect(resolveLayout({ ...roomy, railWidth: 9000 }).rail).toBeLessThanOrEqual(MAX_RAIL_WIDTH);
    // Negative / zero values fall back to the floor, not to nothing.
    expect(resolveLayout({ ...roomy, railWidth: 0 }).rail).toBe(MIN_RAIL_WIDTH);
  });

  it('never squeezes the reading column below its floor while a rail can still give', () => {
    // Just tight enough that the rail alone can absorb it — the point of the test is the
    // ORDER things give in, so the width tracks the real numbers rather than being a constant.
    const width = SIDEBAR_WIDTH + MIN_RAIL_WIDTH + MIN_CENTRE_WIDTH;
    const narrow = resolveLayout({ ...roomy, windowWidth: width });
    expect(narrow.sidebar + narrow.rail + MIN_CENTRE_WIDTH).toBeLessThanOrEqual(width);
    // The right rail gives first — the sidebar is how you navigate at all. Stated against the
    // width this window would have produced anyway, not against the ceiling: the sidebar
    // scales with the window now, so "did not give" means "the squeeze took nothing from it".
    const unsqueezed = resolveLayout({
      ...roomy,
      windowWidth: width,
      railCollapsed: true,
    }).sidebar;
    expect(narrow.rail).toBeLessThan(DEFAULT_RAIL_WIDTH);
    expect(narrow.sidebar).toBe(unsqueezed);
  });

  it('on a genuinely tiny window both rails sit at their floor rather than vanishing', () => {
    // Below the sum of both floors plus the centre: something has to give, but a rail the
    // user opened must not silently become invisible — collapsing is their call, not ours.
    const cramped = resolveLayout({ ...roomy, windowWidth: 700 });
    expect(cramped.rail).toBe(MIN_RAIL_WIDTH);
    expect(cramped.sidebar).toBe(MIN_SIDEBAR_WIDTH);
  });
});
