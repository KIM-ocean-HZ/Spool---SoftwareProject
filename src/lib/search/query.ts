import { getDb } from '@/lib/db/client';

// Full-text search over blocks (PLAN_EN.md §9.10 / Phase 7). Purely local — this
// module only ever touches SQLite, never the network.
//
// Two paths, picked by query length:
//   - ≥3 characters → SQLite FTS5 over the `blocks_fts` trigram index, bm25-ranked.
//   - 1–2 characters → a LIKE scan over `blocks`. The trigram tokenizer cannot index
//     a token shorter than 3 chars, so a 2-character Chinese word ("结论", "方案")
//     would otherwise match nothing. The scan is cheap at personal-database scale.

const SEARCH_LIMIT = 60;

// Per-line display cap. A captured block is often a single very long line (a
// paragraph pasted with no newlines); past this width the hit line is windowed
// around the keyword instead of dumping the whole line into the overlay.
const LINE_CAP = 120;
const WINDOW_PAD_BEFORE = 48;

export type SearchField = 'content' | 'annotation';

export interface SearchSnippetLine {
  text: string;
  isHit: boolean;
  // Hit line only: [start, end) of the keyword within `text`, for highlighting.
  match?: { start: number; end: number };
}

// v2.9 §9.10 / §19.17: every position the query matches within a hit block, used
// for in-block <mark> rendering and InBlockNavigator stepping. Offsets are
// UTF-16 character indices into the field's text, ordered by field then by
// appearance (content offsets first, then annotation offsets).
export interface HitOffset {
  field: SearchField;
  start: number;
  end: number;
}

export interface SearchHit {
  blockId: string;
  threadId: string;
  threadTitle: string;
  workspaceId: string;
  workspaceTitle: string;
  createdAt: number;
  field: SearchField; // which field the keyword was found in
  snippet: SearchSnippetLine[]; // up to 3 lines: hit line ± one line of context
  // All literal substring matches across both fields. The snippet is for the
  // search-result preview; these drive in-block highlighting + navigation.
  hitOffsets: HitOffset[];
  /** ⭐ S8：这一块**整体**是什么，一句话。null = 还没有人写过。
   *  ⚠️ 片段说的是「字在哪儿对上的」，这一句说的是「它们是什么的一部分」。 */
  gist: string | null;
}

/** 一条命中里「对上的那一行」的文字。⭐ 2026-08-27 从 InBlockNavigator 搬到这里，因为右侧
 *  刻度的悬浮预览也要用同一行 —— 两处各写一遍的话，两处会慢慢长得不一样。 */
export const hitLine = (hit: SearchHit): string => {
  const line = hit.snippet.find((l) => l.isHit) ?? hit.snippet[0];
  return (line?.text ?? '').trim();
};

interface Row {
  block_id: string;
  thread_id: string;
  content: string;
  annotation: string | null;
  created_at: number;
  thread_title: string;
  workspace_id: string;
  workspace_title: string;
  gist: string | null;
}

// Window a long hit line so the keyword stays visible with some context on each
// side. Short lines pass through untouched.
const windowHitLine = (line: string, matchStart: number, matchLen: number): SearchSnippetLine => {
  if (line.length <= LINE_CAP) {
    return { text: line, isHit: true, match: { start: matchStart, end: matchStart + matchLen } };
  }
  let winStart = Math.max(0, matchStart - WINDOW_PAD_BEFORE);
  const winEnd = Math.min(line.length, winStart + LINE_CAP);
  winStart = Math.max(0, winEnd - LINE_CAP); // pull the start back if we hit the end
  const lead = winStart > 0 ? '…' : '';
  const trail = winEnd < line.length ? '…' : '';
  const start = matchStart - winStart + lead.length;
  return {
    text: lead + line.slice(winStart, winEnd) + trail,
    isHit: true,
    match: { start, end: start + matchLen },
  };
};

const contextLine = (line: string): SearchSnippetLine => ({
  text: line.length <= LINE_CAP ? line : line.slice(0, LINE_CAP) + '…',
  isHit: false,
});

// Pure: given a matched block's text fields and the raw keyword, locate the keyword
// and return the hit line plus one line of context above and below (PLAN_EN.md
// §9.10). Exported for unit testing.
export const buildSnippet = (
  content: string,
  annotation: string | null,
  query: string,
): { field: SearchField; snippet: SearchSnippetLine[] } => {
  const q = query.toLowerCase();
  const locate = (text: string): number => (q ? text.toLowerCase().indexOf(q) : -1);

  // Prefer the content; fall back to the annotation only when the keyword is not
  // in the content (the block may have matched FTS via either column).
  let field: SearchField = 'content';
  let text = content;
  let hitIndex = locate(content);
  if (hitIndex < 0 && annotation) {
    const annIndex = locate(annotation);
    if (annIndex >= 0) {
      field = 'annotation';
      text = annotation;
      hitIndex = annIndex;
    }
  }

  const lines = text.split('\n');

  // Keyword not present as a literal substring (rare — e.g. a Unicode case-folding
  // edge the JS search can't reproduce): degrade to the first lines of the block.
  if (hitIndex < 0) {
    return { field, snippet: lines.slice(0, 3).map(contextLine) };
  }

  // Map the flat hit offset onto its line. The query has no newline (the search
  // input is single-line), so the match always sits within one line's text.
  let lineStart = 0;
  let hitLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (hitIndex < lineStart + len) {
      hitLine = i;
      break;
    }
    lineStart += len + 1; // +1 for the consumed '\n'
  }

  const snippet: SearchSnippetLine[] = [];
  if (hitLine > 0) snippet.push(contextLine(lines[hitLine - 1]!));
  snippet.push(windowHitLine(lines[hitLine]!, hitIndex - lineStart, query.length));
  if (hitLine < lines.length - 1) snippet.push(contextLine(lines[hitLine + 1]!));
  return { field, snippet };
};

