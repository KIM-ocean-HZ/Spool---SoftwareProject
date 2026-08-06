import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from './blocks';
import { __setTestDb } from './client';
import {
  lastSuccessfulRunAt,
  listRunsForThread,
  markReviewed,
  recordRun,
  spendSince,
  threadsDueForMaintenance,
  weeklyReviewDue,
  type NewEngineRun,
} from './engineRuns';
import schemaSql from './schema.sql?raw';
import { createThread, setAutoMaintain, updateThread } from './threads';
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

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const SETTLE = 10 * MINUTE;
const COOLDOWN = 24 * HOUR;

let handle: Sqlite;

const run = (over: Partial<NewEngineRun> = {}): NewEngineRun => ({
  action: 'distill',
  threadId: null,
  engine: 'claude',
  outcome: 'ok',
  resultText: 'a conclusion',
  detail: null,
  blocksWritten: 0,
  proposalsQueued: 0,
  usage: { model: null, costUsd: null, inputTokens: null, outputTokens: null },
  startedAt: NOW - MINUTE,
  finishedAt: NOW,
  ...over,
});

/** Blocks stamp themselves with Date.now(), so age them by hand. */
const ageNewestBlock = (threadId: string, at: number): void => {
  handle.prepare('UPDATE blocks SET created_at = ? WHERE thread_id = ?').run(at, threadId);
};

beforeEach(() => {
  handle = new DatabaseSync(':memory:');
  handle.exec(schemaSql.replace(/--.*$/gm, ''));
  __setTestDb(makeAdapter(handle));
});

afterEach(() => {
  __setTestDb(null);
  handle.close();
});

// DESIGN_WORKBENCH §4.1. The reason this table exists is that the AI's prose had nowhere
// to live and was being dropped — so what matters is that it survives a round trip.
describe('engine_runs', () => {
  it('keeps the AI prose, the cost and the model that a run came back with', async () => {
    const ws = await createWorkspace('W');
    const th = await createThread(ws.id, 'Flux');
    await recordRun(
      run({
        threadId: th.id,
        resultText: '到今天为止，这个项目定下来的是……',
        usage: { model: 'claude-opus-4-6', costUsd: 0.031, inputTokens: 15004, outputTokens: 517 },
      }),
    );

    const [stored] = await listRunsForThread(th.id);
    expect(stored.resultText).toBe('到今天为止，这个项目定下来的是……');
    expect(stored.usage).toEqual({
      model: 'claude-opus-4-6',
      costUsd: 0.031,
      inputTokens: 15004,
      outputTokens: 517,
    });
    // Nobody has answered the card yet — that is what makes it still ask.
    expect(stored.reviewedAt).toBeNull();

    await markReviewed(stored.id, NOW + 1000);
    expect((await listRunsForThread(th.id))[0].reviewedAt).toBe(NOW + 1000);
  });

  it('counts only what a CLI actually reported spending', async () => {
    await recordRun(run({ usage: { model: null, costUsd: 0.02, inputTokens: null, outputTokens: null } }));
    await recordRun(run({ usage: { model: null, costUsd: 0.03, inputTokens: null, outputTokens: null } }));
    // codex reports nothing today (§5) — an unreported run must not read as free.
    await recordRun(run());

    const spend = await spendSince(NOW - DAY);
    expect(spend.costUsd).toBeCloseTo(0.05);
    expect(spend.runs).toBe(2);
  });

  it('only a successful run counts as having maintained a project', async () => {
    const ws = await createWorkspace('W');
    const th = await createThread(ws.id, 'Flux');
    await recordRun(run({ threadId: th.id, outcome: 'failed', finishedAt: NOW }));
    await recordRun(run({ threadId: th.id, outcome: 'cancelled', finishedAt: NOW + 1 }));
    expect(await lastSuccessfulRunAt(th.id, 'distill')).toBeNull();

    await recordRun(run({ threadId: th.id, outcome: 'ok', finishedAt: NOW + 2 }));
    expect(await lastSuccessfulRunAt(th.id, 'distill')).toBe(NOW + 2);
  });
});

// §4.3 — Ocean: 「必须节约token」. Every assertion here is a way of NOT spending money.
describe('threadsDueForMaintenance', () => {
  const seed = async (title: string): Promise<{ id: string }> => {
    const ws = await createWorkspace('W');
    const th = await createThread(ws.id, title);
    await createBlock({ threadId: th.id, content: 'something new' });
    return th;
  };

  it('picks a project that gained a block and has had time to settle', async () => {
    const th = await seed('Flux');
    ageNewestBlock(th.id, NOW - HOUR);
    const due = await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN);
    expect(due.map((d) => d.title)).toEqual(['Flux']);
  });

  it('leaves a project alone until its newest block has settled', async () => {
    const th = await seed('Flux');
    // Capturing is bursty; a clip from a minute ago means the user is still working.
    ageNewestBlock(th.id, NOW - MINUTE);
    expect(await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN)).toEqual([]);
  });

  it('does not re-run a project that has not changed since its last distil', async () => {
    const th = await seed('Flux');
    ageNewestBlock(th.id, NOW - 2 * DAY);
    await recordRun(run({ threadId: th.id, finishedAt: NOW - DAY }));
    expect(await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN)).toEqual([]);
  });

  it('honours the cooldown even when the project did change', async () => {
    const th = await seed('Flux');
    ageNewestBlock(th.id, NOW - HOUR);
    // Distilled an hour before that — the project moved since, but not long enough ago
    // for a second run to be worth billing.
    await recordRun(run({ threadId: th.id, finishedAt: NOW - 2 * HOUR }));
    expect(await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN)).toEqual([]);
    // A day later the same state is due again.
    expect(await threadsDueForMaintenance(NOW + DAY, SETTLE, COOLDOWN)).toHaveLength(1);
  });

  it('never touches an opted-out project or a finished one', async () => {
    const optedOut = await seed('Opted out');
    ageNewestBlock(optedOut.id, NOW - HOUR);
    await setAutoMaintain(optedOut.id, false);

    const done = await seed('Done');
    ageNewestBlock(done.id, NOW - HOUR);
    await updateThread(done.id, { status: 'done' });

    expect(await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN)).toEqual([]);
  });

  it('a project with no blocks at all is not a candidate', async () => {
    const ws = await createWorkspace('W');
    await createThread(ws.id, 'Empty');
    expect(await threadsDueForMaintenance(NOW, SETTLE, COOLDOWN)).toEqual([]);
  });
});

describe('weeklyReviewDue', () => {
  it('is due when none has ever succeeded, and not again inside the period', async () => {
    expect(await weeklyReviewDue(NOW, 7 * DAY)).toBe(true);

    await recordRun(run({ action: 'weekly_review', threadId: null, finishedAt: NOW }));
    expect(await weeklyReviewDue(NOW, 7 * DAY)).toBe(false);
    expect(await weeklyReviewDue(NOW + 7 * DAY, 7 * DAY)).toBe(true);
  });

  it('a review that failed does not count as one that happened', async () => {
    await recordRun({
      ...run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
      outcome: 'failed',
    });
    expect(await weeklyReviewDue(NOW, 7 * DAY)).toBe(true);
  });
});
