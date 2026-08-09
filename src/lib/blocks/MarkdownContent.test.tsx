import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';

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
