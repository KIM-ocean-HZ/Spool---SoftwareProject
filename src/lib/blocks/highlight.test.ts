import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_RE,
  isCurrentlyHighlighted,
  isHighlightable,
  toggleHighlight,
  unwrapHighlight,
  wrapHighlight,
} from './highlight';

describe('isHighlightable', () => {
  it('accepts a normal substring', () => {
    expect(isHighlightable('key idea')).toBe(true);
  });

  it('rejects whitespace-only selections', () => {
    expect(isHighlightable('')).toBe(false);
    expect(isHighlightable('   ')).toBe(false);
    expect(isHighlightable('\n\t')).toBe(false);
  });

  it('rejects selections containing == markers', () => {
    expect(isHighlightable('foo ==bar== baz')).toBe(false);
    expect(isHighlightable('==already==')).toBe(false);
  });
});

describe('wrapHighlight', () => {
  it('wraps the selected substring in == markers', () => {
    const r = wrapHighlight('the quick brown fox', 'quick brown');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('the ==quick brown== fox');
  });

  it('is a no-op when the selection is not found in content', () => {
    const r = wrapHighlight('hello world', 'absent');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('hello world');
  });

  it('is a no-op when the selection is already highlighted (no nesting)', () => {
    const r = wrapHighlight('the ==quick== fox', 'quick');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('the ==quick== fox');
  });

  it('is a no-op for whitespace-only selections', () => {
    const r = wrapHighlight('hello world', '   ');
    expect(r.changed).toBe(false);
  });

  it('is a no-op when the selection itself contains == (selection spans an existing highlight)', () => {
    const r = wrapHighlight('the ==key== insight here', 'the ==key== insight');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('the ==key== insight here');
  });

  it('wraps the first occurrence when the substring appears more than once', () => {
    // Documented Track B limitation: substring-based mapping picks first match.
    const r = wrapHighlight('alpha beta alpha', 'alpha');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('==alpha== beta alpha');
  });

  it('supports CJK content', () => {
    const r = wrapHighlight('这是一个关键想法的例子', '关键想法');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('这是一个==关键想法==的例子');
  });
});

describe('isCurrentlyHighlighted', () => {
  it('detects a span that is surrounded by ==', () => {
    expect(isCurrentlyHighlighted('alpha ==key== beta', 'key')).toBe(true);
  });

  it('is false for plain text not inside markers', () => {
    expect(isCurrentlyHighlighted('alpha key beta', 'key')).toBe(false);
  });

  it('is false when only one side has the marker', () => {
    expect(isCurrentlyHighlighted('alpha ==key beta', 'key')).toBe(false);
    expect(isCurrentlyHighlighted('alpha key== beta', 'key')).toBe(false);
  });

  it('tolerates a selection that included its own == markers (textarea path)', () => {
    // User selected "==key==" verbatim in the textarea — we strip the markers before
    // looking up; the bare text is still inside ==…== in content.
    expect(isCurrentlyHighlighted('alpha ==key== beta', '==key==')).toBe(true);
  });

  it('is false at the start of the string (no chars before to be ==)', () => {
    expect(isCurrentlyHighlighted('key something', 'key')).toBe(false);
  });

  it('returns true at the very start when the content opens with ==', () => {
    expect(isCurrentlyHighlighted('==key== rest', 'key')).toBe(true);
  });
});

describe('unwrapHighlight', () => {
  it('removes the surrounding == markers from the first occurrence', () => {
    const r = unwrapHighlight('alpha ==key== beta', 'key');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('alpha key beta');
  });

  it('handles selections that brought their == markers along', () => {
    const r = unwrapHighlight('alpha ==key== beta', '==key==');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('alpha key beta');
  });

  it('is a no-op when the bare text is not in content', () => {
    const r = unwrapHighlight('alpha beta', 'gone');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('alpha beta');
  });

  it('is a no-op when the bare text exists but is not currently highlighted', () => {
    const r = unwrapHighlight('alpha key beta', 'key');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('alpha key beta');
  });

  it('only unwraps the first occurrence (documented Track B limitation)', () => {
    const r = unwrapHighlight('==a== mid ==a==', 'a');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('a mid ==a==');
  });
});

describe('toggleHighlight', () => {
  it('wraps a plain selection', () => {
    const r = toggleHighlight('foo bar baz', 'bar');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('foo ==bar== baz');
  });

  it('unwraps a selection currently inside ==…==', () => {
    const r = toggleHighlight('foo ==bar== baz', 'bar');
    expect(r.changed).toBe(true);
    expect(r.content).toBe('foo bar baz');
  });

  it('round-trips wrap then unwrap to the original content', () => {
    const original = 'the quick brown fox';
    const wrapped = toggleHighlight(original, 'quick brown');
    expect(wrapped.changed).toBe(true);
    const back = toggleHighlight(wrapped.content, 'quick brown');
    expect(back.changed).toBe(true);
    expect(back.content).toBe(original);
  });

  it('is a no-op for selections not present in the content', () => {
    const r = toggleHighlight('hello world', 'absent');
    expect(r.changed).toBe(false);
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
    // The regex requires at least one char between the markers.
    const matches = Array.from('==='.matchAll(HIGHLIGHT_RE));
    expect(matches).toHaveLength(0);
  });
});
