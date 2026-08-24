import type { Block } from '@/lib/db/blocks';

/** 查过期那条路上的两道闸。
 *
 *  ⚠️⚠️ **拆出来是因为它们原来没有缝可测。** 两条判断本来写在
 *  `compressStore.ts` 的 `runStale` / `decideStale` 里，是局部闭包 ——
 *  没有任何导出的入口调得到，于是 T2 这两道闸**一个单元测试都没有**，
 *  2026-08-24 第六轮实测只能把条件抄出来才量得到它们（§8.2）。
 *
 *  ⛔⛔ **而抄出来那一量就发现它们认错了维度**（这个文件存在的真正理由）：
 *
 *  一块的「关系」在库里是**两个字段**：`refBlockId`（指着谁）和 `refKind`（什么关系）。
 *  而 `cites`（引用）这一种存的是 **`refBlockId` 有值 + `refKind` 是 `null`**。
 *  两道闸原来写的都是 `refKind !== null`，于是**整个 `cites` 那一类从两道闸底下漏过去**：
 *
 *  - 扫描时摘不走它 → 用户被问一件已经有关系的事；
 *  - 点「只退旧的」时拒绝不触发 → `setBlockSupersession` 覆盖式写入，
 *    **把那条 `cites` 悄悄改写掉，界面不报任何错**。
 *
 *  ⚠️ 实测的数：真库里 `refKind='corrects'` 的块只有 **4** 个，
 *  而 `refBlockId` 有值、`refKind` 是 `null` 的有 **20** 个 —— T2 堵住了 4 个，敞着 20 个。
 *  而第六轮阶段 3 那 30 次里，模型提的 6 条**有 4 条**正好落在这个口子上
 *  （UCLA `#10` 指着「申请帮助 `#12`」）。
 *
 *  ⭐ 所以判断的依据是 **`refBlockId`**：**这块已经指着谁了没有**，
 *  ⛔ 而不是「它指的是哪一种关系」。 */

/** 这条提议说的关系，**库里已经记着了** —— 于是根本不该拿出来问。
 *
 *  「已经记着」= 新块**正指着**旧块。⚠️ 哪一种关系都算：
 *  `corrects` 是他选的「旧块留着」、`supersedes` 是他选的「退掉」、
 *  `cites` 是他自己连的引用 —— **三种都是已经决定过的事**。 */
export const relationAlreadySettled = (
  older: Block | undefined,
  newer: Block | undefined,
): boolean => {
  if (!older || !newer) return false;
  return newer.refBlockId !== null && newer.refBlockId === older.id;
};

/** 写下去会**冲掉**新块上已有的那条关系 —— 于是这一下必须拒绝。
 *
 *  ⚠️ 一块只存得下一条这样的关系（`setBlockSupersession` 是覆盖式写入）。
 *  新块要是已经指着**别的**块，写下去等于把那条悄悄删了。
 *  ⭐ 指着**同一块**的那种在扫描时就被 `relationAlreadySettled` 摘走了，
 *  走到这里的只剩「指着别处」。 */
export const wouldOverwriteRelation = (
  older: Block | undefined,
  newer: Block | undefined,
): boolean => {
  if (!newer) return false;
  return newer.refBlockId !== null && newer.refBlockId !== older?.id;
};
