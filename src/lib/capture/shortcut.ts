// Shortcut accelerators (PLAN_EN.md §9.12 / §19.1). The two global shortcuts —
// capture and search (⌘⇧F) — are user-configurable from the Settings panel. Capture
// has NO default since 2026-07-07: double-tap ⌥ is the trigger, and a capture
// shortcut exists only when the user binds one.
//
// An accelerator is a string in this module's own grammar: lowercase modifier tokens
// (`meta` `control` `alt` `shift`) joined with `+`, then the W3C `KeyboardEvent.code`
// of the main key, e.g. `meta+shift+KeyF`. The Rust `set_shortcuts` command parses the
// same grammar — keeping the format simple and shared avoids a brittle dependency on
// the global-shortcut crate's own accelerator parser.

import { IS_MAC } from '@/lib/platform';

// Default — must match Rust's search_accelerator().
export const DEFAULT_SEARCH_ACCEL = IS_MAC ? 'meta+shift+KeyF' : 'control+shift+KeyF';

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
