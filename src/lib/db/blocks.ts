import { nanoid } from 'nanoid';
import type { AnnotationAuthor } from '@/lib/blocks/annotationAuthor';
import { joinSegments, type Segment } from '@/lib/blocks/segments';
import { getDb, tutorialSourceLabels } from './client';

export type BlockKind = 'text' | 'ref';

/** v13 (DESIGN_CONTEXT_HYGIENE §3.1) — what a block's `refBlockId` MEANS.
 *
 *  `cites` is every citation written before v13 and the default since: "this builds on
 *  that". The other two are the supersession relation, and the difference between them is
 *  the whole of §3.1.1: `supersedes` retires the cited block wholesale (it carries
 *  `staleAt` too), while `corrects` says one point inside it is wrong and leaves the cited
 *  block completely untouched — which is what stops correcting one sentence from costing a
 *  re-paste of the surrounding two thousand characters. */
export type RefKind = 'cites' | 'supersedes' | 'corrects';

export interface Block {
  id: string;
  threadId: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;   // a note about this block — the user's, unless annotationBy says otherwise
  /** v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板乙): who wrote `annotation`. Null = a pre-v14 row;
   *  read it through annotationIsAi(), which falls back to `source` for those. */
  annotationBy: AnnotationAuthor | null;
  refThreadId: string | null;  // kind=ref
  refBlockId: string | null;   // v7 (§20.13 v2.4 D2): block-level citation, set by MCP writers
  source: string | null;       // provenance label, editable
  pinned: boolean;
  // v9 (DESIGN_SCHEMA_V9 H-1): the block's human-visible number within its thread, shown
  // as "#12" in the stream and in the pack. Null only on a row written before the v9
  // backfill ran. Never renumbered, never reused — see schema.sql.
  seq: number | null;
  createdAt: number;
  /** v13: when the USER said this stopped holding. Null = still valid. The block is never
   *  edited and never deleted — it leaves packs, not the library. */
  staleAt: number | null;
  /** v13: null reads as 'cites' (every pre-v13 row, and the default). */
  refKind: RefKind | null;
  /** v20 (DESIGN_MCP_INTENT_ROUTING §4.6): the page this block was written from. Null on
   *  everything the user wrote by hand — only the MCP write tools fill these in. */
  sourceUrl: string | null;
  /** v20: the DAY the source was read, as UTC midnight in unix ms (schema.sql says why
   *  these two are not local moments). Null = nobody said. */
  retrievedAt: number | null;
  /** v20: the day after which this should be checked again. Null = it does not go off. */
  recheckAfter: number | null;
  /** v21: on a `corrects` block, the sentence it quotes verbatim out of the block it
   *  corrects — the aim v13 never had. Null = nobody said which sentence, which renders
   *  exactly as v13 did. Matched by substring at render time, never by offset. */
  correctedQuote: string | null;
}

export interface CreateBlockArgs {
  threadId: string;
  kind?: BlockKind;
  content: string;
  annotation?: string | null;
  /** v14: omitted means the user wrote it — every caller of this function is a GUI path. */
  annotationBy?: AnnotationAuthor | null;
  refThreadId?: string | null;
  refBlockId?: string | null;
  source?: string | null;
  // Only the overlay's redirect path sets this — it re-creates a block the user may
  // already have pinned from the toast, and the pin must survive the move.
  pinned?: boolean;
  /** v20 (§4.6): provenance an AI recorded when it wrote the source. The only caller that
   *  passes these is approveBatch, carrying what the proposal arrived with — no GUI path
   *  has them, because §4.6 gives the user no input for them. */
  sourceUrl?: string | null;
  retrievedAt?: number | null;
  recheckAfter?: number | null;
  /** v21: same story — only approveBatch carries one, out of the proposal. */
  correctedQuote?: string | null;
}

interface Row {
  id: string;
  thread_id: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;
  annotation_by: AnnotationAuthor | null;
  ref_thread_id: string | null;
  ref_block_id: string | null;
  source: string | null;
  pinned: number;
  seq: number | null;
  created_at: number;
  stale_at: number | null;
  ref_kind: RefKind | null;
  source_url: string | null;
  retrieved_at: number | null;
  recheck_after: number | null;
  corrected_quote: string | null;
}

