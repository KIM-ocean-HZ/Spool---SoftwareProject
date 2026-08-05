import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/db/blocks';
import { ACTIVITY_GAP_MS, countAiBlocks, groupAiActivity } from './activity';

const block = (id: string, createdAt: number, source: string | null): Block => ({
  id,
  threadId: 't',
  kind: 'text',
  content: id,
  annotation: null,
  refThreadId: null,
  refBlockId: null,
  source,
  pinned: false,
  seq: null,
  createdAt,
});

const T = 1_700_000_000_000;

describe('AI activity grouping (DESIGN_AI_ENGINE M3)', () => {
  it('ignores everything the user or a capture wrote', () => {
    const blocks = [
      block('user', T, null),
      block('capture', T + 1, 'Safari'),
      block('pdf', T + 2, 'lecture-11.pdf'),
      block('ai', T + 3, 'Claude · MCP'),
    ];
    expect(groupAiActivity(blocks).flatMap((g) => g.blocks.map((b) => b.id))).toEqual(['ai']);
    expect(countAiBlocks(blocks)).toBe(1);
  });

  it('treats one write burst as a single visit, newest first', () => {
    const blocks = [
      block('a', T, 'Claude · MCP'),
      block('b', T + 4000, 'Claude · MCP'),
      block('c', T + 9000, 'Claude · MCP'),
    ];
    const groups = groupAiActivity(blocks);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.blocks.map((b) => b.id)).toEqual(['c', 'b', 'a']);
    // The group is dated by its newest block — that is what "when did the AI touch this"
    // means to someone scanning the panel.
    expect(groups[0]!.at).toBe(T + 9000);
  });

  it('splits when the same client comes back later', () => {
    const groups = groupAiActivity([
      block('morning', T, 'Claude · MCP'),
      block('afternoon', T + ACTIVITY_GAP_MS + 1, 'Claude · MCP'),
    ]);
    expect(groups.map((g) => g.blocks.map((b) => b.id))).toEqual([['afternoon'], ['morning']]);
  });

  it('keeps a burst together right up to the gap', () => {
    const groups = groupAiActivity([
      block('first', T, 'Claude · MCP'),
      block('last', T + ACTIVITY_GAP_MS, 'Claude · MCP'),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('never merges two different clients, however close in time', () => {
    const groups = groupAiActivity([
      block('claude', T, 'Claude · MCP'),
      block('cursor', T + 1000, 'Cursor · MCP'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.source)).toEqual(['Cursor · MCP', 'Claude · MCP']);
  });

  it('measures the gap from the oldest block already in the visit, not the newest', () => {
    // A slow chain of writes 6 minutes apart is one continuous run; comparing each new
    // block against the group's NEWEST would break it into three.
    const step = 6 * 60 * 1000;
    const groups = groupAiActivity([
      block('a', T, 'Claude · MCP'),
      block('b', T + step, 'Claude · MCP'),
      block('c', T + 2 * step, 'Claude · MCP'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.blocks).toHaveLength(3);
  });

  it('says nothing about a thread no AI has touched', () => {
    expect(groupAiActivity([block('user', T, null)])).toEqual([]);
    expect(groupAiActivity([])).toEqual([]);
  });
});
