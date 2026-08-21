import { describe, expect, it } from 'vitest';
import { bandOf } from './band';

describe('bandOf', () => {
  // 渲染器自己就是这么判的：没有 source = 用户自己敲的。这一条是事实，不是推测。
  it('没有来源 = 💭 你自己写的', () => {
    expect(bandOf({ source: null, content: '随便写点什么' })).toBe('personal');
  });

  // pack 原文写着：AI 来源的块「not clearly a dialogue trace belongs here rather than
  // in 🔄 Process — that is the default」。
  it('AI 来源默认算 🧩，不是 🔄', () => {
    expect(bandOf({ source: '重新设计Spool宣传物料 - Claude', content: '# 一篇长文\n\n三段解释。' })).toBe(
      'synthesis',
    );
  });

  it('明显是对话记录才算 🔄', () => {
    const chat = ['我: 这个怎么办', 'AI: 你可以这样', '我: 那另一种呢'].join('\n');
    expect(bandOf({ source: 'ChatGPT', content: chat })).toBe('process');
  });

  it('正文里出现一次「我:」不算一轮对话', () => {
    expect(bandOf({ source: 'Claude', content: '他说 我: 是个梗，然后继续讲。' })).toBe('synthesis');
  });

  it('其余算 📖', () => {
    expect(bandOf({ source: 'Safari', content: '招生页上的一段话' })).toBe('reference');
    expect(bandOf({ source: 'Mail', content: '录取通知' })).toBe('reference');
  });

  // MCP 写进来的块是另一个 AI 写的，按 🧩 —— 和 sourceIcon 的 Bot 图标同源。
  it('MCP 写进来的算 🧩', () => {
    expect(bandOf({ source: 'Claude Desktop · MCP', content: '一段整理' })).toBe('synthesis');
  });
});
