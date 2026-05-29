import { beforeEach, describe, expect, it } from 'vitest';
import {
  clear,
  invalidate,
  peekLastValid,
  popLastValid,
  push,
  snapshot,
  type UndoEntry,
} from './undoLog';

// Minimal capture entry — the ring buffer is payload-agnostic, so a single kind suffices.
const entry = (blockId: string): UndoEntry => ({
  id: blockId,
  kind: 'capture',
  timestamp: Date.now(),
  payload: { blockId, threadId: 't', content: blockId },
  affectedBlockIds: [blockId],
  invalidated: false,
});

describe('undoLog ring buffer (§9.13)', () => {
  beforeEach(() => clear());

  it('caps the ring at the last 10 entries', () => {
    for (let i = 0; i < 12; i++) push(entry(`b${i}`));
    const ids = snapshot().map((e) => e.id);
    expect(ids).toHaveLength(10);
    // Oldest two (b0, b1) dropped; newest (b11) retained.
    expect(ids).toEqual([
      'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11',
    ]);
  });

  it('skips an invalidated entry and returns the next valid one', () => {
    push(entry('a'));
    push(entry('b'));
    invalidate('b'); // newest is now invalid
    expect(peekLastValid()?.id).toBe('a');
  });

  it('pop returns the newest valid entry, not an invalidated older one', () => {
    push(entry('a'));
    invalidate('a');
    push(entry('b'));
    const popped = popLastValid();
    expect(popped?.id).toBe('b');
    // 'a' is still in the ring (invalidated, never popped); a second pop finds nothing valid.
    expect(popLastValid()).toBeNull();
  });

  it('returns null when every entry is invalidated', () => {
    push(entry('a'));
    push(entry('b'));
    invalidate('a');
    invalidate('b');
    expect(peekLastValid()).toBeNull();
    expect(popLastValid()).toBeNull();
  });

  it('clear() empties the ring', () => {
    push(entry('a'));
    push(entry('b'));
    clear();
    expect(snapshot()).toHaveLength(0);
    expect(peekLastValid()).toBeNull();
  });

  it('invalidates a highlight entry when its block is edited afterward (§9.13)', () => {
    const highlight: UndoEntry = {
      id: 'h',
      kind: 'highlight',
      timestamp: Date.now(),
      payload: { blockId: 'h', threadId: 't', beforeContent: 'before' },
      affectedBlockIds: ['h'],
      invalidated: false,
    };
    push(highlight);
    invalidate('h'); // a later content/annotation edit to the block
    expect(peekLastValid()).toBeNull();
    expect(popLastValid()).toBeNull();
  });
});
