import { describe, expect, it } from 'vitest';
import type { SearchHit } from '@/lib/search/query';
import { countMatches } from './searchStore';

// ⭐ 2026-08-27（Ocean:「搜索的计数有歧义」）。查找条上原来那两个数在数不同的东西，
// 而「这个项目里一共多少处」一个都答不上。这一组把四个数各自数什么钉死。
const hit = (blockId: string, threadId: string, hits: number): SearchHit => ({
  blockId,
  threadId,
  threadTitle: '',
  workspaceId: 'w',
  workspaceTitle: '',
  createdAt: 0,
  field: 'content',
  snippet: [],
  gist: null,
  hitOffsets: Array.from({ length: hits }, (_, i) => ({
    field: 'content' as const,
    start: i,
    end: i + 1,
  })),
});

describe('countMatches', () => {
  it('处和块分开数 —— 一块里有五处就是五处、一块', () => {
    const c = countMatches([hit('b1', 't1', 5)], 't1');
    expect(c.threadHits).toBe(5);
    expect(c.threadBlocks).toBe(1);
    expect(c.allHits).toBe(5);
    expect(c.allBlocks).toBe(1);
  });

  it('本项目只数本项目的，全部数所有的', () => {
    const c = countMatches(
      [hit('b1', 't1', 2), hit('b2', 't1', 3), hit('b3', 't2', 4)],
      't1',
    );
    expect(c.threadHits).toBe(5);
    expect(c.threadBlocks).toBe(2);
    expect(c.allHits).toBe(9);
    expect(c.allBlocks).toBe(3);
  });

  it('命中全在别的项目时，本项目是 0 —— ⛔ 不是把全部的数字搬过来', () => {
    const c = countMatches([hit('b1', 't2', 4)], 't1');
    expect(c.threadHits).toBe(0);
    expect(c.threadBlocks).toBe(0);
    expect(c.allHits).toBe(4);
    expect(c.allBlocks).toBe(1);
  });

  it('一条结果都没有的时候四个数都是 0', () => {
    expect(countMatches([], 't1')).toEqual({
      threadHits: 0,
      threadBlocks: 0,
      allHits: 0,
      allBlocks: 0,
    });
  });
});
