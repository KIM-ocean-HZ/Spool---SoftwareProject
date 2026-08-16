import { nanoid } from 'nanoid';
import { followUpFingerprint } from '@/lib/engine/followUp';
import { getDb } from './client';

// DESIGN_FOLLOW_UP §8 — what a project follows up, one row per line (v22).
//
// Ocean decided on 2026-08-16 that the user sees ONE list, not two (§8.2). The two kinds of
// line still live in it and still behave differently, and `standing` is what tells them
// apart:
//
//   standing  a watch that never completes. An AI may not close it — it can only propose
//             retiring it. Without this marker, an AI that answers "the deadline is March 1"
//             closes the watch too, and the project silently stops being watched.
//   one-off   a question that retires the moment it is answered.
//
// Everything an AI proposes lands as 'proposed' and waits on the review screen: a line here
// outlives this conversation and steers what the next one goes looking for, so a page an AI
// read must never be able to file one directly (§8.4, same reasoning as the brief it
// replaces).

export type FollowUpStatus = 'proposed' | 'open' | 'answered';

export interface FollowUpItem {
  id: string;
  threadId: string;
  text: string;
  /** One line on why it matters to this project. AI-proposed rows carry it; the user's own
   *  lines usually do not — they wrote it, they know. */
  why: string | null;
  standing: boolean;
  status: FollowUpStatus;
  /** Which AI proposed it, for the review card. Null when the user wrote the line. */
  proposedBy: string | null;
  sortOrder: number;
  createdAt: number;
  approvedAt: number | null;
  lastRaisedAt: number | null;
  answeredAt: number | null;
  answerBlockId: string | null;
  outcome: string | null;
}

interface Row {
  id: string;
  thread_id: string;
  text: string;
  why: string | null;
  standing: number;
  status: FollowUpStatus;
  proposed_by: string | null;
  sort_order: number;
  created_at: number;
  approved_at: number | null;
  last_raised_at: number | null;
  answered_at: number | null;
  answer_block_id: string | null;
  outcome: string | null;
}

const fromRow = (r: Row): FollowUpItem => ({
  id: r.id,
  threadId: r.thread_id,
  text: r.text,
  why: r.why,
  standing: r.standing === 1,
  status: r.status,
  proposedBy: r.proposed_by,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  approvedAt: r.approved_at,
  lastRaisedAt: r.last_raised_at,
  answeredAt: r.answered_at,
  answerBlockId: r.answer_block_id,
  outcome: r.outcome,
});

const SELECT_COLS =
  'id, thread_id, text, why, standing, status, proposed_by, sort_order, created_at, approved_at, last_raised_at, answered_at, answer_block_id, outcome';

/** Every line of one project's list, whatever its state. Callers filter: the panel shows
 *  open ones as the list and answered ones folded underneath, and proposals are shown on the
 *  review screen instead. */
export const listFollowUpItems = async (threadId: string): Promise<FollowUpItem[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM follow_up_items WHERE thread_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

/** How many live lines this project has. Zero is the off switch — a follow-up with nothing
 *  to look for cannot run, which is what `follow_up_brief IS NULL` used to mean (§3.2). */
export const countOpenFollowUpItems = async (threadId: string): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM follow_up_items WHERE thread_id = $1 AND status = 'open'",
    [threadId],
  );
  return rows[0]?.c ?? 0;
};

const nextSortOrder = async (threadId: string): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ m: number | null }[]>(
    'SELECT MAX(sort_order) AS m FROM follow_up_items WHERE thread_id = $1',
    [threadId],
  );
  return (rows[0]?.m ?? -1) + 1;
};

/** The user adds a line themselves — live immediately, no review step. The gate in §8.4 is
 *  about what an AI files, not about what the user types into their own list. */
