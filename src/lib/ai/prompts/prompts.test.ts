import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { buildDigestPrompt } from './summarizeDigest';
import { buildRoutePrompt } from './route';
import { buildStatusPrompt } from './summarizeStatus';

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
