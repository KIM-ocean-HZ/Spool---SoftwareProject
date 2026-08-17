import { nanoid } from 'nanoid';
import { getDb, INBOX_WORKSPACE_TITLE } from './client';

export interface Workspace {
  id: string;
  title: string;
  /** v23: NULL = top level. Otherwise the workspace this one sits inside. */
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

const fromRow = (r: Row): Workspace => ({
  id: r.id,
  title: r.title,
  parentId: r.parent_id,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const listWorkspaces = async (): Promise<Workspace[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    'SELECT id, title, parent_id, sort_order, created_at, updated_at FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC',
  );
  return rows.map(fromRow);
};

export const createWorkspace = async (
  title: string = '',
  parentId: string | null = null,
): Promise<Workspace> => {
  const db = await getDb();
  const now = Date.now();
  // New workspace lands at the end OF ITS OWN LEVEL: max(sort_order) among its siblings + 1.
  // Scoping this to the parent is what keeps a nested workspace from inheriting a number
  // from a level it is not on — sort_order only ever orders a row against its siblings.
  const maxRows = await db.select<{ m: number | null }[]>(
    parentId === null
      ? 'SELECT MAX(sort_order) AS m FROM workspaces WHERE deleted_at IS NULL AND parent_id IS NULL'
      : 'SELECT MAX(sort_order) AS m FROM workspaces WHERE deleted_at IS NULL AND parent_id = $1',
    parentId === null ? [] : [parentId],
  );
  const sortOrder = (maxRows[0]?.m ?? 0) + 1;
  const ws: Workspace = {
    id: nanoid(),
    title,
    parentId,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    'INSERT INTO workspaces (id, title, parent_id, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [ws.id, ws.title, ws.parentId, ws.sortOrder, ws.createdAt, ws.updatedAt],
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

// `rootId` plus every live workspace nested under it, at any depth. Used by delete (what
// else goes with it) and by the move guard (what may not become its parent). A row already
// soft-deleted stops the walk — its own subtree was stamped by that earlier delete and
// belongs to that delete's undo, not this one.
const descendantIds = async (
  db: Awaited<ReturnType<typeof getDb>>,
  rootId: string,
): Promise<string[]> => {
  const rows = await db.select<{ id: string }[]>(
    `WITH RECURSIVE sub(id) AS (
       SELECT $1
       UNION
       SELECT w.id FROM workspaces w JOIN sub ON w.parent_id = sub.id WHERE w.deleted_at IS NULL
     )
     SELECT id FROM sub`,
    [rootId],
  );
  return rows.map((r) => r.id);
};

// v23: move a workspace to another level. `parentId = null` sends it back to the top.
//
// ⚠️ The one thing that must not be allowed: dropping a workspace inside its own
// descendant. That builds a ring which no longer hangs off the root, so every workspace in
// the ring VANISHES from the sidebar — the user's projects are still in the database and
// nowhere on screen. Refused here rather than repaired in the renderer, because a renderer
// that quietly re-roots a cycle hides the fact that the data is wrong.
export const setWorkspaceParent = async (
  id: string,
  parentId: string | null,
): Promise<number> => {
  if (parentId === id) throw new Error('a workspace cannot be its own parent');
  const db = await getDb();
  if (parentId !== null) {
    const inside = await descendantIds(db, id);
    if (inside.includes(parentId)) {
      throw new Error('a workspace cannot be moved inside one of its own descendants');
    }
  }
  const now = Date.now();
  await db.execute('UPDATE workspaces SET parent_id = $1, updated_at = $2 WHERE id = $3', [
    parentId,
    now,
    id,
  ]);
  return now;
};

// Soft-delete a workspace and cascade-soft-delete its threads. Deleting the workspace
// that holds the capture target is permitted — the caller restores a target afterwards
// (ensureBaseData + ensureCaptureTarget), recreating the Inbox if nothing is left.
//
// v23: the cascade now reaches NESTED workspaces too. Deleting 「升学」 takes the
// 「材料准备」 inside it — leaving a child behind would strand it: its parent is gone from
// every list, so the child hangs off a row nothing renders.
//
// §9.13 undo: the workspaces AND their currently-active threads are stamped with ONE shared
// timestamp (returned), so a later restore can bring back exactly the threads this delete
// removed. Threads the user had deleted earlier carry a different deleted_at and are left
// untouched. `at` is overridable so a redo can re-stamp with the original timestamp.
export const softDeleteWorkspace = async (
  id: string,
  at: number = Date.now(),
): Promise<number> => {
  const db = await getDb();
  for (const wsId of await descendantIds(db, id)) {
    await db.execute('UPDATE workspaces SET deleted_at = $1 WHERE id = $2', [at, wsId]);
    await db.execute(
      'UPDATE threads SET deleted_at = $1 WHERE workspace_id = $2 AND deleted_at IS NULL',
      [at, wsId],
    );
  }
  return at;
};

// §9.13 undo: reverse softDeleteWorkspace. Clears deleted_at on the workspace and ONLY the
// threads stamped by that same delete (matching timestamp). is_capture_target is cleared on
// the restored threads so an undo can't resurrect a second active target.
//
// v23: walks back down the same subtree, and only through rows carrying THIS delete's
// timestamp — a nested workspace the user had deleted a week earlier stays deleted.
export const restoreWorkspace = async (id: string, timestamp: number): Promise<void> => {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `WITH RECURSIVE sub(id) AS (
       SELECT $1
       UNION
       SELECT w.id FROM workspaces w JOIN sub ON w.parent_id = sub.id WHERE w.deleted_at = $2
     )
     SELECT id FROM sub`,
    [id, timestamp],
  );
  for (const { id: wsId } of rows) {
    await db.execute(
      'UPDATE workspaces SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2',
      [wsId, timestamp],
    );
    await db.execute(
      'UPDATE threads SET deleted_at = NULL, is_capture_target = 0 WHERE workspace_id = $1 AND deleted_at = $2',
      [wsId, timestamp],
    );
  }
};

export { INBOX_WORKSPACE_TITLE };
