// 情人节限定版 (2026-08-19, Ocean) — what a theme IS. The hooks that read the current one
// live in hooks/useTheme.ts; this file stays free of imports on purpose (see the ⚠️ below).
//
// Ocean 2026-08-19: 「版本需要可以随便调整（切换情人节，或者经典，中英文都支持）」 and, in the
// same breath, 「不能影响已经发布的版本」. Those two together are the whole design:
//
//   - There are exactly TWO themes, and 经典 is not one of them in the usual sense. `classic`
//     means **no theme applied at all** — the shipped v0.5.0 look, painted by the bare
//     `:root` in tokens.css. Everything 情人节 changes lives inside a
//     `[data-theme='valentine']` selector. So no 经典 user can receive any part of this work
//     by accident, and no branch of it has to be tested against the released appearance.
//   - The default is `classic` (Ocean picked it 2026-08-19), which is what makes installing
//     this build over a real library a no-op until someone opens Settings.
//
// ⚠️ The switch is a SETTING, not a build flag. Both themes ship in every build, on both
// platforms — nothing here is `#[cfg]`-ed or tree-shaken, and there is no 「情人节 build」 to
// keep in sync with the normal one. A second binary would be a second thing to notarize,
// sign, upload and get wrong.
//
// ⚠️ It is applied by writing an attribute on <html>, NOT by swapping a stylesheet: the
// capture overlay is a separate window with its own bundle (src/overlay), and an attribute is
// the one mechanism both windows can apply identically.
// ⚠️ They do NOT read the value the same way, and this sentence originally said they did —
// which is how the toast shipped 经典 inside a 情人节 build. The overlay is a separate PROCESS
// (since 2026-08-01): no `settings:changed` event reaches it and it holds no `store:`
// permission, so Rust pushes the theme to it with each show. See hooks/useTheme.ts.
//
// ⚠️ **This module imports nothing.** settingsStore imports it (for the default and the
// validator), so anything imported here that reaches back into the store would be a cycle
// evaluated during the store's own construction. Keep the hooks in hooks/useTheme.ts.

export type Theme = 'classic' | 'valentine';

/** Every theme, in the order the Settings switch draws them. 经典 first — it is the default
 *  and the one a user returns to. */
export const THEMES: readonly Theme[] = ['classic', 'valentine'] as const;

export const DEFAULT_THEME: Theme = 'classic';

/** settings.json is hand-editable, and a library can be carried to a build that does not know
 *  every name (the transfer feature exists, DESIGN_LIBRARY_TRANSFER), so an unrecognised
 *  value has to degrade to 经典 rather than to an unstyled page. */
export const isTheme = (v: unknown): v is Theme => v === 'classic' || v === 'valentine';

export const themeOrDefault = (v: unknown): Theme => (isTheme(v) ? v : DEFAULT_THEME);

/** The attribute CSS selects on. Named here rather than inlined at the two call sites so the
 *  windows and the tests cannot drift from tokens.css. */
export const THEME_ATTR = 'data-theme';

/** Put the theme on <html>.
 *
 *  ⚠️ `classic` is written out explicitly rather than removing the attribute. Nothing in CSS
 *  reads `[data-theme='classic']` today — the shipped tokens sit on bare `:root` — but a
 *  present attribute is what lets a screenshot, a devtools inspection or some future rule tell
 *  「the user chose 经典」 apart from 「the theme has not loaded yet」. Those are different states
 *  and the app boots through the second one. */
export const applyTheme = (theme: Theme, root: Element): void => {
  root.setAttribute(THEME_ATTR, theme);
};
