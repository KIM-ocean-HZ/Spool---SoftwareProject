import { describe, expect, it } from 'vitest';
import { foldPunctuation, locateQuote, quoteIsInBlock } from './quoteFold';

// T4（2026-08-23，第五轮实测）——「引文两把尺子」。
//
// ⚠️ 这一组盯的不是折叠本身，是**长度守恒**和**真的不在里面时仍然找不到**。
// 长度不守恒的话，算出来的下标拿回原文上用就是错的 —— 而错法是「高亮框歪在半个字上」，
// 屏幕上看着还挺像回事。
describe('引文折叠', () => {
  it('折叠不改变长度 —— 下标可以拿回没折叠的正文上用', () => {
    const s = '第一批（三个）：UCLA、CMU；其余「暂缓」——见下。';
    expect(foldPunctuation(s).length).toBe(s.length);
  });

  it('⛔ 数字一个都不折叠', () => {
    expect(foldPunctuation('２０２６ 和 2026')).toBe('２０２６ 和 2026');
  });

  // ⭐ 这就是实测撞到的那一条：压缩把 `个：UCLA` 改写成 `个:UCLA`。
  it('⭐ 压缩把全角标点改成半角之后，那句引文还找得到', () => {
    const before = '第一批三个：UCLA、CMU、UMich。';
    const after = '第一批三个:UCLA,CMU,UMich.';
    const quote = '第一批三个：UCLA';
    expect(before.includes(quote)).toBe(true);
    expect(after.includes(quote)).toBe(false); // 旧尺子：找不到，高亮悄悄消失
    expect(quoteIsInBlock(after, quote)).toBe(true);
    expect(locateQuote(after, quote)).toBe(0);
  });

  it('偏移落在原文坐标上，不是折叠之后的坐标', () => {
    const content = '开头一句。第一批三个：UCLA。';
    const at = locateQuote(content, '第一批三个:UCLA');
    expect(content.slice(at, at + '第一批三个：UCLA'.length)).toBe('第一批三个：UCLA');
  });

  it('真的不在里面的，仍然找不到 —— 尺子松到什么都能对上就成了假高亮', () => {
    expect(quoteIsInBlock('名单里只有 UCLA。', '名单里只有 CMU。')).toBe(false);
    expect(quoteIsInBlock('随便什么', '')).toBe(false);
  });

  // ⚠️ 省略号故意不在表里：提示词明写「不许用省略号」，它是破规矩，不是重打标点。
  it('省略号不算重打', () => {
    expect(foldPunctuation('前面…后面')).toBe('前面…后面');
  });
});
