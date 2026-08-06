import { nanoid } from 'nanoid';
import { getDb } from './client';

// DESIGN_WORKBENCH §4.1 — the record of what the AI actually said.
//
// This module exists because of a bug, not a feature (§1.1). The three maintenance prompts
// all end with "say the conclusion to the user first, and store it only once they agree" —
// written for a chat client, where a human IS there to agree. Spool's engine slot runs
// `claude -p` headless, where nobody can, so the model correctly wrote the whole answer
// into its final message and stored nothing. That message reached engineStore, went into a
// local variable, and was dropped; the user saw "跑完了，没有新增块" and reasonably
// concluded the AI had done nothing.
//
// So a run's prose is stored here, and the run card is where "they agree" finally happens.
// The prompts are not changed — they were right; what was missing was somewhere to land.
//
// Deliberately NOT part of the library: a run is not a block. Nothing in packs, digests or
// search reads this table, exactly as with the proposal queue — it becomes library content
// only when the user presses 存成一块, and that goes through the ordinary insert path.

/** Kept in sync with Rust's action names (lib.rs refuses anything else) and with
 *  engineStore's EngineAction. */
export type RunAction =
  | 'distill'
  | 'thread_health'
  | 'weekly_review'
  | 'follow_up_brief'
  | 'follow_up';

export type RunOutcome = 'ok' | 'failed' | 'cancelled';

/** DESIGN_WORKBENCH §5. Every field is nullable because every field is the CLI's to report
 *  or not: codex reports none of it today (its quota is out until 2026-09-04, so where it
 *  puts cost has not been measured), and a claude release may rename one. Absent means the
 *  card shows "—", never a zero — "$0.00" and "not reported" are different claims. */
export interface RunUsage {
  model: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface EngineRun {
  id: string;
  action: RunAction;
  /** NULL for 周回顾: it reads the whole library, and putting it under one project was
   *  the mistake §3.4 corrects. */
  threadId: string | null;
  engine: string;
  outcome: RunOutcome;
  /** What the AI said. The point of the whole table. */
  resultText: string | null;
  /** The CLI's own words when it failed — never a Spool paraphrase (DESIGN_AI_ENGINE §2.3). */
  detail: string | null;
  blocksWritten: number;
  proposalsQueued: number;
  usage: RunUsage;
  startedAt: number;
  finishedAt: number;
  /** When the user acted on the card. NULL = it is still asking them something. */
  reviewedAt: number | null;
}

interface RunRow {
  id: string;
  action: RunAction;
  thread_id: string | null;
  engine: string;
  model: string | null;
  outcome: RunOutcome;
  result_text: string | null;
  detail: string | null;
  blocks_written: number;
  proposals_queued: number;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  started_at: number;
  finished_at: number;
  reviewed_at: number | null;
}

const fromRow = (r: RunRow): EngineRun => ({
  id: r.id,
  action: r.action,
  threadId: r.thread_id,
  engine: r.engine,
  outcome: r.outcome,
  resultText: r.result_text,
  detail: r.detail,
  blocksWritten: r.blocks_written,
  proposalsQueued: r.proposals_queued,
  usage: {
    model: r.model,
    costUsd: r.cost_usd,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
  },
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  reviewedAt: r.reviewed_at,
});

export type NewEngineRun = Omit<EngineRun, 'id' | 'reviewedAt'>;

export const recordRun = async (run: NewEngineRun): Promise<EngineRun> => {
  const db = await getDb();
  const id = nanoid();
  await db.execute(
    `INSERT INTO engine_runs (
       id, action, thread_id, engine, model, outcome, result_text, detail,
       blocks_written, proposals_queued, cost_usd, input_tokens, output_tokens,
       started_at, finished_at, reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL)`,
    [
      id,
      run.action,
      run.threadId,
      run.engine,
      run.usage.model,
      run.outcome,
      run.resultText,
      run.detail,
      run.blocksWritten,
      run.proposalsQueued,
      run.usage.costUsd,
      run.usage.inputTokens,
      run.usage.outputTokens,
      run.startedAt,
      run.finishedAt,
    ],
  );
  return { ...run, id, reviewedAt: null };
};

/** The right rail follows the open project, so this is its main read. 周回顾 rows have
 *  no thread and are fetched by `listRecentRuns` instead — they belong to the library, and
 *  showing them under whichever project happened to be open is the confusion §3.4 removes. */
export const listRunsForThread = async (threadId: string, limit = 20): Promise<EngineRun[]> => {
  const db = await getDb();
  const rows = await db.select<RunRow[]>(
    'SELECT * FROM engine_runs WHERE thread_id = $1 ORDER BY finished_at DESC LIMIT $2',
    [threadId, limit],
  );
  return rows.map(fromRow);
};

/** Library-wide feed: weekly reviews, and anything the user has not answered yet. */
export const listRecentRuns = async (limit = 20): Promise<EngineRun[]> => {
  const db = await getDb();
  const rows = await db.select<RunRow[]>(
    'SELECT * FROM engine_runs ORDER BY finished_at DESC LIMIT $1',
    [limit],
  );
  return rows.map(fromRow);
};

/** The user has answered the card (stored it, or dismissed it). The row stays — what the AI
 *  said and what it cost is the audit trail, and deleting it on dismissal would make the
 *  cost total lie. */
export const markReviewed = async (id: string, at: number): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE engine_runs SET reviewed_at = $1 WHERE id = $2', [at, id]);
};

