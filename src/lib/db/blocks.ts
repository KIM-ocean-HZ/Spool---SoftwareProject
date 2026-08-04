import { nanoid } from 'nanoid';
import { joinSegments, type Segment } from '@/lib/blocks/segments';
import { getDb } from './client';

export type BlockKind = 'text' | 'ref';

export interface Block {
  id: string;
  threadId: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;   // the user's own note about this block
  refThreadId: string | null;  // kind=ref
  refBlockId: string | null;   // v7 (§20.13 v2.4 D2): block-level citation, set by MCP writers
  source: string | null;       // provenance label, editable
  pinned: boolean;
  // v9 (DESIGN_SCHEMA_V9 H-1): the block's human-visible number within its thread, shown
  // as "#12" in the stream and in the pack. Null only on a row written before the v9
  // backfill ran. Never renumbered, never reused — see schema.sql.
  seq: number | null;
  createdAt: number;
}

export interface CreateBlockArgs {
  threadId: string;
  kind?: BlockKind;
  content: string;
  annotation?: string | null;
  refThreadId?: string | null;
  refBlockId?: string | null;
  source?: string | null;
  // Only the overlay's redirect path sets this — it re-creates a block the user may
  // already have pinned from the toast, and the pin must survive the move.
  pinned?: boolean;
}

interface Row {
  id: string;
  thread_id: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;
  ref_thread_id: string | null;
  ref_block_id: string | null;
  source: string | null;
  pinned: number;
  seq: number | null;
  created_at: number;
}

const fromRow = (r: Row): Block => ({
  id: r.id,
  threadId: r.thread_id,
  kind: r.kind,
  content: r.content,
  annotation: r.annotation,
  refThreadId: r.ref_thread_id,
  refBlockId: r.ref_block_id,
  source: r.source,
  pinned: r.pinned === 1,
  seq: r.seq ?? null,
  createdAt: r.created_at,
});

const SELECT_COLS =
  'id, thread_id, kind, content, annotation, ref_thread_id, ref_block_id, source, pinned, seq, created_at';

export const getBlockById = async (id: string): Promise<Block | null> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE id = $1`,
    [id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
};

export const listBlocksByThread = async (threadId: string): Promise<Block[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

// v2.4 (§20.13 D2): resolve cited blocks (blocks.ref_block_id) for pack rendering —
// citations may point across threads, so this is an id-set lookup, not a thread scan.
export const listBlocksByIds = async (ids: string[]): Promise<Block[]> => {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map(fromRow);
};

export const listPinnedByThread = async (threadId: string): Promise<Block[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE thread_id = $1 AND pinned = 1 ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

export const createBlock = async (args: CreateBlockArgs): Promise<Block> => {
  const db = await getDb();
  const b: Block = {
    id: nanoid(),
    threadId: args.threadId,
    kind: args.kind ?? 'text',
    content: args.content,
    annotation: args.annotation ?? null,
    refThreadId: args.refThreadId ?? null,
    refBlockId: args.refBlockId ?? null,
    source: args.source ?? null,
    pinned: args.pinned ?? false,
    seq: null,
    createdAt: Date.now(),
  };
  // v9: `seq` is computed inside the INSERT, not read-then-written. WAL serialises
  // writers, so a single statement holding the write lock cannot lose the race against
  // the MCP subprocess inserting into the same thread at the same moment.
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, ref_thread_id, ref_block_id, source, pinned, seq, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             (SELECT COALESCE(MAX(seq), 0) + 1 FROM blocks WHERE thread_id = $2), $10)`,
    [
      b.id,
      b.threadId,
      b.kind,
      b.content,
      b.annotation,
      b.refThreadId,
      b.refBlockId,
      b.source,
      b.pinned ? 1 : 0,
      b.createdAt,
    ],
  );
  const assigned = await db.select<{ seq: number | null }[]>(
    'SELECT seq FROM blocks WHERE id = $1',
    [b.id],
  );
  b.seq = assigned[0]?.seq ?? null;
  return b;
};

