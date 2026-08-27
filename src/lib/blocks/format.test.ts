import { describe, expect, it } from 'vitest';
import { applyBlockFormat, formatAt } from './format';

// ⑧（2026-08-27，Ocean:「去掉第一行自动加粗，换成手动排版三档：标题 / 正文 / 斜体」）。
// 三档写进正文的 markdown 记号里，⛔ 不新开数据库字段 —— 所以这一组测的就是
// 「按下那个按钮之后，那段字变成了什么样」。

describe('applyBlockFormat', () => {
  it('标题：整行前面加 #，光标停在哪儿都算整行', () => {
    const r = applyBlockFormat('第一行\n第二行', 5, 5, 'heading');
    expect(r.text).toBe('第一行\n# 第二行');
  });

  it('已经是标题再按一次标题，⛔ 不会叠成 ## #', () => {
    const once = applyBlockFormat('一句话', 0, 0, 'heading');
    const twice = applyBlockFormat(once.text, 0, 0, 'heading');
    expect(twice.text).toBe('# 一句话');
  });

  it('正文：把 # 和 *…* 都摘掉', () => {
    expect(applyBlockFormat('## 标题', 0, 0, 'body').text).toBe('标题');
    expect(applyBlockFormat('*斜的*', 0, 0, 'body').text).toBe('斜的');
    expect(applyBlockFormat('# *两个都有*', 0, 0, 'body').text).toBe('两个都有');
  });

  it('斜体：划中半句就只斜半句', () => {
    // 前(0)面(1) (2)中(3)间(4) (5)后(6)面(7) —— 划中的是「中间」。
    const r = applyBlockFormat('前面 中间 后面', 3, 5, 'italic');
    expect(r.text).toBe('前面 *中间* 后面');
    // 选区跟着包好的那一段走 —— ⛔ 不许把光标扔到末尾。
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('*中间*');
  });

  it('斜体：没划选区就斜整行', () => {
    expect(applyBlockFormat('整整一行', 2, 2, 'italic').text).toBe('*整整一行*');
  });

  it('斜体按第二次是取消（选中整段记号，或只选中里面的字）', () => {
    expect(applyBlockFormat('*斜的*', 0, 4, 'italic').text).toBe('斜的');
    expect(applyBlockFormat('*斜的*', 1, 3, 'italic').text).toBe('斜的');
  });

  it('标题行上按斜体：先把 # 摘掉，⛔ 不做又是标题又是斜体的一行', () => {
    expect(applyBlockFormat('# 标题', 3, 3, 'italic').text).toBe('*标题*');
  });

  it('空行按标题不会留下一个孤零零的 #', () => {
    // 上(0)面(1)\n(2)\n(3)下(4)面(5) —— 光标 3 落在中间那个空行上。
    expect(applyBlockFormat('上面\n\n下面', 3, 3, 'heading').text).toBe('上面\n\n下面');
  });

  it('多行选区：每一行各自套上', () => {
    const r = applyBlockFormat('甲\n乙\n丙', 0, 3, 'heading');
    expect(r.text).toBe('# 甲\n# 乙\n丙');
  });

  it('别的行一个字都不动', () => {
    const text = '不许动的一行\n要改的一行\n也不许动';
    const r = applyBlockFormat(text, 7, 7, 'heading');
    expect(r.text.split('\n')[0]).toBe('不许动的一行');
    expect(r.text.split('\n')[2]).toBe('也不许动');
  });
});

describe('formatAt', () => {
  it('说得出光标那一行现在是哪一档', () => {
    expect(formatAt('# 标题', 2, 2)).toBe('heading');
    expect(formatAt('*斜的*', 0, 0)).toBe('italic');
    expect(formatAt('普通一行', 1, 1)).toBe('body');
  });

  it('多行文本里认的是光标那一行，⛔ 不是第一行', () => {
    expect(formatAt('# 标题\n普通', 6, 6)).toBe('body');
  });
});
