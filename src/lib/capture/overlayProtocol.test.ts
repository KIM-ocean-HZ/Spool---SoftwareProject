import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_BREAK_EVENT,
  OVERLAY_LANGUAGE_EVENT,
  OVERLAY_THEME_EVENT,
} from './overlayProtocol';

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
    // The one arm of on_main_message every displayable kind goes through, so an emit here
    // reaches the toast, the notice, the undo card and the break card alike.
    // ⚠️ Matched by its shape rather than by a literal list, so ADDING a kind cannot break
    // this test — while dropping a kind OUT of the arm still can, which is the failure that
    // matters: a card shown from its own arm would render 经典 in a 情人节 build, exactly the
    // 2026-08-19 bug above.
    const arm = /"show"(?: \| "[a-z-]+")+ =>/.exec(overlayRs);
    expect(arm, 'the show/notice/undo/break arm of on_main_message').not.toBeNull();
    const handler = overlayRs.slice(arm!.index, overlayRs.indexOf('fn ui_language'));
    expect(handler).toContain('LANGUAGE_EVENT');
    expect(handler).toContain('THEME_EVENT');
    // 休息提醒 (2026-08-22): the break card is themed by being in that same arm, not by an
    // emit of its own — so what is pinned is its membership.
    expect(arm![0]).toContain('"break"');
    expect(handler).toContain(`"${OVERLAY_BREAK_EVENT}"`);
  });
});
