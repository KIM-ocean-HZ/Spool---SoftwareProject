import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { buildPackFolder, indexSummary, sanitizeSegment, type PackProject } from './folder';

const NOW = new Date('2026-08-17T14:30:00').getTime();

const thread = (id: string, title: string, opts: Partial<Thread> = {}): Thread => ({
  id,
  workspaceId: 'w1',
  title,
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  autoMaintain: null,
  createdAt: NOW,
  updatedAt: NOW,
  completedAt: null,
  ...opts,
});

const block = (id: string, threadId: string, content: string, opts: Partial<Block> = {}): Block =>
  ({
    id,
    threadId,
    kind: 'text',
    content,
    annotation: null,
    refThreadId: null,
    refBlockId: null,
    source: null,
    pinned: false,
    createdAt: NOW,
    ...opts,
  }) as Block;

const project = (id: string, title: string, blocks: Block[], t?: Partial<Thread>): PackProject => ({
  thread: thread(id, title, t),
  blocks,
  attachments: [],
});

const build = (root: Parameters<typeof buildPackFolder>[0]['root']) =>
  buildPackFolder({
    root,
    range: 'all',
    refTitles: new Map(),
    refBlocks: new Map(),
    outputLanguage: 'zh',
    now: NOW,
  });

describe('sanitizeSegment', () => {
  it('keeps Chinese titles as they are', () => {
    expect(sanitizeSegment('材料准备')).toBe('材料准备');
  });

  it('turns separators and spaces into single dashes', () => {
    expect(sanitizeSegment('Georgia Tech MS')).toBe('Georgia-Tech-MS');
    expect(sanitizeSegment('a/b:c')).toBe('a-b-c');
  });

  it('never returns an empty path segment', () => {
    // A workspace created with ＋ and never named is the common case, not an edge one.
    expect(sanitizeSegment('')).toBe('untitled');
    expect(sanitizeSegment('   ')).toBe('untitled');
    expect(sanitizeSegment('...')).toBe('untitled');
  });

  it('refuses to end a name in a dot, which would confuse the extension', () => {
    expect(sanitizeSegment('v1.')).toBe('v1');
  });
});

describe('indexSummary', () => {
  it('prefers the project summary', () => {
    const t = thread('t1', '申请规划', { summary: '已经定了三所学校，等推荐信' });
    expect(indexSummary(t, [])).toBe('已经定了三所学校，等推荐信');
  });

  it('caps a long summary at the same 40 characters the fallback uses', () => {
    // Ocean 2026-08-17: 「不需要 120 字，每个项目的标题信息量足够了，加上 40 字辅助」— the file
    // NAME carries the first half of the line, so both kinds of half-line get one budget.
    const t = thread('t1', '申请规划', { summary: 'x'.repeat(60) });
    expect(indexSummary(t, [])).toBe('x'.repeat(40) + '…');
  });

  it('falls back to the head of the first live block', () => {
    const t = thread('t1', '申请规划');
    expect(indexSummary(t, [block('b1', 't1', 'GT 的截止日是 12 月 15 日')])).toBe(
      'GT 的截止日是 12 月 15 日',
    );
  });

  it('skips retired blocks when falling back', () => {
    const t = thread('t1', '申请规划');
    const blocks = [
      block('b1', 't1', '这条已经不成立了', { staleAt: NOW } as Partial<Block>),
      block('b2', 't1', '这条还成立'),
    ];
    expect(indexSummary(t, blocks)).toBe('这条还成立');
  });

  it('is empty rather than invented when the project has neither', () => {
    expect(indexSummary(thread('t1', '空项目'), [])).toBe('');
  });
});

