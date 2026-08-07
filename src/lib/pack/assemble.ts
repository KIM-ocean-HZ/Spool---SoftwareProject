import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import {
  AI_NOTE_MARKER,
  ATTACHMENT_SEE_BELOW,
  CORRECTED_BY_PREFIX,
  EMPTY_LOG_LINE,
  EMPTY_PINNED_LINE,
  EXTRACT_CHAR_CAP,
  EXTRACT_INDENT,
  FILE_MARKER,
  FOLDER_MARKER,
  INSTRUCTION_HEADER,
  NOTE_INDENT,
  NOTE_MARKER,
  OUTPUT_LANGUAGE_BY_LANG,
  PACK_HEADER,
  PINNED_PREFIX,
  PINNED_SEE_ABOVE,
  REF_BLOCK_CORRECTS,
  REF_BLOCK_MARKER,
  REF_BLOCK_FROM,
  REF_BLOCK_MISSING,
  REF_BLOCK_SUPERSEDES,
  REF_MARKER,
  SECTION_FILES,
  SECTION_LOG,
  SECTION_PINNED,
  SOURCE_MARKER,
  staleOmittedLine,
  UNKNOWN_THREAD,
  URL_MARKER,
  truncationMarker,
} from './templates';

/** What the renderer needs about a block someone else cites. */
export interface CitedBlock {
  content: string;
  annotation?: string | null;
  /** v14 (§9.3 拍板乙): true when `annotation` was written by an AI — such a note may not
   *  name the block. Callers resolve it with annotationIsAi(); omitted reads as the user's,
   *  which is what every pre-v14 caller meant. */
  annotationIsAi?: boolean;
  createdAt: number;
  foreignTitle?: string;
}

