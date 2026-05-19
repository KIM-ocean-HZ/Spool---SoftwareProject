import { nanoid } from 'nanoid';
import { getDb } from './client';

export type AttachmentKind = 'file' | 'folder' | 'url';

// v2.7: which extractor produced an attachment's cached text (or 'failed').
export type AttachmentExtractionKind = 'pdf' | 'docx' | 'plaintext' | 'failed' | null;

export interface Attachment {
  id: string;
  blockId: string;
  kind: AttachmentKind;
  target: string;                              // absolute path or URL
  label: string;                               // display name
  extractedText: string | null;                // v2.7: auto-extracted text for file kinds
  extractedAt: number | null;                  // v2.7: ms epoch when extraction completed; null if unattempted
  extractionKind: AttachmentExtractionKind;     // v2.7: which extractor handled this (or 'failed')
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
  extracted_text: string | null;
  extracted_at: number | null;
  extraction_kind: AttachmentExtractionKind;
  created_at: number;
}

const fromRow = (r: Row): Attachment => ({
  id: r.id,
  blockId: r.block_id,
  kind: r.kind,
  target: r.target,
  label: r.label,
  extractedText: r.extracted_text,
  extractedAt: r.extracted_at,
  extractionKind: r.extraction_kind,
  createdAt: r.created_at,
});

const SELECT_COLS =
  'id, block_id, kind, target, label, extracted_text, extracted_at, extraction_kind, created_at';

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
    `SELECT a.id, a.block_id, a.kind, a.target, a.label,
            a.extracted_text, a.extracted_at, a.extraction_kind, a.created_at
       FROM attachments a
       JOIN blocks b ON b.id = a.block_id
      WHERE b.thread_id = $1
      ORDER BY a.created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

// v2.7: file attachments that have never had an extraction pass — used by the one-time
// startup backfill for rows created before v2.7 (PLAN §8.1 lazy backfill). All three
// extraction columns being NULL means extraction was never attempted.
export const listAttachmentsNeedingExtraction = async (): Promise<Attachment[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM attachments
      WHERE kind = 'file'
        AND extracted_text IS NULL AND extracted_at IS NULL AND extraction_kind IS NULL
      ORDER BY created_at ASC`,
  );
  return rows.map(fromRow);
};

export const createAttachment = async (args: CreateAttachmentArgs): Promise<Attachment> => {
  const db = await getDb();
  // The three extraction columns start NULL — they are filled in asynchronously after
  // the row exists, by the v2.7 extraction pipeline (see updateAttachmentExtraction).
  const a: Attachment = {
    id: nanoid(),
    blockId: args.blockId,
    kind: args.kind,
    target: args.target,
    label: args.label ?? '',
    extractedText: null,
    extractedAt: null,
    extractionKind: null,
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO attachments (id, block_id, kind, target, label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [a.id, a.blockId, a.kind, a.target, a.label, a.createdAt],
  );
  return a;
};

// v2.7: record the result of a text-extraction pass on an attachment. Called by the
// extraction pipeline once `extractAttachmentText` resolves — with the text and the
// extractor kind on success, or `(null, 'failed')` on failure / unsupported type.
// `extracted_at` is always stamped, marking that extraction was attempted.
export const updateAttachmentExtraction = async (
  id: string,
  text: string | null,
  kind: AttachmentExtractionKind,
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `UPDATE attachments
        SET extracted_text = $1, extracted_at = $2, extraction_kind = $3
      WHERE id = $4`,
    [text, Date.now(), kind, id],
  );
};

export const deleteAttachment = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = $1', [id]);
};
