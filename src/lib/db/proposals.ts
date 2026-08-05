import { nanoid } from 'nanoid';
import { createBlock } from './blocks';
import { getDb } from './client';

// DESIGN_MCP_WRITE_ROLE §4 (M1) — the read/approve half of the triage queue. The MCP
// server (mcp.rs propose_blocks) fills these two tables; nothing here ever writes into
// them, and nothing outside this file reads them.
//
// The line this module exists to keep: a proposal is NOT a block. It is something an AI
// offered. Approval is the only thing that turns it into rows in `blocks`, and it goes
// through the ordinary insert path — same source label, same append-only rules, same
// numbering — so the library has no idea this feature exists. Rejection deletes the rows
// and leaves nothing behind (§4.3: a rejection log turns the queue into a landfill), and
// expiry is that same deletion on a 7-day timer.

export interface Proposal {
  id: string;
  threadId: string;
  content: string;
  annotation: string | null;
  /** An explicit citation the AI passed. Approval fills this in from the batch's own
   *  original passage when the AI left it empty (§4.4 A). */
  refBlockId: string | null;
}

export interface ProposalBatch {
  id: string;
  /** Source label the approved blocks will carry, captured when the batch was proposed —
   *  so approving next week still names the AI that actually wrote it. */
  client: string;
  /** The AI's one line about what this batch is. */
  note: string | null;
  /** §4.4 A: the whole passage the split was cut from. */
  sourceText: string | null;
  sourceThreadId: string | null;
  createdAt: number;
  expiresAt: number;
  items: Proposal[];
}

interface BatchRow {
  id: string;
  client: string;
  note: string | null;
  source_text: string | null;
  source_thread_id: string | null;
  created_at: number;
  expires_at: number;
}

interface ItemRow {
  id: string;
  batch_id: string;
  thread_id: string;
  content: string;
  annotation: string | null;
  ref_block_id: string | null;
}

