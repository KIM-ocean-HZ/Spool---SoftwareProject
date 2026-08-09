import { getDb } from './client';

// DESIGN_PROJECT_FILES §3.4 (phase three) — the read/approve half of «AI 申请访问文件».
//
// The line this module keeps is the one §2 was allowed to exist on: **an AI can ask about a
// file the user already put in a project, and can never introduce a new one.** Every id in
// here points at an `attachments` row that came out of the system file dialog. Nothing takes
// a path.
//
// Approval is the only thing that sets `ai_access = 1`, and it is deliberately long-lived
// (Ocean 2026-08-08 ①): re-approving the same PDF every session is exactly the approval
// fatigue DESIGN_MCP_WRITE_ROLE §3.3 says defeats consent. The price of a standing grant is
// that it must be visible and revocable in one click — that is the ✓ in the project's file
// panel, not anything here.
//
// Refusal deletes the rows and records nothing (§4.3, the proposal queue's rule: what the
// user turned away leaves no trace). Expiry is that same deletion on the same 7-day timer.

export interface FileAccessFile {
  attachmentId: string;
  label: string;
  target: string;
  /** How much text is actually in it — the size of what the user would be handing over. */
  extractedChars: number | null;
}

export interface FileAccessRequest {
  requestId: string;
  /** Source label of the AI that asked, captured when it asked. */
  client: string;
  threadId: string;
  /** Why it wants them. The one thing the user judges the request by, so it is never empty. */
  why: string;
  createdAt: number;
  expiresAt: number;
  files: FileAccessFile[];
}

interface Row {
  request_id: string;
  client: string;
  thread_id: string;
  why: string;
  created_at: number;
  expires_at: number;
  attachment_id: string;
  label: string;
  target: string;
  extracted_text: string | null;
}

// A request is worth showing only while every part of it still exists: the join drops rows
// whose file or project has since gone, and a request left with no files disappears with
// them. Approving a request whose file was deleted would grant nothing and say it granted
// something.
const SELECT_JOINED = `
  SELECT r.request_id, r.client, r.thread_id, r.why, r.created_at, r.expires_at,
         r.attachment_id, a.label, a.target, a.extracted_text
    FROM file_access_requests r
    JOIN attachments a ON a.id = r.attachment_id
    JOIN threads t ON t.id = r.thread_id AND t.deleted_at IS NULL
   WHERE r.expires_at > $1
   ORDER BY r.created_at ASC`;

const group = (rows: Row[]): FileAccessRequest[] => {
  const byId = new Map<string, FileAccessRequest>();
  for (const r of rows) {
    const existing = byId.get(r.request_id);
    const file: FileAccessFile = {
      attachmentId: r.attachment_id,
      label: r.label,
      target: r.target,
      extractedChars: r.extracted_text === null ? null : [...r.extracted_text].length,
    };
    if (existing) existing.files.push(file);
    else
      byId.set(r.request_id, {
        requestId: r.request_id,
        client: r.client,
        threadId: r.thread_id,
        why: r.why,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        files: [file],
      });
  }
  return [...byId.values()];
};

export const listPendingFileRequests = async (now: number): Promise<FileAccessRequest[]> => {
  const db = await getDb();
  return group(await db.select<Row[]>(SELECT_JOINED, [now]));
};

/** One number for the badge — requests, not files: the user makes one decision per card. */
export const countPendingFileRequests = async (now: number): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(DISTINCT r.request_id) AS c
       FROM file_access_requests r
       JOIN attachments a ON a.id = r.attachment_id
       JOIN threads t ON t.id = r.thread_id AND t.deleted_at IS NULL
      WHERE r.expires_at > $1`,
    [now],
  );
  return rows[0]?.c ?? 0;
};

const deleteRequest = async (requestId: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM file_access_requests WHERE request_id = $1', [requestId]);
};

/**
 * Grant: the files named in this request become readable to any AI, until the user takes it
 * back in the file panel. Returns how many were granted.
 *
 * ⚠️ The grant is written from the request rows rather than from anything the caller passes,
 * so the UI cannot widen it — the only ids that can be flipped are the ones the user just
 * read on the card.
 */
export const approveFileRequest = async (requestId: string): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ attachment_id: string }[]>(
    'SELECT attachment_id FROM file_access_requests WHERE request_id = $1',
    [requestId],
  );
  const ids = rows.map((r) => r.attachment_id);
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await db.execute(`UPDATE attachments SET ai_access = 1 WHERE id IN (${placeholders})`, ids);
  }
  await deleteRequest(requestId);
  return ids.length;
};

/** Refuse: the rows go and nothing records that they were ever asked for (§4.3). */
export const rejectFileRequest = (requestId: string): Promise<void> => deleteRequest(requestId);

export const purgeExpiredFileRequests = async (now: number): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM file_access_requests WHERE expires_at <= $1', [now]);
};

// Test-only seam: the queue's only writer is the Rust MCP server, so a TS test has no way
// to put a request in front of the approve path without one. Never called by the app.
export const __insertFileRequestForTest = async (
  r: Omit<FileAccessRequest, 'files'> & { files: { attachmentId: string }[] },
): Promise<void> => {
  const db = await getDb();
  for (let i = 0; i < r.files.length; i++) {
    await db.execute(
      `INSERT INTO file_access_requests (id, request_id, client, thread_id, attachment_id, why, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `${r.requestId}-${i}`,
        r.requestId,
        r.client,
        r.threadId,
        r.files[i]!.attachmentId,
        r.why,
        r.createdAt,
        r.expiresAt,
      ],
    );
  }
};
