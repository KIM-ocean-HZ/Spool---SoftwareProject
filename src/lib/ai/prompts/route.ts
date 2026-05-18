// Prompt body copied verbatim from PLAN_EN.md §12.3 — core product IP, not to be
// "optimized" in implementation (§18 rule 5).
export const buildRoutePrompt = (
  blockContent: string,
  threads: { id: string; title: string; recentSnippet: string }[]
) => `
你是一个信息归类工具。判断下面这条新捕捉的内容,最可能属于哪一条已有项目脉络。

# 新捕捉的内容
${blockContent}

# 已有项目脉络
${threads.map(t => `- id: ${t.id}\n  标题: ${t.title}\n  最近内容: ${t.recentSnippet}`).join('\n')}

# 输出(仅 JSON,无其他文字、无代码块标记)
{
  "threadId": "最匹配的脉络 id,如果都不像就填 null",
  "confidence": "high | medium | low"
}

# 规则
1. 只有内容上明确相关才给 high/medium;勉强沾边给 low
2. 宁可保守:不确定就 null 或 low,绝不硬塞
`.trim();
