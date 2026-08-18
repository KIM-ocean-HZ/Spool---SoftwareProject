import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_ACCEL,
  eventToAccelerator,
  formatAccelerator,
  reservedChordMeaning,
} from './shortcut';

// Ocean, Windows 验收 #20: binding Ctrl+Z as the capture shortcut was accepted, which takes
// Undo out of every other program on the machine. These pin the refusal AND its edges — a
// guard that also refused Ctrl+Shift+Z would leave a Windows user with very little left.
describe('reservedChordMeaning', () => {
  it('refuses the primary modifier alone with a key the whole OS uses', () => {
    expect(reservedChordMeaning('control+KeyZ', false)).toBe('撤销');
    expect(reservedChordMeaning('control+KeyC', false)).toBe('复制');
    expect(reservedChordMeaning('meta+KeyZ', true)).toBe('撤销');
    expect(reservedChordMeaning('meta+KeyQ', true)).toBe('退出');
  });

  it('allows the same key once a second modifier is in the chord', () => {
    expect(reservedChordMeaning('control+shift+KeyZ', false)).toBeNull();
    expect(reservedChordMeaning('control+alt+KeyZ', false)).toBeNull();
    expect(reservedChordMeaning('meta+alt+KeyC', true)).toBeNull();
  });

  it('allows keys nothing universal is bound to', () => {
    expect(reservedChordMeaning('control+KeyK', false)).toBeNull();
    expect(reservedChordMeaning('control+Space', false)).toBeNull();
    expect(reservedChordMeaning('control+F9', false)).toBeNull();
  });

  it('reads the platform: ⌘Z is the Mac question, Ctrl+Z the Windows one', () => {
    expect(reservedChordMeaning('control+KeyZ', true)).toBeNull();
    expect(reservedChordMeaning('meta+KeyZ', false)).toBeNull();
  });
});

// 2026-08-18: capture ships UNBOUND on both platforms now — the built-in double-tap gesture
// (double-tap ⌥ on macOS, double-tap Ctrl on Windows — double_tap_win.rs) is the trigger, so
// there is no default chord to pin. Windows shipped bound (Ctrl+Alt+Space) only while it had
// no gesture; that reason is gone.
describe('DEFAULT_CAPTURE_ACCEL', () => {
  it('ships unbound — the double-tap gesture is the trigger', () => {
    expect(DEFAULT_CAPTURE_ACCEL).toBeNull();
  });
});

// The recorder's round-trip, independent of any default: a chord it builds renders to the
// label the user's keyboard prints, and the modifier ORDER is fixed (meta→control→alt→shift)
// because 「两个快捷键不能相同」 and Rust's own comparisons are string equality — a chord spelled
// in any other order would read as different from the identical one the user just pressed.
//
// ⚠️ Under Vitest `navigator.userAgent` is Node's, so IS_MAC is false and formatAccelerator
// spells the modifiers as the words a Windows keyboard prints.
describe('accelerator round-trip', () => {
  it('renders an accelerator to a Windows key label', () => {
    expect(formatAccelerator('control+alt+Space')).toBe('Ctrl+Alt+Space');
  });

  it('builds the string in the order it renders', () => {
    const asRecorded = eventToAccelerator({
      code: 'Space',
      ctrlKey: true,
      altKey: true,
      metaKey: false,
      shiftKey: false,
    } as KeyboardEvent);
    expect(asRecorded).toBe('control+alt+Space');
  });
});
