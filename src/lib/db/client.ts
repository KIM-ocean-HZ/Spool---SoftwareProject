import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import schemaSql from './schema.sql?raw';

export const INBOX_WORKSPACE_TITLE = '收件箱';
export const UNSORTED_THREAD_TITLE = '未分类';

// Seeded rows are per-language (2026-07-31, HANDOFF §2.2). Unlike UI strings — Chinese
// literal as the key, translated at render (lib/i18n) — these land in the database as
// ordinary user data: editable and deletable. So a fresh install is seeded once, in the
// language the user starts in.
//
// 2026-08-03 (Ocean): a later language switch DOES re-translate the tutorial threads —
// see retranslateTutorial below — but only the rows still character-for-character as
// seeded. Anything the user touched, renamed or deleted stays exactly as they left it.
export type SeedLanguage = 'zh' | 'en';

const INBOX_TITLE: Record<SeedLanguage, string> = { zh: INBOX_WORKSPACE_TITLE, en: 'Inbox' };
const UNSORTED_TITLE: Record<SeedLanguage, string> = { zh: UNSORTED_THREAD_TITLE, en: 'Unsorted' };

// Set by App.tsx from the resolved UI language BEFORE anything opens the database (it
// awaits the settings load first) — the seed paths below are the only readers. Kept as
// module state rather than an import of settingsStore: db/client.ts is imported by the
// node-based Vitest suites, and the store pulls in Tauri's event IPC at module scope.
let seedLanguage: SeedLanguage = 'zh';
export const setSeedLanguage = (lang: SeedLanguage): void => {
  seedLanguage = lang;
};

// Bump this whenever schema.sql changes, and add a named step to MIGRATIONS that
// carries a database from the previous version to the new one. On startup the
// database's PRAGMA user_version is compared against this and every applicable step
// runs in sequence, each stamping user_version as its own checkpoint (§19.3).
const SCHEMA_VERSION = 8;

// Tables in reverse dependency order: blocks_fts (virtual, mirrors blocks),
// attachments → blocks → threads → workspaces. Indexes and the blocks_* FTS
// triggers are dropped automatically with their owning table.
const TABLES_TO_DROP = ['blocks_fts', 'attachments', 'blocks', 'threads', 'workspaces'];

let dbPromise: Promise<Database> | null = null;

// Test-only seam (PLAN_EN.md §19.5). When set, getDb() yields this instead of
// opening sqlite:spool.db — letting the node:sqlite-backed Vitest cases drive the
// real query/CRUD modules against schema.sql's FTS triggers without the Tauri
// runtime. Never set outside tests.
let testDb: Database | null = null;
export const __setTestDb = (db: Database | null): void => {
  testDb = db;
};

const splitStatements = (sql: string): string[] => {
  // Strip line comments first, then split top-level statements by `;` followed by a blank
  // line. Trigger bodies (BEGIN ... END;) survive intact because the inner `;` is
  // followed by a single newline, not a blank one.
  const cleaned = sql.replace(/--.*$/gm, '').trim();
  const padded = cleaned + '\n\n';
  return padded
    .split(/;\s*\n\s*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(';') ? s : s + ';'));
};

const applySchema = async (db: Database): Promise<void> => {
  const stmts = splitStatements(schemaSql);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!;
    try {
      await db.execute(stmt);
    } catch (e) {
      console.error(`[db] schema statement ${i} failed:\n${stmt}\n`, e);
      throw e;
    }
  }
};

