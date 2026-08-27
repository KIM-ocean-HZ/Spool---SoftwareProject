import { describe, expect, it } from 'vitest';
import {
  BLOCK_FONT_ATTR,
  BLOCK_FONT_SIZES,
  DEFAULT_BLOCK_FONT,
  applyBlockFont,
  blockFontOrDefault,
  isBlockFontSize,
} from './blockFont';

// 正文字号三档（2026-08-27）。和 theme.test.ts 同一组不变量，同一个理由。

describe('blockFont', () => {
  it('默认是「中」——也就是已发布版本的字号', () => {
    // ⚠️ 这条一翻，所有老用户换装之后正文会自己变大或变小，而他们没动过任何开关。
    expect(DEFAULT_BLOCK_FONT).toBe('medium');
    expect([...BLOCK_FONT_SIZES]).toEqual(['small', 'medium', 'large']);
  });

  it('认不出来的值退回「中」，而不是退回一个没有字号的页面', () => {
    // settings.json 是可以手改的，也可能是从别的版本搬过来的库（DESIGN_LIBRARY_TRANSFER）。
    expect(blockFontOrDefault('small')).toBe('small');
    expect(blockFontOrDefault('large')).toBe('large');
    expect(blockFontOrDefault('huge')).toBe('medium');
    expect(blockFontOrDefault(undefined)).toBe('medium');
    expect(blockFontOrDefault(18)).toBe('medium');
  });

  it('只认这三个词', () => {
    expect(isBlockFontSize('medium')).toBe(true);
    expect(isBlockFontSize('Medium')).toBe(false);
    expect(isBlockFontSize('')).toBe(false);
  });

  it('「中」也照写不误 —— 属性在，才分得出「选了中」和「还没读到设置」', () => {
    const attrs: Record<string, string> = {};
    const el = {
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
    } as unknown as Element;
    applyBlockFont('medium', el);
    expect(attrs[BLOCK_FONT_ATTR]).toBe('medium');
    applyBlockFont('large', el);
    expect(attrs[BLOCK_FONT_ATTR]).toBe('large');
  });
});