// Pending = still inside its 7-day window. Everything else is void and shows as one
// "expired" line, never as something the user could still approve (§4.2-3).
export const listPendingBatches = async (now: number): Promise<ProposalBatch[]> => {
  const db = await getDb();
  const batches = await db.select<BatchRow[]>(
    'SELECT * FROM proposal_batches WHERE expires_at > $1 ORDER BY created_at ASC',
    [now],
  );
  if (batches.length === 0) return [];
  const ids = batches.map((b) => b.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const items = await db.select<ItemRow[]>(
    `SELECT * FROM proposals WHERE batch_id IN (${placeholders}) ORDER BY batch_id, sort_order ASC`,
    ids,
  );
  const byBatch = new Map<string, Proposal[]>();
  for (const r of items) {
    const list = byBatch.get(r.batch_id) ?? [];
    list.push({
      id: r.id,
      threadId: r.thread_id,
      content: r.content,
      annotation: r.annotation,
      refBlockId: r.ref_block_id,
    });
    byBatch.set(r.batch_id, list);
  }
  return batches.map((b) => ({
    id: b.id,
    client: b.client,
    note: b.note,
    sourceText: b.source_text,
    sourceThreadId: b.source_thread_id,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
    items: byBatch.get(b.id) ?? [],
  }));
};

/** How many proposals are waiting — the number on the sidebar badge. One query, run on
 *  every window focus, so it stays a COUNT rather than a load. */
export const countPending = async (now: number): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM proposals p
       JOIN proposal_batches b ON b.id = p.batch_id
      WHERE b.expires_at > $1`,
    [now],
  );
  return rows[0]?.c ?? 0;
};

/** How many batches have run out of time. The review screen shows one line for these and
 *  a way to clear them; they are never approvable. */
export const countExpiredBatches = async (now: number): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM proposal_batches WHERE expires_at <= $1',
    [now],
  );
  return rows[0]?.c ?? 0;
};

const deleteBatches = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  // Children first: the FK carries ON DELETE CASCADE, but SQLite only honours that with
  // `PRAGMA foreign_keys = ON`, which this connection does not set. Doing it by hand is
  // correct either way.
  await db.execute(`DELETE FROM proposals WHERE batch_id IN (${placeholders})`, ids);
  await db.execute(`DELETE FROM proposal_batches WHERE id IN (${placeholders})`, ids);
};

/** Reject: the rows go, and nothing records that they ever existed (§4.3). Rejecting a
 *  batch IS the retraction the old "let the AI take a write back" question was asking
 *  for — there is nothing to take back, because nothing landed. */
export const rejectBatch = (batchId: string): Promise<void> => deleteBatches([batchId]);

export const purgeExpired = async (now: number): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    'SELECT id FROM proposal_batches WHERE expires_at <= $1',
    [now],
  );
  await deleteBatches(rows.map((r) => r.id));
  return rows.length;
};

/**
 * Approve some or all of a batch. `keepIds` omitted = approve everything (§4.3: the
 * default action is the whole batch, because the judgement triage asks for is "was this
 * split right", not "is item 3 right").
 *
 * Order matters. §4.4 A stores the original passage FIRST, as the user's own block —
 * they wrote it; the AI only decided where the pieces go — and every approved item then
 * cites it. That citation is the whole reason the passage is kept: a piece read three
 * weeks from now can be checked against the context it was cut out of, and being cut out
 * of context is the only mistake a split actually makes. An item that came with its own
 * ref_block_id keeps it; the passage is a fallback, not an override.
 *
 * The batch is deleted whether every item was approved or only some: what the user
 * declined is a rejection, and rejections leave no trace.
 *
 * Returns the blocks written, the original included.
 */
export const approveBatch = async (batchId: string, keepIds?: string[]): Promise<number> => {
  const db = await getDb();
  const batches = await db.select<BatchRow[]>('SELECT * FROM proposal_batches WHERE id = $1', [
    batchId,
  ]);
  const batch = batches[0];
  if (!batch) return 0;
  const rows = await db.select<ItemRow[]>(
    'SELECT * FROM proposals WHERE batch_id = $1 ORDER BY sort_order ASC',
    [batchId],
  );
  const keep = keepIds ? rows.filter((r) => keepIds.includes(r.id)) : rows;
  if (keep.length === 0) {
    await deleteBatches([batchId]);
    return 0;
  }

  // The passage only earns its place if something is going to cite it.
  let originId: string | null = null;
  if (batch.source_text && batch.source_thread_id) {
    const live = await db.select<{ id: string }[]>(
      'SELECT id FROM threads WHERE id = $1 AND deleted_at IS NULL',
      [batch.source_thread_id],
    );
    if (live.length > 0) {
      const origin = await createBlock({
        threadId: batch.source_thread_id,
        content: batch.source_text,
        // Sourceless on purpose (§4.4 A): the passage is the user's own words, handed to
        // the AI and approved by the user. A source label would file it as somebody's
        // quoted material, which is the one thing it is not.
        source: null,
      });
      originId = origin.id;
    }
  }

  let written = originId ? 1 : 0;
  for (const r of keep) {
    // A project deleted between proposal and approval takes its items with it — the
    // alternative is inventing a destination the user never chose.
    const live = await db.select<{ id: string }[]>(
      'SELECT id FROM threads WHERE id = $1 AND deleted_at IS NULL',
      [r.thread_id],
    );
    if (live.length === 0) continue;
    await createBlock({
      threadId: r.thread_id,
      content: r.content,
      annotation: r.annotation,
      source: batch.client || 'MCP',
      refBlockId: r.ref_block_id ?? originId,
    });
    written += 1;
  }
  await deleteBatches([batchId]);
  return written;
};

// Test-only seam: the queue's only writer is the Rust server, so a TS test has no way to
// get a batch in front of the approve path without one. Never called by the app.
export const __insertBatchForTest = async (
  batch: Omit<ProposalBatch, 'items'> & { items: Omit<Proposal, 'id'>[] },
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO proposal_batches (id, client, note, source_text, source_thread_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      batch.id,
      batch.client,
      batch.note,
      batch.sourceText,
      batch.sourceThreadId,
      batch.createdAt,
      batch.expiresAt,
    ],
  );
  for (let i = 0; i < batch.items.length; i++) {
    const it = batch.items[i]!;
    await db.execute(
      `INSERT INTO proposals (id, batch_id, thread_id, content, annotation, ref_block_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nanoid(), batch.id, it.threadId, it.content, it.annotation, it.refBlockId, i],
    );
  }
};
