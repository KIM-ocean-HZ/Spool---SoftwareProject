import { describe, expect, it } from 'vitest';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { buildDigestPrompt } from './summarizeDigest';
import { buildRoutePrompt } from './route';
import { buildStatusPrompt } from './summarizeStatus';

const makeAttachment = (over: Partial<Attachment> = {}): Attachment => ({
  id: 'a-1',
  blockId: 'b-1',
  kind: 'file',
  target: '/x/notes.pdf',
  label: 'notes.pdf',
  extractedText: null,
  extractedAt: null,
  extractionKind: null,
  includeInPack: false,
  createdAt: 0,
  ...over,
});

const makeThread = (over: Partial<Thread> = {}): Thread => ({
  id: 't1',
  workspaceId: 'w1',
  title: '蓝莓松饼烘焙',
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  ...over,
});

const makeBlock = (content: string, createdAt = 0): Block => ({
  id: `b-${content}`,
  threadId: 't1',
  kind: 'text',
  content,
  annotation: null,
  refThreadId: null,
  source: null,
  pinned: false,
  createdAt,
});

describe('buildStatusPrompt', () => {
  it('assembles title, blocks in order, and the verbatim rules', () => {
    const out = buildStatusPrompt(makeThread(), [
      makeBlock('先试了 180 度', 1_000),
      makeBlock('改成 200 度效果更好', 2_000),
    ]);
    expect(out).toContain('蓝莓松饼烘焙');
    expect(out.indexOf('先试了 180 度')).toBeLessThan(out.indexOf('改成 200 度效果更好'));
    expect(out).toContain('1. 只输出一句话,不超过 50 字');
    expect(out).toContain('不要前言、解释、markdown 标记——直接输出那句话');
  });

  it('falls back to (无标题) for an empty title', () => {
    expect(buildStatusPrompt(makeThread({ title: '' }), [makeBlock('x')])).toContain(
      '(无标题)',
    );
  });
});

describe('buildDigestPrompt', () => {
  it('assembles title, pinned blocks as a list, and the NO_DIGEST rule', () => {
    const out = buildDigestPrompt(makeThread(), [
      makeBlock('最终配方是 200 度 25 分钟'),
      makeBlock('用冷冻蓝莓不会沉底'),
    ]);
    expect(out).toContain('蓝莓松饼烘焙');
    expect(out).toContain('- 最终配方是 200 度 25 分钟');
    expect(out).toContain('- 用冷冻蓝莓不会沉底');
    expect(out).toContain(
      '如果置顶内容过于零碎、无法形成有意义的结论,只输出一行:NO_DIGEST',
    );
  });

  it('inlines a pinned block attachment\'s extracted text under the block (§20.3)', () => {
    const pinned = makeBlock('最终配方是 200 度 25 分钟');
    const attachment = makeAttachment({
      blockId: pinned.id,
      label: 'recipe.pdf',
      extractedText: '面糊静置 30 分钟，烤至金黄。',
      extractionKind: 'pdf',
    });
    const out = buildDigestPrompt(makeThread(), [pinned], { [pinned.id]: [attachment] });
    expect(out).toContain('- 最终配方是 200 度 25 分钟');
    expect(out).toContain('📎 附件「recipe.pdf」(pdf) 内容:');
    expect(out).toContain('面糊静置 30 分钟，烤至金黄。');
  });

  it('inlines pinned-block attachments regardless of include_in_pack (§20.3)', () => {
    // Pinning is the opt-in signal for the digest — include_in_pack governs the full
    // pack only. A pinned block's attachment text always rides along.
    const pinned = makeBlock('最终配方');
    const attachment = makeAttachment({
      blockId: pinned.id,
      extractedText: '关键步骤说明',
      extractionKind: 'pdf',
      includeInPack: false,
    });
    const out = buildDigestPrompt(makeThread(), [pinned], { [pinned.id]: [attachment] });
    expect(out).toContain('关键步骤说明');
  });

  it('truncates extracted text longer than 8000 chars with a marker', () => {
    const long = 'x'.repeat(8500);
    const pinned = makeBlock('big file');
    const attachment = makeAttachment({
      blockId: pinned.id,
      extractedText: long,
      extractionKind: 'pdf',
    });
    const out = buildDigestPrompt(makeThread(), [pinned], { [pinned.id]: [attachment] });
    expect(out).toContain('[... truncated, 500 more chars not shown ...]');
    expect(out).toContain('x'.repeat(8000));
    expect(out).not.toContain('x'.repeat(8001));
  });

  it('skips attachments with empty or null extracted text', () => {
    const pinned = makeBlock('content');
    const empty = makeAttachment({ blockId: pinned.id, extractedText: '   ' });
    const missing = makeAttachment({ blockId: pinned.id, id: 'a-2', extractedText: null });
    const out = buildDigestPrompt(makeThread(), [pinned], { [pinned.id]: [empty, missing] });
    expect(out).not.toContain('📎 附件');
  });

  it('keeps existing call sites working with no attachmentsByBlock argument', () => {
    // The new param is defaulted to {} so the CompleteThreadPanel path that pre-dates
    // v2.8 still produces the un-augmented prompt.
    const out = buildDigestPrompt(makeThread(), [makeBlock('线索')]);
    expect(out).toContain('- 线索');
    expect(out).not.toContain('📎 附件');
  });
});

describe('buildRoutePrompt', () => {
  it('assembles the new content, candidate threads, and the JSON contract', () => {
    const out = buildRoutePrompt('烤箱预热到 200 度', [
      { id: 't-123', title: '蓝莓松饼烘焙', recentSnippet: '试了 180 度' },
      { id: 't-456', title: '报税', recentSnippet: '收齐发票' },
    ]);
    expect(out).toContain('烤箱预热到 200 度');
    expect(out).toContain('id: t-123');
    expect(out).toContain('标题: 蓝莓松饼烘焙');
    expect(out).toContain('id: t-456');
    expect(out).toContain('"confidence": "high | medium | low"');
    expect(out).toContain('宁可保守:不确定就 null 或 low,绝不硬塞');
  });
});
