import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import {
  ATTACHMENT_SEE_BELOW,
  DEFAULT_PACK_TEMPLATE,
  EMPTY_LOG_LINE,
  EMPTY_PINNED_LINE,
  EXTRACT_CHAR_CAP,
  EXTRACT_INDENT,
  FILE_MARKER,
  FOLDER_MARKER,
  INSTRUCTION_HEADER,
  NOTE_INDENT,
  NOTE_MARKER,
  OUTPUT_LANGUAGE,
  PACK_HEADER,
  PACK_TEMPLATES,
  PINNED_PREFIX,
  PINNED_SEE_ABOVE,
  REF_MARKER,
  SECTION_FILES,
  SECTION_LOG,
  SECTION_PINNED,
  SOURCE_MARKER,
  UNKNOWN_THREAD,
  URL_MARKER,
  truncationMarker,
  type PackTemplateKey,
} from './templates';

export interface AssembleArgs {
  thread: Thread;
  blocks: Block[];
  // Every attachment belonging to this thread's blocks. The caller supplies them;
  // an empty array is fine. Grouped by blockId internally.
  attachments?: Attachment[];
  // Map of referenced thread id → title; used to render `kind=ref` blocks. The caller
  // (Phase 9 @-mention) supplies this. Empty map is fine for Phase 4.
  refTitles?: Map<string, string>;
  // v2.8 §20.7: optional task-template selector. The chosen template's closing block
  // is appended after "Related Files & Links" and before the Output Language line.
  // Default = 'default' (no extra block — pre-v2.8 behavior).
  template?: PackTemplateKey;
  // For deterministic output in tests.
  now?: number;
}

// §17 pack range selector (pulled forward from v1.5): a pure pre-filter over the block
// list, applied by PackDialog BEFORE assemble so the default ('all') path stays
// byte-identical. 'pinned' packs only the user-marked core context; the day ranges pack
// the recent working set of a long-running thread.
export type PackRange = 'all' | 'pinned' | 'last7' | 'last30';

export const PACK_RANGE_KEYS: PackRange[] = ['all', 'pinned', 'last7', 'last30'];

const RANGE_DAYS: Partial<Record<PackRange, number>> = { last7: 7, last30: 30 };

