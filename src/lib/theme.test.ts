import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEMES,
  THEME_ATTR,
  applyTheme,
  isTheme,
  themeOrDefault,
} from './theme';

// 情人节限定版 (2026-08-19) — the two invariants that make installing this build over a real
// library safe, plus the degradation path for a settings.json somebody edited by hand.

describe('theme', () => {
  it('defaults to 经典, the shipped look (Ocean 2026-08-19)', () => {
    // ⚠️ If this ever flips, a released-build user upgrading to this branch would open a pink
    // window they never asked for. The default is the whole reason the switch is unobtrusive.
    expect(DEFAULT_THEME).toBe('classic');
    expect(THEMES[0]).toBe('classic');
  });

  it('degrades an unknown name to 经典 rather than to an unstyled page', () => {
    // settings.json is hand-editable, and a library can be carried to a build that does not know
    // every name (DESIGN_LIBRARY_TRANSFER). An unrecognised value written onto <html> would match
    // no stylesheet at all — a half-painted window, which is worse than either theme.
    expect(themeOrDefault('valentine')).toBe('valentine');
    expect(themeOrDefault('classic')).toBe('classic');
    expect(themeOrDefault('halloween')).toBe('classic');
    expect(themeOrDefault(undefined)).toBe('classic');
    expect(themeOrDefault(null)).toBe('classic');
    expect(themeOrDefault(42)).toBe('classic');
  });

  it('recognises exactly the two themes and nothing adjacent', () => {
    expect(isTheme('classic')).toBe(true);
    expect(isTheme('valentine')).toBe(true);
    expect(isTheme('Valentine')).toBe(false);
    expect(isTheme('valentines')).toBe(false);
    expect(isTheme('')).toBe(false);
  });

  it('writes 经典 out explicitly instead of clearing the attribute', () => {
    // ⚠️ Not cosmetic. A PRESENT attribute is what tells 「the user chose 经典」 apart from 「the
    // theme has not loaded yet」, and the app boots through the second state — so a screenshot or
    // a devtools glance during boot would otherwise be indistinguishable from a settled 经典.
    // A stand-in rather than a real element: these tests run in the node environment, and the one
    // thing being asserted is which attribute gets written with what.
    const attrs: Record<string, string> = {};
    const el = {
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
    } as unknown as Element;
    applyTheme('classic', el);
    expect(attrs[THEME_ATTR]).toBe('classic');
    applyTheme('valentine', el);
    expect(attrs[THEME_ATTR]).toBe('valentine');
  });
});
