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
    expect(out.match(/·/g)).toHaveLength(2);
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
});
