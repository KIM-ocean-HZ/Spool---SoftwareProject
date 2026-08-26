import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setTestDb } from './client';
import {
  deleteRun,
  lastWeeklyAttemptAt,
  listRunsForAction,
  listRunsForThread,
  markReviewed,
  recordRun,
  spendSince,
  weeklyReviewDue,
  weeklyReviewNextAt,
  type NewEngineRun,
} from './engineRuns';
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

const MINUTE = 60_000;
const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

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

  // §11.1 — the 周回顾 view reads every review ever run, including the ones the user has
  // already answered. That is the difference between an archive and the rail's feed.
  it('returns every run of one action, answered or not', async () => {
    await recordRun(run({ action: 'weekly_review', threadId: null, finishedAt: NOW }));
    const answered = await recordRun(
      run({ action: 'weekly_review', threadId: null, finishedAt: NOW + 1 }),
    );
    await markReviewed(answered.id, NOW + 2);
    await recordRun(run({ action: 'follow_up', threadId: null, finishedAt: NOW + 3 }));

    const reviews = await listRunsForAction('weekly_review');
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.action === 'weekly_review')).toBe(true);
    // Newest first, and being answered does not remove it.
    expect(reviews[0].id).toBe(answered.id);
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

describe('weeklyReviewNextAt', () => {
  it('answers from the same row weeklyReviewDue reads', async () => {
    // ⭐ 界面上「还有 N 天」和自动那条「该跑了没有」必须出自同一处,否则那是一种
    // 用户自己发现不了的谎。
    expect(await weeklyReviewNextAt(7 * DAY)).toBeNull();

    await recordRun(run({ action: 'weekly_review', threadId: null, finishedAt: NOW }));
    expect(await weeklyReviewNextAt(7 * DAY)).toBe(NOW + 7 * DAY);
    expect(await weeklyReviewDue(NOW + 7 * DAY, 7 * DAY)).toBe(true);
  });

  it('a failed review does not move the next date', async () => {
    await recordRun({
      ...run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
      outcome: 'failed',
    });
    expect(await weeklyReviewNextAt(7 * DAY)).toBeNull();
  });
});

describe('deleteRun', () => {
  it('deletes a run that did not succeed', async () => {
    const bad = await recordRun({
      ...run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
      outcome: 'failed',
    });
    await deleteRun(bad.id);
    expect(await listRunsForAction('weekly_review')).toHaveLength(0);
  });

  it('⛔ refuses to delete one that succeeded — the guard is in the SQL, not the UI', async () => {
    const good = await recordRun(
      run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
    );
    await deleteRun(good.id);
    const left = await listRunsForAction('weekly_review');
    expect(left.map((r) => r.id)).toEqual([good.id]);
  });

  it('a cancelled run can go too', async () => {
    const stopped = await recordRun({
      ...run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
      outcome: 'cancelled',
    });
    await deleteRun(stopped.id);
    expect(await listRunsForAction('weekly_review')).toHaveLength(0);
  });
});

describe('lastWeeklyAttemptAt', () => {
  it('⛔ counts the failures too — it is the brake, not the record', async () => {
    // 病根: weeklyReviewDue 只认跑成的,所以一次失败之后它一直是 true,而自动那条
    // 每十分钟看一次。08-26 起那条路可以走 API,而 API 按字数计费。
    expect(await lastWeeklyAttemptAt()).toBeNull();
    await recordRun({
      ...run({ action: 'weekly_review', threadId: null, finishedAt: NOW }),
      outcome: 'failed',
    });
    expect(await lastWeeklyAttemptAt()).toBe(NOW);
    expect(await weeklyReviewDue(NOW + MINUTE, 7 * DAY)).toBe(true);
  });

  it('ignores other actions', async () => {
    await recordRun(run({ action: 'distill', finishedAt: NOW }));
    expect(await lastWeeklyAttemptAt()).toBeNull();
  });
});
