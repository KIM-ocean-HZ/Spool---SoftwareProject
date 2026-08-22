// 四带 —— pack 自己那套权威分级，搬到界面上（WORKPLAN §9.6.5）。
//
// Ocean 点名要的：「转移到右侧面板后应该使用渲染后文本，但是仍然体现出 personal 等等这种
// 文本地位」。核对一份压缩稿的时候，一块是**用户自己写的**还是**某个 AI 的长篇解释**，
// 决定了「删掉它要紧不要紧」——而那正是这个界面要用户判断的事。
//
// ⚠️⚠️ **这里用的是 pack 自己写在 `## How to Read This Context` 里的规则，一字不另立。**
// 那段文字是给收件的 AI 读的分级说明，界面照着同一套分，两边才不会对同一块说两种话。
//
// ⚠️ 但有一条要老实说：**渲染器故意只印 💭 和 📌**（templates.ts v22 那段注释：
// 📖 / 🧩 / 🔄「need the content read, so they stay the receiving model's call」）。
// 所以：
//
//   * `💭` 是**事实**——块上没有 `source`，渲染器自己就是这么判的；
//   * `🧩` / `🔄` 的分界要读内容，这里按 pack 原文写的那条默认走：
//     **AI 来源的块默认算 🧩，只有明显是对话记录（多轮、短交替、`User:` / `Q:` / `我:`
//     这类行首标记）才算 🔄**；
//   * 其余算 `📖`。
//
// ⛔ **分带只从原块取，不从压缩稿猜**（§9.6.5）——压缩稿是被审查的一方。
//
// ⚠️ D6（2026-08-22，Ocean 原话「🧩 别人的整理这个提示不知所云，写的明确一点，
// 并且**再次**提醒你，少用 emoji，看起来不专业」）：
//
//   * 名字换成说得清的，**四个一起换**（只换一个，四带就不像一家人了）。
//     「别人的整理」既没说是谁整理的，也没说整理的是什么 —— 现在直接写「AI 写的整理稿」，
//     它旁边那一带跟着写成「和 AI 的对话」，两带的分界（成篇文章 / 一问一答）从名字上就看得出来。
//   * **界面上那个 emoji 记号撤了**，卡片头上只留名字。
//     ⚠️ **pack 里的记号一个没动**（`templates.ts` / `mcp.rs` 那份表头照旧印 💭 📌 🗜）——
//     那是给收件 AI 读的记法，是对外的格式契约，和「界面好不好看」是两件事。

import { isMcpSource } from './sourceIcon';

export type Band = 'personal' | 'reference' | 'synthesis' | 'process';

export const BAND_LABEL: Record<Band, string> = {
  personal: '你自己写的',
  reference: '来源材料',
  synthesis: 'AI 写的整理稿',
  process: '和 AI 的对话',
};

/** 权威从高到低那句话，鼠标停上去看得到 —— 和 pack 里给 AI 读的是同一套说法。 */
export const BAND_HINT: Record<Band, string> = {
  personal: '没有来源标注 = 你自己敲进 Spool 的。pack 里权威最高的一带。',
  reference: '来自邮件、机构页面、文件这类材料。pack 把它当作事实基准。',
  synthesis: '另一个 AI 写的成篇解释。可以拿来当框架，不能当事实。',
  process: '和另一个 AI 的一问一答。里面的答案不可靠，可靠的是你反复在问什么。',
};

// AI 工具作来源。和 sourceIcon 那张表里最后一条同源（那条也是「聊天助手放最后」）。
const AI_SOURCE = /chatgpt|gpt|gemini|claude|copilot|openai|deepseek|kimi|豆包|文心|通义/i;
// 对话形状：行首的说话人标记。⚠️ 只认行首 —— 正文里出现一个「我:」不算一轮对话。
const TURN = /^\s*(?:user|assistant|human|ai|q|a|我|你|问|答)\s*[:：]/i;

export const bandOf = (block: { source: string | null; content: string }): Band => {
  if (!block.source) return 'personal';
  if (isMcpSource(block.source) || AI_SOURCE.test(block.source)) {
    const turns = block.content.split('\n').filter((l) => TURN.test(l)).length;
    return turns >= 2 ? 'process' : 'synthesis';
  }
  return 'reference';
};
