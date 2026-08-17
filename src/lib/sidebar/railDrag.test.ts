import { describe, expect, it } from 'vitest';
import type { Thread } from '@/lib/db/threads';
import { threadsToMove } from './railDrag';

const th = (id: string, workspaceId: string): Thread => ({
  id,
  workspaceId,
  title: id,
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  autoMaintain: null,
});

const all = [th('a', '升学'), th('b', '升学'), th('c', '求职')];

describe('threadsToMove', () => {
  it('moves a single project into another workspace', () => {
    expect(threadsToMove(['a'], all, '求职')).toEqual(['a']);
  });

  it('drops the rows that are already there, and moves the rest', () => {
    // The whole point of dragging a mixed selection onto 求职: c is home already.
    expect(threadsToMove(['a', 'b', 'c'], all, '求职')).toEqual(['a', 'b']);
  });

  it('is empty when the drop would change nothing', () => {
    expect(threadsToMove(['a', 'b'], all, '升学')).toEqual([]);
  });

  it('ignores ids that no longer exist', () => {
    // A row deleted by another window mid-drag must not be re-created by the drop.
    expect(threadsToMove(['a', 'gone'], all, '求职')).toEqual(['a']);
  });
});
