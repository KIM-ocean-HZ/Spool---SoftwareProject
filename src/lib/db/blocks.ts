import { nanoid } from 'nanoid';
import { getDb } from './client';

export type BlockKind = 'text' | 'ref';

export interface Block {
  id: string;
  threadId: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;   // the user's own note about this block
  refThreadId: string | null;  // kind=ref
  source: string | null;       // provenance label, editable
  pinned: boolean;
  createdAt: number;
}

export interface CreateBlockArgs {
  threadId: string;
  kind?: BlockKind;
  content: string;
  annotation?: string | null;
  refThreadId?: string | null;
  source?: string | null;
}

interface Row {
  id: string;
  thread_id: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;
  ref_thread_id: string | null;
  source: string | null;
  pinned: number;
  created_at: number;
}

const fromRow = (r: Row): Block => ({
  id: r.id,
  threadId: r.thread_id,
  kind: r.kind,
  content: r.content,
  annotation: r.annotation,
  refThreadId: r.ref_thread_id,
  source: r.source,
  pinned: r.pinned === 1,
  createdAt: r.created_at,
});

const SELECT_COLS =
  'id, thread_id, kind, content, annotation, ref_thread_id, source, pinned, created_at';

export const listBlocksByThread = async (threadId: string): Promise<Block[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
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
    source: args.source ?? null,
    pinned: false,
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, ref_thread_id, source, pinned, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
    [
      b.id,
      b.threadId,
      b.kind,
      b.content,
      b.annotation,
      b.refThreadId,
      b.source,
      b.createdAt,
    ],
  );
  return b;
};

export const updateBlockSource = async (id: string, source: string | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET source = $1 WHERE id = $2', [source, id]);
};

// Reparent a block to a different thread (§11.5 — the capture classification "move").
// Keeps the block's id and created_at, so it sorts into the target thread by time.
export const updateBlockThread = async (id: string, threadId: string): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET thread_id = $1 WHERE id = $2', [threadId, id]);
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

// v2.8 §20.1: pure helper computing the survivor + merged fields for a multi-block merge.
// Earliest-created block stays as survivor — keeps its id, created_at, and feed position.
// Contents are joined chronologically; if any source differs across the set, non-survivor
// segments are prefixed with `[from <source>]` so segment boundaries stay visible. Pinned
// becomes true if any merged block was pinned; annotations newline-join in chronological
// order (survivor's first); survivor's source is kept regardless.
export interface MergedFields {
  survivorId: string;
  content: string;
  annotation: string | null;
  pinned: boolean;
  source: string | null;
  nonSurvivorIds: string[];
}

const MERGE_SEGMENT_SEPARATOR = '\n\n';
const MERGE_NO_SOURCE_LABEL = '(无来源)';

export const computeMergedFields = (blocks: Block[]): MergedFields => {
  if (blocks.length < 2) throw new Error('mergeBlocks: need at least 2 blocks');
  const ordered = [...blocks].sort((a, b) => a.createdAt - b.createdAt);
  const survivor = ordered[0]!;
  const nonSurvivors = ordered.slice(1);

  const firstSource = ordered[0]!.source ?? null;
  const sourcesDiffer = ordered.some((b) => (b.source ?? null) !== firstSource);

  const segments: string[] = [survivor.content];
  for (const b of nonSurvivors) {
    const prefix = sourcesDiffer ? `[from ${b.source ?? MERGE_NO_SOURCE_LABEL}] ` : '';
    segments.push(`${prefix}${b.content}`);
  }

  const annotations = ordered
    .map((b) => b.annotation)
    .filter((a): a is string => a != null && a.trim().length > 0);

  return {
    survivorId: survivor.id,
    content: segments.join(MERGE_SEGMENT_SEPARATOR),
    annotation: annotations.length > 0 ? annotations.join('\n') : null,
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
