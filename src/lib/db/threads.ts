import { nanoid } from 'nanoid';
import { getDb } from './client';

export type ThreadStatus = 'active' | 'parked' | 'done';

export interface Thread {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;     // active-stage status summary
  digest: string | null;      // conclusion summary at completion; may be empty
  deadline: number | null;
  status: ThreadStatus;
  isCaptureTarget: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** DESIGN_FOLLOW_UP §3.2: what this project wants watched on the open web. NULL is the
   *  off switch — there is no separate enabled column, because a follow-up with nothing to
   *  look for is not a thing that can run. */
  followUpBrief: string | null;
  /** DESIGN_WORKBENCH §4.3: null = the user has not said, so the master switch decides;
   *  false = never maintain this project automatically, whatever the switch says. */
  autoMaintain: boolean | null;
}

export type ThreadPatch = Partial<
  Pick<
    Thread,
    | 'title'
    | 'summary'
    | 'digest'
    | 'deadline'
    | 'status'
    | 'workspaceId'
    | 'completedAt'
  >
>;

interface Row {
  id: string;
  workspace_id: string;
  title: string;
  summary: string | null;
  digest: string | null;
  deadline: number | null;
  status: ThreadStatus;
  is_capture_target: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  follow_up_brief: string | null;
  auto_maintain: number | null;
}

const fromRow = (r: Row): Thread => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: r.title,
  summary: r.summary,
  digest: r.digest,
  deadline: r.deadline,
  status: r.status,
  isCaptureTarget: r.is_capture_target === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
  followUpBrief: r.follow_up_brief,
  autoMaintain: r.auto_maintain === null ? null : r.auto_maintain === 1,
});

// follow_up_state is deliberately NOT here: it is bookkeeping for the next run (§2.4's
// "what did I already propose"), never something a view renders, and it can hold a long
// list of URLs. The one reader loads it on its own.
const SELECT_COLS =
  'id, workspace_id, title, summary, digest, deadline, status, is_capture_target, created_at, updated_at, completed_at, follow_up_brief, auto_maintain';

export const listAllThreads = async (): Promise<Thread[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM threads WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
  );
  return rows.map(fromRow);
};

export const listThreadsByWorkspace = async (workspaceId: string): Promise<Thread[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM threads WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [workspaceId],
  );
  return rows.map(fromRow);
};

export const getCaptureTargetThread = async (): Promise<Thread | null> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM threads WHERE is_capture_target = 1 AND deleted_at IS NULL LIMIT 1`,
  );
  return rows[0] ? fromRow(rows[0]) : null;
};

export const createThread = async (workspaceId: string, title: string = ''): Promise<Thread> => {
  const db = await getDb();
  const now = Date.now();
  const t: Thread = {
    id: nanoid(),
    workspaceId,
    title,
    summary: null,
    digest: null,
    deadline: null,
    status: 'active',
    isCaptureTarget: false,
    followUpBrief: null,
    autoMaintain: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await db.execute(
    `INSERT INTO threads (id, workspace_id, title, status, is_capture_target, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', 0, $4, $5)`,
    [t.id, t.workspaceId, t.title, t.createdAt, t.updatedAt],
  );
  return t;
};

export const updateThread = async (id: string, patch: ThreadPatch): Promise<number> => {
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const cols: Record<keyof ThreadPatch, string> = {
    title: 'title',
    summary: 'summary',
    digest: 'digest',
    deadline: 'deadline',
    status: 'status',
    workspaceId: 'workspace_id',
    completedAt: 'completed_at',
  };
  for (const k of Object.keys(patch) as (keyof ThreadPatch)[]) {
    sets.push(`${cols[k]} = $${i++}`);
    values.push(patch[k] as unknown);
  }
  // Summary provenance: every GUI write is the user's (the app has no AI path since the
  // 2026-07-09 MCP-first pivot). A hand-written summary locks out MCP overwrites; clearing
  // it resets provenance so an MCP client may fill the empty card again.
  if ('summary' in patch) {
    sets.push(`summary_source = $${i++}`);
    values.push(patch.summary != null ? 'user' : null);
    // v16 (§5-5): stamp when this card was written. Never surfaced in the UI — Ocean asked
    // for it recorded, not displayed. Clearing the summary clears the stamp with it, the
    // same way it resets provenance above.
    sets.push(`summary_at = $${i++}`);
    values.push(patch.summary != null ? Date.now() : null);
  }
  const now = Date.now();
  // Always bump updated_at — even an empty patch is meaningful ("this thread saw
  // activity"), which is how the capture path re-sorts the target thread to the top.
  sets.push(`updated_at = $${i++}`);
  values.push(now);
  values.push(id);
  await db.execute(`UPDATE threads SET ${sets.join(', ')} WHERE id = $${i}`, values);
  return now;
};

