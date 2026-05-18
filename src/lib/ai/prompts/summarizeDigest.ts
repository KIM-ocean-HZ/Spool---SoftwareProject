import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';

// Prompt body copied verbatim from PLAN_EN.md §12.2 — core product IP, not to be
// "optimized" in implementation (§18 rule 5). Rule 4's NO_DIGEST is the small model's
// explicit give-up exit; callers treat it as a generation failure (§12.4).
export const buildDigestPrompt = (thread: Thread, pinnedBlocks: Block[]) => `
你是一个项目结论摘要工具。一个项目刚结束,下面是用户在过程中标记为"重要"的信息块。把它们提炼成一段简短的结论摘要,供日后归档查阅。

# 项目标题
${thread.title || '(无标题)'}

# 用户标记为重要的信息块
${pinnedBlocks.map(b => `- ${b.content}`).join('\n')}

# 规则
1. 输出 2-4 句话,总共不超过 120 字
2. 聚焦"最终结论 / 关键决定 / 可复用的东西",不要复述过程
3. 绝对不要添加信息块里没有的内容
4. 如果置顶内容过于零碎、无法形成有意义的结论,只输出一行:NO_DIGEST
5. 不要前言、解释、markdown 标记——直接输出摘要正文
`.trim();
