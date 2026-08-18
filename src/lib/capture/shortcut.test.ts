import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_ACCEL,
  DEFAULT_SEARCH_ACCEL,
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

// 2026-08-18 (Ocean: 「ctrl+space 比较方便，默认做这个快捷键」). Capture now ships bound off
// macOS, and a shipped default is the one accelerator that never passes through the recorder
// — so the two rules the recorder enforces have to be checked here, or Settings could show a
// chord the recorder itself would refuse.
//
// ⚠️ Under Vitest `navigator.userAgent` is Node's, so IS_MAC is false and these constants
// hold their off-macOS values — which is the platform that has a capture default at all.
describe('DEFAULT_CAPTURE_ACCEL', () => {
  it('is not a chord the recorder would refuse', () => {
    expect(reservedChordMeaning(DEFAULT_CAPTURE_ACCEL!, false)).toBeNull();
  });

  it('does not collide with the search default', () => {
    expect(DEFAULT_CAPTURE_ACCEL).not.toBe(DEFAULT_SEARCH_ACCEL);
  });

  // The settings row and the seeded first-run tutorial both name this key; they are written
  // in different files and only agree because both come out as these five characters.
  it('reads as Ctrl+Alt+Space', () => {
    expect(formatAccelerator(DEFAULT_CAPTURE_ACCEL!)).toBe('Ctrl+Alt+Space');
  });

  // The modifier ORDER is not cosmetic: the recorder builds its string meta→control→alt→
  // shift (eventToAccelerator), and 「两个快捷键不能相同」 plus Rust's own comparisons are
  // string equality. A default spelled in any other order would read as a different chord
  // from the identical one the user just pressed.
  it('is spelled in the order the recorder would produce', () => {
    const asRecorded = eventToAccelerator({
      code: 'Space',
      ctrlKey: true,
      altKey: true,
      metaKey: false,
      shiftKey: false,
    } as KeyboardEvent);
    expect(asRecorded).toBe(DEFAULT_CAPTURE_ACCEL);
  });
});
