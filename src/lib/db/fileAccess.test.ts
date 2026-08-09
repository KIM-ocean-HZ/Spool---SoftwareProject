import { createRequire } from 'node:module';
import type Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttachment, listAttachmentsByThread } from './attachments';
import { __setTestDb } from './client';
import {
  __insertFileRequestForTest,
  approveFileRequest,
  countPendingFileRequests,
  listPendingFileRequests,
  purgeExpiredFileRequests,
  rejectFileRequest,
} from './fileAccess';
import schemaSql from './schema.sql?raw';
import {
  applyBriefSuggestion,
  countBriefSuggestions,
  createThread,
  dismissBriefSuggestion,
  listBriefSuggestions,
  setFollowUpBrief,
} from './threads';
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

describe('file access requests (DESIGN_PROJECT_FILES §3.4)', () => {
  let handle: Sqlite;
  let threadId: string;
  let aId: string;
  let bId: string;

  beforeEach(async () => {
    handle = new DatabaseSync(':memory:');
    handle.exec(schemaSql.replace(/--.*$/gm, ''));
    __setTestDb(makeAdapter(handle));
    const wsId = (await createWorkspace('升学')).id;
    threadId = (await createThread(wsId, '申请规划')).id;
    aId = (await createAttachment({ threadId, kind: 'file', target: '/x/a.pdf', label: 'a.pdf' }))
      .id;
    bId = (await createAttachment({ threadId, kind: 'file', target: '/x/b.docx', label: 'b.docx' }))
      .id;
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  const queue = async (): Promise<void> =>
    __insertFileRequestForTest({
      requestId: 'req1',
      client: 'Codex · MCP',
      threadId,
      why: '核对 CMU 的课程表',
      createdAt: NOW,
      expiresAt: NOW + 7 * DAY,
      files: [{ attachmentId: aId }, { attachmentId: bId }],
    });

  it('shows one card per request, whatever number of files it named', async () => {
    await queue();
    const pending = await listPendingFileRequests(NOW);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.files.map((f) => f.label)).toEqual(['a.pdf', 'b.docx']);
    expect(pending[0]!.why).toBe('核对 CMU 的课程表');
    // The badge counts decisions, not rows — two files are one thing to answer.
    expect(await countPendingFileRequests(NOW)).toBe(1);
  });

  it('grants exactly the files the card named, and nothing else', async () => {
    const other = await createAttachment({
      threadId,
      kind: 'file',
      target: '/x/c.pdf',
      label: 'c.pdf',
    });
    await queue();

    expect(await approveFileRequest('req1')).toBe(2);

    const files = await listAttachmentsByThread(threadId);
    expect(files.filter((f) => f.aiAccess).map((f) => f.label).sort()).toEqual([
      'a.pdf',
      'b.docx',
    ]);
    expect(files.find((f) => f.id === other.id)!.aiAccess).toBe(false);
    // The request is spent: an answered card must not still be sitting on the screen.
    expect(await listPendingFileRequests(NOW)).toEqual([]);
  });

  it('leaves no trace when refused, and grants nothing', async () => {
    await queue();
    await rejectFileRequest('req1');

    expect(await listPendingFileRequests(NOW)).toEqual([]);
    expect((await listAttachmentsByThread(threadId)).some((f) => f.aiAccess)).toBe(false);
    // §4.3: rejection keeps no record. A queue that remembers what was turned away is the
    // landfill the review screen exists to avoid.
    expect(
      (handle.prepare('SELECT COUNT(*) AS c FROM file_access_requests').get() as { c: number }).c,
    ).toBe(0);
  });

  it('stops offering a request once its 7 days are up', async () => {
    await queue();
    const later = NOW + 8 * DAY;

    expect(await listPendingFileRequests(later)).toEqual([]);
    expect(await countPendingFileRequests(later)).toBe(0);
    await purgeExpiredFileRequests(later);
    expect(
      (handle.prepare('SELECT COUNT(*) AS c FROM file_access_requests').get() as { c: number }).c,
    ).toBe(0);
  });

  it('drops a request whose file the user deleted in the meantime', async () => {
    await queue();
    handle.exec(`DELETE FROM attachments WHERE id = '${aId}'`);

    // Not an error and not a half-card: the request now covers the one file that is left,
    // because approving something that no longer exists would grant nothing while saying it
    // granted something.
    const pending = await listPendingFileRequests(NOW);
    expect(pending[0]!.files.map((f) => f.label)).toEqual(['b.docx']);
  });
});

describe('follow-up brief suggestions (决定 5)', () => {
  let handle: Sqlite;
  let threadId: string;

  beforeEach(async () => {
    handle = new DatabaseSync(':memory:');
    handle.exec(schemaSql.replace(/--.*$/gm, ''));
    __setTestDb(makeAdapter(handle));
    const wsId = (await createWorkspace('升学')).id;
    threadId = (await createThread(wsId, '申请规划')).id;
    await setFollowUpBrief(threadId, '盯 CMU 的截止日期');
  });

  afterEach(() => {
    __setTestDb(null);
    handle.close();
  });

  const park = (text: string): void => {
    handle
      .prepare(
        `UPDATE threads SET follow_up_brief_suggested = ?1,
                            follow_up_brief_suggested_by = 'Codex · MCP',
                            follow_up_brief_suggested_at = ?2
          WHERE id = ?3`,
      )
      .run(text, NOW, threadId);
  };

  it('shows the old and the new text together', async () => {
    park('盯截止日期，也盯先修课要求');
    const [s] = await listBriefSuggestions();
    // Both, because what the user is approving is a CHANGE to what their machine will go
    // looking for — a card showing only the new lines hides the part that matters.
    expect(s!.current).toBe('盯 CMU 的截止日期');
    expect(s!.suggested).toBe('盯截止日期，也盯先修课要求');
    expect(s!.by).toBe('Codex · MCP');
    expect(await countBriefSuggestions()).toBe(1);
  });

  it('moves the text across only when applied, and clears the card', async () => {
    park('盯截止日期，也盯先修课要求');
    await applyBriefSuggestion(threadId);

    const row = handle
      .prepare('SELECT follow_up_brief, follow_up_brief_suggested FROM threads WHERE id = ?1')
      .get(threadId) as { follow_up_brief: string; follow_up_brief_suggested: string | null };
    expect(row.follow_up_brief).toBe('盯截止日期，也盯先修课要求');
    expect(row.follow_up_brief_suggested).toBeNull();
    expect(await listBriefSuggestions()).toEqual([]);
  });

  it('moves the project clock, because list_threads now reports what is watched', async () => {
    // DESIGN_MCP_INTENT_ROUTING §1.1 + §4.3 C. This was harmless until 2026-08-09: nothing
    // outside the follow-up screen could observe a brief, so a silent change told no lies.
    // list_threads now returns `following_up`, under a description that promises updated_at
    // moves on any change at all — leaving the clock still would make the tool state a fact
    // about the project that the project's own timestamp denies.
    // Backdated on purpose: createThread and applyBriefSuggestion land in the same
    // millisecond in a test this fast, and "did not move" would pass either way.
    const before = 1_700_000_000_000;
    handle.prepare('UPDATE threads SET updated_at = ?1 WHERE id = ?2').run(before, threadId);
    park('盯截止日期，也盯先修课要求');
    await applyBriefSuggestion(threadId);
    const after = (
      handle.prepare('SELECT updated_at FROM threads WHERE id = ?1').get(threadId) as {
        updated_at: number;
      }
    ).updated_at;
    expect(after).toBeGreaterThan(before);
  });

  it('leaves the live brief untouched when dismissed', async () => {
    park('盯别的东西');
    await dismissBriefSuggestion(threadId);

    const row = handle
      .prepare('SELECT follow_up_brief, follow_up_brief_suggested FROM threads WHERE id = ?1')
      .get(threadId) as { follow_up_brief: string; follow_up_brief_suggested: string | null };
    expect(row.follow_up_brief).toBe('盯 CMU 的截止日期');
    expect(row.follow_up_brief_suggested).toBeNull();
    expect(await countBriefSuggestions()).toBe(0);
  });

  it('applies nothing when there is no suggestion parked', async () => {
    await applyBriefSuggestion(threadId);
    const row = handle
      .prepare('SELECT follow_up_brief FROM threads WHERE id = ?1')
      .get(threadId) as { follow_up_brief: string };
    // The guard matters: without `AND follow_up_brief_suggested IS NOT NULL` this statement
    // would blank a live brief — turning follow-up off for a project by clicking a card that
    // was already gone.
    expect(row.follow_up_brief).toBe('盯 CMU 的截止日期');
  });
});
