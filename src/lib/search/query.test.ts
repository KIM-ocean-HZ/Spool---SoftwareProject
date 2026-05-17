import { describe, expect, it } from 'vitest';
import { buildSnippet } from './query';

describe('buildSnippet', () => {
  it('returns the single line for a one-line block, keyword marked', () => {
    const { field, snippet } = buildSnippet('论文文献综述初稿', null, '文献');
    expect(field).toBe('content');
    expect(snippet).toHaveLength(1);
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[0]!.match).toEqual({ start: 2, end: 4 });
  });

  it('includes one line of context above and below the hit line', () => {
    const text = 'line one\nthe keyword here\nline three';
    const { snippet } = buildSnippet(text, null, 'keyword');
    expect(snippet.map((l) => l.text)).toEqual([
      'line one',
      'the keyword here',
      'line three',
    ]);
    expect(snippet[0]!.isHit).toBe(false);
    expect(snippet[1]!.isHit).toBe(true);
    expect(snippet[2]!.isHit).toBe(false);
    expect(snippet[1]!.match).toEqual({ start: 4, end: 11 });
  });

  it('omits the missing neighbour when the hit is on the first line', () => {
    const { snippet } = buildSnippet('first hit\nsecond', null, 'hit');
    expect(snippet).toHaveLength(2);
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[1]!.isHit).toBe(false);
  });

  it('falls back to the annotation when the content has no match', () => {
    const { field, snippet } = buildSnippet('some captured text', '我的批注里有关键词', '关键词');
    expect(field).toBe('annotation');
    expect(snippet[0]!.isHit).toBe(true);
    expect(snippet[0]!.match).toEqual({ start: 6, end: 9 });
  });

  it('matches case-insensitively', () => {
    const { snippet } = buildSnippet('The API Reference', null, 'api');
    expect(snippet[0]!.match).toEqual({ start: 4, end: 7 });
  });

  it('windows a very long hit line around the keyword', () => {
    const long = 'x'.repeat(300) + 'NEEDLE' + 'y'.repeat(300);
    const hit = buildSnippet(long, null, 'NEEDLE').snippet[0]!;
    expect(hit.text.length).toBeLessThanOrEqual(122); // LINE_CAP + two ellipses
    expect(hit.text.startsWith('…')).toBe(true);
    expect(hit.text.endsWith('…')).toBe(true);
    expect(hit.text.slice(hit.match!.start, hit.match!.end)).toBe('NEEDLE');
  });

  it('falls back to the first lines when the keyword is not literally present', () => {
    const { snippet } = buildSnippet('alpha\nbeta\ngamma\ndelta', null, 'zzz');
    expect(snippet).toHaveLength(3);
    expect(snippet.every((l) => !l.isHit)).toBe(true);
  });
});
