import { describe, expect, it } from 'vitest';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { assemble } from './assemble';

const NOW = new Date('2026-05-15T10:00:00').getTime();
const T = (m: number): number => new Date('2026-05-15T09:00:00').getTime() + m * 60_000;

const thread: Thread = {
  id: 't1',
  workspaceId: 'w1',
  title: '论文文献综述',
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  createdAt: T(0),
  updatedAt: T(0),
  completedAt: null,
};

const textBlock = (id: string, content: string, opts: Partial<Block> = {}): Block => ({
  id,
  threadId: 't1',
  kind: 'text',
  content,
  annotation: null,
  refThreadId: null,
  source: null,
  pinned: false,
  createdAt: T(0),
  ...opts,
});

const attachment = (id: string, blockId: string, opts: Partial<Attachment> = {}): Attachment => ({
  id,
  blockId,
  kind: 'file',
  target: '/Users/x/Desktop/paper.pdf',
  label: 'paper.pdf',
  extractedText: null,
  extractedAt: null,
  extractionKind: null,
  createdAt: T(0),
  ...opts,
});

describe('assemble', () => {
  it('begins with the four-category English instruction header', () => {
    const out = assemble({ thread, blocks: [textBlock('b1', 'hi')], now: NOW });
    // Verbatim phrases — assert a few so silent template drift is caught.
    expect(out).toContain('## How to Read This Context');
    expect(out).toContain('FOUR different authority categories');
    expect(out).toContain('### 📖 Reference (authoritative)');
    expect(out).toContain('### 🧩 Synthesis (already-formed understanding)');
    expect(out).toContain('### 🔄 Process (conversation traces — read for evolution, not facts)');
    expect(out).toContain("### 💭 Personal (the user's own hypotheses and notes)");
    expect(out).toContain('If they conflict with other categories, Reference wins.');
    expect(out).toContain('## Output Language');
    expect(out).toContain('Respond in Simplified Chinese unless content itself dictates');
  });

  it('handles an empty thread', () => {
    const out = assemble({ thread, blocks: [], now: NOW });
    expect(out).toContain('# Project Context: 论文文献综述');
    expect(out).toContain('0 blocks total');
    expect(out).toContain('(no pinned blocks)');
    expect(out).toContain('(no blocks yet)');
    expect(out).not.toContain('## Related Files & Links');
  });

  it('renders plain text blocks with timestamps', () => {
    const blocks = [
      textBlock('b1', 'first thought', { createdAt: T(10) }),
      textBlock('b2', 'second thought', { createdAt: T(20), source: 'Notion' }),
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toMatch(/\[2026-05-15 09:10\] first thought/);
    expect(out).toMatch(/\[2026-05-15 09:20 · from Notion\] second thought/);
  });

  it('lifts pinned blocks into the Pinned Blocks section', () => {
    const blocks = [
      textBlock('b1', 'background noise'),
      textBlock('b2', 'pinned key insight', { pinned: true }),
    ];
    const out = assemble({ thread, blocks, now: NOW });
    const lines = out.split('\n');
    const pinnedIdx = lines.indexOf('## Pinned Blocks');
    const logIdx = lines.indexOf('## Full Record (chronological)');
    expect(pinnedIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(pinnedIdx);
    const pinnedSection = lines.slice(pinnedIdx, logIdx).join('\n');
    expect(pinnedSection).toContain('pinned key insight');
    expect(pinnedSection).not.toContain('background noise');
  });

  it('renders a block annotation indented beneath it', () => {
    const blocks = [textBlock('b1', 'kickoff note', { annotation: '这条要重点跟进' })];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('    note: 这条要重点跟进');
  });

  it('lists a block attachment inline and in the Related Files & Links section', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [attachment('a1', 'b1')];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain(
      '    ↳ attached file: paper.pdf — see Related Files & Links section below',
    );
    expect(out).toContain('## Related Files & Links');
    expect(out).toContain('- paper.pdf — /Users/x/Desktop/paper.pdf');
  });

  it('falls back to the target when an attachment label is empty', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [
      attachment('a1', 'b1', { kind: 'url', target: 'https://example.com/spec', label: '' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain(
      '    ↳ attached URL: https://example.com/spec — https://example.com/spec',
    );
    expect(out).toContain('- https://example.com/spec — https://example.com/spec');
  });

  it("inlines an attachment's extracted text indented under its block", () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', 'b1', { extractedText: 'line one\nline two', extractionKind: 'pdf' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    ↳ attached file: paper.pdf (pdf)');
    expect(out).toContain('      line one');
    expect(out).toContain('      line two');
  });

  it('truncates extracted text longer than 8000 chars with a marker', () => {
    const long = 'x'.repeat(8500);
    const blocks = [textBlock('b1', 'big file')];
    const attachments = [attachment('a1', 'b1', { extractedText: long, extractionKind: 'pdf' })];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('[... truncated, 500 more chars not shown ...]');
    expect(out).toContain('x'.repeat(8000));
    expect(out).not.toContain('x'.repeat(8001));
  });

  it('renders a block with a mix of extracted, failed, and URL attachments', () => {
    const blocks = [textBlock('b1', 'mixed bag')];
    const attachments = [
      attachment('a1', 'b1', {
        label: 'notes.pdf',
        target: '/x/notes.pdf',
        extractedText: 'extracted body text',
        extractionKind: 'pdf',
      }),
      attachment('a2', 'b1', {
        label: 'photo.jpg',
        target: '/x/photo.jpg',
        extractionKind: 'failed',
      }),
      attachment('a3', 'b1', { kind: 'url', label: 'spec', target: 'https://e.com/s' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    ↳ attached file: notes.pdf (pdf)');
    expect(out).toContain('      extracted body text');
    expect(out).toContain(
      '    ↳ attached file: photo.jpg — see Related Files & Links section below',
    );
    expect(out).toContain('    ↳ attached URL: spec — https://e.com/s');
  });

  it('renders ref blocks using the refTitles map', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', 'old snapshot title'), kind: 'ref', refThreadId: 't2' },
    ];
    const refTitles = new Map([['t2', '相关脉络的最新标题']]);
    const out = assemble({ thread, blocks, refTitles, now: NOW });
    expect(out).toContain('→ Referenced thread: 相关脉络的最新标题');
    expect(out).not.toContain('old snapshot title');
  });

  it('falls back to the ref snapshot title when refTitles is empty', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', '脉络快照标题'), kind: 'ref', refThreadId: 't2' },
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('→ Referenced thread: 脉络快照标题');
  });

  it('is a pure function (no globals, no side effects)', () => {
    const blocks = [textBlock('b1', 'hi')];
    const a = assemble({ thread, blocks, now: NOW });
    const b = assemble({ thread, blocks, now: NOW });
    expect(a).toBe(b);
  });
});
