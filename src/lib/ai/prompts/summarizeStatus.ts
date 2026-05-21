import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { EXTRACT_CHAR_CAP, truncationMarker } from '@/lib/pack/templates';
import { formatBlockTime as formatTime } from '@/lib/utils/time';

// v2.7: inline an attachment's auto-extracted file text under its block so the status
// summary can read file contents, not just the block's typed text. Capped at
// EXTRACT_CHAR_CAP per attachment (same cap as the pack, §9.5) so one large PDF can't
// dominate the prompt; over the cap a truncation marker is appended.
const renderAttachmentText = (a: Attachment): string => {
  const label = a.label.trim() || a.target;
  const full = a.extractedText ?? '';
  const body =
    full.length > EXTRACT_CHAR_CAP
      ? `${full.slice(0, EXTRACT_CHAR_CAP)}\n${truncationMarker(full.length - EXTRACT_CHAR_CAP)}`
      : full;
  return `\n  📎 附件「${label}」(${a.extractionKind}) 内容:\n${body}`;
};

// Prompt body copied verbatim from PLAN_EN.md §12.1 — core product IP, not to be
// "optimized" in implementation (§18 rule 5).
export const buildStatusPrompt = (
  thread: Thread,
  blocks: Block[],
  // v2.7: extracted text for file attachments, keyed by owning block id. Defaulted so
  // existing call sites and tests without attachments stay valid.
  attachmentsByBlock: Record<string, Attachment[]> = {},
) => `
你是一个项目状态摘要工具。读下面这条项目脉络里按时间排列的信息块,写一句话总结"这个项目现在到哪一步了"。

# 项目标题
${thread.title || '(无标题)'}

# 信息块(按时间从旧到新；部分信息块附带文件内容,以 📎 标出,应视为该信息块的一部分)
${blocks
  .map((b) => {
    const atts = (attachmentsByBlock[b.id] ?? []).filter(
      (a) => a.extractedText != null && a.extractedText.trim().length > 0,
    );
    return `[${formatTime(b.createdAt)}] ${b.content}${atts.map(renderAttachmentText).join('')}`;
  })
  .join('\n')}

# 规则
1. 只输出一句话,不超过 50 字
2. 聚焦"当前状态 / 下一步",不要复述全部历史
3. 绝对不要添加信息块(含其附件内容)里没有的内容
4. 不要前言、解释、markdown 标记——直接输出那句话
`.trim();
