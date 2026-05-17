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
  createdAt: T(0),
  ...opts,
});

describe('assemble', () => {
  it('handles an empty thread', () => {
    const out = assemble({ thread, blocks: [], now: NOW });
    expect(out).toContain('# 项目：论文文献综述');
    expect(out).toContain('共 0 条记录');
    expect(out).toContain('（暂无置顶的关键信息）');
    expect(out).toContain('（暂无记录）');
    expect(out).not.toContain('## 下一步');
    expect(out).not.toContain('## 相关文件与链接');
  });

  it('renders plain text blocks with timestamps', () => {
    const blocks = [
      textBlock('b1', 'first thought', { createdAt: T(10) }),
      textBlock('b2', 'second thought', { createdAt: T(20), source: 'Notion' }),
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toMatch(/\[2026-05-15 09:10\] first thought/);
    expect(out).toMatch(/\[2026-05-15 09:20 · 来自 Notion\] second thought/);
  });

  it('lifts pinned blocks into the Key Information section', () => {
    const blocks = [
      textBlock('b1', 'background noise'),
      textBlock('b2', 'pinned key insight', { pinned: true }),
    ];
    const out = assemble({ thread, blocks, now: NOW });
    const lines = out.split('\n');
    const keyIdx = lines.indexOf('## 关键信息');
    const logIdx = lines.indexOf('## 完整记录');
    expect(keyIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(keyIdx);
    const keySection = lines.slice(keyIdx, logIdx).join('\n');
    expect(keySection).toContain('pinned key insight');
    expect(keySection).not.toContain('background noise');
  });

  it('renders a block annotation indented beneath it', () => {
    const blocks = [textBlock('b1', 'kickoff note', { annotation: '这条要重点跟进' })];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('    备注：这条要重点跟进');
  });

  it('lists a block attachment inline and in the Related Files & Links section', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [attachment('a1', 'b1')];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    附件：paper.pdf');
    expect(out).toContain('## 相关文件与链接');
    expect(out).toContain('- paper.pdf — /Users/x/Desktop/paper.pdf');
  });

  it('falls back to the target when an attachment label is empty', () => {
    const blocks = [textBlock('b1', 'kickoff note')];
    const attachments = [
      attachment('a1', 'b1', { kind: 'url', target: 'https://example.com/spec', label: '' }),
    ];
    const out = assemble({ thread, blocks, attachments, now: NOW });
    expect(out).toContain('    附件：https://example.com/spec');
    expect(out).toContain('- https://example.com/spec — https://example.com/spec');
  });

  it('renders ref blocks using the refTitles map', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', 'old snapshot title'), kind: 'ref', refThreadId: 't2' },
    ];
    const refTitles = new Map([['t2', '相关脉络的最新标题']]);
    const out = assemble({ thread, blocks, refTitles, now: NOW });
    expect(out).toContain('→ 引用脉络：相关脉络的最新标题');
    expect(out).not.toContain('old snapshot title');
  });

  it('falls back to the ref snapshot title when refTitles is empty', () => {
    const blocks: Block[] = [
      { ...textBlock('b1', '脉络快照标题'), kind: 'ref', refThreadId: 't2' },
    ];
    const out = assemble({ thread, blocks, now: NOW });
    expect(out).toContain('→ 引用脉络：脉络快照标题');
  });

  it('is a pure function (no globals, no side effects)', () => {
    const blocks = [textBlock('b1', 'hi')];
    const a = assemble({ thread, blocks, now: NOW });
    const b = assemble({ thread, blocks, now: NOW });
    expect(a).toBe(b);
  });
});