/**
 * DESIGN_WORKBENCH §4.3 — when a project was last maintained successfully.
 *
 * This is what makes "only run when the project actually changed" derivable rather than a
 * new column: compare it against the project's newest block. Ocean's constraint was
 * 「必须节约token」, and a project nobody has touched since the last pass has nothing new
 * to distil — so it is not worth a run, and this query is how that is known.
 *
 * Cancelled and failed runs do not count: neither produced a conclusion, so the work is
 * still outstanding.
 */
export const lastSuccessfulRunAt = async (
  threadId: string,
  action: RunAction,
): Promise<number | null> => {
  const db = await getDb();
  const rows = await db.select<{ at: number | null }[]>(
    `SELECT MAX(finished_at) AS at FROM engine_runs
      WHERE thread_id = $1 AND action = $2 AND outcome = 'ok'`,
    [threadId, action],
  );
  return rows[0]?.at ?? null;
};

/**
 * DESIGN_WORKBENCH §4.3 — which projects are worth an automatic run right now.
 *
 * Ocean's constraint was 「必须节约token」, so this query's whole job is to say NO. Four
 * conditions, and each one is a way of not spending money:
 *
 *  * **The project gained a block since its last successful distil.** A project nobody has
 *    touched has nothing new to conclude, so re-distilling it buys a second copy of an
 *    answer already in the library. This is the condition Ocean actually asked for.
 *  * **That block has had time to settle.** Capturing is bursty — five clips in a minute is
 *    one thought, not five. Running on the first arrival would bill for a half-written
 *    project and then be stale immediately.
 *  * **A cooldown per project.** Belt and braces on the two above: whatever else happens,
 *    one project cannot cost more than one run per cooldown window.
 *  * **The user has not opted this project out**, and finished projects are left alone —
 *    a done project's conclusion is not going to change.
 *
 * Returns titles too, because that is what a run is queued with (ids are never spoken).
 */
export const threadsDueForMaintenance = async (
  now: number,
  settleMs: number,
  cooldownMs: number,
): Promise<{ id: string; title: string }[]> => {
  const db = await getDb();
  return db.select<{ id: string; title: string }[]>(
    `SELECT t.id, t.title
       FROM threads t
       JOIN (SELECT thread_id, MAX(created_at) AS newest FROM blocks GROUP BY thread_id) b
         ON b.thread_id = t.id
       LEFT JOIN (SELECT thread_id, MAX(finished_at) AS last_ok
                    FROM engine_runs
                   WHERE action = 'distill' AND outcome = 'ok'
                   GROUP BY thread_id) r
         ON r.thread_id = t.id
      WHERE t.deleted_at IS NULL
        AND t.status = 'active'
        AND COALESCE(t.auto_maintain, 1) = 1
        AND b.newest > COALESCE(r.last_ok, 0)
        AND b.newest <= $1 - $2
        AND COALESCE(r.last_ok, 0) <= $1 - $3
      ORDER BY b.newest ASC`,
    [now, settleMs, cooldownMs],
  );
};

/** §3.4 — whether a whole-library review is due. One per period, and a failed or cancelled
 *  run does not count as having happened: nothing was produced, so nothing was reviewed. */
export const weeklyReviewDue = async (now: number, periodMs: number): Promise<boolean> => {
  const db = await getDb();
  const rows = await db.select<{ at: number | null }[]>(
    `SELECT MAX(finished_at) AS at FROM engine_runs
      WHERE action = 'weekly_review' AND outcome = 'ok'`,
  );
  const last = rows[0]?.at ?? null;
  return last === null || last <= now - periodMs;
};

/**
 * What Spool's own runs have cost over a window — the honest half of Ocean's #5.
 *
 * ⚠️ This is spend, NOT remaining quota. Neither CLI reports how much of the user's plan is
 * left (claude's `/usage` is interactive only), so nothing built on this may be phrased as
 * "you have N left". Runs whose CLI reported no cost contribute nothing rather than zero.
 */
export const spendSince = async (sinceMs: number): Promise<{ costUsd: number; runs: number }> => {
  const db = await getDb();
  const rows = await db.select<{ c: number | null; n: number }[]>(
    `SELECT SUM(cost_usd) AS c, COUNT(*) AS n FROM engine_runs
      WHERE finished_at >= $1 AND cost_usd IS NOT NULL`,
    [sinceMs],
  );
  return { costUsd: rows[0]?.c ?? 0, runs: rows[0]?.n ?? 0 };
};
