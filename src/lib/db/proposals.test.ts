import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMcpSource } from '@/lib/blocks/sourceIcon';
import { t } from '@/lib/i18n';
import { createBlock, listBlocksByThread } from './blocks';
import { __setTestDb } from './client';
import {
  __insertBatchForTest,
  approveBatch,
  countExpiredBatches,
  countPending,
  dropProposals,
  listBatchesCreatedSince,
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
    // §4.4-bis: the passage is NOT sourceless. Sourceless reads as 💭 Personal in a pack —
    // the highest-authority category — which would let anything the AI put in `source_text`
    // wear the user's name. It carries the proposing client's label, plus the half that
    // says these are still the user's own words.
    expect(origin[0]!.source).toBe(`Claude · MCP — ${t('用户原文')}`);
    // And it must stay recognisable as MCP-written: the badge icon and the AI-activity
    // count both key off this predicate.
    expect(isMcpSource(origin[0]!.source)).toBe(true);

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

  // Found by the 2026-08-05 self-review. There is no transaction here (the plugin's pool
  // cannot hold one across statements), and an insert can genuinely fail mid-batch —
  // idx_blocks_thread_seq is unique and the MCP subprocess may take a number in between.
  // Retrying after that must not write a second copy of everything that already landed.
  it('a retry after a mid-batch failure writes only what is missing', async () => {
    await queue();
    // Fail the insert into the SECOND item's project, and only that one — standing in for
    // whatever real cause (a seq collision with the MCP subprocess, a locked database).
    // The passage and the first item go elsewhere and land normally.
    handle.exec(`
      CREATE TRIGGER fail_one BEFORE INSERT ON blocks WHEN new.thread_id = '${paperId}'
      BEGIN SELECT RAISE(ABORT, 'simulated insert failure'); END;
    `);

    await expect(approveBatch('batch1')).rejects.toThrow();
    // The passage and the first item landed; the failing one did not.
    expect(await listBlocksByThread(inboxId)).toHaveLength(1);
    expect(await listBlocksByThread(mlId)).toHaveLength(1);

    // Clear the obstruction and approve again — the survivors must not double.
    handle.exec('DROP TRIGGER fail_one');
    await approveBatch('batch1');
    expect(await listBlocksByThread(inboxId)).toHaveLength(1);
    expect(await listBlocksByThread(mlId)).toHaveLength(1);
    const paper = await listBlocksByThread(paperId);
    expect(paper).toHaveLength(1);
    // And the retried item still cites the passage, which was written on the first pass.
    const origin = (await listBlocksByThread(inboxId))[0]!;
    expect(paper[0]!.refBlockId).toBe(origin.id);
    expect(await countPending(NOW)).toBe(0);
  });
});

// DESIGN_FOLLOW_UP §2.4 (M3) — the two reads/writes the dedup gate needs. The gate's own
// logic is pure and tested in lib/engine/followUp.test.ts; this is the database half.
describe('follow-up dedup support', () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(schemaSql);
    __setTestDb(makeAdapter(sqlite));
  });

  afterEach(() => {
    __setTestDb(null);
    sqlite.close();
  });

  const batch = async (id: string, createdAt: number, contents: string[]) => {
    const ws = await createWorkspace('W');
    const thread = await createThread(ws.id, 'T');
    await __insertBatchForTest({
      id,
      client: 'Claude · MCP',
      note: null,
      sourceText: null,
      sourceThreadId: null,
      createdAt,
      expiresAt: createdAt + 7 * DAY,
      items: contents.map((content) => ({
        threadId: thread.id,
        content,
        annotation: null,
        refBlockId: null,
      })),
    });
    return thread;
  };

  it('returns only the batches born inside the run window', async () => {
    await batch('old', NOW - DAY, ['before the run']);
    await batch('mine', NOW + 10, ['during the run']);
    const found = await listBatchesCreatedSince(NOW);
    expect(found.map((b) => b.id)).toEqual(['mine']);
    expect(found[0]!.items.map((i) => i.content)).toEqual(['during the run']);
  });

  it('drops repeats and leaves the rest of the batch alone', async () => {
    await batch('b1', NOW, ['keep me', 'drop me', 'keep me too']);
    const [before] = await listBatchesCreatedSince(NOW);
    const doomed = before!.items.find((i) => i.content === 'drop me')!;
    await dropProposals([doomed.id]);
    const [after] = await listPendingBatches(NOW);
    expect(after!.items.map((i) => i.content)).toEqual(['keep me', 'keep me too']);
  });

  // A heading over nothing is worse than no heading: the review screen would show a batch
  // the user cannot act on.
  it('takes the batch with the last proposal in it', async () => {
    await batch('b1', NOW, ['only one']);
    const [before] = await listBatchesCreatedSince(NOW);
    await dropProposals(before!.items.map((i) => i.id));
    expect(await listPendingBatches(NOW)).toEqual([]);
    expect(await countPending(NOW)).toBe(0);
    // §4.3: what the queue turned away leaves no trace at all — not even an empty shell.
    expect(await countExpiredBatches(NOW + 30 * DAY)).toBe(0);
  });

  it('is a no-op on an empty list', async () => {
    await batch('b1', NOW, ['untouched']);
    await dropProposals([]);
    expect(await countPending(NOW)).toBe(1);
  });
});
