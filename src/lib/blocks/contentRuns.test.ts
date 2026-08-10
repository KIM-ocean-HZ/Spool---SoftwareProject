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

  it('never leaks literal == markers into any run (read mode is always highlight)', () => {
    // §20.5: read mode must never show raw markers, regardless of collapse state — both
    // states feed the same tokenizer.
    const runs = tokenizeContent('start ==one== mid ==two== end', { withSpine: true });
    expect(runs.some((r) => r.text.includes('='))).toBe(false);
    expect(runs.filter((r) => r.highlight).map((r) => r.text)).toEqual(['one', 'two']);
  });
});

// DESIGN_WORKBENCH §10.1 — inline Markdown rides the same run machinery as ==…==.
describe('tokenizeContent · inline markdown', () => {
  it('strips ** and flags the inner span as strong', () => {
    expect(tokenizeContent('a **b** c')).toEqual([
      { text: 'a ', spine: false, highlight: false, hit: null },
      { text: 'b', spine: false, highlight: false, hit: null, mark: 'strong' },
      { text: ' c', spine: false, highlight: false, hit: null },
    ]);
  });

  it('renders `code` as its own mark and leaves what is inside it literal', () => {
    const runs = tokenizeContent('run `npm **run** dev` now');
    expect(runs.find((r) => r.mark === 'code')?.text).toBe('npm **run** dev');
    expect(runs.some((r) => r.mark === 'strong')).toBe(false);
  });

  it('only takes * as italic when it hugs its text', () => {
    expect(tokenizeContent('3 * 4 * 5').some((r) => r.mark)).toBe(false);
    expect(tokenizeContent('a *b* c').find((r) => r.mark === 'em')?.text).toBe('b');
    // ** wins over * — the bold pattern is claimed first, so this is one bold span.
    expect(tokenizeContent('**bold**').find((r) => r.mark)?.mark).toBe('strong');
  });

  it('keeps search hits aligned with the ORIGINAL offsets when markers are present', () => {
    // The §10.1 trap: 「跳到命中处」 works off character offsets in this exact string, so a
    // hit on 「重点」 must still mark 「重点」 with two ** in front of it.
    const content = '这里是 **重点** 内容';
    const start = content.indexOf('重点');
    const runs = tokenizeContent(content, {
      hits: [{ start, end: start + 2, idx: 0 }],
      activeHitIndex: 0,
    });
    const hit = runs.find((r) => r.hit);
    expect(hit?.text).toBe('重点');
    expect(hit?.mark).toBe('strong');
    expect(runs.some((r) => r.text.includes('*'))).toBe(false);
  });

  it('tokenizes only the requested slice, in the same coordinate space', () => {
    const content = '# 标题\n正文 **粗**';
    const runs = tokenizeContent(content, { from: 5, to: content.length });
    expect(runs.map((r) => r.text).join('')).toBe('正文 粗');
    expect(runs.find((r) => r.mark === 'strong')?.text).toBe('粗');
  });

  it('leaves markers literal inside a raw (code-block) range', () => {
    const content = 'let x = **1**';
    const runs = tokenizeContent(content, { raw: [{ start: 0, end: content.length }] });
    expect(runs).toEqual([{ text: content, spine: false, highlight: false, hit: null }]);
  });

  it('hides the structural marker ranges the parser reports', () => {
    const content = '# 标题';
    const runs = tokenizeContent(content, { hidden: [{ start: 0, end: 2 }] });
    expect(runs.map((r) => r.text).join('')).toBe('标题');
  });

  // v21 — the sentence a later block corrected. One more independent attribute: it has to
  // survive landing on top of a ==highlight== or a search hit, because those are exactly
  // the blocks a user is reading when a correction matters.
  it('flags a corrected span without disturbing the text', () => {
    const content = '截止 4 月 30 日,占总分 40%,可以两人一组';
    const start = content.indexOf('占总分 40%');
    const runs = tokenizeContent(content, {
      corrected: [{ start, end: start + '占总分 40%'.length }],
    });
    expect(runs.map((r) => r.text).join('')).toBe(content);
    expect(runs.find((r) => r.corrected)?.text).toBe('占总分 40%');
    expect(runs.filter((r) => r.corrected)).toHaveLength(1);
  });

  it('composes a correction with a highlight over the same words', () => {
    const content = '占总分 ==40%== 整';
    const start = content.indexOf('==40%==');
    const runs = tokenizeContent(content, {
      corrected: [{ start, end: start + '==40%=='.length }],
    });
    const inner = runs.find((r) => r.text === '40%');
    expect(inner?.highlight).toBe(true);
    expect(inner?.corrected).toBe(true);
  });
});
