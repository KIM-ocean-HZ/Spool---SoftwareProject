import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OVERLAY_LANGUAGE_EVENT, OVERLAY_THEME_EVENT } from './overlayProtocol';

// 情人节限定版 (2026-08-19). The 经典-toast-in-a-情人节-build bug (Ocean:「捕捉浮窗仍然是
// classic的ui啊」) had one property that makes it worth a test at all: it was invisible to every
// check we run. It compiled, it type-checked, every test passed, and the only place it showed up
// was a cream card floating over someone's screen — because the theme had been wired to a
// broadcast that cannot cross the overlay's process boundary.
//
// What actually keeps the toast themed now is a Rust emit, so that is what these pin: the two
// halves of the wire are still called the same thing, and the theme is still pushed in the SAME
// handler as the language. Deleting either emit — or renaming one side — turns the toast 经典
// again with nothing else going red.
const overlayRs = readFileSync(
  fileURLToPath(new URL('../../../src-tauri/src/overlay.rs', import.meta.url)),
  'utf8',
);

describe('overlay wire protocol ↔ overlay.rs', () => {
  it('names the same events on both sides', () => {
    expect(overlayRs).toContain(`const LANGUAGE_EVENT: &str = "${OVERLAY_LANGUAGE_EVENT}";`);
    expect(overlayRs).toContain(`const THEME_EVENT: &str = "${OVERLAY_THEME_EVENT}";`);
  });

  it('pushes the theme with every show, alongside the language', () => {
    // The show/notice/undo arm of on_main_message — everything the overlay is ever told to
    // display goes through it, so an emit here reaches the toast, the notice and the undo card.
    const handler = overlayRs.slice(
      overlayRs.indexOf('"show" | "notice" | "undo" =>'),
      overlayRs.indexOf('fn ui_language'),
    );
    expect(handler).toContain('LANGUAGE_EVENT');
    expect(handler).toContain('THEME_EVENT');
  });
});
