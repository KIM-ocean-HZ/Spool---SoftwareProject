// S7① (2026-08-24) —— **Spool 不许对读它的 AI 说一句自己没说过的话。**
//
// 已经发生过：〈申请规划〉seq 21 / seq 24 两块的正文里，压缩稿写进了一行
// `[... 2 blocks the user has marked as no longer valid are not shown ...]`,
// 和 `templates.ts` 的 `staleOmittedLine(2)` 一字不差。压缩 sidecar 读了一份带骨架行的
// pack，把 pack 的骨架当块正文抄了回来。
//
// ⛔⛔ 诊断改过一次，别照旧的做：**不是 MCP 写回抄的，是压缩那一步写进去的** ——
// 两块的 `original_content` 都干净，只有压缩稿 `content` 带着这一行。
// ⇒ 闸加在压缩的写回路径上（`compressStore.draftWrites`），和 `S3` 同一个收尾步骤。
//
// **后果说清楚**：这一行留在块正文里，以后每一份 pack 都会在**块正文中间**印一句
// 「有 2 块没显示」，而在那个位置上这句话不成立。骨架行是 Spool 说的话，块正文是用户
// 说的话 —— 两者混在一起，收件 AI 分不出哪句是谁说的。
//
// ⭐ **为什么按「压缩前有没有」减，而不是见到就删**：`contentFromEntryBody` 上写着那条
// ⛔「用正则去认『像装饰的行』会误伤正文里真的以 `↩` 开头的一句话」。同一条顾虑在这里
// 更实在 —— 用户的块里真的可能有一行 `## Related Files & Links`。所以判据不是形状，
// 是**来历**：压缩前那一块里没有、压缩后冒出来的，才是压缩发明的。这正是当初查出这两块
// 的那个判据（`original_content` 干净、`content` 带着），把它固化成闸。

import {
  EMPTY_LOG_LINE,
  EMPTY_PINNED_LINE,
  PACK_BEGIN,
  PACK_END,
  PINNED_SEE_ABOVE,
  SECTION_FILES,
  SECTION_LOG,
  SECTION_PINNED,
} from './templates';

/** 整行就是骨架、而且**不可能是用户散文**的那几条。
 *
 *  ⛔ 这张表里**没有** `↩ cites:` / `📌` / `🗜` / `💭 note:` —— 那几个是**块自己的**渲染行，
 *  `shieldPack` / `contentFromEntryBody` 已经按原文逐行减掉了，在这里再认一遍就是拿形状
 *  猜正文，会误伤。这张表只收**pack 级**的行：它们不属于任何一块。 */
const FIXED_LINES: readonly string[] = [
  PACK_BEGIN,
  PACK_END,
  SECTION_PINNED,
  SECTION_LOG,
  SECTION_FILES,
  EMPTY_PINNED_LINE,
  EMPTY_LOG_LINE,
  PINNED_SEE_ABOVE,
];

/** 带数字的那两条，写成模式。
 *  ⚠️ `skeleton.test.ts` 拿 `staleOmittedLine()` / `truncationMarker()` 的真输出钉着这两个
 *  正则 —— 改了模板串而没改这里，测试会红。 */
const STALE_OMITTED_RE =
  /^\[\.\.\. \d+ blocks? the user has marked as no longer valid (?:is|are) not shown — still in Spool, still searchable, readable with get_blocks\(stale=true\) \.\.\.\]$/;
const TRUNCATION_RE = /^\[\.\.\. truncated, \d+ more chars not shown \.\.\.\]$/;

/** 这一行是不是 pack 骨架（⚠️ 只判形状，**不判来历** —— 来历在 `stripInventedSkeleton`）。 */
export const isPackSkeletonLine = (line: string): boolean => {
  const s = line.trim();
  if (s === '') return false;
  return FIXED_LINES.includes(s) || STALE_OMITTED_RE.test(s) || TRUNCATION_RE.test(s);
};

export interface SkeletonStrip {
  /** 剔干净之后的正文。 */
  content: string;
  /** 剔掉了哪几行（原样，去掉首尾空白）。空数组 = 这一块什么都没发生。 */
  removed: string[];
}

/** 把**压缩发明出来的**骨架行从压缩稿里剔掉。
 *
 *  `before` = 这一块压缩前的正文，`after` = 压缩稿。同一行在 `before` 里出现几次，
 *  `after` 里就留几次 —— 多出来的那几次是压缩加的，剔掉。
 *  ⚠️ 和 `contentFromEntryBody` 同一套「按原文减」的纪律，⛔ 不按形状猜。 */
export const stripInventedSkeleton = (before: string, after: string): SkeletonStrip => {
  const budget = new Map<string, number>();
  for (const l of before.split('\n')) {
    const s = l.trim();
    if (isPackSkeletonLine(s)) budget.set(s, (budget.get(s) ?? 0) + 1);
  }

  const removed: string[] = [];
  const kept = after.split('\n').filter((l) => {
    const s = l.trim();
    if (!isPackSkeletonLine(s)) return true;
    const left = budget.get(s) ?? 0;
    if (left > 0) {
      budget.set(s, left - 1);
      return true;
    }
    removed.push(s);
    return false;
  });

  if (removed.length === 0) return { content: after, removed };
  // 剔掉一整行会在原地留下一段空档；只在真剔过的时候收一次，⛔ 不动没剔过的稿子的排版。
  const content = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return { content, removed };
};
