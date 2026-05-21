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
});

const SELECT_COLS =
  'id, workspace_id, title, summary, digest, deadline, status, is_capture_target, created_at, updated_at, completed_at';

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
  const now = Date.now();
  // Always bump updated_at — even an empty patch is meaningful ("this thread saw
  // activity"), which is how the capture path re-sorts the target thread to the top.
  sets.push(`updated_at = $${i++}`);
  values.push(now);
  values.push(id);
  await db.execute(`UPDATE threads SET ${sets.join(', ')} WHERE id = $${i}`, values);
  return now;
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
