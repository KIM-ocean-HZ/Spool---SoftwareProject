// §17 "AI pack compression" (pulled forward from v1.5; router was ready, this is the
// prompt). NOT a §12 verbatim-locked prompt — it ships with the feature and is tunable.
// Contract with PackDialog: the model returns a complete briefing in the same skeleton;
// the deterministic original is never replaced, only toggled — compression is disposable
// decoration (§2.5.5 / §6.3), and the 💭 Personal material (notes, sourceless entries,
// highlights) must survive verbatim because it is the pack's unique signal (§2.5.1).
export const buildCompressPackPrompt = (packText: string) =>
  `
你是一个上下文压缩工具。下面是一份由 Spool 生成的项目上下文简报,它太长了。把它压缩成一份更短但信息完整的版本,供粘贴给另一个 AI 使用。

# 原始简报
${packText}

# 规则
1. 完整保留文档骨架,以下部分一字不改地照抄:开头的 "# Project Context" 标题块、"## How to Read This Context" 整节、"## Pinned Blocks" 整节、"## Related Files & Links" 整节、"## Output Language" 整节,以及任何 "---" 之后的任务指令块
2. 只压缩 "## Full Record" 一节:合并重复信息,压缩冗长的引用和文件提取内容,保留每条的 [时间戳 · from 来源] 格式
3. "## Full Record" 里以下内容一字不改地保留:所有 note: 行(用户批注)、所有不带来源标注的条目(用户手写内容)、所有 ==...== 高亮片段
4. 绝对不要添加原始简报里没有的信息,不要评论,不要总结陈词
5. 直接输出压缩后的完整简报——不要前言、解释或代码块标记
`.trim();
