import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setTestDb } from './client';
import schemaSql from './schema.sql?raw';
import { createThread } from './threads';
import {
  createWorkspace,
  listWorkspaces,
  restoreWorkspace,
  setWorkspaceParent,
  softDeleteWorkspace,
} from './workspaces';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
type Sqlite = InstanceType<typeof DatabaseSync>;

type SqlValue = string | number | bigint | null | Uint8Array;
const toNumbered = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

const makeAdapter = (handle: Sqlite): Database =>
  ({
    execute: async (sql: string, params: unknown[] = []) => {
      const r = handle.prepare(toNumbered(sql)).run(...(params as SqlValue[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
    select: async (sql: string, params: unknown[] = []) =>
      handle.prepare(toNumbered(sql)).all(...(params as SqlValue[])),
  }) as unknown as Database;

// DESIGN_WORKSPACE_PACK §4 (v23) — a workspace can sit inside another one. Ocean 2026-08-15:
// 「可以在每个工作区内再新建工作区」. What is worth pinning down here is not that the column
// exists but the two things nesting can silently break: a child left behind by a delete
// (still in the database, gone from every list), and a ring made by dropping a workspace
// into its own descendant (a whole subtree that no longer hangs off the root).
describe('nested workspaces (DESIGN_WORKSPACE_PACK §4)', () => {
  let handle: Sqlite;

  beforeEach(() => {
    handle = new DatabaseSync(':memory:');
    handle.exec(schemaSql.replace(/--.*$/gm, ''));
    __setTestDb(makeAdapter(handle));
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  it('starts a workspace at the top level and records the one it is created inside', async () => {
    const parent = await createWorkspace('升学');
    const child = await createWorkspace('材料准备', parent.id);

    expect(parent.parentId).toBeNull();
    expect(child.parentId).toBe(parent.id);
    const listed = await listWorkspaces();
    expect(listed.map((w) => [w.title, w.parentId])).toEqual([
      ['升学', null],
      ['材料准备', parent.id],
    ]);
  });

  // sort_order only ever orders a row against its SIBLINGS. Numbering a child off the
  // top-level maximum would hand it an ordinal from a level it is not on — harmless until
  // the first reorder, then wrong in a way that looks like the drag "didn't take".
  it('numbers a new workspace within its own level, not across the whole library', async () => {
    const a = await createWorkspace('升学');
    await createWorkspace('求职');
    const first = await createWorkspace('文书', a.id);
    const second = await createWorkspace('推荐信', a.id);

    expect([first.sortOrder, second.sortOrder]).toEqual([1, 2]);
  });

  it('takes the workspaces nested inside it when one is deleted, and their projects', async () => {
    const parent = await createWorkspace('升学');
    const child = await createWorkspace('材料准备', parent.id);
    const grandchild = await createWorkspace('文书', child.id);
    await createThread(grandchild.id, '个人陈述');

    const at = await softDeleteWorkspace(parent.id);

    expect(await listWorkspaces()).toEqual([]);
    // One shared timestamp across the whole subtree — that is what lets the undo bring back
    // exactly what this delete removed (§9.13).
    expect(handle.prepare('SELECT id, deleted_at FROM workspaces ORDER BY created_at').all()).toEqual([
      { id: parent.id, deleted_at: at },
      { id: child.id, deleted_at: at },
      { id: grandchild.id, deleted_at: at },
    ]);
    expect(handle.prepare('SELECT deleted_at FROM threads').all()).toEqual([{ deleted_at: at }]);
  });

  it('brings the whole subtree back on undo', async () => {
    const parent = await createWorkspace('升学');
    const child = await createWorkspace('材料准备', parent.id);
    await createThread(child.id, '个人陈述');

    const at = await softDeleteWorkspace(parent.id);
    await restoreWorkspace(parent.id, at);

    expect((await listWorkspaces()).map((w) => w.id)).toEqual([parent.id, child.id]);
    expect(handle.prepare('SELECT COUNT(*) AS c FROM threads WHERE deleted_at IS NULL').get()).toEqual(
      { c: 1 },
    );
  });

  // A child the user had already thrown away carries a different deleted_at. Undoing the
  // parent's delete must not resurrect it — the undo restores one delete, not everything
  // that ever happened to be inside this workspace.
  it('leaves a workspace deleted earlier deleted when the parent comes back', async () => {
    const parent = await createWorkspace('升学');
    const old = await createWorkspace('旧材料', parent.id);
    const kept = await createWorkspace('材料准备', parent.id);
    await softDeleteWorkspace(old.id, 1000);

    const at = await softDeleteWorkspace(parent.id);
    await restoreWorkspace(parent.id, at);

    expect((await listWorkspaces()).map((w) => w.id)).toEqual([parent.id, kept.id]);
    expect(handle.prepare('SELECT deleted_at FROM workspaces WHERE id = ?1').get(old.id)).toEqual({
      deleted_at: 1000,
    });
  });

  it('moves a workspace into another one and back out to the top', async () => {
    const a = await createWorkspace('升学');
    const b = await createWorkspace('材料准备');

    await setWorkspaceParent(b.id, a.id);
    expect((await listWorkspaces()).find((w) => w.id === b.id)?.parentId).toBe(a.id);

    await setWorkspaceParent(b.id, null);
    expect((await listWorkspaces()).find((w) => w.id === b.id)?.parentId).toBeNull();
  });

  // ⚠️ The failure this guards against is invisible, not noisy: a ring hangs off nothing, so
  // every workspace in it disappears from the sidebar while its projects sit in the database
  // untouched. Refusing the move is the only place this can be caught cheaply.
  it('refuses to move a workspace inside itself or inside its own descendant', async () => {
    const parent = await createWorkspace('升学');
    const child = await createWorkspace('材料准备', parent.id);
    const grandchild = await createWorkspace('文书', child.id);

    await expect(setWorkspaceParent(parent.id, parent.id)).rejects.toThrow(/own parent/);
    await expect(setWorkspaceParent(parent.id, grandchild.id)).rejects.toThrow(/descendant/);
    // Nothing moved.
    expect((await listWorkspaces()).map((w) => w.parentId)).toEqual([
      null,
      parent.id,
      child.id,
    ]);
  });
});