const fromRow = (r: Row): Block => ({
  id: r.id,
  threadId: r.thread_id,
  kind: r.kind,
  content: r.content,
  annotation: r.annotation,
  annotationBy: r.annotation_by ?? null,
  refThreadId: r.ref_thread_id,
  refBlockId: r.ref_block_id,
  source: r.source,
  pinned: r.pinned === 1,
  seq: r.seq ?? null,
  createdAt: r.created_at,
  staleAt: r.stale_at ?? null,
  refKind: r.ref_kind ?? null,
  sourceUrl: r.source_url ?? null,
  retrievedAt: r.retrieved_at ?? null,
  recheckAfter: r.recheck_after ?? null,
  correctedQuote: r.corrected_quote ?? null,
});

const SELECT_COLS =
  'id, thread_id, kind, content, annotation, annotation_by, ref_thread_id, ref_block_id, source, pinned, seq, created_at, stale_at, ref_kind, source_url, retrieved_at, recheck_after, corrected_quote';

export const getBlockById = async (id: string): Promise<Block | null> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE id = $1`,
    [id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
};

// DESIGN_AI_ENGINE §1.3: how many AI-written blocks the library holds right now. An AI run
// writes through a separate process and may file into several projects at once, so counting
// before and after is the only way "AI 归档了 N 块" can be a fact rather than a claim.
//
// Restricted to MCP-labelled rows for a reason found in the 2026-08-05 self-review: a plain
// COUNT(*) also counts what the USER captured during those minutes, and "the AI filed 3
// blocks" when one of them was their own double-tap ⌥ is a lie the user catches
// immediately — in the one feature whose whole capital is "you can see what the AI did".
//
// ⚠️ The predicate mirrors isMcpSource() in lib/blocks/sourceIcon.ts, clause for clause.
// Two spellings of one rule drift; blocks.test.ts asserts they agree on the same labels.
const MCP_SOURCE_PREDICATE =
  "source = 'MCP' OR source LIKE 'MCP — %' OR instr(source, ' · MCP') > 0";

export const countMcpBlocks = async (): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM blocks WHERE ${MCP_SOURCE_PREDICATE}`,
  );
  return rows[0]?.c ?? 0;
};

export interface ThreadBlockStats {
  blocks: number;
  /** Characters of block content + annotations — what a pack of this project would weigh.
   *  Attachment text is NOT counted: whether it lands in a pack is a per-attachment switch
   *  (§20.2), so including it here would report a size the pack may not produce. */
  chars: number;
}

/** How much each project holds, keyed by thread id.
 *
 *  DESIGN_WORKBENCH §9.4 — the board shows 完成情况, and "how much is in it" is the cheapest
 *  honest version of that. One grouped scan for the whole board rather than a query per row:
 *  the board renders every project at once, so N queries would be N round-trips to draw one
 *  screen. Threads with nothing in them are simply absent from the map.
 *
 *  §9.13 grew the character count alongside the block count — an expanded row answers
 *  「这个项目打包出来有多大」 before the user spends a click opening the pack. Same scan, one
 *  more aggregate, so it costs nothing extra. */
export const blockStatsByThread = async (): Promise<Record<string, ThreadBlockStats>> => {
  const db = await getDb();
  const rows = await db.select<{ thread_id: string; c: number; chars: number | null }[]>(
    `SELECT thread_id,
            COUNT(*) AS c,
            SUM(LENGTH(content) + COALESCE(LENGTH(annotation), 0)) AS chars
       FROM blocks GROUP BY thread_id`,
  );
  const out: Record<string, ThreadBlockStats> = {};
  for (const r of rows) out[r.thread_id] = { blocks: r.c, chars: r.chars ?? 0 };
  return out;
};

/**
 * How many blocks in each project are exact copies of another one in the same project.
 *
 * DESIGN_WORKBENCH §11.2-B — what replaced the 去重 button. Ocean retired that action because
 * 「AI 引擎没办法帮我把新块指向过期块里面的那句话，没什么用」: it could only ever report, since
 * Spool merges nothing and deletes nothing by design, so it charged a model to tell him
 * something and then sent him to do the work himself. Finding duplicates does not need a model
 * at all — this is one indexed GROUP BY, it costs nothing, and it lands on the row in 项目管理
 * where the disposal actually happens.
 *
 * ⚠️ **Exact matches only, deliberately.** `find_similar_blocks` (the MCP tool) scores fuzzy
 * similarity and needs a threshold; a badge that is sometimes wrong is worse than no badge,
 * because the user cannot tell which kind of wrong it is today. Byte-identical content has no
 * threshold and no false positives — and it is the case that actually occurs: 〈Flux〉 carries a
 * pair at similarity 1.0, 3,503 chars each, together 13% of that project's whole pack.
 *
 * The count is the REDUNDANT copies (a pair counts once), because that is how many blocks
 * would go away if the user tidied up.
 */
