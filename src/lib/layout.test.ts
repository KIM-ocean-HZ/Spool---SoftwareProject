import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RAIL_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_RAIL_WIDTH,
  MIN_CENTRE_WIDTH,
  MIN_RAIL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  resolveLayout,
} from './layout';

// DESIGN_WORKBENCH §3. These widths come out of settings.json, which the user can edit by
// hand and which outlives the screen it was set on — so the property under test is that no
// stored value can produce a layout the user cannot get out of.
describe('resolveLayout', () => {
  const roomy = {
    windowWidth: 1600,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    railWidth: DEFAULT_RAIL_WIDTH,
    sidebarCollapsed: false,
    railCollapsed: false,
  };

  // §9.2 R1, and the reason it is a test rather than a comment: the rail shipped WIDER than
  // the sidebar, and nothing caught it until Ocean had used it. Both numbers are read from
  // settings.json at runtime, so this asserts the defaults the product ships with.
  it('keeps the rail narrower than the sidebar', () => {
    expect(DEFAULT_RAIL_WIDTH).toBeLessThan(DEFAULT_SIDEBAR_WIDTH);
    expect(MIN_RAIL_WIDTH).toBeLessThan(MIN_SIDEBAR_WIDTH);
  });

  it('leaves sane widths alone when there is room', () => {
    expect(resolveLayout(roomy)).toEqual({
      sidebar: DEFAULT_SIDEBAR_WIDTH,
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
    const huge = resolveLayout({ ...roomy, sidebarWidth: 6000, railWidth: 9000 });
    expect(huge.sidebar).toBeLessThanOrEqual(MIN_CENTRE_WIDTH + 1600);
    expect(huge.rail).toBeLessThanOrEqual(MAX_RAIL_WIDTH);
    // Negative / zero values fall back to the floor, not to nothing.
    const negative = resolveLayout({ ...roomy, sidebarWidth: -50, railWidth: 0 });
    expect(negative.sidebar).toBe(MIN_SIDEBAR_WIDTH);
    expect(negative.rail).toBe(MIN_RAIL_WIDTH);
  });

  it('never squeezes the reading column below its floor while a rail can still give', () => {
    const narrow = resolveLayout({ ...roomy, windowWidth: 900 });
    expect(narrow.sidebar + narrow.rail + MIN_CENTRE_WIDTH).toBeLessThanOrEqual(900);
    // The right rail gives first — the sidebar is how you navigate at all.
    expect(narrow.rail).toBeLessThan(DEFAULT_RAIL_WIDTH);
    expect(narrow.sidebar).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('on a genuinely tiny window both rails sit at their floor rather than vanishing', () => {
    // Below the sum of both floors plus the centre: something has to give, but a rail the
    // user opened must not silently become invisible — collapsing is their call, not ours.
    const cramped = resolveLayout({ ...roomy, windowWidth: 700 });
    expect(cramped.rail).toBe(MIN_RAIL_WIDTH);
    expect(cramped.sidebar).toBe(MIN_SIDEBAR_WIDTH);
  });
});