// §20.1 forward (copy to thread): INSERT pre-built copy blocks. INSERT-ONLY — never reads,
// updates, or deletes an existing row, so a forward cannot touch the source thread's blocks
// (the feature's hard data-safety constraint). The caller builds the rows with fresh ids, the
// target thread_id, and now-based created_at. One multi-row INSERT keeps the whole batch a
// single atomic statement (tauri-plugin-sql's sqlx pool can't honour BEGIN/COMMIT across
// statements — see threads.ts:141 — but a single statement is itself atomic). The blocks_ai
// FTS trigger indexes each new row.
export const insertBlocks = async (blocks: Block[]): Promise<void> => {
  if (blocks.length === 0) return;
  const db = await getDb();
  // v9: seq numbers for the batch. Unlike createBlock's in-statement subquery, a
  // multi-row VALUES list cannot compute them itself — a correlated MAX(seq) may or may
  // not see the rows inserted earlier in the same statement, which would hand out
  // duplicates or gaps. So the base is read once and the offsets are literals. A forward
  // targets one thread the user just picked; if a concurrent MCP write claimed a number
  // in between, idx_blocks_thread_seq rejects the batch rather than duplicating a number,
  // and the user can retry.
  const base = new Map<string, number>();
  for (const threadId of new Set(blocks.map((b) => b.threadId))) {
    const rows = await db.select<{ next: number }[]>(
      'SELECT COALESCE(MAX(seq), 0) AS next FROM blocks WHERE thread_id = $1',
      [threadId],
    );
    base.set(threadId, rows[0]?.next ?? 0);
  }
  const COLS = 11;
  const tuples = blocks
    .map((_, i) => {
      const o = i * COLS;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, $${o + 11})`;
    })
    .join(', ');
  const params = blocks.flatMap((b) => {
    const next = (base.get(b.threadId) ?? 0) + 1;
    base.set(b.threadId, next);
    return [
      b.id,
      b.threadId,
      b.kind,
      b.content,
      b.annotation,
      b.refThreadId,
      b.refBlockId,
      b.source,
      b.pinned ? 1 : 0,
      next,
      b.createdAt,
    ];
  });
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, ref_thread_id, ref_block_id, source, pinned, seq, created_at) VALUES ${tuples}`,
    params,
  );
};

export const updateBlockSource = async (id: string, source: string | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET source = $1 WHERE id = $2', [source, id]);
};

// Reparent a block to a different thread (§11.5 — the capture classification "move").
// Keeps the block's id and created_at, so it sorts into the target thread by time.
// v9: `seq` is per-thread, so a move has to draw a fresh number from the destination —
// carrying the old one over would collide with whatever already holds it there. The
// block's visible number therefore changes when it changes project; nothing else does.
export const updateBlockThread = async (id: string, threadId: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `UPDATE blocks
        SET thread_id = $1,
            seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM blocks WHERE thread_id = $1)
      WHERE id = $2`,
    [threadId, id],
  );
};

export const updateBlockContent = async (id: string, content: string): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET content = $1 WHERE id = $2', [content, id]);
};

export const updateBlockAnnotation = async (
  id: string,
  annotation: string | null,
): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET annotation = $1 WHERE id = $2', [annotation, id]);
};

export const togglePin = async (id: string): Promise<boolean> => {
  const db = await getDb();
  const rows = await db.select<{ pinned: number }[]>(
    'SELECT pinned FROM blocks WHERE id = $1',
    [id],
  );
  const next = rows[0]?.pinned === 1 ? 0 : 1;
  await db.execute('UPDATE blocks SET pinned = $1 WHERE id = $2', [next, id]);
  return next === 1;
};

export const deleteBlock = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM blocks WHERE id = $1', [id]);
};

// §9.13 Undo: re-insert a block verbatim from an undo snapshot, preserving its original
// id and created_at so it lands back at the same feed position. The blocks_ai FTS trigger
// re-indexes it on insert (a fresh rowid is assigned — fine, FTS is rebuilt from it).
// Used to undo a delete, and to recreate the non-survivor blocks when undoing a merge.
// v9: the original `seq` comes back with it. Numbers are never reused after a delete, so
// nothing can have taken it in the meantime — and the user undoing a delete expects the
// block they were just looking at, #12 included.
export const restoreBlock = async (block: Block): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, ref_thread_id, ref_block_id, source, pinned, seq, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      block.id,
      block.threadId,
      block.kind,
      block.content,
      block.annotation,
      block.refThreadId,
      block.refBlockId,
      block.source,
      block.pinned ? 1 : 0,
      block.seq,
      block.createdAt,
    ],
  );
};

