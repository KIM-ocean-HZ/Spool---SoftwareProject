import { nanoid } from 'nanoid';
import { getDb, INBOX_WORKSPACE_TITLE } from './client';

export interface Workspace {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  title: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

const fromRow = (r: Row): Workspace => ({
  id: r.id,
  title: r.title,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const listWorkspaces = async (): Promise<Workspace[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    'SELECT id, title, sort_order, created_at, updated_at FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC',
  );
  return rows.map(fromRow);
};

export const createWorkspace = async (title: string = ''): Promise<Workspace> => {
  const db = await getDb();
  const now = Date.now();
  // New workspace lands at the end: max(sort_order) + 1.
  const maxRows = await db.select<{ m: number | null }[]>(
    'SELECT MAX(sort_order) AS m FROM workspaces WHERE deleted_at IS NULL',
  );
  const sortOrder = (maxRows[0]?.m ?? 0) + 1;
  const ws: Workspace = {
    id: nanoid(),
    title,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    'INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
    [ws.id, ws.title, ws.sortOrder, ws.createdAt, ws.updatedAt],
  );
  return ws;
};

export const renameWorkspace = async (id: string, title: string): Promise<number> => {
  const db = await getDb();
  const now = Date.now();
  await db.execute('UPDATE workspaces SET title = $1, updated_at = $2 WHERE id = $3', [
    title,
    now,
    id,
  ]);
  return now;
};

export const reorderWorkspaces = async (orderedIds: string[]): Promise<void> => {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute('UPDATE workspaces SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
  }
};

// Soft-delete a workspace and cascade-soft-delete its threads. Deleting the workspace
// that holds the capture target is permitted — the caller restores a target afterwards
// (ensureBaseData + ensureCaptureTarget), recreating the Inbox if nothing is left.
//
// §9.13 undo: the workspace AND its currently-active threads are stamped with ONE shared
// timestamp (returned), so a later restore can bring back exactly the threads this delete
// removed. Threads the user had deleted earlier carry a different deleted_at and are left
// untouched. `at` is overridable so a redo can re-stamp with the original timestamp.
export const softDeleteWorkspace = async (
  id: string,
  at: number = Date.now(),
): Promise<number> => {
  const db = await getDb();
  await db.execute('UPDATE workspaces SET deleted_at = $1 WHERE id = $2', [at, id]);
  await db.execute(
    'UPDATE threads SET deleted_at = $1 WHERE workspace_id = $2 AND deleted_at IS NULL',
    [at, id],
  );
  return at;
};

// §9.13 undo: reverse softDeleteWorkspace. Clears deleted_at on the workspace and ONLY the
// threads stamped by that same delete (matching timestamp). is_capture_target is cleared on
// the restored threads so an undo can't resurrect a second active target.
export const restoreWorkspace = async (id: string, timestamp: number): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE workspaces SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2',
    [id, timestamp],
  );
  await db.execute(
    'UPDATE threads SET deleted_at = NULL, is_capture_target = 0 WHERE workspace_id = $1 AND deleted_at = $2',
    [id, timestamp],
  );
};

export { INBOX_WORKSPACE_TITLE };
