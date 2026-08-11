import { describe, expect, it } from 'vitest';
import {
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
  const roomy = {
    windowWidth: 1600,
    railWidth: DEFAULT_RAIL_WIDTH,
    sidebarCollapsed: false,
    railCollapsed: false,
  };

  // §9.2 R1, and the reason it is a test rather than a comment: the rail shipped WIDER than
  // the sidebar, and nothing caught it until Ocean had used it.
  it('keeps the rail narrower than the sidebar', () => {
    expect(DEFAULT_RAIL_WIDTH).toBeLessThan(SIDEBAR_WIDTH);
    expect(MIN_RAIL_WIDTH).toBeLessThan(MIN_SIDEBAR_WIDTH);
  });

  // Ocean 2026-08-11: 「左侧边栏改成无法拖移……固定成最佳显示状态」. The sidebar takes no width
  // input at all now, so nothing a user does — or a stale settings.json holds — can move it
  // while the window has room. The panel at the top of it is laid out against this number.
  it('gives the sidebar its fixed width whatever the rail is doing', () => {
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
    // The right rail gives first — the sidebar is how you navigate at all.
    expect(narrow.rail).toBeLessThan(DEFAULT_RAIL_WIDTH);
    expect(narrow.sidebar).toBe(SIDEBAR_WIDTH);
  });

  it('on a genuinely tiny window both rails sit at their floor rather than vanishing', () => {
    // Below the sum of both floors plus the centre: something has to give, but a rail the
    // user opened must not silently become invisible — collapsing is their call, not ours.
    const cramped = resolveLayout({ ...roomy, windowWidth: 700 });
    expect(cramped.rail).toBe(MIN_RAIL_WIDTH);
    expect(cramped.sidebar).toBe(MIN_SIDEBAR_WIDTH);
  });
});