export const addFollowUpItem = async (
  threadId: string,
  text: string,
  standing: boolean,
): Promise<void> => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT INTO follow_up_items
       (id, thread_id, text, why, standing, fingerprint, status, proposed_by,
        sort_order, created_at, approved_at)
     VALUES ($1, $2, $3, NULL, $4, $5, 'open', NULL, $6, $7, $7)`,
    [
      nanoid(),
      threadId,
      trimmed,
      standing ? 1 : 0,
      followUpFingerprint(trimmed),
      await nextSortOrder(threadId),
      now,
    ],
  );
};

export const updateFollowUpItemText = async (id: string, text: string): Promise<void> => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const db = await getDb();
  await db.execute('UPDATE follow_up_items SET text = $1, fingerprint = $2 WHERE id = $3', [
    trimmed,
    followUpFingerprint(trimmed),
    id,
  ]);
};

export const setFollowUpItemStanding = async (id: string, standing: boolean): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE follow_up_items SET standing = $1 WHERE id = $2', [
    standing ? 1 : 0,
    id,
  ]);
};

/** Answered — retired, not deleted (§8.6). The row keeps rendering under 「已经答了」 with
 *  what closed it, and one click puts it back. That is what makes it safe to let an AI do
 *  this without asking first (Ocean 拍板 2026-08-16): the worst a page that lies about
 *  something being settled can do is park one line where the user can see it. */
export const closeFollowUpItem = async (
  id: string,
  outcome: string | null,
  answerBlockId: string | null = null,
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `UPDATE follow_up_items
        SET status = 'answered', answered_at = $2, outcome = $3, answer_block_id = $4
      WHERE id = $1 AND status = 'open'`,
    [id, Date.now(), outcome?.trim() || null, answerBlockId],
  );
};

export const reopenFollowUpItem = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `UPDATE follow_up_items
        SET status = 'open', answered_at = NULL, outcome = NULL, answer_block_id = NULL
      WHERE id = $1 AND status = 'answered'`,
    [id],
  );
};

/** The user drops a line for good. Theirs to delete — unlike closing, this leaves nothing,
 *  which is right for "I never wanted this watched" and wrong for "this got answered". */
export const deleteFollowUpItem = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM follow_up_items WHERE id = $1', [id]);
};

/** Put a just-deleted row back exactly as it was, for the 撤销 on the toast (Ocean
 *  2026-08-17 — a line he had typed went for good on one click of an icon he had not meant
 *  to press, and there was no way back from it).
 *
 *  ⚠️ It restores the ORIGINAL id, which is what makes this an undo rather than retyping:
 *  `answer_block_id` and anything that ever cites a line point at that id, and minting a new
 *  one would leave a row that looks right and is pointed at by nothing. */
export const restoreFollowUpItem = async (item: FollowUpItem): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO follow_up_items
       (id, thread_id, text, why, standing, fingerprint, status, proposed_by, sort_order,
        created_at, approved_at, last_raised_at, answered_at, answer_block_id, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      item.id,
      item.threadId,
      item.text,
      item.why,
      item.standing ? 1 : 0,
      followUpFingerprint(item.text),
      item.status,
      item.proposedBy,
      item.sortOrder,
      item.createdAt,
      item.approvedAt,
      item.lastRaisedAt,
      item.answeredAt,
      item.answerBlockId,
      item.outcome,
    ],
  );
};

// ---------------------------------------------------------------------------------------
// The review side: lines an AI proposed, waiting for the user.
// ---------------------------------------------------------------------------------------

export interface FollowUpProposal extends FollowUpItem {
  threadTitle: string;
}

export const listFollowUpProposals = async (): Promise<FollowUpProposal[]> => {
  const db = await getDb();
  const rows = await db.select<(Row & { thread_title: string })[]>(
    `SELECT ${SELECT_COLS.split(', ')
      .map((c) => `f.${c}`)
      .join(', ')}, t.title AS thread_title
       FROM follow_up_items f JOIN threads t ON t.id = f.thread_id
      WHERE f.status = 'proposed' AND t.deleted_at IS NULL
      ORDER BY f.created_at ASC`,
  );
  return rows.map((r) => ({ ...fromRow(r), threadTitle: r.thread_title }));
};

export const countFollowUpProposals = async (): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM follow_up_items f JOIN threads t ON t.id = f.thread_id
      WHERE f.status = 'proposed' AND t.deleted_at IS NULL`,
  );
  return rows[0]?.c ?? 0;
};

/** The user said yes: the line goes live and starts steering what gets looked for.
 *
 *  ⚠️ `updated_at` moves on the project too, for the reason applying a brief suggestion moved
 *  it (2026-08-09): `list_threads` reports what a project is following up, and its own
 *  description promises "updated_at moves on any change at all". Leaving it still would make
 *  the tool state a fact the project's clock denies. */
export const approveFollowUpProposal = async (id: string): Promise<void> => {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `UPDATE follow_up_items SET status = 'open', approved_at = $2
      WHERE id = $1 AND status = 'proposed'`,
    [id, now],
  );
  await db.execute(
    `UPDATE threads SET updated_at = $2
      WHERE id = (SELECT thread_id FROM follow_up_items WHERE id = $1)`,
    [id, now],
  );
};

/** The user said no. No trace — the same rule as a rejected block proposal: a rejection log
 *  is a landfill, and a line they already turned down must not come back as history. */
export const dismissFollowUpProposal = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute("DELETE FROM follow_up_items WHERE id = $1 AND status = 'proposed'", [id]);
};