export const duplicateCountsByThread = async (): Promise<Record<string, number>> => {
  const db = await getDb();
  const rows = await db.select<{ thread_id: string; extra: number }[]>(
    `SELECT thread_id, SUM(n - 1) AS extra
       FROM (SELECT thread_id, COUNT(*) AS n
               FROM blocks
              WHERE stale_at IS NULL
              GROUP BY thread_id, content
             HAVING COUNT(*) > 1)
      GROUP BY thread_id`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.thread_id] = r.extra;
  return out;
};

/** 「什么算一条捕捉」 — the one definition, as a WHERE clause plus the values it binds.
 *
 *  A capture is a block that came from somewhere ELSE. There is no column that says so, so
 *  the rule is read off `source`: it must be present (the composer writes null), it must not
 *  be the MCP label (the AI wrote that block — the user never read it), and it must not be
 *  the tutorial's (seeded at first launch, captured by nobody — without this a fresh install
 *  opens on 「你攒了 6 条」 before the user has done anything). A source the user typed by
 *  hand on the badge does count: they labelled it 「Chrome」 because that is where they read
 *  it, and the foreground-app detection missing is not the user's fault.
 *
 *  ⚠️ The tutorial labels are BOUND, never spelled out here: `tutorialSourceLabels()` holds
 *  both languages' copy and stays the single source of truth for that rule. A second
 *  spelling in a SQL literal is exactly the drift the MCP predicate above warns about. */
const captureClause = (): { sql: string; params: string[] } => {
  const labels = tutorialSourceLabels();
  const holes = labels.map((_, i) => `$${i + 1}`).join(', ');
  return {
    sql: `source IS NOT NULL AND NOT (${MCP_SOURCE_PREDICATE}) AND source NOT IN (${holes})`,
    params: labels,
  };
};

/** What the user captured since `since` — newest first. Feeds the sidebar card's
 *  「今天读了 N 条」 line (首日价值, DESIGN_NEXT_STAGE §4.5) and its 打包 target.
 *
 *  ⚠️ `rowid DESC` breaks the tie on `created_at`, which is milliseconds and therefore not
 *  unique: three captures pasted in a burst share a timestamp, and without it the card's
 *  今天 count and its 打包 target would be whatever order SQLite felt like returning. */
export const listCapturesSince = async (since: number): Promise<Block[]> => {
  const db = await getDb();
  const { sql, params } = captureClause();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks
      WHERE ${sql} AND created_at >= $${params.length + 1}
      ORDER BY created_at DESC, rowid DESC`,
    [...params, since],
  );
  return rows.map(fromRow);
};

/** How many the user has captured, ever.
 *
 *  ⚠️ This used to be `listCapturesSince(0).length`, which reads every capture row in the
 *  library into an object to learn one number. That was written for the pack hint, which
 *  asks once and only while its one-shot flag is still armed (i.e. on a library young enough
 *  that "every capture row" is a handful). 首日价值二期 §2.3 put the same number on the
 *  spool meter, which is on screen ALL the time — so it has to be one COUNT(*). */
export const countCaptures = async (): Promise<number> => {
  const db = await getDb();
  const { sql, params } = captureClause();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM blocks WHERE ${sql}`,
    params,
  );
  return rows[0]?.c ?? 0;
};

// Whether a block's annotation was written by an AI — the SQL spelling of annotationIsAi()
// (lib/blocks/annotationAuthor.ts): `annotation_by` is authoritative when set, and NULL (every
// row written before v14) falls back to the block's source.
//
// ⚠️ Both COALESCEs are load-bearing. Written the way the TS reads — `annotation_by = 'ai'`,
// and the MCP predicate applied to any row — each is NULL rather than false on exactly the
// rows they exist for (a pre-v14 row, a sourceless one), and a NULL makes NOT(...) NULL,
// which fails the CASE and silently drops the user's own words from the count. The commonest
// block in the library is exactly that: no source, an annotation, written before v14.
// blocks.test.ts holds two such rows against this query for that reason.
const AI_ANNOTATION_PREDICATE =
  `COALESCE(annotation_by, '') = 'ai'
   OR (annotation_by IS NULL AND source IS NOT NULL AND (${MCP_SOURCE_PREDICATE}))`;

