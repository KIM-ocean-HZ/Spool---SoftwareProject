import { nanoid } from 'nanoid';
import { getDb } from './client';

export type AttachmentKind = 'file' | 'folder' | 'url';

// v2.7: which extractor produced an attachment's cached text (or 'failed').
export type AttachmentExtractionKind = 'pdf' | 'docx' | 'plaintext' | 'failed' | null;

export interface Attachment {
  id: string;
  blockId: string;
  kind: AttachmentKind;
  target: string;              // absolute path or URL
  label: string;               // display name
  // v2.7: auto-extracted text for file kinds. Optional here; the extraction pipeline and
  // the backing schema column land in the next commit, until which these read as undefined.
  extractedText?: string | null;
  extractionKind?: AttachmentExtractionKind;
  createdAt: number;
}

export interface CreateAttachmentArgs {
  blockId: string;
  kind: AttachmentKind;
  target: string;
  label?: string;
}

interface Row {
  id: string;
  block_id: string;
  kind: AttachmentKind;
  target: string;
  label: string;
  created_at: number;
}

const fromRow = (r: Row): Attachment => ({
  id: r.id,
  blockId: r.block_id,
  kind: r.kind,
  target: r.target,
  label: r.label,
  createdAt: r.created_at,
});

const SELECT_COLS = 'id, block_id, kind, target, label, created_at';

export const listAttachmentsByBlock = async (blockId: string): Promise<Attachment[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM attachments WHERE block_id = $1 ORDER BY created_at ASC`,
    [blockId],
  );
  return rows.map(fromRow);
};

// Bulk-load every attachment whose block lives in this thread. Used to hydrate the
// blocks store on thread switch in a single SELECT instead of N per-block queries.
export const listAttachmentsByThread = async (threadId: string): Promise<Attachment[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT a.id, a.block_id, a.kind, a.target, a.label, a.created_at
       FROM attachments a
       JOIN blocks b ON b.id = a.block_id
      WHERE b.thread_id = $1
      ORDER BY a.created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

export const createAttachment = async (args: CreateAttachmentArgs): Promise<Attachment> => {
  const db = await getDb();
  const a: Attachment = {
    id: nanoid(),
    blockId: args.blockId,
    kind: args.kind,
    target: args.target,
    label: args.label ?? '',
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO attachments (id, block_id, kind, target, label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [a.id, a.blockId, a.kind, a.target, a.label, a.createdAt],
  );
  return a;
};

export const deleteAttachment = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = $1', [id]);
};
