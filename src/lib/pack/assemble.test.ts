import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { assemble, filterBlocksForRange } from './assemble';
import goldenFixture from './fixtures/golden-pack.json';

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
  refBlockId: null,
  source: null,
  pinned: false,
  createdAt: T(0),
  ...opts,
}) as Block;

const attachment = (id: string, blockId: string, opts: Partial<Attachment> = {}): Attachment => ({
  id,
  blockId,
  kind: 'file',
  target: '/Users/x/Desktop/paper.pdf',
  label: 'paper.pdf',
  extractedText: null,
  extractedAt: null,
  extractionKind: null,
  includeInPack: false,
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

  it('header explains user-highlighted == spans (§20.5)', () => {
    const out = assemble({ thread, blocks: [textBlock('b1', 'hi')], now: NOW });
    expect(out).toContain('### ⭐ User-highlighted spans');
    expect(out).toContain('==…==');
    expect(out).toContain('sentence-level key points');
    expect(out).toContain('coexist with pinned blocks');
  });

  it('passes ==…== highlight markers through block content verbatim (§20.5)', () => {
    const blocks = [
      textBlock('b1', 'the ==key insight== is here', { createdAt: T(10) }),
      textBlock('b2', '前段 ==重点句子== 后段', { createdAt: T(20) }),
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('the ==key insight== is here');
    expect(out).toContain('前段 ==重点句子== 后段');
  });

  it('does not crash on malformed/edge ==…== content (§20.5)', () => {
    const blocks = [
      textBlock('b1', 'lone == marker without a pair'),
      textBlock('b2', '====='),
      textBlock('b3', '==unclosed'),
    ];
    expect(() => assemble({ thread, blocks, now: NOW })).not.toThrow();
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('lone == marker without a pair');
    expect(out).toContain('=====');
    expect(out).toContain('==unclosed');
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

  it("inlines an attachment's extracted text only when include_in_pack === true (§20.2)", () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', 'b1', {
        extractedText: 'line one\nline two',
        extractionKind: 'pdf',
        includeInPack: true,
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    ↳ attached file: paper.pdf (pdf)');
    expect(out).toContain('      line one');
    expect(out).toContain('      line two');
  });

  it('does NOT inline extracted text when include_in_pack === false (default, §20.2)', () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', 'b1', {
        extractedText: 'should not appear in body',
        extractionKind: 'pdf',
        // includeInPack defaults to false via the factory
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    // The chip points at Related Files & Links instead of inlining the body text.
    expect(out).toContain(
      '    ↳ attached file: paper.pdf — see Related Files & Links section below',
    );
    expect(out).not.toContain('should not appear in body');
    // And Related Files & Links tags the row with the not-inlined marker so the AI
    // knows content exists but was withheld.
    expect(out).toContain(
      '- paper.pdf — /Users/x/Desktop/paper.pdf  [extracted: yes, not inlined]',
    );
  });

  it('omits the not-inlined marker for files without extracted text', () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', 'b1', { label: 'photo.jpg', target: '/x/photo.jpg' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('- photo.jpg — /x/photo.jpg');
    expect(out).not.toContain('[extracted: yes, not inlined]');
  });

  it('truncates inlined extracted text longer than 8000 chars with a marker', () => {
    const long = 'x'.repeat(8500);
    const blocks = [textBlock('b1', 'big file')];
    const attachments = [
      attachment('a1', 'b1', {
        extractedText: long,
        extractionKind: 'pdf',
        includeInPack: true,
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('[... truncated, 500 more chars not shown ...]');
    expect(out).toContain('x'.repeat(8000));
    expect(out).not.toContain('x'.repeat(8001));
  });

  it('renders a block with a mix of inlined / extracted-not-inlined / failed / URL attachments', () => {
    const blocks = [textBlock('b1', 'mixed bag')];
    const attachments = [
      attachment('a1', 'b1', {
        label: 'notes.pdf',
        target: '/x/notes.pdf',
        extractedText: 'extracted body text',
        extractionKind: 'pdf',
        includeInPack: true,
      }),
      attachment('a2', 'b1', {
        label: 'reference.pdf',
        target: '/x/reference.pdf',
        extractedText: 'extracted but kept out of pack',
        extractionKind: 'pdf',
        // includeInPack: false
      }),
      attachment('a3', 'b1', {
        label: 'photo.jpg',
        target: '/x/photo.jpg',
        extractionKind: 'failed',
      }),
      attachment('a4', 'b1', { kind: 'url', label: 'spec', target: 'https://e.com/s' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    ↳ attached file: notes.pdf (pdf)');
    expect(out).toContain('      extracted body text');
    expect(out).toContain(
      '    ↳ attached file: reference.pdf — see Related Files & Links section below',
    );
    expect(out).not.toContain('extracted but kept out of pack');
    expect(out).toContain(
      '    ↳ attached file: photo.jpg — see Related Files & Links section below',
    );
    expect(out).toContain('    ↳ attached URL: spec — https://e.com/s');
    expect(out).toContain(
      '- reference.pdf — /x/reference.pdf  [extracted: yes, not inlined]',
    );
  });

  it('renders ref blocks using the refTitles map', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', 'old snapshot title'), kind: 'ref', refThreadId: 't2' },
    ];
    const refTitles = new Map([['t2', '相关脉络的最新标题']]);
    const out = assemble({ thread, blocks, refTitles, now: NOW });
    expect(out).toContain('→ Referenced project: 相关脉络的最新标题');
    expect(out).not.toContain('old snapshot title');
  });

  it('falls back to the ref snapshot title when refTitles is empty', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', '脉络快照标题'), kind: 'ref', refThreadId: 't2' },
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('→ Referenced project: 脉络快照标题');
  });

  // v2.4 (§20.13 D2): block-level citations.
  describe('block-level citation (refBlockId)', () => {
    it('renders a cite sub-line with the cited block time + head anchor', () => {
      const blocks = [
        textBlock('b2', '结论建立在前一块之上', {
          refBlockId: 'b1',
          annotation: '写入方声明的依据',
          createdAt: T(20),
        }),
      ];
      const refBlocks = new Map([
        ['b1', { content: '被引块的第一行\n第二行不进锚点', createdAt: T(10) }],
      ]);
      const out = assemble({ thread, blocks, refBlocks, now: NOW });
      // note line first (the user's voice), then the citation.
      const noteIdx = out.indexOf('    note: 写入方声明的依据');
      const citeIdx = out.indexOf('    ↩ cites: [2026-05-15 09:10] 被引块的第一行 第二行不进锚点');
      expect(noteIdx).toBeGreaterThan(-1);
      expect(citeIdx).toBeGreaterThan(noteIdx);
    });

    it('caps the anchor at 40 chars and marks a dangling citation', () => {
      const long = '锚'.repeat(60);
      const blocks = [
        textBlock('b2', '引长块', { refBlockId: 'b1' }),
        textBlock('b3', '引已删块', { refBlockId: 'b-gone', createdAt: T(1) }),
      ];
      const refBlocks = new Map([['b1', { content: long, createdAt: T(0) }]]);
      const out = assemble({ thread, blocks, refBlocks, now: NOW });
      expect(out).toContain(`↩ cites: [2026-05-15 09:00] ${'锚'.repeat(40)}…`);
      expect(out).toContain('↩ cites: (cited block no longer exists)');
    });
  });

  it('is a pure function (no globals, no side effects)', () => {
    const blocks = [textBlock('b1', 'hi')];
    const a = assemble({ thread, blocks, now: NOW });
    const b = assemble({ thread, blocks, now: NOW });
    expect(a).toBe(b);
  });

  // --- v2.8 §20.7: pack task templates ---------------------------------------------------
  describe('pack task templates (§20.7)', () => {
    const blocks = [textBlock('b1', 'one note')];

    it('default template emits no extra closing block (current behavior)', () => {
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).not.toContain('## Task');
      // Pre-v2.8 callers (no `template` arg) get byte-identical output to
      // explicitly passing template: 'default'.
      const explicit = assemble({ thread, blocks, template: 'default', now: NOW });
      expect(out).toBe(explicit);
    });

    it('revision template appends a revision-materials closing block before Output Language', () => {
      const out = assemble({ thread, blocks, template: 'revision', now: NOW });
      expect(out).toContain('## Task');
      expect(out).toContain('Generate revision materials');
      expect(out).toContain('four-category authority hierarchy');
      // Closing block lands BEFORE the Output Language directive (so the AI reads
      // the task right before being told what language to reply in).
      const taskIdx = out.indexOf('## Task');
      const langIdx = out.indexOf('## Output Language');
      expect(taskIdx).toBeGreaterThan(-1);
      expect(langIdx).toBeGreaterThan(taskIdx);
    });

    it('combine template appends a synthesis closing block', () => {
      const out = assemble({ thread, blocks, template: 'combine', now: NOW });
      expect(out).toContain('## Task');
      expect(out).toContain('scattered fragments');
      expect(out).toContain('deduplicated summary');
      expect(out).toContain('Do not invent content');
    });

    it('header + record body are byte-identical across templates (only the closing differs)', () => {
      const defaultOut = assemble({ thread, blocks, template: 'default', now: NOW });
      const revisionOut = assemble({ thread, blocks, template: 'revision', now: NOW });
      // Everything up to the "## Output Language" line in the default output must
      // appear verbatim in the revision output (the revision-task closing slots in
      // between the body and the language directive, not into the body).
      const defaultBody = defaultOut.slice(0, defaultOut.indexOf('## Output Language'));
      expect(revisionOut).toContain(defaultBody);
    });
  });

  describe('pack range filter (§17 range selector)', () => {
    const DAY = 86_400_000;
    const blocks = [
      textBlock('old', 'thirty-one days ago', { createdAt: NOW - 31 * DAY }),
      textBlock('mid', 'ten days ago, pinned', { createdAt: NOW - 10 * DAY, pinned: true }),
      textBlock('new', 'yesterday', { createdAt: NOW - 1 * DAY }),
    ];

    it("'all' returns the input unchanged", () => {
      expect(filterBlocksForRange(blocks, 'all', NOW)).toEqual(blocks);
    });

    it("'pinned' keeps only pinned blocks", () => {
      expect(filterBlocksForRange(blocks, 'pinned', NOW).map((b) => b.id)).toEqual(['mid']);
    });

    it("'last7' / 'last30' cut by capture time but never drop a pinned block (B-2)", () => {
      // 'mid' is ten days old AND pinned — outside the last7 window, inside the pack.
      expect(filterBlocksForRange(blocks, 'last7', NOW).map((b) => b.id)).toEqual(['mid', 'new']);
      expect(filterBlocksForRange(blocks, 'last30', NOW).map((b) => b.id)).toEqual(['mid', 'new']);
      const unpinned = [
        textBlock('old', 'thirty-one days ago', { createdAt: NOW - 31 * DAY }),
        textBlock('new', 'yesterday', { createdAt: NOW - 1 * DAY }),
      ];
      expect(filterBlocksForRange(unpinned, 'last7', NOW).map((b) => b.id)).toEqual(['new']);
    });

    it('a range-filtered pack reports the filtered count and omits excluded content', () => {
      const packed = filterBlocksForRange(blocks, 'last7', NOW);
      const out = assemble({ thread, blocks: packed, now: NOW });
      expect(out).toContain('2 blocks total');
      expect(out).toContain('yesterday');
      expect(out).not.toContain('thirty-one days ago');
    });

    it('scope makes the header say how many of the project the pack holds (B-3)', () => {
      const packed = filterBlocksForRange(blocks, 'last7', NOW);
      const out = assemble({
        thread,
        blocks: packed,
        scope: { range: 'last7', total: blocks.length },
        now: NOW,
      });
      expect(out).toContain('2 of 3 blocks in this project (range: last7');
      expect(out).not.toContain('blocks total');
      // range 'all' keeps the plain wording (the golden path).
      const all = assemble({ thread, blocks, scope: { range: 'all', total: blocks.length }, now: NOW });
      expect(all).toContain('3 blocks total');
    });
  });

  // §20.12 cross-language golden: the Rust MCP server re-implements this renderer
  // (src-tauri/src/mcp.rs); both sides must produce golden-pack.expected.txt from
  // golden-pack.json, dates normalized (local-time rendering is TZ-dependent). If this
  // test fails after a template/renderer change, regenerate the expected file with
  // GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts
  // and make the SAME change in mcp.rs until `cargo test` agrees.
  describe('cross-language golden (§20.12 MCP renderer equivalence)', () => {
    const normalizeDates = (s: string): string =>
      s.replace(/\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/g, '<DATE>');

    it('assemble output matches the shared golden fixture', () => {
      const fx = goldenFixture as unknown as {
        now: number;
        thread: Thread;
        refTitles: Record<string, string>;
        refBlocks: Record<string, { content: string; createdAt: number }>;
        blocks: Block[];
        attachments: Attachment[];
      };
      const out = assemble({
        thread: fx.thread,
        blocks: fx.blocks,
        attachments: fx.attachments,
        refTitles: new Map(Object.entries(fx.refTitles)),
        refBlocks: new Map(Object.entries(fx.refBlocks)),
        now: fx.now,
      });
      const expectedPath = join(__dirname, 'fixtures', 'golden-pack.expected.txt');
      if (process.env.GOLDEN_WRITE === '1') {
        writeFileSync(expectedPath, out);
      }
      const expected = readFileSync(expectedPath, 'utf8');
      expect(normalizeDates(out)).toBe(normalizeDates(expected));
    });
  });
});