/** How many characters in the library are the user's OWN words (首日价值二期 §2.2).
 *
 *  Ocean picked 口径乙 (2026-08-10): annotations he wrote, PLUS the body of blocks he typed
 *  himself. Not 甲 (annotations only — his hand-written blocks would count for nothing) and
 *  not 丙 (all bodies — that counts what he PASTED, which is the opposite of the point:
 *  he asked for this number to 「鼓励用户多写个人的 notes」).
 *
 *  「他自己打的」 is read off the same absent-source rule isUserWritten() uses, and the
 *  tutorial's rows are excluded whole: they arrive annotated, so counting them would open a
 *  fresh install on 「我写了 700 字」 — the same lie the tutorial exclusion above prevents for
 *  the capture count. */
export const countUserWrittenChars = async (): Promise<number> => {
  const db = await getDb();
  const labels = tutorialSourceLabels();
  const holes = labels.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await db.select<{ chars: number | null }[]>(
    `SELECT SUM(
        CASE WHEN TRIM(COALESCE(source, '')) = '' THEN LENGTH(content) ELSE 0 END
      + CASE WHEN TRIM(COALESCE(annotation, '')) <> '' AND NOT (${AI_ANNOTATION_PREDICATE})
             THEN LENGTH(annotation) ELSE 0 END
      ) AS chars
       FROM blocks WHERE COALESCE(source, '') NOT IN (${holes})`,
    labels,
  );
  return rows[0]?.chars ?? 0;
};