export const filterBlocksForRange = (
  blocks: Block[],
  range: PackRange,
  now = Date.now(),
): Block[] => {
  if (range === 'all') return blocks;
  if (range === 'pinned') return blocks.filter((b) => b.pinned);
  const days = RANGE_DAYS[range]!;
  const cutoff = now - days * 86_400_000;
  return blocks.filter((b) => b.createdAt >= cutoff);
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Local-time formatter — Spool data has no timezone metadata, just unix ms. Output is
// always 24h "YYYY-MM-DD HH:mm" so the briefing is unambiguous when pasted into a foreign
// timezone.
export const formatPackTime = (ts: number): string => {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
};

export const formatPackDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

// An attachment's display text falls back to its target when the label is empty.
const attachmentLabel = (a: Attachment): string => a.label.trim() || a.target;

// Extracted file text, indented under its block and capped so one large PDF can't dominate
// the pack. Every line — including the truncation marker — carries the 6-space indent.
const renderExtractedText = (text: string): string => {
  let body = text;
  let marker = '';
  if (text.length > EXTRACT_CHAR_CAP) {
    body = text.slice(0, EXTRACT_CHAR_CAP);
    marker = `\n${truncationMarker(text.length - EXTRACT_CHAR_CAP)}`;
  }
  return `${body}${marker}`
    .split('\n')
    .map((line) => `${EXTRACT_INDENT}${line}`)
    .join('\n');
};

// One attachment, rendered as the indented sub-lines beneath its block. File attachments
// inline their extracted text ONLY when the user opted in (v2.8 §20.2: include_in_pack).
// Everything else — opted-out files, files without extracted text, folders — points at
// the Related Files section. `extractedText` is populated by the v2.7 extraction pipeline
// (extractor.ts); `includeInPack` is the v2.8 split that controls inlining specifically.
const renderAttachment = (a: Attachment): string[] => {
  const label = attachmentLabel(a);
  if (a.kind === 'url') {
    return [`${NOTE_INDENT}${URL_MARKER}${label} — ${a.target}`];
  }
  if (a.kind === 'folder') {
    return [`${NOTE_INDENT}${FOLDER_MARKER}${label}${ATTACHMENT_SEE_BELOW}`];
  }
  // kind === 'file'
  if (a.extractedText != null && a.includeInPack) {
    return [
      `${NOTE_INDENT}${FILE_MARKER}${label} (${a.extractionKind ?? 'text'})`,
      renderExtractedText(a.extractedText),
    ];
  }
  return [`${NOTE_INDENT}${FILE_MARKER}${label}${ATTACHMENT_SEE_BELOW}`];
};

// One block: its header line, an optional note, then each attachment. A pinned block gets
// the 📌 prefix wherever it is rendered — Pinned Blocks section and Full Record alike.
const renderBlock = (
  b: Block,
  byBlock: Map<string, Attachment[]>,
  refTitles: Map<string, string> | undefined,
): string[] => {
  const time = formatPackTime(b.createdAt);
  const star = b.pinned ? PINNED_PREFIX : '';
  const lines: string[] = [];

  if (b.kind === 'ref') {
    const title =
      (b.refThreadId ? refTitles?.get(b.refThreadId) : null) || b.content || UNKNOWN_THREAD;
    lines.push(`${star}[${time}] ${REF_MARKER}${title}`);
  } else {
    const bracket = b.source ? `${time}${SOURCE_MARKER}${b.source}` : time;
    lines.push(`${star}[${bracket}] ${b.content.trim()}`);
  }

  if (b.annotation?.trim()) {
    lines.push(`${NOTE_INDENT}${NOTE_MARKER}${oneLine(b.annotation)}`);
  }
  for (const a of byBlock.get(b.id) ?? []) {
    lines.push(...renderAttachment(a));
  }
  return lines;
};

// 2026-07-09: a pinned block's Full Record slot — same time/source bracket for the
// chronology, but the body (plus note/attachments) lives only in Pinned Blocks above.
// Before this, pinned blocks appeared verbatim twice per pack.
// R2 field report B2: the slot carries a short head anchor so the timeline stays
// readable without scrolling back up. Char-based to stay in lockstep with mcp.rs.
const PLACEHOLDER_HEAD_CHARS = 40;
const headAnchor = (content: string): string => {
  const one = oneLine(content);
  const chars = [...one];
  if (chars.length <= PLACEHOLDER_HEAD_CHARS) return one;
  return chars.slice(0, PLACEHOLDER_HEAD_CHARS).join('') + '…';
};

const renderPinnedPlaceholder = (b: Block): string => {
  const time = formatPackTime(b.createdAt);
  const bracket =
    b.kind !== 'ref' && b.source ? `${time}${SOURCE_MARKER}${b.source}` : time;
  const head = headAnchor(b.content);
  const anchor = head.length > 0 ? `${head} ` : '';
  return `${PINNED_PREFIX}[${bracket}] ${anchor}${PINNED_SEE_ABOVE}`;
};

// Pure function. No await, no fetch, no DB calls — this is the §6.4 hot path. The
// four-category instruction header is static text inlined verbatim from templates.ts;
// the receiving AI does the actual classification at consumption time.
export function assemble({
  thread,
  blocks,
  attachments,
  refTitles,
  template,
  now,
}: AssembleArgs): string {
  const dateStr = formatPackDate(now ?? Date.now());
  const out: string[] = [];

  out.push(PACK_HEADER(thread.title, dateStr, blocks.length));
  out.push('');
  out.push(INSTRUCTION_HEADER);

  // Group attachments by their owning block so each block lists its own inline.
  const byBlock = new Map<string, Attachment[]>();
  for (const a of attachments ?? []) {
    const list = byBlock.get(a.blockId);
    if (list) list.push(a);
    else byBlock.set(a.blockId, [a]);
  }

  // Pinned Blocks: blocks the user explicitly marked as core context, rendered with the
  // full block format (pinned blocks also appear again, in order, in the Full Record).
  out.push('');
  out.push(SECTION_PINNED);
  out.push('');
  const pinned = blocks.filter((b) => b.pinned);
  if (pinned.length === 0) {
    out.push(EMPTY_PINNED_LINE);
  } else {
    for (const b of pinned) out.push(...renderBlock(b, byBlock, refTitles));
  }

  // Full Record: every block in chronological order. A block's annotation and its
  // attachments are listed indented beneath it. Pinned blocks keep their chronological
  // slot as a one-line placeholder — their full text renders once, above.
  out.push('');
  out.push(SECTION_LOG);
  out.push('');
  if (blocks.length === 0) {
    out.push(EMPTY_LOG_LINE);
  } else {
    for (const b of blocks) {
      if (b.pinned) out.push(renderPinnedPlaceholder(b));
      else out.push(...renderBlock(b, byBlock, refTitles));
    }
  }

  // Related Files & Links: every attachment in the thread, collected so the user can
  // scan at a glance what artifacts belong to the project. v2.8 §9.5: a file attachment
  // whose extracted_text exists but was NOT inlined (include_in_pack === false) carries
  // a "[extracted: yes, not inlined]" tag, so the receiving AI knows content exists but
  // was deliberately withheld for length — and can ask the user to inline it if needed.
  const all = attachments ?? [];
  if (all.length > 0) {
    out.push('');
    out.push(SECTION_FILES);
    out.push('');
    for (const a of all) {
      const notInlined =
        a.kind === 'file' && a.extractedText != null && !a.includeInPack
          ? '  [extracted: yes, not inlined]'
          : '';
      out.push(`- ${attachmentLabel(a)} — ${a.target}${notInlined}`);
    }
  }

  // v2.8 §20.7: optional task-template closing block. Appended AFTER "Related Files &
  // Links" and BEFORE the Output Language directive, so the receiving AI lands on the
  // task right before it's told what language to reply in. Default template emits no
  // block — pre-v2.8 packs stay byte-identical.
  const tmpl = PACK_TEMPLATES[template ?? DEFAULT_PACK_TEMPLATE];
  if (tmpl.closing) {
    out.push('');
    out.push('---');
    out.push('');
    out.push(tmpl.closing);
  }

  // Output Language: the closing directive asking the AI to respond in the user's language.
  out.push('');
  out.push('---');
  out.push('');
  out.push(OUTPUT_LANGUAGE);

  // Trailing newline so consecutive paste actions don't run together.
  return out.join('\n') + '\n';
}
