import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlock, listBlocksByThread } from './blocks';
import { __setTestDb } from './client';
import {
  __insertBatchForTest,
  approveBatch,
  countExpiredBatches,
  countPending,
  listPendingBatches,
  purgeExpired,
  rejectBatch,
} from './proposals';
import schemaSql from './schema.sql?raw';
import { createThread } from './threads';
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

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe('proposal queue (DESIGN_MCP_WRITE_ROLE §4 M1)', () => {
  let handle: Sqlite;
  let wsId: string;
  let mlId: string;
  let paperId: string;
  let inboxId: string;

  beforeEach(async () => {
    handle = new DatabaseSync(':memory:');
    handle.exec(schemaSql.replace(/--.*$/gm, ''));
    __setTestDb(makeAdapter(handle));
    wsId = (await createWorkspace('收件箱')).id;
    mlId = (await createThread(wsId, '机器学习课')).id;
    paperId = (await createThread(wsId, '论文')).id;
    inboxId = (await createThread(wsId, '收件箱项目')).id;
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  const queue = async (over: Partial<Parameters<typeof __insertBatchForTest>[0]> = {}) => {
    await __insertBatchForTest({
      id: 'batch1',
      client: 'Claude · MCP',
      note: '从你贴的那段拆的',
      sourceText: '一整段原文，里面既有机器学习课的事也有论文的事。',
      sourceThreadId: inboxId,
      createdAt: NOW,
      expiresAt: NOW + 7 * DAY,
      items: [
        { threadId: mlId, content: '属于机器学习课的那半段', annotation: '为什么留', refBlockId: null },
        { threadId: paperId, content: '属于论文的那半段', annotation: null, refBlockId: null },
      ],
      ...over,
    });
  };

  it('is invisible to the library until approved', async () => {
    await queue();
    expect(await listBlocksByThread(mlId)).toHaveLength(0);
    expect(await listBlocksByThread(paperId)).toHaveLength(0);
    expect(await countPending(NOW)).toBe(2);
    const [batch] = await listPendingBatches(NOW);
    expect(batch?.items).toHaveLength(2);
    expect(batch?.sourceText).toContain('一整段原文');
  });

  it('approving stores the passage first and points every piece back at it', async () => {
    await queue();
    const written = await approveBatch('batch1');
    // Two proposals plus the original passage.
    expect(written).toBe(3);

    const origin = await listBlocksByThread(inboxId);
    expect(origin).toHaveLength(1);
    // §4.4 A: the passage is the user's own words, so it carries no source label — that
    // is what makes it read as theirs in a pack rather than as quoted material.
    expect(origin[0]!.source).toBeNull();

    const ml = await listBlocksByThread(mlId);
    expect(ml).toHaveLength(1);
    expect(ml[0]!.content).toBe('属于机器学习课的那半段');
    expect(ml[0]!.annotation).toBe('为什么留');
    // Attributed to the client that proposed it, exactly like an add_block write.
    expect(ml[0]!.source).toBe('Claude · MCP');
    // The citation is the point of §4.4: a piece cut out of context can be checked
    // against the context it was cut from, even across projects.
    expect(ml[0]!.refBlockId).toBe(origin[0]!.id);
    const paper = await listBlocksByThread(paperId);
    expect(paper[0]!.refBlockId).toBe(origin[0]!.id);

    // The queue is emptied by the approval — approved or not, nothing is left behind.
    expect(await countPending(NOW)).toBe(0);
    expect(await listPendingBatches(NOW)).toHaveLength(0);
  });

  it("keeps a proposal's own citation rather than overwriting it with the passage", async () => {
    const cited = await createBlock({ threadId: mlId, content: '一条早先的结论' });
    await queue({
      items: [{ threadId: mlId, content: '建立在旧结论上的一条', annotation: null, refBlockId: cited.id }],
    });
    await approveBatch('batch1');
    const ml = await listBlocksByThread(mlId);
    const fresh = ml.find((b) => b.content === '建立在旧结论上的一条');
    expect(fresh?.refBlockId).toBe(cited.id);
  });

  it('approving a subset writes only those and drops the rest without a trace', async () => {
    await queue();
    const [batch] = await listPendingBatches(NOW);
    const keep = batch!.items.filter((i) => i.threadId === mlId).map((i) => i.id);
    const written = await approveBatch('batch1', keep);
    expect(written).toBe(2); // the passage + the one kept
    expect(await listBlocksByThread(mlId)).toHaveLength(1);
    expect(await listBlocksByThread(paperId)).toHaveLength(0);
    // §4.3: what the user declined leaves nothing behind — no rejected-item log.
    expect(await countPending(NOW)).toBe(0);
    const leftovers = handle.prepare('SELECT COUNT(*) AS c FROM proposals').get() as { c: number };
    expect(leftovers.c).toBe(0);
  });

  it('rejecting writes nothing and leaves no record', async () => {
    await queue();
    await rejectBatch('batch1');
    expect(await listBlocksByThread(mlId)).toHaveLength(0);
    expect(await listBlocksByThread(inboxId)).toHaveLength(0);
    expect(await countPending(NOW)).toBe(0);
    const batches = handle.prepare('SELECT COUNT(*) AS c FROM proposal_batches').get() as {
      c: number;
    };
    expect(batches.c).toBe(0);
  });

  it('goes void after 7 days instead of waiting forever', async () => {
    await queue();
    const later = NOW + 8 * DAY;
    expect(await countPending(later)).toBe(0);
    expect(await listPendingBatches(later)).toHaveLength(0);
    expect(await countExpiredBatches(later)).toBe(1);
    // The day it expires is still inside the window; the day after is not.
    expect(await countPending(NOW + 7 * DAY - 1)).toBe(2);
    expect(await purgeExpired(later)).toBe(1);
    expect(await countExpiredBatches(later)).toBe(0);
  });

  it('skips a project that was deleted between proposal and approval', async () => {
    await queue();
    handle.prepare('UPDATE threads SET deleted_at = ? WHERE id = ?').run(NOW, paperId);
    const written = await approveBatch('batch1');
    expect(written).toBe(2); // passage + the surviving project's item
    expect(await listBlocksByThread(mlId)).toHaveLength(1);
    expect(await listBlocksByThread(paperId)).toHaveLength(0);
  });

  it('stores nothing at all when a batch id no longer exists', async () => {
    expect(await approveBatch('never-existed')).toBe(0);
    expect(await listBlocksByThread(mlId)).toHaveLength(0);
  });
});
