// S2（2026-08-24，Ocean 拍板）—— AI 提的「整条取代」，读出来给 E3 那张卡用。
//
// ⛔⛔ **三条护栏一条不松**（都是 E3 那次定的）：
//  ① **只能提案，永不直接写。** AI 手上没有让块退休的工具，这次也不给 ——
//     这张表里的行不改任何块，用户在审阅面上点头才有事发生。
//  ② **引文逐字闸照走**（`api_engine.rs::quote_passes`，MCP 那一侧写入前就过了）。
//     ⚠️ 那道闸的输入**一个字符都不许动，首尾空白也算** —— 顺手 `.trim()` 就把闸放宽了，
//     而且放宽之后测试照样绿。
//  ③ ⛔ **不做 confidence 过滤** —— 实测最离谱那条自标 `high`，所以这张表里根本没有
//     那一列可存。
//
// ⭐ **并进 E3 那张卡，不新开一张**（Ocean 明说）：判断是同一个判断 —— 这一块是不是被
// 后面那块整条取代了 —— 只是发现它的人不同。E3 是花钱让 sidecar 扫一遍，这条是正在
// 聊天的那个 AI 顺手提的。**并进去用户只学一套话；分开就是两套。**

import { getDb } from './client';

/** 库里那一行，`#N` 已经翻好了。 */
export interface SupersedeProposal {
  id: string;
  threadId: string;
  /** 旧的那一块 —— ⚠️ 界面上说 `#N`，这里同时带着它的 id。 */
  staleSeq: number;
  staleBlockId: string;
  bySeq: number;
  byBlockId: string;
  /** 谁提的。空串 = 没报名字。 */
  client: string;
  why: string;
  quoteStale: string;
  quoteNew: string;
  /** 两句引文里至少有一句是「只差标点的重打」。⚠️ 界面要说出来。 */
  retyped: boolean;
  createdAt: number;
  expiresAt: number;
}

interface Row {
  id: string;
  thread_id: string;
  stale_block_id: string;
  by_block_id: string;
  stale_seq: number | null;
  by_seq: number | null;
  client: string;
  why: string;
  quote_stale: string;
  quote_new: string;
  retyped: number;
  created_at: number;
  expires_at: number;
}

/** 这个项目里还没过期的那几条。
 *
 *  ⚠️ **两块里少一块，这一条就不出现**（INNER JOIN）—— 块被删了，行会被外键带走，
 *  但删块和读这张表之间还有一段时间，而一条指不着块的提议在卡片上是画不出来的。
 *  ⚠️ `seq` 为空的行（v9 回填之前的老块）同样过不了 —— 屏幕上没有 `#N` 可说。 */
export const listSupersedeProposals = async (
  threadId: string,
  now: number,
): Promise<SupersedeProposal[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT sp.*, s.seq AS stale_seq, n.seq AS by_seq
       FROM supersede_proposals sp
       JOIN blocks s ON s.id = sp.stale_block_id
       JOIN blocks n ON n.id = sp.by_block_id
      WHERE sp.thread_id = $1 AND sp.expires_at > $2
      ORDER BY sp.created_at ASC`,
    [threadId, now],
  );
  return rows.flatMap((r) =>
    r.stale_seq == null || r.by_seq == null
      ? []
      : [
          {
            id: r.id,
            threadId: r.thread_id,
            staleSeq: r.stale_seq,
            staleBlockId: r.stale_block_id,
            bySeq: r.by_seq,
            byBlockId: r.by_block_id,
            client: r.client,
            why: r.why,
            quoteStale: r.quote_stale,
            quoteNew: r.quote_new,
            retyped: r.retyped !== 0,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
          },
        ],
  );
};

/** 用户下过决定了 —— 这一行的活干完了，删掉。
 *
 *  ⚠️ 三个动作**都**走这里，「不动」也是：「不动」是一个决定，不是「没决定」。
 *  ⛔ 不留拒绝日志 —— 和 `proposals` 同一条理由（§4.3：拒绝日志会把队列变成垃圾堆）。 */
export const deleteSupersedeProposal = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM supersede_proposals WHERE id = $1', [id]);
};

/** 过期的清掉。⚠️ 和提案批次同一个 7 天，同一个「时间到了等于拒绝」。 */
export const purgeExpiredSupersedeProposals = async (now: number): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM supersede_proposals WHERE expires_at <= $1', [now]);
};