// DESIGN_FOLLOW_UP §3.2 — the follow-up brief, kept off ThreadPatch on purpose.
//
// ThreadPatch is what the ordinary editing surfaces send, and every one of its fields is
// content. This is a standing instruction to go out to the open web on this project's
// behalf, and the decision 拍板过的 on 2026-08-06 is that the user must have read it before
// it can run (§6-2). Giving it its own function is what keeps "the user approved this
// brief" from becoming a field somebody sets in passing.
//
// Passing null turns follow-up off — that is the whole off switch (§3.2).
export const setFollowUpBrief = async (id: string, brief: string | null): Promise<void> => {
  const db = await getDb();
  const trimmed = brief?.trim();
  await db.execute('UPDATE threads SET follow_up_brief = $1 WHERE id = $2', [
    trimmed && trimmed.length > 0 ? trimmed : null,
    id,
  ]);
};

/** DESIGN_WORKBENCH §4.3 — the per-project opt-out. `null` puts the project back under the
 *  master switch rather than pinning it on; "the user has not said" is a state worth
 *  keeping, because a switch flipped later should reach the projects nobody ruled on. */
export const setAutoMaintain = async (id: string, on: boolean | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE threads SET auto_maintain = $1 WHERE id = $2', [
    on === null ? null : on ? 1 : 0,
    id,
  ]);
};

// 2026-08-11 — `findOrCreateReviewThread` used to live here: 周回顾 had no home, so it made
// itself a project called 「回顾」 in `workspaces[0]`, whichever that happened to be. Ocean
// found one inside his 升学 workspace and asked what the rule was; there wasn't one. A review
// is not a block and needs no project — it is durable in `engine_runs` and read in its own
// pinned view (components/ReviewBoard), so the function has no callers and is gone.

/** §2.4's comparison material: what the last run already saw, so the next one can stay
 *  quiet about it. Opaque JSON to this layer — only the follow-up run reads its shape. */
export const getFollowUpState = async (id: string): Promise<string | null> => {
  const db = await getDb();
  const rows = await db.select<{ follow_up_state: string | null }[]>(
    'SELECT follow_up_state FROM threads WHERE id = $1',
    [id],
  );
  return rows[0]?.follow_up_state ?? null;
};

export const setFollowUpState = async (id: string, state: string | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE threads SET follow_up_state = $1 WHERE id = $2', [state, id]);
};

// Single atomic UPDATE instead of BEGIN/UPDATE/UPDATE/COMMIT. tauri-plugin-sql is backed
// by sqlx::SqlitePool, which means each `db.execute` may borrow a *different* connection
// from the pool — BEGIN on conn A doesn't bind UPDATEs that land on conns B/C, and the
// final COMMIT throws "no transaction" on whatever conn it lands on. The old code left
// the frontend store out of sync with the DB (the await rejected, so set(...) never ran)
// and could also leave the DB momentarily with zero target rows. Single statement, single
// autocommit, atomic.
export const setCaptureTarget = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE threads SET is_capture_target = CASE WHEN id = $1 THEN 1 ELSE 0 END WHERE deleted_at IS NULL',
    [id],
  );
};

// Self-heal: if no thread currently has is_capture_target = 1 (e.g. the user is recovering
// from a session where the old transactional setCaptureTarget half-committed), promote the
// first non-done, non-deleted thread back to target. Returns the promoted id, or null if
// there are no threads at all.
export const ensureCaptureTarget = async (): Promise<string | null> => {
  const db = await getDb();
  const existing = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM threads WHERE is_capture_target = 1 AND deleted_at IS NULL',
  );
  if ((existing[0]?.c ?? 0) > 0) return null;
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM threads
     WHERE deleted_at IS NULL AND status != 'done'
     ORDER BY created_at ASC LIMIT 1`,
  );
  const id = rows[0]?.id;
  if (!id) return null;
  await db.execute('UPDATE threads SET is_capture_target = 1 WHERE id = $1', [id]);
  return id;
};

// Soft-delete is always permitted, including the capture-target thread — the caller is
// responsible for restoring a target afterwards (ensureBaseData + ensureCaptureTarget).
export const softDeleteThread = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE threads SET deleted_at = $1 WHERE id = $2', [Date.now(), id]);
};

// §9.13 undo: clear the soft-delete so the thread (and its blocks, which were never
// deleted) returns. Also clears is_capture_target — deleting the capture target re-promotes
// another, so restoring it must not leave two active targets; the user can re-set it.
export const restoreThread = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE threads SET deleted_at = NULL, is_capture_target = 0 WHERE id = $1',
    [id],
  );
};
