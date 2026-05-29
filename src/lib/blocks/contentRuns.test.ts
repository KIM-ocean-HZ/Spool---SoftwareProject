import { describe, expect, it } from 'vitest';
import { spineEnd, tokenizeContent } from './contentRuns';

describe('spineEnd', () => {
  it('returns the first-paragraph length when a blank line exists', () => {
    expect(spineEnd('Title\n\nbody')).toBe(5);
    // The spine is the whole first paragraph, even when it spans multiple lines.
    expect(spineEnd('line1\nline2\n\nrest')).toBe(11);
  });

  it('returns the first line length when multi-line without a blank line', () => {
    expect(spineEnd('first\nsecond\nthird')).toBe(5);
  });

  it('returns 0 for a single line, empty, or leading-blank content', () => {
    expect(spineEnd('just one line')).toBe(0);
    expect(spineEnd('')).toBe(0);
    expect(spineEnd('\n\nlater')).toBe(0);
  });
});

describe('tokenizeContent', () => {
  it('marks spine runs only before the spine end', () => {
    const runs = tokenizeContent('Title\n\nbody', { withSpine: true });
    expect(runs.map((r) => [r.text, r.spine])).toEqual([
      ['Title', true],
      ['\n\nbody', false],
    ]);
  });

  it('omits the spine entirely when withSpine is false', () => {
    const runs = tokenizeContent('Title\n\nbody');
    expect(runs.every((r) => !r.spine)).toBe(true);
  });

  it('strips == markers and flags the inner span as a highlight', () => {
    expect(tokenizeContent('a ==b== c')).toEqual([
      { text: 'a ', spine: false, highlight: false, hit: null },
      { text: 'b', spine: false, highlight: true, hit: null },
      { text: ' c', spine: false, highlight: false, hit: null },
    ]);
  });

  it('composes spine + highlight + active hit on an overlapping run', () => {
    const runs = tokenizeContent('A ==B==\n\nC', {
      withSpine: true,
      hits: [{ start: 4, end: 5, idx: 0 }],
      activeHitIndex: 0,
    });
    expect(runs.find((r) => r.text === 'B')).toEqual({
      text: 'B',
      spine: true,
      highlight: true,
      hit: { idx: 0, active: true },
    });
  });

  it('returns a single plain run for plain content', () => {
    expect(tokenizeContent('hello world')).toEqual([
      { text: 'hello world', spine: false, highlight: false, hit: null },
    ]);
  });
});
