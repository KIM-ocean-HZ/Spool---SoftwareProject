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
    // start/end are the run's range in the ORIGINAL string — markers included in the
    // arithmetic, which is what makes a DOM selection mappable back (selectionRange.ts).
    expect(tokenizeContent('a ==b== c')).toEqual([
      { text: 'a ', start: 0, end: 2, spine: false, highlight: false, hit: null },
      { text: 'b', start: 4, end: 5, spine: false, highlight: true, hit: null },
      { text: ' c', start: 7, end: 9, spine: false, highlight: false, hit: null },
    ]);
  });

  // 2026-08-19 — the invariant the whole selection→content mapping rests on. Marker chars
  // never reach a run, so within one, a character offset in the rendered text is the same
  // distance from `start` in the RAW string. If this drifts, a correction made by selecting
  // a paragraph quietly stores the wrong words (selectionRange.ts has no way to notice).
  it('gives every run a range that slices back to exactly its own text', () => {
    const cases = [
      'hello world',
      'a ==b== c',
      'a **b** c',
      '# 标题\n\n正文 **粗** 和 `代码`\n\n- 甲\n- 乙',
      '截止 4 月 30 日,==占总分 40%==,可以*两人*一组',
      '```\nlet x = **1**\n```',
    ];
    for (const content of cases) {
      for (const r of tokenizeContent(content, { withSpine: true })) {
        expect(content.slice(r.start, r.end)).toBe(r.text);
      }
    }
  });

  it('keeps the ranges walking forward and never overlapping', () => {
    const runs = tokenizeContent('a ==b== c **d** e', { withSpine: true });
    let prev = -1;
    for (const r of runs) {
      expect(r.start).toBeGreaterThanOrEqual(prev);
      expect(r.end).toBeGreaterThan(r.start);
      prev = r.end;
    }
  });

  it('composes spine + highlight + active hit on an overlapping run', () => {
    const runs = tokenizeContent('A ==B==\n\nC', {
      withSpine: true,
      hits: [{ start: 4, end: 5, idx: 0 }],
      activeHitIndex: 0,
    });
    expect(runs.find((r) => r.text === 'B')).toEqual({
      text: 'B',
      start: 4,
      end: 5,
      spine: true,
      highlight: true,
      hit: { idx: 0, active: true },
    });
  });

  it('returns a single plain run for plain content', () => {
    expect(tokenizeContent('hello world')).toEqual([
      { text: 'hello world', start: 0, end: 11, spine: false, highlight: false, hit: null },
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
      { text: 'a ', start: 0, end: 2, spine: false, highlight: false, hit: null },
      { text: 'b', start: 4, end: 5, spine: false, highlight: false, hit: null, mark: 'strong' },
      { text: ' c', start: 7, end: 9, spine: false, highlight: false, hit: null },
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
    expect(runs).toEqual([
      { text: content, start: 0, end: content.length, spine: false, highlight: false, hit: null },
    ]);
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

  // 2026-08-19 — two sentences corrected by two different blocks. Clicking one has to open THAT
  // one, so the id has to survive tokenization onto the run.
  it('tells two corrections apart on the runs they marked', () => {
    const content = '截止 4 月 30 日,占总分 40%,可以两人一组';
    const a = content.indexOf('截止 4 月 30 日');
    const b = content.indexOf('占总分 40%');
    const runs = tokenizeContent(content, {
      corrected: [
        { start: a, end: a + '截止 4 月 30 日'.length, id: 'corr-a' },
        { start: b, end: b + '占总分 40%'.length, id: 'corr-b' },
      ],
    });
    expect(runs.map((r) => r.text).join('')).toBe(content);
    expect(runs.find((r) => r.text === '截止 4 月 30 日')?.correctionId).toBe('corr-a');
    expect(runs.find((r) => r.text === '占总分 40%')?.correctionId).toBe('corr-b');
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

describe('合并留下的来源记号', () => {
  // ⭐ 2026-08-25（Ocean:「来源的文字特别大,和正文混在一起,太突兀」）—— `[from …] ` 以前
  // 就是普通正文,15px、和上下文一样黑。现在 `[from ` 和 `] ` 当记号藏掉,中间那几个字
  // 拿 'source' 这个标记画成一枚小灰标签。
  it('hides the brackets and marks the source name', () => {
    const content = '第一段\n\n[from chatgpt] 第二段';
    const runs = tokenizeContent(content);
    // 记号末尾那个空格留着,所以纯文本读起来还是「chatgpt 第二段」。
    expect(runs.map((r) => r.text).join('')).toBe('第一段\n\nchatgpt 第二段');
    expect(runs.find((r) => r.mark === 'source')?.text).toBe('chatgpt');
  });

  it('keeps every surviving run on its original offset', () => {
    // ⚠️ 藏掉的字符不许改变别人的下标 —— 划词、==重点==、更正全按它定位。
    const content = '[from claude] 第二段';
    const runs = tokenizeContent(content);
    for (const r of runs) expect(content.slice(r.start, r.end)).toBe(r.text);
  });

  it('only reads the marker at the start of a line', () => {
    const content = '他说 [from chatgpt] 是这么讲的';
    const runs = tokenizeContent(content);
    expect(runs.some((r) => r.mark === 'source')).toBe(false);
    expect(runs.map((r) => r.text).join('')).toBe(content);
  });
});
