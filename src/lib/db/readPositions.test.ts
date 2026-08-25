import { describe, expect, it } from 'vitest';
import { resolveLanding } from './readPositions';

// V1 (WORKPLAN §2.V1). The DB halves are two statements; the rules live in resolveLanding.
const blocks = [
  { id: 'a', createdAt: 100 },
  { id: 'b', createdAt: 200 },
  { id: 'c', createdAt: 300 },
];

describe('resolveLanding', () => {
  it('returns to the remembered block when nothing has changed', () => {
    expect(resolveLanding({ blockId: 'b', lastBlockAt: 300 }, blocks)).toEqual({
      at: 'block',
      blockId: 'b',
    });
  });

  it('lands at the bottom when a project has never been read', () => {
    expect(resolveLanding(null, blocks)).toEqual({ at: 'bottom' });
  });

  it('lands at the bottom when new blocks arrived while away', () => {
    // ⭐ The rule Ocean did not ask for: coming back to your old spot would leave the new
    // material below the fold, and 「有新的」 is why the project was opened.
    expect(resolveLanding({ blockId: 'a', lastBlockAt: 200 }, blocks)).toEqual({ at: 'bottom' });
  });

  it('treats a block arriving at the exact remembered timestamp as not new', () => {
    // Boundary: `lastBlockAt` IS the newest block's own timestamp at save time, so equality
    // is the normal case, not a new arrival.
    expect(resolveLanding({ blockId: 'b', lastBlockAt: 300 }, blocks)).toEqual({
      at: 'block',
      blockId: 'b',
    });
  });

  it('falls back to the bottom when the remembered block is gone', () => {
    expect(resolveLanding({ blockId: 'deleted', lastBlockAt: 300 }, blocks)).toEqual({
      at: 'bottom',
    });
  });

  it('lands at the bottom for an empty feed', () => {
    expect(resolveLanding({ blockId: 'a', lastBlockAt: 100 }, [])).toEqual({ at: 'bottom' });
  });
});
