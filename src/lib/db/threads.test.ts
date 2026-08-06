import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setTestDb } from './client';
import schemaSql from './schema.sql?raw';
import { createThread, listThreadsByWorkspace, setFollowUpBrief } from './threads';
import { createWorkspace } from './workspaces';

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

// DESIGN_FOLLOW_UP §3.2 — the brief is the on/off switch, so its NULL semantics are the
// thing worth pinning down. A project that comes out of here with a non-null brief by
// accident is a project that will go out to the open web without the user asking.
describe('follow-up brief (DESIGN_FOLLOW_UP §3.2)', () => {
  let handle: Sqlite;
  let wsId: string;
  let threadId: string;

  beforeEach(async () => {
    handle = new DatabaseSync(':memory:');
    handle.exec(schemaSql.replace(/--.*$/gm, ''));
    __setTestDb(makeAdapter(handle));
    wsId = (await createWorkspace('收件箱')).id;
    threadId = (await createThread(wsId, '升学规划')).id;
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  const briefOf = async (): Promise<string | null> => {
    const [t] = await listThreadsByWorkspace(wsId);
    return t!.followUpBrief;
  };

  it('starts off for a brand-new project', async () => {
    expect(await briefOf()).toBeNull();
  });

  it('stores what the user settled on, and trims it', async () => {
    await setFollowUpBrief(threadId, '  CMU 的截止日期变没变\nGRE 还要不要  ');
    expect(await briefOf()).toBe('CMU 的截止日期变没变\nGRE 还要不要');
  });

  it('treats empty and whitespace as OFF, not as a brief', async () => {
    await setFollowUpBrief(threadId, '要盯的东西');
    expect(await briefOf()).not.toBeNull();
    // An emptied text box is how the user turns follow-up off (§3.2 — there is no separate
    // switch), so it has to land as NULL rather than as an empty brief that still runs.
    await setFollowUpBrief(threadId, '   \n  ');
    expect(await briefOf()).toBeNull();
    await setFollowUpBrief(threadId, '要盯的东西');
    await setFollowUpBrief(threadId, null);
    expect(await briefOf()).toBeNull();
  });

  it('leaves the rest of the project alone', async () => {
    const before = handle.prepare('SELECT title, status, updated_at FROM threads').get();
    await setFollowUpBrief(threadId, '要盯的东西');
    expect(handle.prepare('SELECT title, status, updated_at FROM threads').get()).toEqual(before);
  });
});
