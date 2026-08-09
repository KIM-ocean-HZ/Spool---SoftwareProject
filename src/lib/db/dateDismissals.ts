import { getDb } from './client';

// 旧账 §5-3 (Ocean 2026-08-13) — the ✕ on a text-date reminder.
//
// The dates themselves are never stored: they are re-read from each block's text on every
// render (lib/blocks/dates.ts), so a block the user edits produces the right reminders
// immediately and nothing can drift. What IS worth keeping is the user pressing ✕ — that is
// a judgement, not a derivation, and it has to survive a restart.
//
// Keyed by (block, day) rather than by block: Ocean's 〈申请规划〉 has one block naming three
// application deadlines, and silencing one must leave the other two.
//
// ⚠️ **A ✕ is 「先收起」, not a delete** (Ocean: 「两个月，一个月，一周，差不多这样吧」). Each date
// is raised at three lead times, and a ✕ silences only the stage it was pressed in — the row
// returns when the date crosses into the next one. Which is why WHEN it was pressed is the
// whole payload: `created_at` plus the date itself is enough to recover which stage was
// silenced (lib/blocks/dates.ts noticeStage), so no column and no migration were needed.

/** When each (block, day) pair in this project was last silenced, keyed `${blockId}:${dueAt}`. */
export const listDismissals = async (threadId: string): Promise<Map<string, number>> => {
  const db = await getDb();
  const rows = await db.select<{ block_id: string; due_at: number; created_at: number }[]>(
    `SELECT d.block_id, d.due_at, d.created_at FROM date_dismissals d
       JOIN blocks b ON b.id = d.block_id
      WHERE b.thread_id = $1`,
    [threadId],
  );
  return new Map(rows.map((r) => [`${r.block_id}:${r.due_at}`, r.created_at]));
};

export const dismissDate = async (blockId: string, dueAt: number): Promise<void> => {
  const db = await getDb();
  // ⚠️ DO UPDATE, not DO NOTHING: pressing ✕ on a date that has come back at a tighter stage
  // has to record THAT stage. With DO NOTHING the second ✕ would be silently ignored, the old
  // timestamp would keep resolving to the stage already passed, and the row would reappear on
  // the next render — which reads as a broken button.
  await db.execute(
    `INSERT INTO date_dismissals (block_id, due_at, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (block_id, due_at) DO UPDATE SET created_at = excluded.created_at`,
    [blockId, dueAt, Date.now()],
  );
};
