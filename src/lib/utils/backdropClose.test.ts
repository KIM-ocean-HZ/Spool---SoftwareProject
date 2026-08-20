import { describe, expect, it } from 'vitest';
import { createBackdropClose } from './backdropClose';

// 遮罩和面板各是一个元素；事件的 currentTarget 永远是遮罩。
const BACKDROP = { id: 'backdrop' };
const INPUT = { id: 'input' };
const ev = (target: object) => ({ target, currentTarget: BACKDROP });

describe('遮罩点击关闭', () => {
  it('在遮罩上按下、在遮罩上松开 —— 关', () => {
    let closed = 0;
    const h = createBackdropClose(() => closed++);
    h.onMouseDown(ev(BACKDROP));
    h.onClick(ev(BACKDROP));
    expect(closed).toBe(1);
  });

  // 这条就是 Ocean 报的那个 bug：从输入框里划选文字，划出了面板，在遮罩上松手。
  it('从输入框里划出来、在遮罩上松开 —— 不关', () => {
    let closed = 0;
    const h = createBackdropClose(() => closed++);
    h.onMouseDown(ev(INPUT));
    h.onClick(ev(BACKDROP));
    expect(closed).toBe(0);
  });

  it('划出去一次之后，下一次真的点遮罩仍然要能关', () => {
    let closed = 0;
    const h = createBackdropClose(() => closed++);
    h.onMouseDown(ev(INPUT));
    h.onClick(ev(BACKDROP));
    h.onMouseDown(ev(BACKDROP));
    h.onClick(ev(BACKDROP));
    expect(closed).toBe(1);
  });

  it('点在面板内部 —— 不关', () => {
    let closed = 0;
    const h = createBackdropClose(() => closed++);
    h.onMouseDown(ev(INPUT));
    h.onClick(ev(INPUT));
    expect(closed).toBe(0);
  });
});
