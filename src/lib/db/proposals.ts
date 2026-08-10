import { nanoid } from 'nanoid';
import { t } from '@/lib/i18n';
import { createBlock, setBlockSupersession, type RefKind } from './blocks';
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
  /** v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板甲): 'corrects' when the AI is saying one point in
   *  the cited block no longer holds. Null is a plain citation — every pre-v14 proposal, and
   *  every item the batch's own passage is cited by. Only 'corrects' can ever arrive here:
   *  the server refuses 'supersedes' outright, because ①② remove the old block from every
   *  future pack and that stays the user's call (§3.1 «谁能用»). */
  refKind: Extract<RefKind, 'corrects'> | null;
  /** v20 (DESIGN_MCP_INTENT_ROUTING §4.6): the provenance the AI recorded, carried through
   *  the queue so the approved block keeps it. Null on every pre-v20 proposal. */
  sourceUrl: string | null;
  retrievedAt: number | null;
  recheckAfter: number | null;
  /** v21: the sentence in the corrected block this item is aimed at, quoted verbatim.
   *  Only meaningful alongside refKind 'corrects'; null everywhere else. */
  correctedQuote: string | null;
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

/**
 * §4.4-bis (Ocean, 2026-08-05 evening): the label the original passage carries once it is
 * approved. It used to be sourceless, and that was a hole: a pack reads a block with no
 * source as 💭 Personal — the user's own intent, the highest-signal category there is — so
 * anything an AI put in `source_text` could take the library's most authoritative identity
 * under the user's name. The one defence was the user reading this screen, and the default
 * button says "store all of it".
 *
 * Both halves are load-bearing. `· MCP` (inherited from the client label) is what
 * isMcpSource() matches on, so the badge shows the robot icon and the AI-activity panel
 * counts it. `用户原文` is for the model reading the pack: an AI source label alone would
 * file this as 🧩 Synthesis = "somebody else's framing, not fact", and this passage is in
 * fact the user's own words — swapping "held too high" for "held too low". The wording is
 * what lets the model see through the label, so it cannot be dropped.
 */
export const passageSource = (client: string): string => `${client || 'MCP'} — ${t('用户原文')}`;

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
  ref_kind: 'corrects' | null;
  source_url: string | null;
  retrieved_at: number | null;
  recheck_after: number | null;
  corrected_quote: string | null;
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
      refKind: r.ref_kind,
      sourceUrl: r.source_url,
      retrievedAt: r.retrieved_at,
      recheckAfter: r.recheck_after,
      correctedQuote: r.corrected_quote,
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

/** DESIGN_FOLLOW_UP §2.4 (M3) — everything a run just queued, so the dedup gate can look
 *  at it before the user does. Scoped by batch creation time: engine runs are strictly
 *  serial (engineStore §1.2), so the batches born inside a run's window are that run's. */