// Locate every literal occurrence of `query` within `text` (case-insensitive
// substring match — same semantics as buildSnippet's hit-line locator). Tagged
// with `field` so content + annotation offsets remain distinguishable downstream.
const findAllOffsets = (
  text: string,
  query: string,
  field: SearchField,
): HitOffset[] => {
  if (!text || !query) return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const out: HitOffset[] = [];
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push({ field, start: idx, end: idx + query.length });
    // Advance past the match so we don't infinitely re-find a zero-width
    // location. (query.trim() guarantees length ≥ 1 here, but the +1 is a
    // belt-and-braces guard.)
    from = idx + Math.max(1, query.length);
  }
  return out;
};

export const buildHitOffsets = (
  content: string,
  annotation: string | null,
  query: string,
): HitOffset[] => [
  ...findAllOffsets(content, query, 'content'),
  ...(annotation ? findAllOffsets(annotation, query, 'annotation') : []),
];

// Wrap a query as an FTS5 phrase literal: doubled quotes, surrounding quotes. A
// quoted phrase is always valid FTS5 syntax and forces a contiguous (substring)
// trigram match rather than a loose AND of individual trigrams.
const ftsPhrase = (raw: string): string => `"${raw.replace(/"/g, '""')}"`;

// Escape the SQL LIKE wildcards so a literal `%`/`_`/`\` in the query stays literal.
const escapeLike = (raw: string): string => raw.replace(/[\\%_]/g, (c) => `\\${c}`);

// ⭐ S8（§2.S8）：`b.gist` 一起取 —— 用户和 AI 在这一屏上撞的是同一件事：
// 一个 2,000 字的长块只还得回一个命中片段，还不出这块整体是什么。
const SELECT_COLS = `b.id AS block_id, b.thread_id, b.content, b.annotation, b.created_at,
         t.title AS thread_title, t.workspace_id, w.title AS workspace_title, b.gist`;

// FTS path: join the trigram index back to the live rows. Threads/workspaces are
// soft-deleted (their blocks are not), so a hit inside a deleted thread is excluded.
const FTS_SQL = `SELECT ${SELECT_COLS}
  FROM blocks_fts
  JOIN blocks b ON b.rowid = blocks_fts.rowid
  JOIN threads t ON t.id = b.thread_id
  JOIN workspaces w ON w.id = t.workspace_id
  WHERE blocks_fts MATCH $1 AND t.deleted_at IS NULL AND w.deleted_at IS NULL
  ORDER BY rank
  LIMIT ${SEARCH_LIMIT}`;

const LIKE_SQL = `SELECT ${SELECT_COLS}
  FROM blocks b
  JOIN threads t ON t.id = b.thread_id
  JOIN workspaces w ON w.id = t.workspace_id
  WHERE (b.content LIKE $1 ESCAPE '\\' OR b.annotation LIKE $1 ESCAPE '\\')
    AND t.deleted_at IS NULL AND w.deleted_at IS NULL
  ORDER BY b.created_at DESC
  LIMIT ${SEARCH_LIMIT}`;

const toHit = (r: Row, query: string): SearchHit => {
  const { field, snippet } = buildSnippet(r.content, r.annotation, query);
  return {
    blockId: r.block_id,
    threadId: r.thread_id,
    threadTitle: r.thread_title,
    workspaceId: r.workspace_id,
    workspaceTitle: r.workspace_title,
    createdAt: r.created_at,
    field,
    snippet,
    gist: r.gist ?? null,
    hitOffsets: buildHitOffsets(r.content, r.annotation, query),
  };
};

// Search every block (content + annotation) across all non-deleted threads.
export const search = async (raw: string): Promise<SearchHit[]> => {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  const db = await getDb();
  // Count by codepoint — trigram's "3 characters" is codepoints, and an astral
  // character (emoji) is 2 UTF-16 units but 1 codepoint.
  const charCount = [...cleaned].length;
  const rows =
    charCount >= 3
      ? await db.select<Row[]>(FTS_SQL, [ftsPhrase(cleaned)])
      : await db.select<Row[]>(LIKE_SQL, [`%${escapeLike(cleaned)}%`]);
  return rows.map((r) => toHit(r, cleaned));
};
