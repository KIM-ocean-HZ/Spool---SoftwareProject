import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { formatBlockTime as formatTime } from '@/lib/utils/time';

// Prompt body copied verbatim from PLAN_EN.md §12.1 — core product IP, not to be
// "optimized" in implementation (§18 rule 5).
export const buildStatusPrompt = (thread: Thread, blocks: Block[]) => `
你是一个项目状态摘要工具。读下面这条项目脉络里按时间排列的信息块,写一句话总结"这个项目现在到哪一步了"。

# 项目标题
${thread.title || '(无标题)'}

# 信息块(按时间从旧到新)
${blocks.map(b => `[${formatTime(b.createdAt)}] ${b.content}`).join('\n')}

# 规则
1. 只输出一句话,不超过 50 字
2. 聚焦"当前状态 / 下一步",不要复述全部历史
3. 绝对不要添加信息块里没有的内容
4. 不要前言、解释、markdown 标记——直接输出那句话
`.trim();
