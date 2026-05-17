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
