import { describe, expect, it } from 'vitest';
import { indexAtOffset, stepBlockIndex } from './viewportAnchor';

// V2 ② / ③ (WORKPLAN §2.V2). The DOM halves of viewportAnchor.ts are rect reads with no
// decisions in them; these two carry the decisions.
const ids = ['a', 'b', 'c'];

describe('stepBlockIndex', () => {
  it('walks one block at a time in both directions', () => {
    expect(stepBlockIndex(ids, 'a', 1)).toBe('b');
    expect(stepBlockIndex(ids, 'b', 1)).toBe('c');
    expect(stepBlockIndex(ids, 'c', -1)).toBe('b');
  });

  it('clamps at both ends instead of wrapping', () => {
    // ⚠️ The point of the whole helper: ↓ on the newest block must STAY on the newest block.
    // Wrapping here would silently throw the reader back to the top of the project.
    expect(stepBlockIndex(ids, 'c', 1)).toBe('c');
    expect(stepBlockIndex(ids, 'a', -1)).toBe('a');
  });

  it('starts from the near end when there is no cursor yet', () => {
    expect(stepBlockIndex(ids, null, 1)).toBe('a');
    expect(stepBlockIndex(ids, null, -1)).toBe('c');
  });

  it('treats a cursor that is no longer in the feed as no cursor', () => {
    // Happens for real: the cursor block gets deleted, or scrolls out of the tail window.
    expect(stepBlockIndex(ids, 'gone', 1)).toBe('a');
  });

  it('has nothing to say about an empty feed', () => {
    expect(stepBlockIndex([], null, 1)).toBeNull();
    expect(stepBlockIndex([], 'a', -1)).toBeNull();
  });
});

describe('indexAtOffset', () => {
  // 透镜把当前那根摊开、远处的压扁 —— 所以每根的高度都不一样,这正是它存在的理由。
  const lensed = [4, 4, 20, 4, 4];

  it('lands on the tick the pointer is actually over', () => {
    expect(indexAtOffset(lensed, 0)).toBe(0);
    expect(indexAtOffset(lensed, 5)).toBe(1);
    expect(indexAtOffset(lensed, 10)).toBe(2);
    expect(indexAtOffset(lensed, 27)).toBe(2);
    expect(indexAtOffset(lensed, 29)).toBe(3);
    expect(indexAtOffset(lensed, 33)).toBe(4);
  });

  it('⚠️ 按比例算会点到隔壁块 —— 换掉 ratioToBlockIndex 就是为了这个', () => {
    // 10px 那个位置上坐着的是第 2 根（透镜把它摊开了）；按比例算得到的是第 1 根。
    expect(indexAtOffset(lensed, 10)).toBe(2);
    expect(Math.round((10 / 36) * (lensed.length - 1))).toBe(1);
  });

  it('clamps a drag that has left the rail', () => {
    expect(indexAtOffset(lensed, -40)).toBe(0);
    expect(indexAtOffset(lensed, 999)).toBe(4);
  });

  it('reports nothing for an empty rail', () => {
    expect(indexAtOffset([], 12)).toBe(-1);
  });
});
