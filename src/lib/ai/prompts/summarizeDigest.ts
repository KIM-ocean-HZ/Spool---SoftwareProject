import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { EXTRACT_CHAR_CAP, truncationMarker } from '@/lib/pack/templates';

// v2.8 §20.3: a pinned block's attachments are inlined regardless of include_in_pack —
// pinning is the opt-in signal for the conclusion summary (a stronger "this matters"
// gesture than the pack toggle, which governs the full-record pack). Capped at
// EXTRACT_CHAR_CAP per attachment (same cap as the pack §9.5 / status summary §12.1)
// so one large PDF can't dominate the prompt; over the cap a truncation marker appears.
const renderAttachmentText = (a: Attachment): string => {
  const label = a.label.trim() || a.target;
  const full = a.extractedText ?? '';
  const body =
    full.length > EXTRACT_CHAR_CAP
      ? `${full.slice(0, EXTRACT_CHAR_CAP)}\n${truncationMarker(full.length - EXTRACT_CHAR_CAP)}`
      : full;
  return `\n  📎 附件「${label}」(${a.extractionKind}) 内容:\n${body}`;
};

// Prompt body copied verbatim from PLAN_EN.md §12.2 — core product IP, not to be
// "optimized" in implementation (§18 rule 5). Rule 4's NO_DIGEST is the small model's
// explicit give-up exit; callers treat it as a generation failure (§12.4).
// v2.8 §20.3: signature gains attachmentsByBlock so each pinned block's extracted file
// text rides along — completing what the v2.7 status summary started for the active
// stage. Only the input list line is touched; the rules block stays untouched.
export const buildDigestPrompt = (
  thread: Thread,
  pinnedBlocks: Block[],
  attachmentsByBlock: Record<string, Attachment[]> = {},
) => `
你是一个项目结论摘要工具。一个项目刚结束,下面是用户在过程中标记为"重要"的信息块。把它们提炼成一段简短的结论摘要,供日后归档查阅。

# 项目标题
${thread.title || '(无标题)'}

# 用户标记为重要的信息块(部分信息块附带文件内容,以 📎 标出,应视为该信息块的一部分)
${pinnedBlocks
  .map((b) => {
    const atts = (attachmentsByBlock[b.id] ?? []).filter(
      (a) => a.extractedText != null && a.extractedText.trim().length > 0,
    );
    return `- ${b.content}${atts.map(renderAttachmentText).join('')}`;
  })
  .join('\n')}

# 规则
1. 输出 2-4 句话,总共不超过 120 字
2. 聚焦"最终结论 / 关键决定 / 可复用的东西",不要复述过程
3. 绝对不要添加信息块里没有的内容
4. 如果置顶内容过于零碎、无法形成有意义的结论,只输出一行:NO_DIGEST
5. 不要前言、解释、markdown 标记——直接输出摘要正文
`.trim();