// §9.13 Undo (merge): revert the merge survivor's mutable fields to their pre-merge
// values in place. The survivor kept its id / created_at / feed position through the
// merge, so an UPDATE is the exact inverse of the forward merge's survivor write — no
// destructive delete + recreate (which has no transaction to protect it here).
export const restoreBlockFields = async (
  id: string,
  content: string,
  annotation: string | null,
  pinned: boolean,
  source: string | null,
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE blocks SET content = $1, annotation = $2, pinned = $3, source = $4 WHERE id = $5',
    [content, annotation, pinned ? 1 : 0, source, id],
  );
};

// v2.8 §20.1: pure helper computing the survivor + merged fields for a multi-block merge.
// Earliest-created block stays as survivor — keeps its id, created_at, and feed position.
// Contents are joined chronologically; if any source differs across the set, non-survivor
// segments are prefixed with `[from <source>]` so segment boundaries stay visible. Pinned
// becomes true if any merged block was pinned; survivor's source is kept regardless.
//
// Annotation handling (v2.8 §20.1 follow-up, 2026-05-25): per-segment annotations are
// preserved by appending `↪ note: <text>` as the last line of each segment that had one
// (see lib/blocks/segments.ts). The top-level `annotation` field on the merged block is
// set to null when ANY of the merged blocks carried an annotation — having both the
// inline markers AND a duplicate top-level annotation would be confusing for both the
// reader and the pack output. When none of the merged blocks had annotations, the
// content stays marker-free (and the resulting block, like any un-merged one, parses as
// a single segment with no annotation).
export interface MergedFields {
  survivorId: string;
  content: string;
  annotation: string | null;
  pinned: boolean;
  source: string | null;
  nonSurvivorIds: string[];
}

const MERGE_NO_SOURCE_LABEL = '(无来源)';

export const computeMergedFields = (blocks: Block[]): MergedFields => {
  if (blocks.length < 2) throw new Error('mergeBlocks: need at least 2 blocks');
  const ordered = [...blocks].sort((a, b) => a.createdAt - b.createdAt);
  const survivor = ordered[0]!;
  const nonSurvivors = ordered.slice(1);

  const firstSource = ordered[0]!.source ?? null;
  const sourcesDiffer = ordered.some((b) => (b.source ?? null) !== firstSource);

  const segments: Segment[] = ordered.map((b, idx) => {
    const isSurvivor = idx === 0;
    const prefix = sourcesDiffer && !isSurvivor
      ? `[from ${b.source ?? MERGE_NO_SOURCE_LABEL}] `
      : '';
    return {
      text: `${prefix}${b.content}`,
      annotation: b.annotation,
    };
  });

  return {
    survivorId: survivor.id,
    content: joinSegments(segments),
    // Always null: per-segment annotations live inside the content now; carrying a
    // separate top-level annotation would render twice.
    annotation: null,
    pinned: ordered.some((b) => b.pinned),
    source: survivor.source,
    nonSurvivorIds: nonSurvivors.map((b) => b.id),
  };
};

// Merge multiple blocks: re-points attachments to survivor, writes merged fields onto
// survivor, deletes non-survivors. Steps run sequentially (no BEGIN/COMMIT — see
// threads.ts:141 on why tauri-plugin-sql's connection pool makes explicit transactions
// unreliable). Order is safety-driven: attachments are moved BEFORE non-survivor blocks
// are dropped, so the FK cascade can never strand a moved attachment. The FTS sync
// triggers (schema.sql blocks_au/blocks_ad) keep blocks_fts current across both writes.
export const mergeBlocks = async (
  survivorId: string,
  content: string,
  annotation: string | null,
  pinned: boolean,
  source: string | null,
  nonSurvivorIds: string[],
): Promise<void> => {
  if (nonSurvivorIds.length === 0) return;
  const db = await getDb();

  const repointPlaceholders = nonSurvivorIds.map((_, i) => `$${i + 2}`).join(', ');
  await db.execute(
    `UPDATE attachments SET block_id = $1 WHERE block_id IN (${repointPlaceholders})`,
    [survivorId, ...nonSurvivorIds],
  );

  await db.execute(
    'UPDATE blocks SET content = $1, annotation = $2, pinned = $3, source = $4 WHERE id = $5',
    [content, annotation, pinned ? 1 : 0, source, survivorId],
  );

  const deletePlaceholders = nonSurvivorIds.map((_, i) => `$${i + 1}`).join(', ');
  await db.execute(
    `DELETE FROM blocks WHERE id IN (${deletePlaceholders})`,
    [...nonSurvivorIds],
  );
};