describe('buildPackFolder', () => {
  const tree = {
    title: '升学',
    projects: [
      project('t1', '申请规划', [block('b1', 't1', '定了三所学校')], {
        summary: '等推荐信',
      }),
      project('t2', 'Georgia Tech MS', [block('b2', 't2', '截止 12/15')]),
    ],
    children: [
      {
        title: '材料准备',
        projects: [project('t3', '文书', [block('b3', 't3', 'PS 第三稿')])],
        children: [],
      },
    ],
  };

  it('names the export folder after the workspace and the day', () => {
    expect(build(tree).folderName).toBe('spool-升学-20260817');
  });

  it('puts INDEX.md first and maps sub-workspaces onto sub-directories', () => {
    expect(build(tree).files.map((f) => f.path)).toEqual([
      'INDEX.md',
      '01-申请规划.md',
      '02-Georgia-Tech-MS.md',
      '材料准备/01-文书.md',
    ]);
  });

  it('opens every project file with the order to read INDEX.md, with the right path', () => {
    const files = build(tree).files;
    const top = files.find((f) => f.path === '01-申请规划.md')!;
    const nested = files.find((f) => f.path === '材料准备/01-文书.md')!;
    expect(top.content.startsWith('> **Read `INDEX.md` in this folder first.**')).toBe(true);
    // ⚠️ One rules file for the whole export — a nested file points UP at it, not at a copy.
    expect(nested.content.startsWith('> **Read `../INDEX.md` at the top of this export first.**'))
      .toBe(true);
  });

  it('keeps the four-category rules in INDEX.md only (拍板乙, not 甲)', () => {
    const files = build(tree).files;
    const index = files.find((f) => f.path === 'INDEX.md')!;
    expect(index.content).toContain('## How to Read This Context');
    for (const f of files.filter((f) => f.path !== 'INDEX.md')) {
      expect(f.content).not.toContain('## How to Read This Context');
    }
  });

  it('states the rules before the catalogue, because INDEX.md is a rules file', () => {
    const index = build(tree).files[0]!.content;
    expect(index.indexOf('## How to Read This Context')).toBeLessThan(
      index.indexOf('## What is in this folder'),
    );
  });

  it('lists every project with its block count and summary', () => {
    const index = build(tree).files[0]!.content;
    expect(index).toContain('- `01-申请规划.md` — 1 block — 等推荐信');
    expect(index).toContain('- `材料准备/` — a workspace inside this one');
    expect(index).toContain('  - `材料准备/01-文书.md` — 1 block — PS 第三稿');
  });

  it('says the export is a snapshot, with the moment it was taken', () => {
    const index = build(tree).files[0]!.content;
    expect(index).toContain('Exported by Spool on 2026-08-17 14:30');
    expect(index).toContain('**This is a one-time snapshot**');
  });

  it('admits in INDEX.md when a range narrowed the export', () => {
    const narrowed = buildPackFolder({
      root: tree,
      range: 'pinned',
      refTitles: new Map(),
      refBlocks: new Map(),
      outputLanguage: 'zh',
      now: NOW,
    });
    expect(narrowed.files[0]!.content).toContain('Only blocks the user pinned as core context');
  });

  it('does not lose a project whose title collides with a sibling', () => {
    // Two projects can share a title; the numeric prefix already separates them, and this
    // pins that — a collision that silently overwrote a file would drop a whole project.
    const paths = build({
      title: '升学',
      projects: [
        project('t1', '文书', [block('b1', 't1', 'a')]),
        project('t2', '文书', [block('b2', 't2', 'b')]),
      ],
      children: [],
    }).files.map((f) => f.path);
    expect(paths).toEqual(['INDEX.md', '01-文书.md', '02-文书.md']);
  });

  it('does not lose a sub-workspace whose title collides with a sibling', () => {
    const paths = build({
      title: '升学',
      projects: [],
      children: [
        { title: '文书', projects: [project('t1', 'a', [])], children: [] },
        { title: '文书', projects: [project('t2', 'b', [])], children: [] },
      ],
    }).files.map((f) => f.path);
    expect(paths).toEqual(['INDEX.md', '文书/01-a.md', '文书-2/01-b.md']);
  });

  it('exports an empty workspace as an INDEX.md that says so', () => {
    const out = build({ title: '空工作区', projects: [], children: [] });
    expect(out.files.map((f) => f.path)).toEqual(['INDEX.md']);
    expect(out.files[0]!.content).toContain('(nothing was selected for export)');
  });
});
