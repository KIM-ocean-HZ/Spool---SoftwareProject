// 情人节限定版 (2026-08-19) — reading the current theme. The type and the constants are in
// lib/theme.ts, which imports nothing so that settingsStore can import it; this file is the
// half that touches the store, and it is why the cycle does not exist.

import { useEffect } from 'react';
import { applyTheme, type Theme } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';

/** Reactive read, for components that draw something structurally different per theme (the
 *  heart instead of the spool; the wordmark's easter egg) rather than merely differently
 *  coloured. ⚠️ Anything that is only a colour or a typeface must come from a token in
 *  tokens.css and must NOT call this — a component that branches on the theme to pick a
 *  colour is a second palette nobody will find when the first one changes. */
export const useTheme = (): Theme => useSettingsStore((s) => s.theme);

export const useIsValentine = (): boolean => useTheme() === 'valentine';

/** Mounted once per window (App, CaptureOverlay). Every window runs its own settings store
 *  over the same settings.json and re-reads on the `settings:changed` broadcast, so flipping
 *  the theme in the main window repaints the capture overlay too — no restart, and no message
 *  of its own to add.
 *
 *  ⚠️ Keyed on `theme` alone, not on `loaded`: before settings arrive `theme` already holds the
 *  store's default (经典), so the first paint is the shipped look and 情人节 lands one tick
 *  later. That ordering is deliberate — the other way round flashes a pink window at a 经典
 *  user on every single launch. */
export const useAppliedTheme = (): void => {
  const theme = useTheme();
  useEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);
};
