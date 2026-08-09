import { nanoid } from 'nanoid';
import { getDb } from './client';

// DESIGN_PROJECT_FILES (Ocean 2026-08-08) — a file belongs to a PROJECT, not to one block.
//
// ⚠️ The one rule this module exists to hold: `target` is only ever a path the user picked
// in the system file dialog. Nothing here takes a path from an AI, from a proposal, or from
// captured web content. That is precisely why 「自动挂本地文件」 was rejected in
// DESIGN_CONTEXT_HYGIENE §2 and why this shape was allowed instead (§2 of that design):
// an AI can ask about a file the user already put here, and can never introduce a new one.
export type AttachmentKind = 'file' | 'folder';

// v2.7: which extractor produced an attachment's cached text (or 'failed').
export type AttachmentExtractionKind = 'pdf' | 'docx' | 'plaintext' | 'failed' | null;

export interface Attachment {
  id: string;
  threadId: string;
  kind: AttachmentKind;
  target: string;                              // absolute path, from the file picker only
  label: string;                               // display name
  extractedText: string | null;                // v2.7: auto-extracted text for file kinds
  extractedAt: number | null;                  // v2.7: ms epoch when extraction completed; null if unattempted
  extractionKind: AttachmentExtractionKind;     // v2.7: which extractor handled this (or 'failed')
  includeInPack: boolean;                       // v2.8 §20.2: opt-in flag for inlining extracted_text into pack/summaries
  aiAccess: boolean;                            // v15 §5.1 ①: the user has let an AI ask for this file's text
  createdAt: number;
}

export interface CreateAttachmentArgs {
  threadId: string;
  kind: AttachmentKind;
  target: string;
  label?: string;
}

interface Row {
  id: string;
  thread_id: string;
  kind: AttachmentKind;
  target: string;
  label: string;
  extracted_text: string | null;
  extracted_at: number | null;
  extraction_kind: AttachmentExtractionKind;
  include_in_pack: number;
  ai_access: number;
  created_at: number;
}

const fromRow = (r: Row): Attachment => ({
  id: r.id,
  threadId: r.thread_id,
  kind: r.kind,
  target: r.target,
  label: r.label,
  extractedText: r.extracted_text,
  extractedAt: r.extracted_at,
  extractionKind: r.extraction_kind,
  includeInPack: r.include_in_pack === 1,
  aiAccess: r.ai_access === 1,
  createdAt: r.created_at,
});

const SELECT_COLS =
  'id, thread_id, kind, target, label, extracted_text, extracted_at, extraction_kind, include_in_pack, ai_access, created_at';

const ALL_COLS =
  '(id, thread_id, kind, target, label, extracted_text, extracted_at, extraction_kind, include_in_pack, ai_access, created_at)';

const allValues = (a: Attachment): unknown[] => [
  a.id,
  a.threadId,
  a.kind,
  a.target,
  a.label,
  a.extractedText,
  a.extractedAt,
  a.extractionKind,
  a.includeInPack ? 1 : 0,
  a.aiAccess ? 1 : 0,
  a.createdAt,
];

export const listAttachmentsByThread = async (threadId: string): Promise<Attachment[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM attachments WHERE thread_id = $1 ORDER BY created_at ASC`,
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
  // ai_access defaults to false the same way and for a stronger reason (§5.1 ①): an AI
  // starts with no claim on any file, and only the user can grant one.
  const a: Attachment = {
    id: nanoid(),
    threadId: args.threadId,
    kind: args.kind,
    target: args.target,
    label: args.label ?? '',
    extractedText: null,
    extractedAt: null,
    extractionKind: null,
    includeInPack: false,
    aiAccess: false,
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO attachments (id, thread_id, kind, target, label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [a.id, a.threadId, a.kind, a.target, a.label, a.createdAt],
  );
  return a;
};

// §20.1 forward (copy to thread): INSERT pre-built copy attachments (one multi-row, atomic
// statement — additive only, same data-safety contract as blocks.insertBlocks). Every cached
// field (extracted_text, extracted_at, extraction_kind, include_in_pack) is copied verbatim,
// so no re-extraction runs. ⚠️ `ai_access` is copied too — the rows are the same files the
// user already granted, arriving in a project they chose to copy into.
export const insertAttachments = async (attachments: Attachment[]): Promise<void> => {
  if (attachments.length === 0) return;
  const db = await getDb();
  const COLS = 11;
  const tuples = attachments
    .map((_, i) => {
      const o = i * COLS;
      return `(${Array.from({ length: COLS }, (_, k) => `$${o + k + 1}`).join(', ')})`;
    })
    .join(', ');
  const params = attachments.flatMap(allValues);
  await db.execute(`INSERT INTO attachments ${ALL_COLS} VALUES ${tuples}`, params);
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

// v15 §5.1 ①: grant or revoke an AI's standing permission to ask for this file. The grant is
// long-lived on purpose (Ocean 2026-08-08 — approving the same file every time is the
// approval fatigue DESIGN_MCP_WRITE_ROLE §3.3 is about), which is exactly why revoking it
// has to be one click in the panel where the file is listed.
export const setAiAccess = async (id: string, value: boolean): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE attachments SET ai_access = $1 WHERE id = $2', [value ? 1 : 0, id]);
};

export const deleteAttachment = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = $1', [id]);
};

// §9.13 Undo (delete): re-insert an attachment verbatim from an undo snapshot, preserving
// every column (incl. extracted_text and include_in_pack).
export const restoreAttachment = async (a: Attachment): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO attachments ${ALL_COLS} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    allValues(a),
  );
};
