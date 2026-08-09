import { getDb } from './client';

// 旧账 §5-3 (Ocean 2026-08-13) — the 「别再提这条」 half of text-date reminders.
//
// The dates themselves are never stored: they are re-read from each block's text on every
// render (lib/blocks/dates.ts), so a block the user edits produces the right reminders
// immediately and nothing can drift. What IS worth keeping is the user saying "not this
// one" — that is a judgement, not a derivation, and it has to survive a restart.
//
// Keyed by (block, day) rather than by block: Ocean's 〈申请规划〉 has one block naming three
// application deadlines, and silencing the one that already passed must leave the other two.

/** Every (block, day) pair in this project the user has silenced, as `${blockId}:${dueAt}`. */
export const listDismissals = async (threadId: string): Promise<Set<string>> => {
  const db = await getDb();
  const rows = await db.select<{ block_id: string; due_at: number }[]>(
    `SELECT d.block_id, d.due_at FROM date_dismissals d
       JOIN blocks b ON b.id = d.block_id
      WHERE b.thread_id = $1`,
    [threadId],
  );
  return new Set(rows.map((r) => `${r.block_id}:${r.due_at}`));
};

export const dismissDate = async (blockId: string, dueAt: number): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO date_dismissals (block_id, due_at, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (block_id, due_at) DO NOTHING`,
    [blockId, dueAt, Date.now()],
  );
};
