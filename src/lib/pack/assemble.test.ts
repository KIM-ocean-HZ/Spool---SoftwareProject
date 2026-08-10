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
  followUpBrief: null,
  autoMaintain: null,
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

// v15: an attachment belongs to the project, so the fixture takes no block.
const attachment = (id: string, opts: Partial<Attachment> = {}): Attachment => ({
  id,
  threadId: thread.id,
  kind: 'file',
  target: '/Users/x/Desktop/paper.pdf',
  label: 'paper.pdf',
  extractedText: null,
  extractedAt: null,
  extractionKind: null,
  includeInPack: false,
  aiAccess: false,
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

  // DESIGN_CONTEXT_HYGIENE §1.1-bis (Ocean: 「目前表头是开发初期的作品,需要更新」). The four
  // categories were written before the pack grew every marker below, and the header
  // explained none of them — a receiving AI had to guess what a pinned placeholder meant,
  // and "content is missing" is the wrong guess.
  it('explains the pack notation the four categories never covered (§1.1-bis)', () => {
    const out = assemble({ thread, blocks: [textBlock('b1', 'hi')], now: NOW });
    expect(out).toContain('## Notation');
    for (const phrase of [
      "`#12` is this block's number inside this project",
      'That placeholder is not missing content.',
      '`↩ cites:`',
      '`↩ replaces (that block no longer holds):`',
      '`↩ corrects one point in:`',
      '[extracted: yes, not inlined]',
      'Nothing Spool leaves out has been deleted.',
    ]) {
      expect(out).toContain(phrase);
    }
    // ⚠️ And what it must NOT do: open a fifth authority category. Two design docs ruled
    // against that (DESIGN_FOLLOW_UP §1.2, DESIGN_MCP_WRITE_ROLE §4.4-bis) and this section
    // is mechanics, not authority.
    expect(out).toContain('FOUR different authority categories');
    expect(out.match(/^### [📖🧩🔄💭⭐]/gm)).toHaveLength(5);
  });

  // §1.1: Ocean 拍板 a switch, not a deletion — 「pack 降级成最简便操作,让纯网页端 ai 用户
  // 使用」. The clipboard default flips in PackDialog; assemble keeps instructions on so the
  // golden path and the MCP twin stay byte-identical.
  it('drops the whole reading header when instructions are off, and nothing else', () => {
    const blocks = [textBlock('b1', '正文一句', { seq: 1, source: 'Safari' })];
    const full = assemble({ thread, blocks, now: NOW });
    const minimal = assemble({ thread, blocks, instructions: false, now: NOW });
    expect(minimal).not.toContain('## How to Read This Context');
    expect(minimal).not.toContain('## Notation');
    // Everything that is CONTENT survives — this is a shorter pack, not a lesser one.
    expect(minimal).toContain('# Project Context: 论文文献综述');
    expect(minimal).toContain('1 blocks total.');
    expect(minimal).toContain('## Pinned Blocks');
    expect(minimal).toContain('## Full Record (chronological)');
    expect(minimal).toContain('#1 [2026-05-15 09:00 · from Safari] 正文一句');
    expect(minimal).toContain('## Output Language');
    // The saving is the point: on a one-block project the header IS the pack.
    expect(minimal.length).toBeLessThan(full.length / 2);
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

  // v15 (DESIGN_PROJECT_FILES §5.1 ②): a file is listed ONCE, in the project's own section,
  // and never as a sub-line under a block. ⚠️ The `↳ attached …` marker is gone from the
  // format entirely — this test is what stops it coming back.
  it('lists a file once, in Related Files & Links, and never under a block', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [attachment('a1')];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('## Related Files & Links');
    // §3.1-5: the file name, never the machine path it sits at.
    expect(out).toContain('- paper.pdf');
    expect(out).not.toContain('/Users/x/Desktop/paper.pdf');
    expect(out).not.toContain('↳ attached');
    // Exactly one mention — the Related Files row.
    expect(out.match(/paper\.pdf/g)).toHaveLength(1);
  });

  it('falls back to the file name when a label is empty, and prints it once', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [attachment('a1', { target: '/x/y/spec.pdf', label: '' })];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    // The " — target" half is dropped when it would only repeat the label.
    expect(out).toContain('- spec.pdf\n');
  });

  // §3.1-5 (MCP review round 2): a pack is the artifact the user pastes elsewhere, so no
  // line of it may carry the machine's directory layout. The property, not one example.
  it('never prints a local path — every file shows its name only', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [
      attachment('a1', { label: '', target: '/Users/hzjin/Library/files/lecture-03.pdf' }),
      attachment('a2', { kind: 'folder', label: '', target: '/Users/hzjin/repos/baseline/' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).not.toContain('/Users/hzjin');
    expect(out).toContain('- lecture-03.pdf');
    expect(out).toContain('- baseline');
  });

  it("inlines an attachment's extracted text only when include_in_pack === true (§20.2)", () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', {
        extractedText: 'line one\nline two',
        extractionKind: 'pdf',
        includeInPack: true,
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('- paper.pdf (pdf)');
    expect(out).toContain('      line one');
    expect(out).toContain('      line two');
  });

  it('does NOT inline extracted text when include_in_pack === false (default, §20.2)', () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', {
        extractedText: 'should not appear in body',
        extractionKind: 'pdf',
        // includeInPack defaults to false via the factory
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).not.toContain('should not appear in body');
    // The row says the text exists and was withheld, so the AI knows there is something
    // to ask the user for.
    expect(out).toContain('- paper.pdf  [extracted: yes, not inlined]');
  });

  it('omits the not-inlined marker for files without extracted text', () => {
    const blocks = [textBlock('b1', 'see attached')];
    const attachments = [
      attachment('a1', { label: 'photo.jpg', target: '/x/photo.jpg' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('- photo.jpg');
    // Asserted on the Related Files row, not on the whole pack: the instruction header's
    // Notation section (DESIGN_CONTEXT_HYGIENE §1.1-bis) now explains what that marker
    // means, so the string legitimately appears up there in every pack.
    expect(out).not.toContain('- photo.jpg  [extracted: yes, not inlined]');
  });

  it('truncates inlined extracted text longer than 8000 chars with a marker', () => {
    const long = 'x'.repeat(8500);
    const blocks = [textBlock('b1', 'big file')];
    const attachments = [
      attachment('a1', {
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

  it('renders a mix of inlined / extracted-not-inlined / failed files', () => {
    const blocks = [textBlock('b1', 'mixed bag')];
    const attachments = [
      attachment('a1', {
        label: 'notes.pdf',
        target: '/x/notes.pdf',
        extractedText: 'extracted body text',
        extractionKind: 'pdf',
        includeInPack: true,
      }),
      attachment('a2', {
        label: 'reference.pdf',
        target: '/x/reference.pdf',
        extractedText: 'extracted but kept out of pack',
        extractionKind: 'pdf',
        // includeInPack: false
      }),
      attachment('a3', {
        label: 'photo.jpg',
        target: '/x/photo.jpg',
        extractionKind: 'failed',
      }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('- notes.pdf (pdf)');
    expect(out).toContain('      extracted body text');
    expect(out).toContain('- reference.pdf  [extracted: yes, not inlined]');
    expect(out).not.toContain('extracted but kept out of pack');
    expect(out).toContain('- photo.jpg');
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

  // --- Pack task templates: removed (2026-08-09, Ocean 决定 6) ----------------------------
  // 复习资料 / 组合零散对话 were the only two templates that emitted anything, and with them
  // gone a pack is always context-only. This guards the removal: no `## Task` block, and the
  // pack still closes on the Output Language directive.
  it('carries no task block — a pack is context only', () => {
    const blocks = [textBlock('b1', 'one note')];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).not.toContain('## Task');
    expect(out.trimEnd().endsWith('may stay in their original language.')).toBe(true);
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

  // DESIGN_CONTEXT_HYGIENE §3.1 — supersession, the one memory-governance strategy Spool
  // did not have (§2.2: age / recency / salience were all covered, "is this still TRUE"
  // was not).
  describe('supersession (§3.1)', () => {
    it('keeps a retired block out of the pack and says so, without deleting anything', () => {
      const blocks = [
        textBlock('b1', '截止 4 月 30 日', { seq: 1, staleAt: T(10) }),
        textBlock('b2', '改成 3 月 15 日', { seq: 2, createdAt: T(11) }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).not.toContain('截止 4 月 30 日');
      expect(out).toContain('改成 3 月 15 日');
      expect(out).toContain('1 blocks total.');
      // ⚠️ The gap is DECLARED. §2.3's reading of TOKI is that dropping a retired fact
      // silently is exactly the failure a temporal store exists to avoid — and the line has
      // to say the block still exists, or "retire" reads as "delete".
      expect(out).toContain('1 block the user has marked as no longer valid is not shown');
      expect(out).toContain('still in Spool, still searchable');
    });

    it('retires a pinned block too — the later statement wins', () => {
      const blocks = [textBlock('b1', '核心结论', { seq: 1, pinned: true, staleAt: T(10) })];
      const out = assemble({ thread, blocks, now: NOW });
      // Out of BOTH sections: pin says "this is core context" about a conclusion that was
      // still holding, and the user has since said it is not.
      expect(out).not.toContain('核心结论');
      expect(out).toContain('(no pinned blocks)');
      expect(out).toContain('1 block the user has marked as no longer valid');
    });

    // ⚠️ v15 REVERSED this. It used to drop a retired block's attachments with it, because a
    // file was evidence for one conclusion and the pack must not point at material it
    // withheld. A file is the PROJECT's now, so retiring a conclusion says nothing about
    // whether the project still holds the file — dropping it would hide the user's own
    // material on the strength of an unrelated decision.
    it('keeps the project’s files even when a block is retired', () => {
      const blocks = [
        textBlock('b1', '旧的', { seq: 1, staleAt: T(10) }),
        textBlock('b2', '新的', { seq: 2 }),
      ];
      const attachments = [attachment('a1', { label: 'old.pdf', target: '/x/old.pdf' })];
      const out = assemble({ thread, blocks, attachments, now: NOW });
      expect(out).toContain('- old.pdf');
    });

    it('marks a wholesale replacement differently from a citation', () => {
      const blocks = [
        textBlock('b2', '改成 3 月 15 日', {
          seq: 2,
          refBlockId: 'b1',
          refKind: 'supersedes',
        }),
      ];
      const out = assemble({
        thread,
        blocks,
        refBlocks: new Map([['b1', { content: '截止 4 月 30 日', createdAt: T(0) }]]),
        now: NOW,
      });
      expect(out).toContain('↩ replaces (that block no longer holds): ');
      expect(out).not.toContain('↩ cites: ');
    });

    // §3.1.1, and the answer to Ocean's question («替代信息大多情况是大段文字里的一句话,ai
    // 写回应该要复制这一段话的其余所有内容才对吧?»): no copy. The old block renders in full,
    // unchanged, and grows one line pointing at the correction.
    it('leaves a partly-corrected block whole and points at the correction', () => {
      const long = '课程要求:复现一篇论文,截止 4 月 30 日,占总分 40%,可以两人一组';
      const blocks = [
        textBlock('b1', long, { seq: 1 }),
        textBlock('b2', '占分是 30% 不是 40%', { seq: 2, refBlockId: 'b1', refKind: 'corrects' }),
      ];
      const out = assemble({
        thread,
        blocks,
        refBlocks: new Map([['b1', { content: long, createdAt: T(0) }]]),
        now: NOW,
      });
      expect(out).toContain(long); // every character of it, still there
      expect(out).toContain('⚠️ one point in this block was corrected later — see #2');
      expect(out).toContain('↩ corrects one point in: ');
      expect(out).not.toContain('no longer valid'); // b1 was never retired
    });

    // v21 (Ocean 2026-08-10, 拍板「标到哪句话」). The v13 line said one point in a long block
    // was wrong and left the reader to find it; with a quote it says which sentence.
    it('names the corrected sentence when the correction quoted it', () => {
      const long = '课程要求:复现一篇论文,截止 4 月 30 日,占总分 40%,可以两人一组';
      const blocks = [
        textBlock('b1', long, { seq: 1 }),
        textBlock('b2', '占分是 30% 不是 40%', {
          seq: 2,
          refBlockId: 'b1',
          refKind: 'corrects',
          correctedQuote: '占总分 40%',
        }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).toContain(
        '⚠️ one point in this block was corrected later — see #2 (\u201c占总分 40%\u201d)',
      );
      expect(out).toContain(long); // still whole — a quote marks, it does not retire
    });

    // ⚠️ The degradation that makes storing the QUOTE (not offsets) the right call: the
    // user edited the sentence away, so the pack stops naming it rather than naming words
    // that are no longer there. The block-level warning survives on its own.
    it('drops a quote that no longer occurs in the corrected block', () => {
      const blocks = [
        textBlock('b1', '课程要求:占总分 30%', { seq: 1 }),
        textBlock('b2', '占分是 30% 不是 40%', {
          seq: 2,
          refBlockId: 'b1',
          refKind: 'corrects',
          correctedQuote: '占总分 40%',
        }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).toContain('⚠️ one point in this block was corrected later — see #2');
      expect(out).not.toContain('占总分 40%\u201d');
    });

    it('does not warn about a correction the user has since retired', () => {
      const blocks = [
        textBlock('b1', '原文', { seq: 1 }),
        textBlock('b2', '更正', {
          seq: 2,
          refBlockId: 'b1',
          refKind: 'corrects',
          staleAt: T(10),
        }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).toContain('原文');
      // Asserted with the sub-line indent: the header's Notation section quotes the marker
      // to explain it, so the bare phrase is in every pack by design.
      expect(out).not.toContain('    ⚠️ one point in this block was corrected later');
    });
  });

  // v20 (DESIGN_MCP_INTENT_ROUTING §4.6) — the provenance sub-line.
  //
  // ⚠️ The cross-language golden cannot stand in for this: both sides normalise every
  // YYYY-MM-DD to <DATE> before comparing, so a renderer that formatted these two columns
  // through the LOCAL zone would pass it and still print the wrong day for half the world.
  // These assertions name the characters.
  describe('provenance (§4.6)', () => {
    // 2026-08-09 and 2027-08-01 at UTC midnight — what parse_iso_date stores.
    const RETRIEVED = Date.UTC(2026, 7, 9);
    const RECHECK = Date.UTC(2027, 7, 1);
    const web = (opts: Partial<Block> = {}): Block[] => [
      textBlock('b1', '截止日期是 12 月 1 日', {
        seq: 1,
        sourceUrl: 'https://admissions.example.edu/deadlines',
        retrievedAt: RETRIEVED,
        recheckAfter: RECHECK,
        ...opts,
      }),
    ];

    it('prints where it came from, when it was read, and when to look again', () => {
      const out = assemble({ thread, blocks: web(), now: Date.UTC(2027, 0, 1) });
      expect(out).toContain(
        '    ↗ https://admissions.example.edu/deadlines · retrieved 2026-08-09 · recheck after 2027-08-01',
      );
    });

    it('says a block may be out of date once its recheck day has passed — and keeps it whole', () => {
      const out = assemble({ thread, blocks: web(), now: Date.UTC(2027, 8, 1) });
      expect(out).toContain('⚠️ may be out of date — was to be rechecked after 2027-08-01');
      // ⚠️ Nobody said this stopped holding. Retiring is the user's alone (§3.1), so the
      // block is still here in full — the line is a caution, not a removal.
      expect(out).toContain('截止日期是 12 月 1 日');
      expect(out).not.toContain('no longer valid');
    });

    it('renders whichever pieces are there, and nothing when there are none', () => {
      const only = assemble({
        thread,
        blocks: [textBlock('b1', '一条结论', { seq: 1, retrievedAt: RETRIEVED })],
        now: NOW,
      });
      expect(only).toContain('    ↗ retrieved 2026-08-09');
      // Every block the user wrote by hand is this case, which is why v20 leaves almost
      // every existing pack byte-identical.
      const none = assemble({ thread, blocks: [textBlock('b1', '一条结论', { seq: 1 })], now: NOW });
      expect(none).not.toContain('↗');
    });
  });

  // DESIGN_CONTEXT_HYGIENE §3.2 — the label ladder, W7 being its first rung. Ocean's §1.2
  // objection is the reason it exists: a pasted wall of text does not announce itself in
  // its first 40 characters, and the user's own note about it does.
  describe('label ladder (§3.2 / W7)', () => {
    // Found by running it against the real lab library rather than by reading it: a short
    // block whose note said 「先按这个数走」 lost its own text to that note, and the reader
    // could no longer tell what the block said.
    it('leaves a short block naming itself, note or no note', () => {
      const blocks = [
        textBlock('b1', '门槛是召回率 60%', { seq: 1, pinned: true, annotation: '先按这个数走' }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).toContain('📌 #1 [2026-05-15 09:00] 门槛是召回率 60% (pinned');
      expect(out).not.toContain('先按这个数走 (pinned');
    });

    it('names a pinned block by its annotation, falling back to the head', () => {
      const blocks = [
        textBlock('b1', '这里是一段很长的原文'.repeat(6), {
          seq: 1,
          pinned: true,
          annotation: '这条讲的是评分口径',
        }),
        textBlock('b2', '另一段很长的原文'.repeat(6), { seq: 2, pinned: true, createdAt: T(1) }),
      ];
      const out = assemble({ thread, blocks, now: NOW });
      expect(out).toContain(
        '📌 #1 [2026-05-15 09:00] 这条讲的是评分口径 (pinned — full text in "Pinned Blocks" above)',
      );
      // No note → rung three, exactly as before v13.
      expect(out).toContain(
        '📌 #2 [2026-05-15 09:01] 另一段很长的原文另一段很长的原文另一段很长的原文另一段很长的原文另一段很长的原文… ' +
          '(pinned — full text in "Pinned Blocks" above)',
      );
    });

    it('names a cited block by its annotation too', () => {
      const blocks = [textBlock('b2', '建立在那条上', { seq: 2, refBlockId: 'b1' })];
      const out = assemble({
        thread,
        blocks,
        refBlocks: new Map([
          ['b1', { content: '原文很长'.repeat(20), annotation: '我当时的判断', createdAt: T(0) }],
        ]),
        now: NOW,
      });
      expect(out).toContain('↩ cites: [2026-05-15 09:00] 我当时的判断');
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
        refBlocks: Record<
          string,
          { content: string; createdAt: number; foreignTitle?: string }
        >;
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