export interface AssembleArgs {
  thread: Thread;
  blocks: Block[];
  // Every attachment belonging to this thread's blocks. The caller supplies them;
  // an empty array is fine. Grouped by blockId internally.
  attachments?: Attachment[];
  // Map of referenced thread id → title; used to render `kind=ref` blocks. The caller
  // (Phase 9 @-mention) supplies this. Empty map is fine for Phase 4.
  refTitles?: Map<string, string>;
  // v2.4 (§20.13 D2): cited block id → its content + capture time, for blocks carrying
  // refBlockId. Caller-supplied like refTitles (cited blocks may live in other threads).
  // A citing block whose id is missing here renders the citation as no-longer-exists.
  // `annotation` arrived with the label ladder (DESIGN_CONTEXT_HYGIENE §3.2): the cited
  // block's own note outranks its first 40 characters as a way of naming it.
  refBlocks?: Map<string, CitedBlock>;
  // B-3 (MCP field review 2026-08-04): when the caller pre-filtered `blocks` with
  // filterBlocksForRange, pass the range and the project's UNFILTERED block count — the
  // header then says "N of TOTAL" instead of claiming N is everything. Omit for 'all'.
  scope?: { range: PackRange; total: number };
  // DESIGN_CONTEXT_HYGIENE §1.1 (Ocean 2026-08-06: 「直接去掉 pack 的分类,只留下纯上下文的
  // 格式」, then 拍板 that it be a switch rather than a deletion). false drops the
  // four-category reading instructions and leaves the content.
  //
  // The number behind it: the golden fixture's pack is 4,329 chars and the header is 2,616
  // of them — 60% of a small pack is instructions on how to read the other 40%, which is
  // §2.1's own argument (attention is the budget) turned against the pack itself.
  //
  // ⚠️ And what the switch costs, because it is real: that header is the one thing telling
  // the receiving AI that an essay some chatbot wrote three months ago is not a fact. Drop
  // it and a web AI weighs it exactly like the user's own judgement — the "authority
  // laundering" DESIGN_MCP_WRITE_ROLE §2 exists to prevent. Which is why it is a switch:
  // the mechanism stays, the plain-web user gets what they asked for, and one tick brings
  // it back.
  //
  // Defaults to true so the golden path and the MCP twin stay byte-identical; PackDialog
  // is where the default flips to minimal, because that is the surface Ocean was talking
  // about (the clipboard). MCP packs always keep it — there it IS the contract.
  instructions?: boolean;
  // v9 (2026-08-04): which language the closing Output Language directive asks for.
  // Defaults to Chinese so every existing caller and the golden fixture are unchanged;
  // PackDialog passes the app's UI language, and mcp.rs reads it from settings.json.
  outputLanguage?: 'zh' | 'en';
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

// B-2 (MCP field review 2026-08-04): the day ranges keep pinned blocks whatever their
// age. Pinned means "core context, never drop it" everywhere else in the pipeline (the
// MCP budget trimmer never touches a pinned block); a last7 pack that silently dropped
// the thesis statement and the deadline was the same concept saying the opposite thing.
export const filterBlocksForRange = (
  blocks: Block[],
  range: PackRange,
  now = Date.now(),
): Block[] => {
  if (range === 'all') return blocks;
  if (range === 'pinned') return blocks.filter((b) => b.pinned);
  const days = RANGE_DAYS[range]!;
  const cutoff = now - days * 86_400_000;
  return blocks.filter((b) => b.pinned || b.createdAt >= cutoff);
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

// §3.1-5 (MCP review round 2, 2026-08-04 — Ocean approved): a pack is BY DEFINITION the
// thing the user pastes into somebody else's AI, and every pack with a file attachment
// used to carry "/Users/hzjin/Library/Application Support/…/lecture-03.pdf" — the
// account name and the machine's directory layout, out the door. "Never leaves your
// machine" is about Spool; the pack is the one artifact designed to leave it. A URL is
// already public and travels whole; a local path shrinks to its file name.
const baseName = (target: string): string => {
  const trimmed = target.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
};

const packTarget = (a: Attachment): string =>
  a.kind === 'url' ? a.target : baseName(a.target);

// An attachment's display text falls back to its target when the label is empty.
const attachmentLabel = (a: Attachment): string => a.label.trim() || packTarget(a);

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
    return [`${NOTE_INDENT}${URL_MARKER}${label} — ${packTarget(a)}`];
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

// v9 (DESIGN_SCHEMA_V9 H-1): the block's human-visible number, the same "#12" shown in
// the app's block stream. It is what lets a receiving AI point at one specific block and
// the user actually find it — a preview cannot, because duplicate blocks preview
// identically. Blank for rows written before v9's backfill, so the line degrades to
// exactly what it used to be. Char-based and mirrored in mcp.rs (golden test).
const seqMarker = (b: Block): string => (b.seq == null ? '' : `#${b.seq} `);

// One block: its header line, an optional note, an optional block-level citation, then
// each attachment. A pinned block gets the 📌 prefix wherever it is rendered — Pinned
// Blocks section and Full Record alike.
// v13 (DESIGN_CONTEXT_HYGIENE §3.1): which marker the `ref_block_id` sub-line uses. NULL
// ref_kind is every pre-v13 row and the default — it reads as 'cites', unchanged.
const refBlockMarker = (kind: Block['refKind']): string => {
  if (kind === 'supersedes') return REF_BLOCK_SUPERSEDES;
  if (kind === 'corrects') return REF_BLOCK_CORRECTS;
  return REF_BLOCK_MARKER;
};

const renderBlock = (
  b: Block,
  byBlock: Map<string, Attachment[]>,
  refTitles: Map<string, string> | undefined,
  refBlocks: Map<string, CitedBlock> | undefined,
  // v13: the newer blocks that corrected a point inside THIS one, by seq. Rendered under
  // the old block, which stays in the pack in full (§3.1.1).
  correctedBy: Map<string, number[]> | undefined,
): string[] => {
  const time = formatPackTime(b.createdAt);
  const star = b.pinned ? PINNED_PREFIX : '';
  const n = seqMarker(b);
  const lines: string[] = [];

  if (b.kind === 'ref') {
    const title =
      (b.refThreadId ? refTitles?.get(b.refThreadId) : null) || b.content || UNKNOWN_THREAD;
    lines.push(`${star}${n}[${time}] ${REF_MARKER}${title}`);
  } else {
    const bracket = b.source ? `${time}${SOURCE_MARKER}${b.source}` : time;
    lines.push(`${star}${n}[${bracket}] ${b.content.trim()}`);
  }

  if (b.annotation?.trim()) {
    // v14 (§9.3 拍板乙): which marker decides how much authority the next model gives this
    // sentence — the whole point of recording who wrote it.
    const noteMarker = annotationIsAi(b.annotationBy, b.source) ? AI_NOTE_MARKER : NOTE_MARKER;
    lines.push(`${NOTE_INDENT}${noteMarker}${oneLine(b.annotation)}`);
  }
  if (b.refBlockId) {
    const cited = refBlocks?.get(b.refBlockId);
    const marker = refBlockMarker(b.refKind);
    lines.push(
      cited
        ? `${NOTE_INDENT}${marker}[${formatPackTime(cited.createdAt)}] ${blockLabel(cited.content, cited.annotation, cited.annotationIsAi)}${
            cited.foreignTitle ? `${REF_BLOCK_FROM}${cited.foreignTitle}` : ''
          }`
        : `${NOTE_INDENT}${marker}${REF_BLOCK_MISSING}`,
    );
  }
  const corrections = correctedBy?.get(b.id);
  if (corrections && corrections.length > 0) {
    lines.push(
      `${NOTE_INDENT}${CORRECTED_BY_PREFIX}${corrections.map((s) => `#${s}`).join(', ')}`,
    );
  }
  for (const a of byBlock.get(b.id) ?? []) {
    lines.push(...renderAttachment(a));
  }
  return lines;
};

// v13 (DESIGN_CONTEXT_HYGIENE §3.1.1): old block id → the #seq of each newer block that
// corrected a point inside it. Derived from the pack's own block list, so a correction
// written in another project is not claimed here — the pack only speaks for what it holds.
// Blocks with no seq (pre-v9 rows) cannot be pointed at and are skipped: a warning naming
// nothing is worse than no warning.
const correctionsBySource = (blocks: Block[]): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  for (const b of blocks) {
    if (b.refKind !== 'corrects' || !b.refBlockId || b.seq == null) continue;
    const list = out.get(b.refBlockId);
    if (list) list.push(b.seq);
    else out.set(b.refBlockId, [b.seq]);
  }
  return out;
};

// 2026-07-09: a pinned block's Full Record slot — same time/source bracket for the
// chronology, but the body (plus note/attachments) lives only in Pinned Blocks above.
// Before this, pinned blocks appeared verbatim twice per pack.
// R2 field report B2: the slot carries a short head anchor so the timeline stays
// readable without scrolling back up. Char-based to stay in lockstep with mcp.rs.
// Exported for the feed's CitationLine (P2-3), which shows the same anchor for a
// cited block — one truncation semantic across pack and GUI.
const PLACEHOLDER_HEAD_CHARS = 40;
export const headAnchor = (content: string): string => {
  const one = oneLine(content);
  const chars = [...one];
  if (chars.length <= PLACEHOLDER_HEAD_CHARS) return one;
  return chars.slice(0, PLACEHOLDER_HEAD_CHARS).join('') + '…';
};

// DESIGN_CONTEXT_HYGIENE §3.2 — the label ladder, and W7 ("批注当标题") is its first rung.
//
// Wherever the pack names a block it is NOT printing in full, it has to pick a few words
// that say what that block is. The first 40 characters (headAnchor) were the only rule,
// and Ocean's §1.2 objection is the reason there is a ladder now: a pasted wall of text
// does not announce itself in its first 40 characters. The user's own annotation does —
// it is a sentence they wrote about this block, it costs nothing, and it carries the
// highest authority the pack has (💭 Personal). Rung two (an AI-written line) is
// deliberately NOT built yet — §4-5 says to see whether the other four items leave a gap
// first — so this ladder is two rungs with the same fallback it always had.
//
// ⚠️ The note only wins when the body does NOT fit in the anchor. §3.2's own rule for the
// AI rung says the same thing about short blocks — "短块用前 40 字就够,那是 Ocean §1.2 那句话
// 的反面" — and it applies here too. Measured against the real lab library on 2026-08-07: a
// 28-character block whose note read 「先按这个数走」 rendered as 「先按这个数走」 and the reader
// could no longer tell WHAT was replaced. When the whole body fits, the body IS its best
// name; a note about it adds nothing you could not already see, and costs the thing itself.
//
// ⚠️ Applies only where the block's own body is absent or elsewhere: the pinned
// placeholder, `↩ cites:`, and the over-budget catalogue. NOT to mcp.rs's Block IDs table,
// which is a lookup keyed by the body text the reader just saw. Mirrored in mcp.rs.
//
// v14 (§9.3 拍板乙): `noteIsAi` is required, not optional, and that is deliberate. W7 is what
// turned the annotation hole from "one extra line" into "the AI names the block", so every
// call site has to answer the question rather than inherit a permissive default — a new
// caller that forgets would silently reopen the hole. An AI-written note falls straight
// through to the body anchor: it is still printed under the block as `ai note:`, it just
// never gets to speak for the block.
export const blockLabel = (
  content: string,
  annotation: string | null | undefined,
  noteIsAi: boolean | undefined,
): string => {
  const body = headAnchor(content);
  const note = noteIsAi ? undefined : annotation?.trim();
  const bodyFitsWhole = body === oneLine(content);
  return note && note.length > 0 && !bodyFitsWhole ? headAnchor(note) : body;
};

const renderPinnedPlaceholder = (b: Block): string => {
  const time = formatPackTime(b.createdAt);
  const bracket =
    b.kind !== 'ref' && b.source ? `${time}${SOURCE_MARKER}${b.source}` : time;
  const head = blockLabel(b.content, b.annotation, annotationIsAi(b.annotationBy, b.source));
  const anchor = head.length > 0 ? `${head} ` : '';
  return `${PINNED_PREFIX}${seqMarker(b)}[${bracket}] ${anchor}${PINNED_SEE_ABOVE}`;
};

// Pure function. No await, no fetch, no DB calls — this is the §6.4 hot path. The
// four-category instruction header is static text inlined verbatim from templates.ts;
// the receiving AI does the actual classification at consumption time.
export function assemble({
  thread,
  blocks: allBlocks,
  attachments,
  refTitles,
  refBlocks,
  scope,
  instructions = true,
  outputLanguage,
  now,
}: AssembleArgs): string {
  const dateStr = formatPackDate(now ?? Date.now());
  const out: string[] = [];

  // v13 (DESIGN_CONTEXT_HYGIENE §3.1): retired blocks leave the pack, not the library.
  // ⚠️ Including the pinned ones. Pin and retirement are two statements by the same person
  // and they contradict each other; the later one wins, because "this is core context" was
  // said about a conclusion that still held. The pack has to SAY so, though — see
  // staleOmittedLine. This is also the plan's one honest compression: length goes, nothing
  // is lost, and the user can still read what they used to think.
  const blocks = allBlocks.filter((b) => b.staleAt == null);
  const staleCount = allBlocks.length - blocks.length;
  const correctedBy = correctionsBySource(blocks);

  out.push(
    PACK_HEADER(
      thread.title,
      dateStr,
      blocks.length,
      scope && scope.range !== 'all' ? { range: scope.range, total: scope.total } : undefined,
    ),
  );
  if (instructions) {
    out.push('');
    out.push(INSTRUCTION_HEADER);
  }

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
    for (const b of pinned) out.push(...renderBlock(b, byBlock, refTitles, refBlocks, correctedBy));
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
      else out.push(...renderBlock(b, byBlock, refTitles, refBlocks, correctedBy));
    }
  }
  // v13: the gap is declared, never silent (§2.3 — a store that drops a fact without
  // saying so is exactly the failure TOKI separates supersession from deletion to avoid).
  if (staleCount > 0) {
    out.push(staleOmittedLine(staleCount));
  }

  // Related Files & Links: every attachment in the thread, collected so the user can
  // scan at a glance what artifacts belong to the project. v2.8 §9.5: a file attachment
  // whose extracted_text exists but was NOT inlined (include_in_pack === false) carries
  // a "[extracted: yes, not inlined]" tag, so the receiving AI knows content exists but
  // was deliberately withheld for length — and can ask the user to inline it if needed.
  // v13: an attachment whose block was retired goes with it — the section must not point
  // at material the pack deliberately withheld (same rule the budgeted omission follows).
  const liveIds = new Set(blocks.map((b) => b.id));
  const all = staleCount > 0
    ? (attachments ?? []).filter((a) => liveIds.has(a.blockId))
    : attachments ?? [];
  if (all.length > 0) {
    out.push('');
    out.push(SECTION_FILES);
    out.push('');
    for (const a of all) {
      const notInlined =
        a.kind === 'file' && a.extractedText != null && !a.includeInPack
          ? '  [extracted: yes, not inlined]'
          : '';
      // §3.1-5: file name, not path. The " — target" half is dropped when it would only
      // repeat the label (the common case, since the label defaults to the file name).
      const target = packTarget(a);
      const label = attachmentLabel(a);
      const shown = target === label ? '' : ` — ${target}`;
      out.push(`- ${label}${shown}${notInlined}`);
    }
  }

  // Output Language: the closing directive asking the AI to respond in the user's language.
  out.push('');
  out.push('---');
  out.push('');
  out.push(OUTPUT_LANGUAGE_BY_LANG[outputLanguage ?? 'zh']);

  // Trailing newline so consecutive paste actions don't run together.
  return out.join('\n') + '\n';
}