export const listBlocksByThread = async (threadId: string): Promise<Block[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

// v2.4 (§20.13 D2): resolve cited blocks (blocks.ref_block_id) for pack rendering —
// citations may point across threads, so this is an id-set lookup, not a thread scan.
export const listBlocksByIds = async (ids: string[]): Promise<Block[]> => {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map(fromRow);
};

export const listPinnedByThread = async (threadId: string): Promise<Block[]> => {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${SELECT_COLS} FROM blocks WHERE thread_id = $1 AND pinned = 1 ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(fromRow);
};

export const createBlock = async (args: CreateBlockArgs): Promise<Block> => {
  const db = await getDb();
  const b: Block = {
    id: nanoid(),
    threadId: args.threadId,
    kind: args.kind ?? 'text',
    content: args.content,
    annotation: args.annotation ?? null,
    // v14: every caller of createBlock is a GUI/capture path, so an annotation arriving
    // here is the user's. The MCP server writes its own rows in Rust and stamps 'ai' there.
    annotationBy: args.annotationBy ?? 'user',
    refThreadId: args.refThreadId ?? null,
    refBlockId: args.refBlockId ?? null,
    source: args.source ?? null,
    pinned: args.pinned ?? false,
    seq: null,
    createdAt: Date.now(),
    // v13: a block is born valid and citing nothing in particular. Supersession is only
    // ever declared afterwards, by the user, on a block that already exists.
    staleAt: null,
    refKind: null,
    // v20: null on every GUI/capture path — §4.6 is explicit that the user does not fill
    // these in, so only approveBatch (relaying what an AI proposed) ever passes them.
    sourceUrl: args.sourceUrl ?? null,
    retrievedAt: args.retrievedAt ?? null,
    recheckAfter: args.recheckAfter ?? null,
    correctedQuote: args.correctedQuote ?? null,
  };
  // v9: `seq` is computed inside the INSERT, not read-then-written. WAL serialises
  // writers, so a single statement holding the write lock cannot lose the race against
  // the MCP subprocess inserting into the same thread at the same moment.
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, annotation_by, ref_thread_id, ref_block_id, source, pinned, seq, created_at, source_url, retrieved_at, recheck_after, corrected_quote)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             (SELECT COALESCE(MAX(seq), 0) + 1 FROM blocks WHERE thread_id = $2), $11, $12, $13, $14, $15)`,
    [
      b.id,
      b.threadId,
      b.kind,
      b.content,
      b.annotation,
      b.annotationBy,
      b.refThreadId,
      b.refBlockId,
      b.source,
      b.pinned ? 1 : 0,
      b.createdAt,
      b.sourceUrl,
      b.retrievedAt,
      b.recheckAfter,
      b.correctedQuote,
    ],
  );
  const assigned = await db.select<{ seq: number | null }[]>(
    'SELECT seq FROM blocks WHERE id = $1',
    [b.id],
  );
  b.seq = assigned[0]?.seq ?? null;
  return b;
};

// §20.1 forward (copy to thread): INSERT pre-built copy blocks. INSERT-ONLY — never reads,
// updates, or deletes an existing row, so a forward cannot touch the source thread's blocks
// (the feature's hard data-safety constraint). The caller builds the rows with fresh ids, the
// target thread_id, and now-based created_at. One multi-row INSERT keeps the whole batch a
// single atomic statement (tauri-plugin-sql's sqlx pool can't honour BEGIN/COMMIT across
// statements — see threads.ts:141 — but a single statement is itself atomic). The blocks_ai
// FTS trigger indexes each new row.
export const insertBlocks = async (blocks: Block[]): Promise<void> => {
  if (blocks.length === 0) return;
  const db = await getDb();
  // v9: seq numbers for the batch. Unlike createBlock's in-statement subquery, a
  // multi-row VALUES list cannot compute them itself — a correlated MAX(seq) may or may
  // not see the rows inserted earlier in the same statement, which would hand out
  // duplicates or gaps. So the base is read once and the offsets are literals. A forward
  // targets one thread the user just picked; if a concurrent MCP write claimed a number
  // in between, idx_blocks_thread_seq rejects the batch rather than duplicating a number,
  // and the user can retry.
  const base = new Map<string, number>();
  for (const threadId of new Set(blocks.map((b) => b.threadId))) {
    const rows = await db.select<{ next: number }[]>(
      'SELECT COALESCE(MAX(seq), 0) AS next FROM blocks WHERE thread_id = $1',
      [threadId],
    );
    base.set(threadId, rows[0]?.next ?? 0);
  }
  const COLS = 18;
  const tuples = blocks
    .map((_, i) => {
      const o = i * COLS;
      return `(${Array.from({ length: COLS }, (_, k) => `$${o + k + 1}`).join(', ')})`;
    })
    .join(', ');
  const params = blocks.flatMap((b) => {
    const next = (base.get(b.threadId) ?? 0) + 1;
    base.set(b.threadId, next);
    return [
      b.id,
      b.threadId,
      b.kind,
      b.content,
      b.annotation,
      b.annotationBy,
      b.refThreadId,
      b.refBlockId,
      b.source,
      b.pinned ? 1 : 0,
      next,
      b.createdAt,
      b.staleAt,
      b.refKind,
      b.sourceUrl,
      b.retrievedAt,
      b.recheckAfter,
      b.correctedQuote,
    ];
  });
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, annotation_by, ref_thread_id, ref_block_id, source, pinned, seq, created_at, stale_at, ref_kind, source_url, retrieved_at, recheck_after, corrected_quote) VALUES ${tuples}`,
    params,
  );
};

export const updateBlockSource = async (id: string, source: string | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET source = $1 WHERE id = $2', [source, id]);
};

// Reparent a block to a different thread (§11.5 — the capture classification "move").
// Keeps the block's id and created_at, so it sorts into the target thread by time.
// v9: `seq` is per-thread, so a move has to draw a fresh number from the destination —
// carrying the old one over would collide with whatever already holds it there. The
// block's visible number therefore changes when it changes project; nothing else does.
export const updateBlockThread = async (id: string, threadId: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `UPDATE blocks
        SET thread_id = $1,
            seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM blocks WHERE thread_id = $1)
      WHERE id = $2`,
    [threadId, id],
  );
};

export const updateBlockContent = async (id: string, content: string): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET content = $1 WHERE id = $2', [content, id]);
};

// v14 (§9.3 拍板乙): this function is only ever reached from the GUI or the capture overlay,
// so whatever it writes is the user's own sentence. Stamping 'user' here is what lets a note
// the user adds to an AI-written block keep its 💭 Personal authority — the one case the
// source-only proxy gets wrong, and the reason Ocean chose the recorded column over it.
// It also retires the proxy for that row permanently, pre-v14 or not.
export const updateBlockAnnotation = async (
  id: string,
  annotation: string | null,
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    "UPDATE blocks SET annotation = $1, annotation_by = 'user' WHERE id = $2",
    [annotation, id],
  );
};

