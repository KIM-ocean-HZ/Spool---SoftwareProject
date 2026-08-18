// Shortcut accelerators (PLAN_EN.md §9.12 / §19.1). The two global shortcuts —
// capture and search (⌘⇧F) — are user-configurable from the Settings panel. Capture has no
// default binding on either platform since 2026-08-18: the built-in double-tap gesture is the
// trigger (double-tap ⌥ / double-tap Ctrl), and a chord exists only when the user binds one —
// see DEFAULT_CAPTURE_ACCEL.
//
// An accelerator is a string in this module's own grammar: lowercase modifier tokens
// (`meta` `control` `alt` `shift`) joined with `+`, then the W3C `KeyboardEvent.code`
// of the main key, e.g. `meta+shift+KeyF`. The Rust `set_shortcuts` command parses the
// same grammar — keeping the format simple and shared avoids a brittle dependency on
// the global-shortcut crate's own accelerator parser.

import { IS_MAC } from '@/lib/platform';

// Default — must match Rust's search_accelerator().
export const DEFAULT_SEARCH_ACCEL = IS_MAC ? 'meta+shift+KeyF' : 'control+shift+KeyF';

// Capture ships UNBOUND on both platforms: the built-in double-tap gesture is the trigger
// (double-tap ⌥ on macOS, double-tap Ctrl on Windows — double_tap_win.rs), and a bound chord
// is the optional backup somebody adds themselves in Settings.
//
// ⚠️ Windows shipped bound for one stretch — `control+Space`, then `control+alt+Space`
// (2026-08-18) — but only because it had NO gesture yet (Ocean 2026-08-15, 首版不做). With
// double-tap Ctrl in place and verified on his machine (2026-08-18), that reason is gone and
// Windows returns to the macOS model: null. The history stays because it names a real trade —
// 中文输入法 toggles with Ctrl+Space and a global hotkey takes that chord out of the IME's
// hands — so if a bound Windows default ever comes back it must still clear Ctrl+Space and the
// 输入法切换 Ctrl+Shift, which is why Ctrl+Alt+Space (not Ctrl+Shift+Space) was the pick then.
export const DEFAULT_CAPTURE_ACCEL: string | null = null;

// Build an accelerator from a keydown. Returns null for an unusable chord: the key
// itself is a bare modifier, or there is no "real" modifier (a shift-only global
// shortcut would hijack every capital letter). Modifiers are pushed in a fixed order
// so two recordings of the same chord always produce the identical string.
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const code = e.code;
  if (!code || /^(Meta|Control|Alt|Shift)(Left|Right)$/.test(code)) return null;
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return null;
  const mods: string[] = [];
  if (e.metaKey) mods.push('meta');
  if (e.ctrlKey) mods.push('control');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  return [...mods, code].join('+');
}

// How each modifier is drawn on the key the user will actually press. Mac keyboards print
// the symbols; Windows keyboards print words, and a recorder that echoed `⌃⌥K` back at
// somebody who just pressed Ctrl+Alt+K would read as though it had misheard them.
//
// ⚠️ `meta` on Windows is the Windows key, not Ctrl — the labels are not a rename of the
// Mac ones. It is listed for completeness only: `RegisterHotKey` reserves Win chords for
// the OS, so a recording containing it will fail to register and the settings row says so.
const MOD_SYMBOL: Record<string, string> = IS_MAC
  ? { meta: '⌘', control: '⌃', alt: '⌥', shift: '⇧' }
  : { meta: 'Win+', control: 'Ctrl+', alt: 'Alt+', shift: 'Shift+' };

const ARROW: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' };
const NAMED_KEY: Record<string, string> = {
  Space: 'Space',
  Enter: '↵',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

const formatKey = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code.slice(6);
  if (code.startsWith('Arrow')) return ARROW[code.slice(5)] ?? code;
  return NAMED_KEY[code] ?? code; // F1–F12, Tab, Escape, … pass through
};

// Render an accelerator as a human label, e.g. `meta+shift+KeyF` → `⌘⇧F`.
export function formatAccelerator(accel: string): string {
  const parts = accel.split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = parts.slice(0, -1).map((m) => MOD_SYMBOL[m] ?? m);
  return mods.join('') + formatKey(key);
}

// Chords the rest of the operating system has already spoken for (2026-08-18).
//
// Ocean, Windows 验收 #20: 「并不会拒绝快捷键,我用 ctrl z 撤回操作都不会拒绝」. The recorder
// took anything with a modifier in it, and a GLOBAL hotkey is not a Spool shortcut — it is
// taken out of every other program on the machine for as long as it is bound. Ctrl+Z is the
// sharpest case: `RegisterHotKey` accepts it happily, and from that moment Undo is dead in
// Word, in the browser, everywhere — with no clue pointing back at Spool, because the app
// whose Undo stopped working is not the app that took it.
//
// The rule is narrow on purpose: only the primary modifier ALONE plus a key every program
// means the same thing by. Ctrl+Shift+Z or Ctrl+Alt+Z are still yours — adding a second
// modifier is exactly what the refusal suggests, and it is a chord no editor claims.
//
// ⚠️ Values are the Chinese noun for what the key does, which is also the i18n key (see
// lib/i18n) — the caller passes it through t() to name the loss in the user's language.
const RESERVED_BY_THE_OS: Record<string, string> = {
  KeyZ: '撤销',
  KeyY: '重做',
  KeyX: '剪切',
  KeyC: '复制',
  KeyV: '粘贴',
  KeyA: '全选',
  KeyS: '保存',
  KeyF: '查找',
  KeyP: '打印',
  KeyN: '新建',
  KeyO: '打开',
  KeyW: '关闭窗口',
  KeyT: '新建标签页',
  KeyQ: '退出',
};

/** What this chord would take away from every other app, or null when it takes nothing.
 *  `mac` is a parameter rather than a read of IS_MAC so the rule is testable on either
 *  platform from one test run — the primary modifier is ⌘ there and Ctrl everywhere else. */
export function reservedChordMeaning(accel: string, mac: boolean = IS_MAC): string | null {
  const parts = accel.split('+');
  const key = parts.pop() ?? '';
  if (parts.length !== 1) return null; // two modifiers is already out of everyone's way
  if (parts[0] !== (mac ? 'meta' : 'control')) return null;
  return RESERVED_BY_THE_OS[key] ?? null;
}
