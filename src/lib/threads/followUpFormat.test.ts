import { describe, expect, it } from 'vitest';
import { onEnter, onFirstChar } from './followUpFormat';

describe('follow-up brief formatting', () => {
  it('opens point 1 on the first character, and never again', () => {
    expect(onFirstChar('', 'a')).toEqual({ text: '1. a', caret: 4 });
    expect(onFirstChar('1. a', 'b')).toBeNull();
    // A pasted-in brief arrives as one long change, not one character — untouched.
    expect(onFirstChar('', 'watch for a new release')).toBeNull();
  });

  it('leaves a leading digit alone — the user may be numbering it themselves', () => {
    expect(onFirstChar('', '1')).toBeNull();
  });

  it('numbers each new point and keeps a blank line between them', () => {
    const one = onEnter('1. new releases', 15, 15);
    expect(one).toEqual({ text: '1. new releases\n\n2. ', caret: 20 });
    const two = onEnter(one.text + 'breaking changes', 36, 36);
    expect(two.text).toBe('1. new releases\n\n2. breaking changes\n\n3. ');
    expect(two.caret).toBe(two.text.length);
  });

  it('numbers by what is above the caret, not by the end of the text', () => {
    const text = '1. a\n\n2. b\n\n3. c';
    // Enter at the end of the FIRST point: the new point is 2, whatever follows it.
    const { text: next } = onEnter(text, 4, 4);
    expect(next).toBe('1. a\n\n2. \n\n2. b\n\n3. c');
    // ⚠️ Stated, not hidden: the points below keep their old numbers. Renumbering the whole
    // box would rewrite text the user did not touch — see the note in followUpFormat.ts.
  });

  it('replaces a selection rather than leaving it behind', () => {
    expect(onEnter('1. abcdef', 3, 9).text).toBe('1. \n\n2. ');
  });
});
