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
  includeInPack: boolean;                       // v2.8 §20.2: opt-in flag for inlining extracted_text into pack/summaries
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
  include_in_pack: number;
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
  includeInPack: r.include_in_pack === 1,
  createdAt: r.created_at,
});

const SELECT_COLS =
  'id, block_id, kind, target, label, extracted_text, extracted_at, extraction_kind, include_in_pack, created_at';

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
            a.extracted_text, a.extracted_at, a.extraction_kind, a.include_in_pack, a.created_at
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
  // Extraction columns start NULL — filled in asynchronously by the v2.7 extraction
  // pipeline (see updateAttachmentExtraction). include_in_pack defaults to false (v2.8
  // §20.2): extraction stays always-on for preview, but inlining is opt-in per attachment.
  const a: Attachment = {
    id: nanoid(),
    blockId: args.blockId,
    kind: args.kind,
    target: args.target,
    label: args.label ?? '',
    extractedText: null,
    extractedAt: null,
    extractionKind: null,
    includeInPack: false,
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

// v2.8 §20.2: flip per-attachment opt-in for inlining extracted_text into pack/summaries.
// Extraction itself is untouched — only whether assemble.ts / status / digest prompts
// inline the cached text. Persisted as 0/1; the in-memory model carries it as boolean.
export const setIncludeInPack = async (id: string, value: boolean): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE attachments SET include_in_pack = $1 WHERE id = $2', [
    value ? 1 : 0,
    id,
  ]);
};

export const deleteAttachment = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = $1', [id]);
};

// §9.13 Undo (delete): re-insert an attachment verbatim from an undo snapshot, preserving
// every column (incl. extracted_text and include_in_pack). Used when undoing a block
// delete — the forward delete cascade-removed the block's attachments, so they must be
// recreated rather than re-pointed.
export const restoreAttachment = async (a: Attachment): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO attachments
       (id, block_id, kind, target, label, extracted_text, extracted_at, extraction_kind, include_in_pack, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      a.id,
      a.blockId,
      a.kind,
      a.target,
      a.label,
      a.extractedText,
      a.extractedAt,
      a.extractionKind,
      a.includeInPack ? 1 : 0,
      a.createdAt,
    ],
  );
};

// §9.13 Undo (merge): move an attachment back to its original owner block. The forward
// merge re-pointed it onto the survivor via UPDATE block_id; this is the inverse.
export const reassignAttachmentBlock = async (
  id: string,
  blockId: string,
): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE attachments SET block_id = $1 WHERE id = $2', [blockId, id]);
};
