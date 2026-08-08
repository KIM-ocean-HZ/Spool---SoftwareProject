import { describe, expect, it } from 'vitest';
import { isPlainParagraph, parseMarkdown } from './markdown';

// Every assertion below reads the text back out of the ORIGINAL string by the offsets the
// parser returned. That is the property §10.1 rests on: structure is described, never
// rewritten, so search hits (which are offsets into this same string) keep landing.
const textOf = (content: string, span: { start: number; end: number }): string =>
  content.slice(span.start, span.end);

describe('parseMarkdown', () => {
  it('treats ordinary prose as one paragraph — the untouched fast path', () => {
    const content = 'just a line\nand another';
    const doc = parseMarkdown(content);
    expect(doc.blocks).toHaveLength(1);
    expect(isPlainParagraph(doc, content)).toBe(true);
  });

  it('splits paragraphs on blank lines and drops the blank from the text', () => {
    const content = 'first para\n\nsecond para';
    const doc = parseMarkdown(content);
    expect(doc.blocks.map((b) => textOf(content, b.text))).toEqual(['first para', 'second para']);
    expect(isPlainParagraph(doc, content)).toBe(false);
  });

  it('parses headings by level and hides the # marker', () => {
    const content = '# 大标题\n### 小标题';
    const doc = parseMarkdown(content);
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 1, text: { start: 2, end: 5 } },
      { kind: 'heading', level: 3, text: { start: 10, end: 13 } },
    ]);
    expect(doc.blocks.map((b) => textOf(content, b.text))).toEqual(['大标题', '小标题']);
    expect(doc.hidden.map((h) => textOf(content, h))).toEqual(['# ', '### ']);
  });

  it('parses bullets and numbered items, keeping the number the user typed', () => {
    const content = '- one\n  - nested\n2. two';
    const doc = parseMarkdown(content);
    expect(doc.blocks).toEqual([
      { kind: 'item', marker: '·', indent: 0, text: { start: 2, end: 5 } },
      { kind: 'item', marker: '·', indent: 1, text: { start: 10, end: 16 } },
      { kind: 'item', marker: '2.', indent: 0, text: { start: 20, end: 23 } },
    ]);
    expect(doc.blocks.map((b) => textOf(content, b.text))).toEqual(['one', 'nested', 'two']);
  });

  it('parses a fenced code block and marks its body as raw', () => {
    const content = 'before\n```\nlet x = **1**\n```\nafter';
    const doc = parseMarkdown(content);
    expect(doc.blocks.map((b) => b.kind)).toEqual(['para', 'code', 'para']);
    expect(textOf(content, doc.blocks[1]!.text)).toBe('let x = **1**');
    // The body is raw, so the ** inside it stays literal (contentRuns honours this).
    expect(doc.raw.map((r) => textOf(content, r))).toEqual(['let x = **1**']);
    // Both fence lines are structure.
    expect(doc.hidden.map((h) => textOf(content, h).trim())).toEqual(['```', '```']);
  });

  it('closes an unterminated fence at the end of the block rather than losing the text', () => {
    const content = '```\nhalf a snippet';
    const doc = parseMarkdown(content);
    expect(doc.blocks).toHaveLength(1);
    expect(textOf(content, doc.blocks[0]!.text)).toBe('half a snippet');
  });

  it('leaves a lone hash or dash alone — a marker needs its space', () => {
    const content = '#nothashtag\n-5 degrees';
    const doc = parseMarkdown(content);
    expect(doc.blocks.map((b) => b.kind)).toEqual(['para']);
    expect(textOf(content, doc.blocks[0]!.text)).toBe(content);
  });
});
