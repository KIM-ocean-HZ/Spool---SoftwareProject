import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/db/blocks';
import { ACTIVITY_GAP_MS, countAiBlocks, groupAiActivity, visibleRuns } from './activity';

const block = (id: string, createdAt: number, source: string | null): Block => ({
  id,
  threadId: 't',
  kind: 'text',
  content: id,
  annotation: null,
  annotationBy: null,
  refThreadId: null,
  refBlockId: null,
  source,
  pinned: false,
  seq: null,
  createdAt,
  staleAt: null,
  refKind: null,
  sourceUrl: null,
  retrievedAt: null,
  recheckAfter: null,
  correctedQuote: null,
  gist: null,
  originalContent: null,
  compressedAt: null,
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

// DESIGN_WORKBENCH §9.13 — Ocean 2026-08-07: 「跟进没法删除，也不会消失」.
//
// Worth a test rather than a comment for the reason §6.2-bis gives: synthetic clicks do not
// drive this webview, so "I dismissed the card and it went away" is a sentence no automated
// check in this project can ever verify by pressing the button. What CAN be pinned is the
// rule the button relies on, and that is this function.
describe('visibleRuns', () => {
  const run = (
    id: string,
    threadId: string | null,
    reviewedAt: number | null,
    action = 'distill',
  ): { id: string; action: string; threadId: string | null; reviewedAt: number | null } => ({
    id,
    action,
    threadId,
    reviewedAt,
  });

  it('drops a run the user has answered', () => {
    const runs = [run('open', 't1', null), run('answered', 't1', 1)];
    expect(visibleRuns(runs, 't1').map((r) => r.id)).toEqual(['open']);
  });

  // ⚠️ This is the reverse of what it asserted until 2026-08-11. A weekly review used to be
  // shown in EVERY project's rail (it belongs to no project, so it was treated as belonging
  // everywhere), and Ocean read the result exactly backwards from the intent:
  // 「周回顾出现在了升学规划区？是对应每个规划区一个回顾吗？」. It has its own view now.
  it('never shows a weekly review under a project, because it is about all of them', () => {
    const runs = [run('weekly', null, null, 'weekly_review'), run('mine', 't1', null)];
    expect(visibleRuns(runs, 't1').map((r) => r.id)).toEqual(['mine']);
    expect(visibleRuns(runs, 't2')).toEqual([]);
    expect(visibleRuns(runs, null)).toEqual([]);
  });

  it('never shows another project’s run under this one', () => {
    expect(visibleRuns([run('theirs', 't2', null)], 't1')).toEqual([]);
  });

  it('empties completely once everything has been answered', () => {
    // The whole point of the fix: a rail you have dealt with looks dealt with. Before this,
    // answered cards stayed on screen greyed out and the pile only ever grew.
    const runs = [run('a', 't1', 1), run('b', 't1', 2), run('c', 't1', 3)];
    expect(visibleRuns(runs, 't1')).toEqual([]);
  });
});