export const togglePin = async (id: string): Promise<boolean> => {
  const db = await getDb();
  const rows = await db.select<{ pinned: number }[]>(
    'SELECT pinned FROM blocks WHERE id = $1',
    [id],
  );
  const next = rows[0]?.pinned === 1 ? 0 : 1;
  await db.execute('UPDATE blocks SET pinned = $1 WHERE id = $2', [next, id]);
  return next === 1;
};

export const deleteBlock = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.execute('DELETE FROM blocks WHERE id = $1', [id]);
};

// §9.13 Undo: re-insert a block verbatim from an undo snapshot, preserving its original
// id and created_at so it lands back at the same feed position. The blocks_ai FTS trigger
// re-indexes it on insert (a fresh rowid is assigned — fine, FTS is rebuilt from it).
// Used to undo a delete, and to recreate the non-survivor blocks when undoing a merge.
// v9: the original `seq` comes back with it. Numbers are never reused after a delete, so
// nothing can have taken it in the meantime — and the user undoing a delete expects the
// block they were just looking at, #12 included.
export const restoreBlock = async (block: Block): Promise<void> => {
  const db = await getDb();
  await db.execute(
    `INSERT INTO blocks (id, thread_id, kind, content, annotation, annotation_by, ref_thread_id, ref_block_id, source, pinned, seq, created_at, stale_at, ref_kind, source_url, retrieved_at, recheck_after, corrected_quote)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      block.id,
      block.threadId,
      block.kind,
      block.content,
      block.annotation,
      // v14: an undone delete restores authorship with everything else — otherwise ⌘Z
      // would launder an AI note into a user note.
      block.annotationBy,
      block.refThreadId,
      block.refBlockId,
      block.source,
      block.pinned ? 1 : 0,
      block.seq,
      block.createdAt,
      // v13: an undone delete must come back exactly as it was, retirement included —
      // otherwise ⌘Z quietly resurrects a conclusion the user had retired.
      block.staleAt,
      block.refKind,
      // v20: provenance comes back with the block for the same reason the retirement does —
      // an undone delete must restore the row that was there, not a cleaned-up version of it.
      block.sourceUrl,
      block.retrievedAt,
      block.recheckAfter,
      block.correctedQuote,
    ],
  );
};

/** DESIGN_CONTEXT_HYGIENE §3.1 — «这条不作数了», and taking it back.
 *
 *  The whole write: one timestamp. Nothing about the block's text, note, pin or position
 *  moves, and nothing is deleted — §2.3's TOKI distinction is the point of doing it this
 *  way. Passing null is the undo, and it has to exist: this is a judgement call, and a
 *  judgement call the user cannot reverse is a trap.
 *
 *  ⚠️ There is no MCP counterpart on purpose (§3.1 «谁能用»). */
export const setBlockStale = async (id: string, staleAt: number | null): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET stale_at = $1 WHERE id = $2', [staleAt, id]);
};

/** DESIGN_CONTEXT_HYGIENE §3.1 — «它更正了哪一条», declared FROM the newer block.
 *
 *  Two strengths, and §3.1.1 is why they are separate. `supersedes` retires the target as
 *  a whole, so it takes a `stale_at` at the same moment. `corrects` says one point inside
 *  the target is wrong — the target keeps rendering in full, and the new block only has to
 *  name the point that changed. Copying the rest of the old block forward would be three
 *  things at once: a duplicate (the very disease this plan treats), an identity laundering
 *  (📖 Reference re-entering the library as 💭 Personal), and a price nobody would pay.
 *
 *  Passing null for `kind` clears the relation back to a plain citation. */
export const setBlockSupersession = async (
  id: string,
  targetBlockId: string | null,
  kind: Exclude<RefKind, 'cites'> | null,
  now: number,
): Promise<void> => {
  const db = await getDb();
  await db.execute('UPDATE blocks SET ref_block_id = $1, ref_kind = $2 WHERE id = $3', [
    kind === null ? null : targetBlockId,
    kind,
    id,
  ]);
  if (kind === 'supersedes' && targetBlockId) {
    await db.execute('UPDATE blocks SET stale_at = $1 WHERE id = $2 AND stale_at IS NULL', [
      now,
      targetBlockId,
    ]);
  }
};

// §9.13 Undo (merge): revert the merge survivor's mutable fields to their pre-merge
// values in place. The survivor kept its id / created_at / feed position through the
// merge, so an UPDATE is the exact inverse of the forward merge's survivor write — no
// destructive delete + recreate (which has no transaction to protect it here).
export const restoreBlockFields = async (
  id: string,
  content: string,
  annotation: string | null,
  pinned: boolean,
  source: string | null,
): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE blocks SET content = $1, annotation = $2, pinned = $3, source = $4 WHERE id = $5',
    [content, annotation, pinned ? 1 : 0, source, id],
  );
};

// v2.8 §20.1: pure helper computing the survivor + merged fields for a multi-block merge.
// Earliest-created block stays as survivor — keeps its id, created_at, and feed position.
// Contents are joined chronologically; if any source differs across the set, non-survivor
// segments are prefixed with `[from <source>]` so segment boundaries stay visible. Pinned
// becomes true if any merged block was pinned; survivor's source is kept regardless.
//
// Annotation handling (v2.8 §20.1 follow-up, 2026-05-25): per-segment annotations are
// preserved by appending `↪ note: <text>` as the last line of each segment that had one
// (see lib/blocks/segments.ts). The top-level `annotation` field on the merged block is
// set to null when ANY of the merged blocks carried an annotation — having both the
// inline markers AND a duplicate top-level annotation would be confusing for both the
// reader and the pack output. When none of the merged blocks had annotations, the
// content stays marker-free (and the resulting block, like any un-merged one, parses as
// a single segment with no annotation).
export interface MergedFields {
  survivorId: string;
  content: string;
  annotation: string | null;
  pinned: boolean;
  source: string | null;
  nonSurvivorIds: string[];
}

const MERGE_NO_SOURCE_LABEL = '(无来源)';

export const computeMergedFields = (blocks: Block[]): MergedFields => {
  if (blocks.length < 2) throw new Error('mergeBlocks: need at least 2 blocks');
  const ordered = [...blocks].sort((a, b) => a.createdAt - b.createdAt);
  const survivor = ordered[0]!;
  const nonSurvivors = ordered.slice(1);

  const firstSource = ordered[0]!.source ?? null;
  const sourcesDiffer = ordered.some((b) => (b.source ?? null) !== firstSource);

  const segments: Segment[] = ordered.map((b, idx) => {
    const isSurvivor = idx === 0;
    const prefix = sourcesDiffer && !isSurvivor
      ? `[from ${b.source ?? MERGE_NO_SOURCE_LABEL}] `
      : '';
    return {
      text: `${prefix}${b.content}`,
      annotation: b.annotation,
    };
  });

  return {
    survivorId: survivor.id,
    content: joinSegments(segments),
    // Always null: per-segment annotations live inside the content now; carrying a
    // separate top-level annotation would render twice.
    annotation: null,
    pinned: ordered.some((b) => b.pinned),
    source: survivor.source,
    nonSurvivorIds: nonSurvivors.map((b) => b.id),
  };
};

// Merge multiple blocks: writes merged fields onto the survivor, deletes non-survivors.
// Steps run sequentially (no BEGIN/COMMIT — see threads.ts:141 on why tauri-plugin-sql's
// connection pool makes explicit transactions unreliable). The FTS sync triggers
// (schema.sql blocks_au/blocks_ad) keep blocks_fts current across both writes.
//
// ⚠️ v15 (DESIGN_PROJECT_FILES): the re-point that used to run first is gone. Attachments
// belonged to a block, so a merge had to move them onto the survivor before the FK cascade
// took them; they belong to the PROJECT now, and merging two of its blocks does not move a
// file anywhere.
export const mergeBlocks = async (
  survivorId: string,
  content: string,
  annotation: string | null,
  pinned: boolean,
  source: string | null,
  nonSurvivorIds: string[],
): Promise<void> => {
  if (nonSurvivorIds.length === 0) return;
  const db = await getDb();

  await db.execute(
    'UPDATE blocks SET content = $1, annotation = $2, pinned = $3, source = $4 WHERE id = $5',
    [content, annotation, pinned ? 1 : 0, source, survivorId],
  );

  const deletePlaceholders = nonSurvivorIds.map((_, i) => `$${i + 1}`).join(', ');
  await db.execute(
    `DELETE FROM blocks WHERE id IN (${deletePlaceholders})`,
    [...nonSurvivorIds],
  );
};
