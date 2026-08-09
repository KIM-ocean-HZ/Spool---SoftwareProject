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
// ⚠️ **A ✕ is a snooze, not a delete** (Ocean, second round: 「然后一个星期再问一次」). The row
// goes away for a week and then asks again. That is why nothing here deletes and why the read
// is time-bounded — the table keeps the history, the WINDOW decides what is currently silent.

/** How long one ✕ keeps a date quiet before it asks again. */
export const SNOOZE_DAYS = 7;

/** Every (block, day) pair in this project that is currently snoozed, as `${blockId}:${dueAt}`. */
export const listDismissals = async (threadId: string): Promise<Set<string>> => {
  const db = await getDb();
  const since = Date.now() - SNOOZE_DAYS * 86_400_000;
  const rows = await db.select<{ block_id: string; due_at: number }[]>(
    `SELECT d.block_id, d.due_at FROM date_dismissals d
       JOIN blocks b ON b.id = d.block_id
      WHERE b.thread_id = $1 AND d.created_at > $2`,
    [threadId, since],
  );
  return new Set(rows.map((r) => `${r.block_id}:${r.due_at}`));
};

export const dismissDate = async (blockId: string, dueAt: number): Promise<void> => {
  const db = await getDb();
  // ⚠️ DO UPDATE, not DO NOTHING: pressing ✕ on a date that has come back has to restart its
  // week. With DO NOTHING the second ✕ would be silently ignored and the row would reappear
  // on the next render, which reads as a broken button.
  await db.execute(
    `INSERT INTO date_dismissals (block_id, due_at, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (block_id, due_at) DO UPDATE SET created_at = excluded.created_at`,
    [blockId, dueAt, Date.now()],
  );
};
