import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_RE,
  isHighlightable,
  rangeIsHighlighted,
  toggleHighlightRange,
  trimRange,
} from './highlight';

// ⚠️ 2026-08-19: these used to test a string-based API (`wrapHighlight(content, selected)`),
// which located the selection with `content.indexOf`. Ocean:「标为重点的功能有类似问题，只能划
// 一行，修复」— that search is exactly why. The renderer strips `**`, `==` and `## ` before
// the user ever sees the text, so a selection crossing one of them is a string that occurs
// nowhere in `content`, and the wrap silently did nothing. Ranges replace it, and the cases
// that used to document the limitation ("wraps the FIRST occurrence") now document the fix.

// `at` is how a caller expresses "these words" once it has a range — it is what
// selectionRange.ts produces from a DOM selection and what a textarea reports directly.
const at = (content: string, needle: string, from = 0): [number, number] => {
  const start = content.indexOf(needle, from);
  if (start === -1) throw new Error(`test bug: ${needle} not in ${content}`);
  return [start, start + needle.length];
};

describe('isHighlightable', () => {
  it('accepts a normal substring', () => {
    expect(isHighlightable('key idea')).toBe(true);
  });

  it('rejects whitespace-only selections', () => {
    expect(isHighlightable('')).toBe(false);
    expect(isHighlightable('   ')).toBe(false);
    expect(isHighlightable('\n\t')).toBe(false);
  });

  // It used to reject anything containing `==`, which ruled out selecting a paragraph that
  // already held a highlight. That is now a supported case — see toggleHighlightRange.
  it('accepts a selection that spans an existing highlight', () => {
    expect(isHighlightable('foo ==bar== baz')).toBe(true);
  });
});

describe('trimRange', () => {
  it('shaves whitespace off both ends so a sloppy drag does not store ==  x ==', () => {
    const c = 'the   quick brown   fox';
    expect(trimRange(c, 3, 20)).toEqual({ start: 6, end: 17 });
  });

  it('is null when nothing but whitespace was selected', () => {
    expect(trimRange('a    b', 1, 5)).toBeNull();
  });
});

describe('toggleHighlightRange', () => {
  it('wraps the range in == markers', () => {
    const c = 'the quick brown fox';
    const r = toggleHighlightRange(c, ...at(c, 'quick brown'));
    expect(r.changed).toBe(true);
    expect(r.content).toBe('the ==quick brown== fox');
  });

  it('unwraps a range already inside a highlight', () => {
    const c = 'foo ==bar== baz';
    const r = toggleHighlightRange(c, ...at(c, 'bar'));
    expect(r.changed).toBe(true);
    expect(r.content).toBe('foo bar baz');
  });

  it('round-trips wrap then unwrap back to the original', () => {
    const original = 'the quick brown fox';
    const wrapped = toggleHighlightRange(original, ...at(original, 'quick brown'));
    const back = toggleHighlightRange(
      wrapped.content,
      ...at(wrapped.content, 'quick brown'),
    );
    expect(back.content).toBe(original);
  });

  // ⭐ The bug Ocean reported. A range spanning a line break is ordinary — it is what
  // selecting a paragraph looks like — and both halves of the old feature refused it.
  it('highlights across a line break', () => {
    const c = '第一行的结论\n第二行的理由';
    const r = toggleHighlightRange(c, 0, c.length);
    expect(r.changed).toBe(true);
    expect(r.content).toBe('==第一行的结论\n第二行的理由==');
    // …and the renderer can read it back, which is the other half (HIGHLIGHT_RE below).
    expect(rangeIsHighlighted(r.content, 2, r.content.length - 2)).toBe(true);
  });

  it('highlights across a blank line, i.e. two whole paragraphs', () => {
    const c = '第一段\n\n第二段';
    const r = toggleHighlightRange(c, 0, c.length);
    expect(r.content).toBe('==第一段\n\n第二段==');
    expect([...r.content.matchAll(HIGHLIGHT_RE)]).toHaveLength(1);
  });

  // The old API refused this outright ("no nesting"), which meant a user could never
  // promote a phrase-level highlight to the whole paragraph.
  it('swallows an inner highlight when the range spans it', () => {
    const c = 'the ==key== insight here';
    const r = toggleHighlightRange(c, ...at(c, 'the ==key== insight'));
    expect(r.changed).toBe(true);
    expect(r.content).toBe('==the key insight== here');
    expect([...r.content.matchAll(HIGHLIGHT_RE)]).toHaveLength(1);
  });

  // ⭐ The other documented Track B limitation, gone: the range says WHICH occurrence.
  it('acts on the occurrence the user picked, not the first one', () => {
    const c = 'alpha beta alpha';
    const r = toggleHighlightRange(c, ...at(c, 'alpha', 1));
    expect(r.content).toBe('alpha beta ==alpha==');
  });

  it('is a no-op for a whitespace-only or empty range', () => {
    expect(toggleHighlightRange('hello world', 5, 6).changed).toBe(false);
    expect(toggleHighlightRange('hello world', 4, 4).changed).toBe(false);
  });

  it('supports CJK content', () => {
    const c = '这是一个关键想法的例子';
    const r = toggleHighlightRange(c, ...at(c, '关键想法'));
    expect(r.content).toBe('这是一个==关键想法==的例子');
  });
});

describe('rangeIsHighlighted', () => {
  it('is true for a range inside ==…==', () => {
    const c = 'alpha ==key== beta';
    expect(rangeIsHighlighted(c, ...at(c, 'key'))).toBe(true);
  });

  it('is true for a sub-range of a highlight, so the toggle still reads as "remove"', () => {
    const c = 'alpha ==key idea== beta';
    expect(rangeIsHighlighted(c, ...at(c, 'idea'))).toBe(true);
  });

  it('is false for plain text and for a half-open marker', () => {
    expect(rangeIsHighlighted('alpha key beta', 6, 9)).toBe(false);
    expect(rangeIsHighlighted('alpha ==key beta', 8, 11)).toBe(false);
  });

  it('is true at the very start when the content opens with ==', () => {
    expect(rangeIsHighlighted('==key== rest', 2, 5)).toBe(true);
  });
});

describe('HIGHLIGHT_RE', () => {
  it('matches a single highlight span', () => {
    const matches = Array.from('foo ==bar== baz'.matchAll(HIGHLIGHT_RE));
    expect(matches).toHaveLength(1);
    expect(matches[0]![1]).toBe('bar');
  });

  it('matches multiple highlight spans', () => {
    const matches = Array.from('==first== mid ==second=='.matchAll(HIGHLIGHT_RE));
    expect(matches.map((m) => m[1])).toEqual(['first', 'second']);
  });

  it('uses a lazy match so adjacent == do not over-eat', () => {
    const matches = Array.from('==a== ==b=='.matchAll(HIGHLIGHT_RE));
    expect(matches.map((m) => m[1])).toEqual(['a', 'b']);
  });

  it('does not match empty == ==', () => {
    expect(Array.from('==='.matchAll(HIGHLIGHT_RE))).toHaveLength(0);
  });

  // ⭐ Defect ① of the two. `.` does not match `\n`, so a highlight spanning a line break
  // stored fine and then rendered as literal `==` around unhighlighted text — which is what
  // made this look like a one-line-only feature even after the wrap was fixed.
  it('matches a span that crosses newlines', () => {
    const matches = Array.from('==第一行\n第二行=='.matchAll(HIGHLIGHT_RE));
    expect(matches).toHaveLength(1);
    expect(matches[0]![1]).toBe('第一行\n第二行');
  });
});
