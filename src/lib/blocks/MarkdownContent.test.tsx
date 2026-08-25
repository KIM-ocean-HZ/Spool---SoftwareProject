import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';
import { SegmentedContent } from './SegmentedContent';

// DESIGN_WORKBENCH §10.1. The parser and the tokenizer are unit-tested next door; this is
// the one thing they cannot answer — what actually comes out the other end. No DOM needed
// (renderToStaticMarkup is a string), and no screenshot is possible on this machine
// (memory: isolated-verify-workflow §28), so this is the closest thing to seeing it.
const html = (content: string): string =>
  renderToStaticMarkup(<MarkdownContent content={content} withSpine />);

describe('MarkdownContent', () => {
  it('renders plain prose exactly as the old path did — no wrapper, no markup', () => {
    // A single line has no spine (spineEnd), so this is a bare text node — byte for byte
    // what ContentRuns produced before §10.1.
    expect(html('just a sentence')).toBe('just a sentence');
  });

  it('turns the markers Ocean named into structure, and shows none of them', () => {
    const out = html('# 标题\n\n正文 **粗** 和 `代码`\n\n- 甲\n- 乙');
    expect(out).toContain('标题');
    expect(out).toContain('font-semibold');
    expect(out).toContain('<code');
    // Two bullets, drawn by the renderer rather than left as "-" in the text.
    expect(out.match(/•/g)).toHaveLength(2);
    // The whole point: not one raw marker survives into the read surface.
    expect(out).not.toMatch(/#|\*\*|`|(^|>)-\s/);
  });

  it('keeps a fenced code block literal', () => {
    const out = html('```\nlet x = **1**\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('let x = **1**');
  });

  it('gives the spine to opening prose but never to a heading', () => {
    expect(html('opening line\n\nrest')).toContain('font-medium');
    expect(html('# 标题\n\n正文')).not.toContain('font-medium');
  });

  // Ocean 2026-08-12「粗体字太粗了」. Bold is one step above the run it sits in, so it stays
  // visible everywhere without going black in the prose where most of it lives.
  it('makes bold one step heavier than its surroundings, not a flat 600', () => {
    // One line — no spine anywhere, so the only weight in the output is the bold itself.
    expect(html('plain **bold** here')).toContain('font-medium');
    expect(html('plain **bold** here')).not.toContain('font-semibold');
    // Inside the spine, which is already 500, bold has to clear it.
    expect(html('opening **bold** line\n\nrest')).toContain('font-semibold');
  });

  // 「大小区分不明显」. Every heading level has to differ from the body AND from its neighbours,
  // and the sizes are in em so 周回顾 (13px) gets the same hierarchy the block feed (15px) does.
  it('gives each heading level its own size, in em', () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((lvl) => {
      const m = /text-\[([\d.]+)em\]/.exec(html(`${'#'.repeat(lvl)} 标题\n\n正文`));
      return Number(m![1]);
    });
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a)); // strictly descending by level
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(5);
    // h1 above body size. Ocean 2026-08-13 pulled the scale back to the original 17px-on-15px,
    // so the bar is "bigger than the body", not the 1.2em the taller scale cleared.
    expect(sizes[0]).toBeGreaterThan(1);
  });
});

// 2026-08-19 — the marked sentence is the affordance (Ocean 2026-08-19:「点击它会出现修正后的信息」).
// Two things have to be true of the rendered output for that to work, and neither is
// visible from the tokenizer alone: the corrected words become a control, and a block
// without corrections gains no wrapper at all.
describe('MarkdownContent, corrected sentences', () => {
  const content = '截止 4 月 30 日,占总分 40%,可以两人一组';
  const span = {
    start: content.indexOf('占总分 40%'),
    end: content.indexOf('占总分 40%') + '占总分 40%'.length,
    id: 'corr-b',
  };

  it('makes the corrected sentence clickable and leaves the rest alone', () => {
    const out = renderToStaticMarkup(
      <MarkdownContent content={content} corrected={[span]} onCorrectedClick={() => {}} />,
    );
    expect(out).toContain('role="button"');
    expect(out).toContain('占总分 40%');
    // The words themselves are untouched — a correction marks, it does not rewrite.
    expect(out).toContain('可以两人一组');
  });

  it('adds no control when nothing corrects this block', () => {
    const out = renderToStaticMarkup(
      <MarkdownContent content={content} onCorrectedClick={() => {}} />,
    );
    expect(out).not.toContain('role="button"');
  });

  // Read-only surfaces (digest, 周回顾) pass no handler: the wash still shows that a
  // sentence was corrected, and clicking it does nothing rather than half-working.
  it('keeps the mark but no control where there is no handler', () => {
    const out = renderToStaticMarkup(<MarkdownContent content={content} corrected={[span]} />);
    expect(out).not.toContain('role="button"');
    expect(out).toContain('decoration-dotted');
  });
});

