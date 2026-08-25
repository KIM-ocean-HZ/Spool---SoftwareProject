import { getDb } from './client';

// V1 (WORKPLAN §2.V1, Ocean 2026-08-25): 「切换到别的项目再回来,停留在刚刚浏览过的位置,
// 而不是刷新。」
//
// ⛔ The position is a BLOCK, never a pixel. `scrollTop` was the obvious answer and it is
// the wrong one: V2 (same batch) just made every block default to expanded, so every stored
// pixel offset from before that change now points somewhere unrelated — and any later change
// to block height would do it again.
//
// Rows expire after 30 days (Ocean's number). Nothing sweeps them on a timer; the read
// enforces the age and the write clears what has aged out, which is enough for a table whose
// entire contents are disposable.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReadPosition {
  /** The block that was at the top of the viewport when the user left. */
  blockId: string;
  /** `created_at` of the newest block in the project at that moment. */
  lastBlockAt: number;
}

/** Where this project was last left, or null if it has no remembered position (or one older
 *  than 30 days). ⚠️ Says nothing about whether the block still exists or whether newer
 *  blocks have arrived since — `resolveLanding` answers both, against the loaded feed. */
export const getReadPosition = async (threadId: string): Promise<ReadPosition | null> => {
  const db = await getDb();
  const rows = await db.select<{ block_id: string; last_block_at: number }[]>(
    'SELECT block_id, last_block_at FROM read_positions WHERE thread_id = $1 AND updated_at >= $2',
    [threadId, Date.now() - MAX_AGE_MS],
  );
  const row = rows[0];
  return row ? { blockId: row.block_id, lastBlockAt: row.last_block_at } : null;
};

/** Record where the user stopped reading. One row per project, overwritten each time. */
export const saveReadPosition = async (
  threadId: string,
  blockId: string,
  lastBlockAt: number,
): Promise<void> => {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT INTO read_positions (thread_id, block_id, last_block_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id) DO UPDATE SET
         block_id = excluded.block_id,
         last_block_at = excluded.last_block_at,
         updated_at = excluded.updated_at`,
    [threadId, blockId, lastBlockAt, now],
  );
  // Cheap piggy-backed sweep: the 30-day rule has to actually delete something eventually,
  // and a project the user still reads is the only place we are guaranteed to be writing.
  await db.execute('DELETE FROM read_positions WHERE updated_at < $1', [now - MAX_AGE_MS]);
};

/** Where opening this project should land, given what it remembered and what the feed
 *  actually holds now. Pure, so the three rules below are testable without a DOM or a DB. */
export const resolveLanding = (
  position: ReadPosition | null,
  blocks: readonly { id: string; createdAt: number }[],
): { at: 'bottom' } | { at: 'block'; blockId: string } => {
  if (!position || blocks.length === 0) return { at: 'bottom' };
  // ⭐⭐ Ocean did not ask for this one; it is in the workplan because without it the feature
  // hides things. Anything new has arrived since he left → land at the bottom, because
  // 「有新的」 is the reason he opened the project at all. Restoring his old spot would put the
  // new material below the fold where he has no reason to look for it.
  // ⚠️ Deliberately not announced anywhere on screen: landing at the bottom IS what
  // 「有新的」 has always looked like here.
  const newest = blocks.reduce((max, b) => Math.max(max, b.createdAt), 0);
  if (newest > position.lastBlockAt) return { at: 'bottom' };
  // The remembered block was deleted, or has scrolled out of the loaded tail window. Bottom
  // is the honest fallback — it is what every project did before this feature existed.
  if (!blocks.some((b) => b.id === position.blockId)) return { at: 'bottom' };
  return { at: 'block', blockId: position.blockId };
};
