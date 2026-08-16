import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { followUpFingerprint } from '@/lib/engine/followUp';
import { __setTestDb } from './client';
import {
  addFollowUpItem,
  approveFollowUpProposal,
  closeFollowUpItem,
  countFollowUpProposals,
  countOpenFollowUpItems,
  deleteFollowUpItem,
  dismissFollowUpProposal,
  listFollowUpItems,
  listFollowUpProposals,
  reopenFollowUpItem,
  setFollowUpItemStanding,
  updateFollowUpItemText,
} from './followUpItems';
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

// DESIGN_FOLLOW_UP §8 — the follow-up list, one row per line (v22). What is worth pinning
// down here is the part Ocean's 2026-08-16 decision made possible: one list holding two
// kinds of line, where merging them is only safe because `standing` survives (§8.2).
describe('follow-up items (DESIGN_FOLLOW_UP §8)', () => {
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

  const propose = (text: string, standing = false): string => {
    const id = `p${text.length}${Math.random().toString(36).slice(2, 8)}`;
    handle
      .prepare(
        `INSERT INTO follow_up_items
           (id, thread_id, text, why, standing, fingerprint, status, proposed_by,
            sort_order, created_at)
         VALUES (?1, ?2, ?3, '因为这个项目在等它', ?4, ?3, 'proposed', 'Claude Desktop', 0, 1)`,
      )
      .run(id, threadId, text, standing ? 1 : 0);
    return id;
  };

  // ⚠️⚠️ TWIN of `follow_up_fingerprint` in src-tauri/src/mcp.rs. Both sides write this value
  // into the same column and both compare against it — this side when the user types a line,
  // that side when an AI proposes one. Drift and the duplicate check stops firing, silently,
  // with no error anywhere to say why. These vectors are duplicated verbatim in that file's
  // `follow_up_fingerprint_matches_its_typescript_twin` — change one, change both.
  it('fingerprints a line the same way the MCP server does', () => {
    expect(followUpFingerprint('GRE 今年还要不要')).toBe('gre 今年还要不要');
    expect(followUpFingerprint('  Tauri  2.12   改没改托盘 API ')).toBe('tauri 2.12 改没改托盘 api');
    expect(followUpFingerprint('CMU\n的截止日期')).toBe('cmu 的截止日期');
    expect(followUpFingerprint('')).toBe('');
    expect(followUpFingerprint('   ')).toBe('');
  });

  it('starts empty — an empty list is the off switch', async () => {
    expect(await listFollowUpItems(threadId)).toEqual([]);
    expect(await countOpenFollowUpItems(threadId)).toBe(0);
  });

  it("stores the user's own line live, in order, trimmed", async () => {
    await addFollowUpItem(threadId, '  CMU 的截止日期变没变  ', true);
    await addFollowUpItem(threadId, 'Tauri 2.12 改没改托盘 API', false);

    const items = await listFollowUpItems(threadId);
    expect(items.map((i) => [i.text, i.standing, i.status, i.sortOrder])).toEqual([
      ['CMU 的截止日期变没变', true, 'open', 0],
      ['Tauri 2.12 改没改托盘 API', false, 'open', 1],
    ]);
    // The user typing in their own list needs no review step — the gate in §8.4 is about
    // what an AI files, and a line they just typed is one they have already read.
    expect(items.every((i) => i.proposedBy === null && i.approvedAt !== null)).toBe(true);
    expect(await countOpenFollowUpItems(threadId)).toBe(2);
  });

  it('ignores a blank line rather than storing one', async () => {
    await addFollowUpItem(threadId, '   \n  ', false);
    expect(await listFollowUpItems(threadId)).toEqual([]);
  });

  // §8.6 — closing is not deleting. This is what makes it safe to let an AI close a line
  // without asking first (Ocean 拍板 2026-08-16): the worst a page that lies about something
  // being settled can do is park one line where the user can see it and put it back.
  it('keeps an answered line visible, with what closed it, and reopens it intact', async () => {
    await addFollowUpItem(threadId, 'Tauri 2.12 改没改托盘 API', false);
    const [item] = await listFollowUpItems(threadId);

    await closeFollowUpItem(item!.id, '2.12 没动托盘 API', 'blk123');

    const [closed] = await listFollowUpItems(threadId);
    expect(closed!.status).toBe('answered');
    expect(closed!.outcome).toBe('2.12 没动托盘 API');
    expect(closed!.answerBlockId).toBe('blk123');
    expect(closed!.text).toBe('Tauri 2.12 改没改托盘 API');
    expect(await countOpenFollowUpItems(threadId)).toBe(0);

    await reopenFollowUpItem(closed!.id);

    const [back] = await listFollowUpItems(threadId);
    expect(back!.status).toBe('open');
    expect([back!.outcome, back!.answeredAt, back!.answerBlockId]).toEqual([null, null, null]);
  });

  it('closes with no answer block at all — "nothing changed" is a legitimate close', async () => {
    await addFollowUpItem(threadId, '有没有新的奖学金', false);
    const [item] = await listFollowUpItems(threadId);

    await closeFollowUpItem(item!.id, '这一周查下来没有变化');

    const [closed] = await listFollowUpItems(threadId);
    // §2.4's silence rule reaches this far: nothing changed means nothing should have been
    // written into the library, so there is no block to point at and that is correct.
    expect([closed!.status, closed!.answerBlockId]).toEqual(['answered', null]);
  });

  it('closes nothing twice — a second close cannot overwrite what settled the first', async () => {
    await addFollowUpItem(threadId, '有没有新的奖学金', false);
    const [item] = await listFollowUpItems(threadId);
    await closeFollowUpItem(item!.id, '第一次的结论', 'blk1');

    await closeFollowUpItem(item!.id, '第二次的结论', 'blk2');

    const [closed] = await listFollowUpItems(threadId);
    expect([closed!.outcome, closed!.answerBlockId]).toEqual(['第一次的结论', 'blk1']);
  });

  it('edits text and the standing marker in place', async () => {
    await addFollowUpItem(threadId, 'GRE 还要不要', false);
    const [item] = await listFollowUpItems(threadId);

    await updateFollowUpItemText(item!.id, '  GRE 今年还要不要  ');
    await setFollowUpItemStanding(item!.id, true);

    const [edited] = await listFollowUpItems(threadId);
    expect([edited!.text, edited!.standing]).toEqual(['GRE 今年还要不要', true]);
    // The fingerprint follows the text, or the duplicate check starts firing on the old
    // wording and missing the new one.
    expect(handle.prepare('SELECT fingerprint FROM follow_up_items').get()).toEqual({
      fingerprint: 'gre 今年还要不要',
    });
  });

  it('deletes a line the user never wanted, leaving nothing', async () => {
    await addFollowUpItem(threadId, '随手写的', false);
    const [item] = await listFollowUpItems(threadId);

    await deleteFollowUpItem(item!.id);

    expect(await listFollowUpItems(threadId)).toEqual([]);
  });

  // §8.4 — a line an AI proposes outlives this conversation and steers what the next one
  // goes looking for, so it waits on the review screen. Ocean 拍板 2026-08-16: 要点一下.
  describe('what an AI proposes (§8.4)', () => {
    it('does not count as live until the user approves it', async () => {
      propose('CMU 今年的截止日期');

      expect(await countOpenFollowUpItems(threadId)).toBe(0);
      expect(await countFollowUpProposals()).toBe(1);
      const [p] = await listFollowUpProposals();
      expect([p!.text, p!.status, p!.proposedBy, p!.threadTitle]).toEqual([
        'CMU 今年的截止日期',
        'proposed',
        'Claude Desktop',
        '升学规划',
      ]);
      // The reason it matters here is the one line the user actually reads before deciding.
      expect(p!.why).toBe('因为这个项目在等它');
    });

    it('goes live on approval, and moves the project clock', async () => {
      const id = propose('CMU 今年的截止日期');
      const before = handle.prepare('SELECT updated_at FROM threads').get() as {
        updated_at: number;
      };
      handle.exec('UPDATE threads SET updated_at = 1');

      await approveFollowUpProposal(id);

      expect(await countOpenFollowUpItems(threadId)).toBe(1);
      expect(await countFollowUpProposals()).toBe(0);
      const [live] = await listFollowUpItems(threadId);
      expect(live!.approvedAt).not.toBeNull();
      // list_threads promises "updated_at moves on any change at all", and what a project
      // follows up is reported there — leaving the clock still would make the tool state a
      // fact the project's own clock denies.
      const after = handle.prepare('SELECT updated_at FROM threads').get() as {
        updated_at: number;
      };
      expect(after.updated_at).toBeGreaterThan(1);
      expect(before.updated_at).toBeGreaterThan(0);
    });

    it('leaves no trace when the user says no', async () => {
      const id = propose('无关的东西');

      await dismissFollowUpProposal(id);

      expect(await listFollowUpItems(threadId)).toEqual([]);
      expect(await countFollowUpProposals()).toBe(0);
    });

    it('is not visible on the review screen once the project is gone', async () => {
      propose('CMU 今年的截止日期');
      handle.exec(`UPDATE threads SET deleted_at = 1 WHERE id = '${threadId}'`);

      expect(await listFollowUpProposals()).toEqual([]);
      expect(await countFollowUpProposals()).toBe(0);
    });
  });
});