// Schema migration. If the on-disk user_version matches SCHEMA_VERSION there is
// nothing to do. The v2 → v3 step (the v2.6 design rollback) drops two `threads`
// columns; v3 → v4 (v2.7 attachment extraction) adds three `attachments` columns;
// v4 → v5 (v2.8 §20.2) adds `attachments.include_in_pack`. All three are additive
// ALTER TABLE migrations that leave every row of user data intact. Any other
// mismatch — including a brand-new database at user_version 0 — falls back to
// dropping every table and rebuilding from schema.sql.
// Best-effort consistent snapshot taken before any schema change. VACUUM INTO copies the
// live database through the SQL engine (correct even with an open WAL) and needs no fs
// permission. A failure here must never block startup, so everything is swallowed.
const backupDbBeforeMigration = async (db: Database, fromVersion: number): Promise<void> => {
  try {
    const { appConfigDir, join } = await import('@tauri-apps/api/path');
    const dir = await appConfigDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = await join(dir, `spool.pre-migration-v${fromVersion}-${stamp}.db`);
    await db.execute(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    console.info(`[db] pre-migration backup written: ${dest}`);
  } catch (e) {
    console.error('[db] pre-migration backup FAILED (continuing without one):', e);
  }
};

// How many real user rows exist right now. Each table is counted independently so a
// brand-new database (where a table may not exist yet) reports zero instead of throwing.
const countExistingUserRows = async (db: Database): Promise<number> => {
  let total = 0;
  for (const t of ['blocks', 'attachments', 'threads', 'workspaces']) {
    try {
      const r = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM ${t}`);
      total += r[0]?.c ?? 0;
    } catch {
      // Table absent on a fresh database — counts as zero, not an error.
    }
  }
  return total;
};

// Named migration registry (§19.3). Each step carries a database exactly one version
// forward and is individually idempotent (guarded ALTERs), so a crash between steps
// resumes cleanly on next startup from the checkpointed user_version. Steps run in
// sequence — a v2 database walks 2→3→4→5 in one startup pass. (The previous if-chain
// stamped a v2 database straight to 5 after only the v2→3 ALTERs, silently skipping
// the v3→4/v4→5 attachment columns; the sequential walk fixes that.)
interface Migration {
  from: number;
  to: number;
  name: string;
  run: (db: Database) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    // v2.6 design rollback (PLAN_EN.md §8.1): manual progress / next_step removed.
    // Each DROP COLUMN guarded — the column may already be absent.
    from: 2,
    to: 3,
    name: 'drop-thread-progress-and-next-step',
    run: async (db) => {
      for (const col of ['progress', 'next_step']) {
        try {
          await db.execute(`ALTER TABLE threads DROP COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not dropped (likely absent)`, e);
        }
      }
    },
  },
  {
    // v2.7 attachment text extraction (PLAN_EN.md §8.1). ADD COLUMN guarded — the
    // column may already exist on a database that saw a partial earlier pass.
    from: 3,
    to: 4,
    name: 'add-attachment-extraction-columns',
    run: async (db) => {
      for (const col of ['extracted_text TEXT', 'extracted_at INTEGER', 'extraction_kind TEXT']) {
        try {
          await db.execute(`ALTER TABLE attachments ADD COLUMN ${col}`);
        } catch (e) {
          console.info(`[db] ${col}: not added (likely exists)`, e);
        }
      }
    },
  },
  {
    // v2.8 §20.2 extraction/inline split. Default 0 — existing extracted rows stop
    // auto-inlining into pack/summaries until the user opts each one in (intentional).
    from: 4,
    to: 5,
    name: 'add-attachment-include-in-pack',
    run: async (db) => {
      try {
        await db.execute(
          'ALTER TABLE attachments ADD COLUMN include_in_pack INTEGER NOT NULL DEFAULT 0',
        );
      } catch (e) {
        console.info('[db] include_in_pack: not added (likely exists)', e);
      }
    },
  },
  {
    // MCP-first pivot (2026-07-09): summary provenance. NULL on legacy rows — treated
    // like 'user' by the MCP guard, so an existing summary is protected until the user
    // clears it or an MCP write claims a fresh one.
    from: 5,
    to: 6,
    name: 'add-thread-summary-source',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE threads ADD COLUMN summary_source TEXT');
      } catch (e) {
        console.info('[db] summary_source: not added (likely exists)', e);
      }
    },
  },
  {
    // §20.13 v2.4 (D2): block-level citations — add_block.ref_block_id lets an MCP
    // writer declare which existing block a finding builds on. NULL everywhere until a
    // writer sets it; nothing in the GUI writes it yet.
    from: 6,
    to: 7,
    name: 'add-block-ref-block-id',
    run: async (db) => {
      try {
        await db.execute('ALTER TABLE blocks ADD COLUMN ref_block_id TEXT');
      } catch (e) {
        console.info('[db] ref_block_id: not added (likely exists)', e);
      }
    },
  },
  {
    // R3 BUG-2: rows written before the v2.3 client-label map stored the raw agent
    // slug ("local-agent-mode-spool · MCP"); the GUI mapped it at render time but the
    // AI-facing surfaces (pack/digest/JSON) leaked it verbatim. Normalize the stored
    // label once — provenance semantics unchanged (same client, same · MCP marker,
    // any " — detail" suffix preserved). Idempotent: the WHERE matches nothing after
    // the first run.
    from: 7,
    to: 8,
    name: 'normalize-legacy-mcp-source-labels',
    run: async (db) => {
      await db.execute(
        "UPDATE blocks SET source = 'Claude' || substr(source, instr(source, ' · MCP')) " +
          "WHERE source LIKE 'local-agent-mode%' AND instr(source, ' · MCP') > 0",
      );
    },
  },
];

// Returns true only when the fresh-install path ran (empty DB rebuilt from schema.sql)
// — the one moment the tutorial thread may be seeded (§Task 3, 2026-07-09: never on an
// existing database; the 2026-05-29 wipe class of bugs is exactly re-running seeds
// against user data).
const migrateSchema = async (db: Database): Promise<boolean> => {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  let current = rows[0]?.user_version ?? 0;
  if (current === SCHEMA_VERSION) {
    console.info(`[db] schema version ${current} matches; no rebuild`);
    return false;
  }

  // The schema is about to change. Snapshot first so every path below — the additive
  // registry steps AND the destructive rebuild — is recoverable.
  await backupDbBeforeMigration(db, current);

  // Walk the registry. Each completed step checkpoints user_version (PRAGMA doesn't
  // accept bound parameters; `to` is a code-local integer).
  while (current < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) break;
    console.warn(`[db] migration ${step.name}: v${step.from} -> v${step.to}`);
    await step.run(db);
    await db.execute(`PRAGMA user_version = ${step.to}`);
    current = step.to;
  }
  if (current === SCHEMA_VERSION) {
    console.info(`[db] migrations complete; user_version now ${current}`);
    return false;
  }

  // Unrecognized schema version — the one path that can destroy everything. It must never
  // run against a populated database. A version we don't know how to migrate from is almost
  // always a build/database skew (e.g. launching an older commit whose SCHEMA_VERSION is
  // below this database's user_version); silently dropping here is exactly how real user
  // data was lost on 2026-05-29. Only a genuinely empty database (fresh install, no rows)
  // is safe to build from scratch.
  const existing = await countExistingUserRows(db);
  if (existing > 0) {
    throw new Error(
      `[db] refusing to rebuild: on-disk schema version ${current} is not recognized ` +
        `(expected ${SCHEMA_VERSION}) and the database already holds ${existing} user rows. ` +
        `No tables were dropped. This usually means the app was started from a build whose ` +
        `SCHEMA_VERSION differs from this database — open the matching build, or migrate ` +
        `deliberately. A snapshot was just written next to spool.db.`,
    );
  }

  console.warn(`[db] schema version ${current} != ${SCHEMA_VERSION}; empty DB, building fresh`);
  for (const t of TABLES_TO_DROP) {
    await db.execute(`DROP TABLE IF EXISTS ${t}`);
  }
  await applySchema(db);
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  console.info(`[db] schema rebuilt; user_version set to ${SCHEMA_VERSION}`);
  return true;
};

// Test-only export (§19.3): lets the node:sqlite-backed Vitest cases drive the real
// migration walk against historical schemas. Never called outside tests.
export const __migrateSchemaForTest = migrateSchema;

// Idempotent base-data guarantee: at least one workspace (the Inbox) and at least one
// thread (the capture target). Runs at startup, and again after a deletion — so deleting
// the capture-target thread, or every thread / the Inbox workspace, self-heals by
// recreating an empty Inbox rather than leaving capture with no target.
const seedDefaults = async (db: Database, lang: SeedLanguage): Promise<void> => {
  const now = Date.now();

  const wsRows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM workspaces WHERE deleted_at IS NULL',
  );
  let wsId: string;
  if ((wsRows[0]?.c ?? 0) === 0) {
    wsId = nanoid();
    await db.execute(
      'INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [wsId, INBOX_TITLE[lang], 0, now, now],
    );
  } else {
    const first = await db.select<{ id: string }[]>(
      'SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC LIMIT 1',
    );
    wsId = first[0]!.id;
  }

  const thRows = await db.select<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM threads WHERE deleted_at IS NULL',
  );
  if ((thRows[0]?.c ?? 0) === 0) {
    await db.execute(
      `INSERT INTO threads (id, workspace_id, title, status, is_capture_target, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', 1, $4, $5)`,
      [nanoid(), wsId, UNSORTED_TITLE[lang], now, now],
    );
  }
};

// Public entry point for the same guarantee, called by the stores after a deletion.
export const ensureBaseData = async (): Promise<void> => {
  await seedDefaults(await getDb(), seedLanguage);
};

// Tutorial thread for a brand-new install (Task 3, Ocean 2026-07-09 #5). Seeded ONLY
// from the fresh-DB rebuild path — never by seedDefaults' self-heal, so deleting it is
// final and re-launching / clearing data can't resurrect it. The blocks are the manual:
// each one teaches the gesture it demonstrates (content finalized with Ocean).
interface SeedBlock {
  content: string;
  annotation?: string;
  pinned?: boolean;
}
interface SeedThread {
  title: string;
  summary: string;
  blocks: SeedBlock[];
}

// 任务二 A2 (2026-07-12, Ocean-approved): the MCP scenarios get their own thread —
// one copy-paste phrase per block, the annotation naming the tool behind it. The
// thread is its own demo material (its review phrase asks the AI to read it).
const TUTORIAL: Record<SeedLanguage, { source: string; gesture: SeedThread; mcp: SeedThread }> = {
  zh: {
    source: 'Spool 指南',
    gesture: {
      title: '欢迎使用 Spool',
      summary: '新手教程：捕捉 → 整理 → 打包 → MCP 互通；可随时整条删除',
      blocks: [
        {
          content:
            'Spool 是一张上下文工作台：把散落的资料捕进「脉络」，需要 AI 时一键打包成完整上下文。它自己不带 AI——你的数据永远只在本机。',
          annotation: '这条灰字就是「批注」——你自己的话，打包时会原样保留给 AI。',
        },
        {
          content:
            '捕捉：在任何应用选中文字按 ⌘C，再快速双击 ⌥（Option）——内容自动落进「捕捉目标」脉络。这一步需要「输入监听」权限：点顶部横幅的「打开捕捉」开启，授权后完全退出 Spool 再打开。',
        },
        {
          content:
            '留下想法：捕捉弹窗里光标已经在批注框里，直接打字写下你此刻的想法，Enter 保存——你的话比摘录本身更值钱，AI 也会优先看它。不想写就点旁边任意处跳过。',
        },
        {
          content:
            '重要的块点 📌 置顶（打包时进入 Key Points）；选中文字可以高亮==像这样==；每个块都能写批注。试试取消这条的置顶！',
          pinned: true,
        },
        {
          content:
            '⌘⇧P 把整条脉络变成结构化上下文，直接粘贴给任何 AI；可选范围（仅置顶/近 7 天）与任务模板。',
        },
        {
          content:
            '设置 → MCP → 一键接入 Claude Desktop / Cursor。接好后对 AI 说「读一下我的欢迎脉络」——它能直接查阅、检索、替你归档结论。AI 写入的块会带来源标签，和你自己的笔记始终分得清。',
        },
      ],
    },
    mcp: {
      title: '让 AI 用上你的 Spool',
      summary: '一块一个场景：引号里的话照抄给 AI；可随时整条删除',
      blocks: [
        {
          content:
            '前提：设置 → MCP → 一键接入 Claude Desktop / Cursor（重启客户端生效）。接好后 AI 就能直接查阅这本思簿——下面每块一个场景，引号里的话可以照抄。Spool 本体不带 AI，数据始终在本机。',
          annotation: 'AI 只读接入即可用；要让它代写，需另开「允许 AI 写入」。',
          pinned: true,
        },
        {
          content:
            '复习与接续：「帮我复习〈让 AI 用上你的 Spool〉这条脉络，再考我两个问题」——把标题换成你自己的脉络，就是你的复习卡。',
          annotation: '背后是 get_pack：AI 拿到整条脉络的结构化简报，置顶块和你的批注都在里面。',
        },
        {
          content: '回顾一周：「我最近一周在忙什么？」',
          annotation: '背后是 get_digest：跨脉络简报，近 7 天各脉络的新块加常驻置顶锚点。',
        },
        {
          content:
            '随手归档：「把刚才这段结论存进〈XX〉脉络，批注一句为什么重要」（需打开「允许 AI 写入」）。',
          annotation:
            '背后是 add_block：AI 写入的块带「Claude · MCP」来源标签，永远和你手写的分得清；它还会用引用标注结论依据的旧块。',
        },
        {
          content: '找与查重：「XX 这个主题我记在哪条脉络？」「帮我看看有没有重复收藏的内容」',
          annotation:
            '背后是 search_blocks / find_similar_blocks：查重只出报告，合并始终由你在 Spool 里动手。',
        },
        {
          content: '库体检：「给我的思簿做个体检」',
          annotation: '背后是 check_library：只读报告内部 id 泄漏与失效引用，不改你一个字。',
        },
      ],
    },
  },
  en: {
    source: 'Spool Guide',
    gesture: {
      title: 'Welcome to Spool',
      summary: 'Quick tour: capture → sort → pack → hand it to your AI. Delete any time.',
      blocks: [
        {
          content:
            'Spool is a workbench for context: capture scattered material into a thread, then pack the whole thread into one ready-made context whenever you need an AI. Spool ships no AI of its own — your data never leaves this machine.',
          annotation:
            'This grey line is an annotation — your own words. Packing passes them to the AI exactly as written.',
        },
        {
          content:
            'Capture: select text in any app and press ⌘C, then quickly double-tap ⌥ (Option) — it lands in your capture-target thread. This needs the Input Monitoring permission: press "Turn on capture" in the banner at the top, then fully quit Spool and reopen.',
        },
        {
          content:
            "Leave a note: the capture popup opens with the cursor already in the note box — just type what you're thinking and press Enter. Your own words are worth more than the excerpt, and AIs read them first. Don't want one? Click anywhere else to skip.",
        },
        {
          content:
            'Pin the blocks that matter with 📌 (they lead the pack as Key Points); select text to highlight it ==like this==; every block can carry an annotation. Try unpinning this one!',
          pinned: true,
        },
        {
          content:
            '⌘⇧P turns the whole thread into structured context you can paste into any AI. Pick a range (pinned only / last 7 days) and a task template.',
        },
        {
          content:
            'Settings → MCP → connect Claude Desktop or Cursor in one click. Then tell your AI "read my welcome thread" — it can look things up, search, and file conclusions back for you. Blocks written by an AI carry a source tag, so they never blur with your own notes.',
        },
      ],
    },
    mcp: {
      title: 'Put your AI to work on Spool',
      summary: 'One scenario per block: copy the line in quotes to your AI. Delete any time.',
      blocks: [
        {
          content:
            'First: Settings → MCP → connect Claude Desktop or Cursor in one click (restart the client to apply). After that your AI can read this notebook directly — one scenario per block below, and the line in quotes is meant to be copied as-is. Spool ships no AI of its own; your data stays on this machine.',
          annotation:
            'Read-only access is enough for all of this; to let the AI write back, turn on "Allow AI to write" as well.',
          pinned: true,
        },
        {
          content:
            'Review and pick up where you left off: "Walk me through my \'Put your AI to work on Spool\' thread, then quiz me on two things." Swap in one of your own threads and it becomes your revision card.',
          annotation:
            'That runs get_pack: the AI gets the whole thread as a structured brief, pinned blocks and your annotations included.',
        },
        {
          content: 'Look back on a week: "What have I been working on lately?"',
          annotation:
            'That runs get_digest: a brief across threads — the last 7 days of new blocks, plus the standing pinned anchors.',
        },
        {
          content:
            'File something on the spot: "Save that conclusion into my \'XX\' thread and note why it matters." (Needs "Allow AI to write".)',
          annotation:
            'That runs add_block: blocks written by an AI carry a "Claude · MCP" source tag and never blur with your own; it also cites the older blocks a conclusion rests on.',
        },
        {
          content:
            'Find things, spot repeats: "Which thread did I write about XX in?" "Check whether I saved the same thing twice."',
          annotation:
            'That runs search_blocks / find_similar_blocks: the duplicate check only reports — merging is always yours to do, inside Spool.',
        },
        {
          content: 'Check the library: "Run a health check on my notebook."',
          annotation:
            'That runs check_library: a read-only report on leaked internal ids and broken references. It changes nothing.',
        },
      ],
    },
  },
};

const insertSeedThread = async (
  db: Database,
  wsId: string,
  thread: SeedThread,
  source: string,
  at: number,
): Promise<string> => {
  const threadId = nanoid();
  await db.execute(
    `INSERT INTO threads (id, workspace_id, title, summary, summary_source, status,
                          is_capture_target, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'user', 'active', 0, $5, $5)`,
    [threadId, wsId, thread.title, thread.summary, at],
  );
  for (let i = 0; i < thread.blocks.length; i++) {
    const b = thread.blocks[i]!;
    await db.execute(
      `INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at)
       VALUES ($1, $2, 'text', $3, $4, $5, $6, $7)`,
      [nanoid(), threadId, b.content, b.annotation ?? null, source, b.pinned ? 1 : 0, at + i],
    );
  }
  return threadId;
};

// DESIGN_FIRST_RUN 拍板点 1: the tutorial thread this launch just seeded. Non-null
// only in the process that created the database — that is exactly "this is a first
// launch", with no extra state to persist and no way for it to leak into a later
// session. App reads it to open there instead of the empty Unsorted thread.
let firstRunThreadId: string | null = null;
export const getFirstRunThreadId = (): string | null => firstRunThreadId;

const seedTutorialThread = async (db: Database, lang: SeedLanguage): Promise<void> => {
  const ws = await db.select<{ id: string }[]>(
    'SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC LIMIT 1',
  );
  const wsId = ws[0]?.id;
  if (!wsId) return;
  const copy = TUTORIAL[lang];
  const now = Date.now();
  firstRunThreadId = await insertSeedThread(db, wsId, copy.gesture, copy.source, now);
  // The MCP thread is timestamped 10s earlier so the gesture tutorial stays on top of
  // the sidebar.
  await insertSeedThread(db, wsId, copy.mcp, copy.source, now - 10_000);
};

// Test-only export: lets Vitest exercise the seed against the node:sqlite adapter.
export const __seedTutorialThreadForTest = seedTutorialThread;

// The provenance label every seeded tutorial block carries, in both languages. A thread
// made up entirely of these is still the tutorial as we wrote it — LogView opens those at
// the top so the guide is read from block 1, while every other thread opens at the newest
// block (Ocean 2026-08-03). The moment the user captures something of their own into the
// thread, it stops being "the tutorial" and behaves like any other project.
const TUTORIAL_SOURCES: ReadonlySet<string> = new Set(
  Object.values(TUTORIAL).map((copy) => copy.source),
);
export const isTutorialSource = (source: string | null): boolean =>
  source !== null && TUTORIAL_SOURCES.has(source);

// Switching the UI language re-translates the tutorial threads in place (Ocean,
// 2026-08-03: "教程的语言…需要随切换语言变化"). These are database rows, not UI strings,
// so the rule that keeps this from eating anyone's work is: **only rewrite what is still
// exactly as seeded.**
//
// - A thread is found by its seeded title; renamed or deleted → skipped, and nothing is
//   ever re-created (deleting the tutorial stays final, same as before).
// - Every seeded block must still match its seeded text, annotation and source label. One
//   edited block skips the whole thread — half-translated would be worse than untouched.
// - Blocks the user captured into the thread are left alone; so are pin state, ids,
//   timestamps and `updated_at` (a language switch is not activity, it must not reorder
//   the sidebar).
//
// Returns true when anything changed, so the caller can refresh the stores.
export const retranslateTutorial = async (
  from: SeedLanguage,
  to: SeedLanguage,
): Promise<boolean> => {
  if (from === to) return false;
  const db = await getDb();
  const fromCopy = TUTORIAL[from];
  const toCopy = TUTORIAL[to];
  let changed = false;

  for (const key of ['gesture', 'mcp'] as const) {
    const before = fromCopy[key];
    const after = toCopy[key];
    // The two languages are parallel translations; if that ever stops being true, do
    // nothing rather than pair blocks up by the wrong index.
    if (before.blocks.length !== after.blocks.length) continue;

    const threads = await db.select<{ id: string; summary: string | null }[]>(
      'SELECT id, summary FROM threads WHERE title = $1 AND deleted_at IS NULL',
      [before.title],
    );
    const thread = threads[0];
    if (!thread) continue;

    const rows = await db.select<{ id: string; content: string; annotation: string | null }[]>(
      'SELECT id, content, annotation FROM blocks WHERE thread_id = $1 AND source = $2',
      [thread.id, fromCopy.source],
    );
    const matched: string[] = [];
    for (const seedBlock of before.blocks) {
      const hit = rows.find(
        (r) =>
          !matched.includes(r.id) &&
          r.content === seedBlock.content &&
          (r.annotation ?? null) === (seedBlock.annotation ?? null),
      );
      if (!hit) break;
      matched.push(hit.id);
    }
    if (matched.length !== before.blocks.length) continue;

    for (let i = 0; i < matched.length; i++) {
      const target = after.blocks[i]!;
      await db.execute('UPDATE blocks SET content = $1, annotation = $2, source = $3 WHERE id = $4', [
        target.content,
        target.annotation ?? null,
        toCopy.source,
        matched[i]!,
      ]);
    }
    // The summary is a separate editable field — swap it only if it is still the seeded
    // one, so a user-written card keeps their words.
    if (thread.summary === before.summary) {
      await db.execute('UPDATE threads SET title = $1, summary = $2 WHERE id = $3', [
        after.title,
        after.summary,
        thread.id,
      ]);
    } else {
      await db.execute('UPDATE threads SET title = $1 WHERE id = $2', [after.title, thread.id]);
    }
    changed = true;
  }

  return changed;
};

// Only the main window initializes the database (migrations + base-data seeding). The
// overlay and collect windows run their own JS contexts and also open the DB at startup
// (the collect panel reads the capture target on mount) — on a FRESH install their
// seedDefaults raced the main window's (both saw count 0, both inserted), leaving a
// duplicate 收件箱/未分类, both flagged capture target; reproduced ~1 in 4 first
// launches. The fresh-DB rebuild inside migrateSchema is racy the same way (a late
// second rebuild would drop the first window's just-seeded rows). Single-writer init
// closes both: non-main windows open the connection and read; until main finishes, a
// fresh install's reads fail or return nothing and those surfaces already degrade
// quietly. Outside a Tauri window (tests calling initDb directly) the label probe
// throws — default to initializing.
const isMainWindow = (): boolean => {
  try {
    return getCurrentWindow().label === 'main';
  } catch {
    return true;
  }
};

const initDb = async (): Promise<Database> => {
  console.info('[db] loading sqlite:spool.db');
  const db = await Database.load('sqlite:spool.db');
  if (isMainWindow()) {
    console.info('[db] loaded; checking schema version');
    const fresh = await migrateSchema(db);
    console.info('[db] schema ready; seeding defaults');
    await seedDefaults(db, seedLanguage);
    if (fresh) {
      console.info(`[db] fresh install; seeding tutorial thread (lang=${seedLanguage})`);
      await seedTutorialThread(db, seedLanguage);
    }
  } else {
    console.info('[db] loaded; non-main window skips migration + seeding');
  }
  console.info('[db] ready');
  return db;
};

export const getDb = (): Promise<Database> => {
  if (testDb) return Promise.resolve(testDb);
  if (!dbPromise) {
    dbPromise = initDb().catch((e) => {
      // Reset so the next caller can retry after the user fixes the underlying issue
      // (e.g. permissions). Without this, every subsequent call awaits the same rejected
      // promise forever.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
};

// "Clear all data" danger action (§9.12). Wipes every user row in dependency order
// (deleting blocks fires the FTS delete trigger, keeping blocks_fts in sync), then
// re-seeds the empty Inbox so the app still has a capture target. The caller is
// expected to reload the window afterwards so every store re-hydrates.
export const clearAllData = async (): Promise<void> => {
  const db = await getDb();
  for (const t of ['attachments', 'blocks', 'threads', 'workspaces']) {
    await db.execute(`DELETE FROM ${t}`);
  }
  await seedDefaults(db, seedLanguage);
};