export const listBatchesCreatedSince = async (since: number): Promise<ProposalBatch[]> => {
  const db = await getDb();
  const batches = await db.select<BatchRow[]>(
    'SELECT * FROM proposal_batches WHERE created_at >= $1 ORDER BY created_at ASC',
    [since],
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
      refKind: r.ref_kind,
      sourceUrl: r.source_url,
      retrievedAt: r.retrieved_at,
      recheckAfter: r.recheck_after,
      correctedQuote: r.corrected_quote,
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

/** §2.4: drop the proposals a follow-up already showed the user once.
 *
 *  Deletion, not a flag — the same rule rejection follows (§4.3): what the queue turned
 *  away leaves no trace, or the queue becomes the landfill it exists to prevent. A batch
 *  emptied by this goes with them, so the review screen never shows a heading over
 *  nothing.
 *
 *  ⚠️ It is only ever called with ids the gate matched against THIS project's own history,
 *  so it cannot reach a batch some other client queued in the same minute. */
export const dropProposals = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const owning = await db.select<{ batch_id: string }[]>(
    `SELECT DISTINCT batch_id FROM proposals WHERE id IN (${placeholders})`,
    ids,
  );
  await db.execute(`DELETE FROM proposals WHERE id IN (${placeholders})`, ids);
  const emptied: string[] = [];
  for (const { batch_id } of owning) {
    const rest = await db.select<{ c: number }[]>(
      'SELECT COUNT(*) AS c FROM proposals WHERE batch_id = $1',
      [batch_id],
    );
    if ((rest[0]?.c ?? 0) === 0) emptied.push(batch_id);
  }
  await deleteBatches(emptied);
};

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
 * Order matters. §4.4 A stores the original passage FIRST — carrying the label of the AI
 * that handed it over (§4.4-bis, passageSource) — and every approved item then cites it.
 * That citation is the whole reason the passage is kept: a piece read three
 * weeks from now can be checked against the context it was cut out of, and being cut out
 * of context is the only mistake a split actually makes. An item that came with its own
 * ref_block_id keeps it; the passage is a fallback, not an override.
 *
 * The batch is deleted whether every item was approved or only some: what the user
 * declined is a rejection, and rejections leave no trace.
 *
 * **Every write is retirable.** There is no transaction to lean on here (see threads.ts:141
 * — tauri-plugin-sql's pool cannot hold BEGIN/COMMIT across statements), and an insert CAN
 * fail mid-batch for a reason that has nothing to do with this feature: `idx_blocks_thread_seq`
 * is unique, and the MCP subprocess may claim a number between two of these calls. So each
 * proposal row is deleted the instant its block lands, and the passage is un-set from the
 * batch the instant it is stored. Approving again after a failure therefore writes only
 * what did not get written — rather than a second copy of everything that did.
 *
 * Returns the blocks written, the passage included.
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
  let written = 0;
  if (batch.source_text && batch.source_thread_id) {
    const live = await db.select<{ id: string }[]>(
      'SELECT id FROM threads WHERE id = $1 AND deleted_at IS NULL',
      [batch.source_thread_id],
    );
    if (live.length > 0) {
      const origin = await createBlock({
        threadId: batch.source_thread_id,
        content: batch.source_text,
        // Labelled, not sourceless (§4.4-bis) — see passageSource above. The passage is
        // the user's own words, but it did not come from the user's own hand: an AI
        // passed it through, and that is exactly what a source label records.
        source: passageSource(batch.client),
      });
      // Hand the citation to the rows themselves and drop the passage from the batch. That
      // is what makes a retry safe: the passage cannot be written twice, and the items that
      // have not landed yet still know what to cite.
      await db.execute(
        'UPDATE proposals SET ref_block_id = $1 WHERE batch_id = $2 AND ref_block_id IS NULL',
        [origin.id, batchId],
      );
      for (const r of keep) if (r.ref_block_id === null) r.ref_block_id = origin.id;
      await db.execute('UPDATE proposal_batches SET source_text = NULL WHERE id = $1', [batchId]);
      written += 1;
    }
  }

  for (const r of keep) {
    // A project deleted between proposal and approval takes its items with it — the
    // alternative is inventing a destination the user never chose.
    const live = await db.select<{ id: string }[]>(
      'SELECT id FROM threads WHERE id = $1 AND deleted_at IS NULL',
      [r.thread_id],
    );
    if (live.length === 0) continue;
    const created = await createBlock({
      threadId: r.thread_id,
      content: r.content,
      annotation: r.annotation,
      // v14 (§9.3 拍板乙): the queue's only writer is the MCP server, so every proposal's
      // annotation is an AI's sentence. Approving it means the user accepted the block —
      // not that they wrote the note — and the pack has to keep saying which.
      annotationBy: 'ai',
      source: batch.client || 'MCP',
      refBlockId: r.ref_block_id,
      // v20 (§4.6): provenance travels with the item. The proposal is where it was
      // recorded; approval is just the moment it becomes a block.
      sourceUrl: r.source_url,
      retrievedAt: r.retrieved_at,
      recheckAfter: r.recheck_after,
      // v21: the aim rides through approval with the rest of the relation.
      correctedQuote: r.corrected_quote,
    });
    // v14 (§9.3 拍板甲): the correction relation is applied on APPROVAL, never at propose
    // time — until the user clicks, nothing about the corrected block has changed. Only
    // 'corrects' can reach here (the server refuses 'supersedes'), so this can never set a
    // stale_at: ①② stay the user's alone.
    if (r.ref_kind === 'corrects' && r.ref_block_id) {
      await setBlockSupersession(created.id, r.ref_block_id, 'corrects', Date.now());
    }
    await db.execute('DELETE FROM proposals WHERE id = $1', [r.id]);
    written += 1;
  }
  await deleteBatches([batchId]);
  return written;
};

// Test-only seam: the queue's only writer is the Rust server, so a TS test has no way to
// get a batch in front of the approve path without one. Never called by the app.
export const __insertBatchForTest = async (
  batch: Omit<ProposalBatch, 'items'> & {
    items: (Omit<
      Proposal,
      'id' | 'refKind' | 'sourceUrl' | 'retrievedAt' | 'recheckAfter' | 'correctedQuote'
    > &
      Partial<
        Pick<
          Proposal,
          'refKind' | 'sourceUrl' | 'retrievedAt' | 'recheckAfter' | 'correctedQuote'
        >
      >)[];
  },
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
      `INSERT INTO proposals (id, batch_id, thread_id, content, annotation, ref_block_id, ref_kind, source_url, retrieved_at, recheck_after, corrected_quote, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        nanoid(),
        batch.id,
        it.threadId,
        it.content,
        it.annotation,
        it.refBlockId,
        it.refKind ?? null,
        it.sourceUrl ?? null,
        it.retrievedAt ?? null,
        it.recheckAfter ?? null,
        it.correctedQuote ?? null,
        i,
      ],
    );
  }
};
