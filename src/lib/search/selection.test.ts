import { describe, expect, it } from 'vitest';
import { usableSearchTerm } from './selection';

// 划词 + ⌘F（2026-08-27）。取选区那一半要 DOM（这些测试跑在 node 环境里），能测的是三条
// 「什么算一个搜索词」的规则 —— 而它们正是这个功能会出错的地方。

describe('usableSearchTerm', () => {
  it('把划中的词原样交出去，两头的空白剪掉', () => {
    expect(usableSearchTerm('压缩')).toBe('压缩');
    expect(usableSearchTerm('  deadline  ')).toBe('deadline');
  });

  it('没划中任何东西 = 不预填', () => {
    // ⚠️ 空串在这里不是错误，是「照常开一个空的搜索框」。
    expect(usableSearchTerm('')).toBe('');
    expect(usableSearchTerm('   ')).toBe('');
  });

  it('跨行的选区不预填 —— 那是一段，不是一个词', () => {
    // 和别的编辑器一致：拿一整段去做全文搜索，一条都查不到，还把搜索框塞满。
    expect(usableSearchTerm('第一行\n第二行')).toBe('');
  });

  it('太长的一段不预填', () => {
    expect(usableSearchTerm('字'.repeat(80))).toBe('字'.repeat(80));
    expect(usableSearchTerm('字'.repeat(81))).toBe('');
  });
});
