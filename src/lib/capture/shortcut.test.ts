import { describe, expect, it } from 'vitest';
import { reservedChordMeaning } from './shortcut';

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