// 2026-08-19 — the offsets have to reach the DOM, or a selection cannot be mapped back and
// 「选整段」 fails again. renderToStaticMarkup is enough to see them.
describe('MarkdownContent, withOffsets', () => {
  it('stamps each run with where it starts in the raw content', () => {
    const content = 'a **b** c';
    const out = renderToStaticMarkup(<MarkdownContent content={content} withOffsets />);
    // 'a ' at 0, 'b' at 4 (past the opening **), ' c' at 7.
    expect(out).toContain('data-o="0"');
    expect(out).toContain('data-o="4"');
    expect(out).toContain('data-o="7"');
  });

  it('adds nothing at all when offsets were not asked for', () => {
    expect(renderToStaticMarkup(<MarkdownContent content={'just a sentence'} />)).toBe(
      'just a sentence',
    );
  });
});

// 2026-08-19 — merged blocks render through SegmentedContent/HighlightedContent, NOT through
// the Markdown renderer. They need the same offsets or selecting inside one maps to nothing,
// which would have turned 「只能划一行」 into 「一行也划不了」 on exactly those blocks.
describe('SegmentedContent, withOffsets', () => {
  it('offsets each segment against the whole merged content', () => {
    const content = 'alpha\n↪ note: first\n\nbeta';
    const out = renderToStaticMarkup(<SegmentedContent content={content} withOffsets />);
    expect(out).toContain('data-o="0"');
    // 'beta' sits after 'alpha\n↪ note: first\n\n'.
    expect(out).toContain(`data-o="${content.indexOf('beta')}"`);
  });

  it('offsets the text inside a highlight past its markers', () => {
    const out = renderToStaticMarkup(
      <SegmentedContent content={'a ==b== c'} withOffsets />,
    );
    expect(out).toContain('data-o="4"');
  });
});

// ⭐ S5（2026-08-24）：`afterBlock` —— 更正卡跟在它划的那一句所在的那一段底下。
// ⛔ 这是往一个**共用**渲染器上加的口子，所以第一条钉的是「不传就零变化」。
describe('MarkdownContent, afterBlock', () => {
  it('⛔ 不传 afterBlock：连一层 Fragment 都不多包，输出一个字节不变', () => {
    expect(renderToStaticMarkup(<MarkdownContent content="just a sentence" />)).toBe(
      'just a sentence',
    );
  });

  it('单段正文：插在那一段后面', () => {
    const out = renderToStaticMarkup(
      <MarkdownContent content="就一段话" afterBlock={() => <i>TAIL</i>} />,
    );
    expect(out).toBe('就一段话<i>TAIL</i>');
  });

  // 位置就是配对的依据，所以给的范围必须是**原始 content 的下标** ——
  // 和 `corrected` 那套坐标同一套。错一套，卡片就挂到隔壁那一段底下去。
  it('给的是每一段在原始 content 里的 [start, end)', () => {
    const content = '# 标题\n\n第一段\n\n第二段';
    const seen: [number, number][] = [];
    renderToStaticMarkup(
      <MarkdownContent
        content={content}
        afterBlock={(start, end) => {
          seen.push([start, end]);
          return null;
        }}
      />,
    );
    expect(seen).toHaveLength(3);
    for (const [start, end] of seen) expect(content.slice(start, end)).not.toContain('#');
    expect(content.slice(seen[0]![0], seen[0]![1])).toBe('标题');
    expect(content.slice(seen[1]![0], seen[1]![1])).toBe('第一段');
    expect(content.slice(seen[2]![0], seen[2]![1])).toBe('第二段');
  });

  it('每一段只插自己那一份', () => {
    const out = renderToStaticMarkup(
      <MarkdownContent
        content={'第一段\n\n第二段'}
        afterBlock={(start) => (start === 0 ? <i>A</i> : <i>B</i>)}
      />,
    );
    expect(out.indexOf('A')).toBeLessThan(out.indexOf('第二段'));
    expect(out.indexOf('第二段')).toBeLessThan(out.indexOf('B'));
  });
});
