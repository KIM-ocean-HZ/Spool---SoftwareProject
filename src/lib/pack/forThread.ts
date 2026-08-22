// 给「不是打包对话框」的调用方组一份 pack（WORKPLAN-2026-08-20 §9.6.2）。
//
// 压缩从打包对话框里搬到右侧栏之后，出现了一个 `PackDialog` 没有的需求：**为一个没打开的
// 项目组一份 pack**。睡前排队（§9.6.4）一次要压好几个项目，而它们的块大多不在 store 里。
//
// ⚠️ **组装本身仍然是 `assemble` 那一个函数**。这里只负责把它要的四样东西凑齐
// （块、文件、项目名表、被引用的块），和 `PackHost` 凑的是同一份 —— 压缩量的必须是
// **用户真的会粘贴出去的那一份**，不能是另一条路上另拼的近似品。

import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { listAttachmentsByThread } from '@/lib/db/attachments';
import { listBlocksByIds, listBlocksByThread, type Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { assemble, filterBlocksForRange, type CitedBlock } from '@/lib/pack/assemble';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

export interface ThreadPack {
  text: string;
  blocks: Block[];
  /** ⭐ v24（R2 §1e）：因为**已经压过**而没进这一份的块数。0 = 一块都没跳过。
   *  ⚠️ 界面要说出这个数：pack 里少了几块，而用户没做任何选择。 */
  skippedCompressed: number;
}

/** 组一份和打包对话框逐字相同的 pack。
 *
 *  ⚠️ `instructions` 跟设置走（`packInstructions`），和对话框一样。**这一条影响的不是排版
 *  是钱**：那段 `## How to Read This Context` 表头在小项目上能占到全文一半，而第 1 条规则
 *  要求它一字不改照抄 —— 它进不进来，直接决定「压完剩百分之几」是多少。 */
export const buildThreadPack = async (
  thread: Thread,
  /** ⭐ v24（R2 §1e，Ocean）：组**压缩用**的 pack 时跳过已经压过的块。
   *
   *  「新加入的 block 可以被单独压缩，压过一次下次就不会再被压缩。」
   *  一条规矩同时解决两件事：**不重复花钱**，以及**压过的不会被越压越短**
   *  （第二次压的是第一次的产物，而它已经不是用户的原话了）。
   *
   *  ⛔ 默认 false：别的调用方（真的要粘贴出去那一份）必须拿到完整的 pack。 */
  skipCompressed = false,
): Promise<ThreadPack> => {
  const all = await listBlocksByThread(thread.id);
  const blocks = skipCompressed ? all.filter((b) => b.compressedAt == null) : all;
  const skippedCompressed = all.length - blocks.length;
  const attachments = await listAttachmentsByThread(thread.id);

  const refTitles = new Map<string, string>();
  for (const list of Object.values(useThreadsStore.getState().threadsByWorkspace)) {
    for (const th of list) refTitles.set(th.id, th.title);
  }

  const citedIds = [...new Set(blocks.map((b) => b.refBlockId).filter((id): id is string => !!id))];
  const refBlocks = new Map<string, CitedBlock>();
  if (citedIds.length > 0) {
    for (const b of await listBlocksByIds(citedIds)) {
      refBlocks.set(b.id, {
        content: b.content,
        annotation: b.annotation,
        annotationIsAi: annotationIsAi(b.annotationBy, b.source),
        createdAt: b.createdAt,
      });
    }
  }

  const s = useSettingsStore.getState();
  const text = assemble({
    thread,
    blocks: filterBlocksForRange(blocks, 'all'),
    attachments,
    refTitles,
    refBlocks,
    scope: { range: 'all', total: blocks.length },
    instructions: s.packInstructions,
    outputLanguage: s.language === 'en' ? 'en' : 'zh',
  });
  return { text, blocks, skippedCompressed };
};
