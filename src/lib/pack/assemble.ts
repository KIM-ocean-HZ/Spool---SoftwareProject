import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { hasSegmentAnnotations } from '@/lib/blocks/segments';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import {
  AI_NOTE_MARKER,
  CORRECTED_BY_PREFIX,
  EMPTY_LOG_LINE,
  EMPTY_PINNED_LINE,
  EXTRACT_CHAR_CAP,
  EXTRACT_INDENT,
  INSTRUCTION_HEADER,
  NOTE_INDENT,
  NOTE_MARKER,
  OUTPUT_LANGUAGE_BY_LANG,
  PACK_BEGIN,
  PACK_END,
  PACK_HEADER,
  PERSONAL_PREFIX,
  COMPRESSED_PREFIX,
  PINNED_PREFIX,
  PINNED_SEE_ABOVE,
  PROVENANCE_PREFIX,
  PROVENANCE_SEP,
  RECHECK_OVERDUE_PREFIX,
  RECHECK_PREFIX,
  RETRIEVED_PREFIX,
  REF_BLOCK_CORRECTS,
  REF_BLOCK_MARKER,
  REF_BLOCK_FROM,
  REF_BLOCK_MISSING,
  REF_BLOCK_SUPERSEDES,
  REF_NOTE_PREFIX,
  REF_MARKER,
  SECTION_FILES,
  SECTION_LOG,
  SECTION_PINNED,
  SOURCE_MARKER,
  staleOmittedLine,
  UNKNOWN_THREAD,
  truncationMarker,
} from './templates';
import { quoteIsInBlock } from '@/lib/blocks/quoteFold';

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

// v20 (§4.6) — for the two columns that hold a DAY rather than a moment. `retrievedAt` and
// `recheckAfter` are stored as UTC midnight precisely so "查于 2026-08-09" survives being
// rendered on a machine east or west of the one that wrote it; formatting them through the
// local zone would slide half of them onto the previous day. Every other timestamp in a
// pack is a real moment and keeps formatPackTime. Mirrored in mcp.rs format_utc_date.
export const formatUtcDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

// §3.1-5 (MCP review round 2, 2026-08-04 — Ocean approved): a pack is BY DEFINITION the
// thing the user pastes into somebody else's AI, and every pack with a file attachment
// used to carry "/Users/hzjin/Library/Application Support/…/lecture-03.pdf" — the
// account name and the machine's directory layout, out the door. "Never leaves your
// machine" is about Spool; the pack is the one artifact designed to leave it. A URL is
// already public and travels whole; a local path shrinks to its file name.
//
// ⚠️ BOTH separators, and that is a privacy fix rather than tidiness: knowing only `/`,
// this returned `C:\Users\Ocean\Secret\lecture-03.pdf` unchanged, so on Windows the whole
// promise above silently stopped holding — the pack would carry the account name out the
// door while the comment still said it did not. Mirrored in mcp.rs base_name; the same
// two-separator rule already lives in utils/openTarget.ts basename.
const baseName = (target: string): string => {
  const trimmed = target.replace(/[/\\]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(cut + 1) || trimmed;
};

// v15: every attachment is a local file or folder now, so every target shrinks to its name.
const packTarget = (a: Attachment): string => baseName(a.target);

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

// v15 (DESIGN_PROJECT_FILES): one of the project's files, rendered in the Related Files
// section — the ONE place a file appears now that it no longer hangs off a block.
//
// The v2.8 §20.2 rule is unchanged and moves here with it: extracted text is inlined ONLY
// when the user opted that file in. A file whose text exists but was withheld says so
// (`[extracted: yes, not inlined]`), because a receiving AI that knows the text exists can
// ask for it, and one that does not know assumes there is nothing to ask for.
const renderProjectFile = (a: Attachment): string[] => {
  // §3.1-5: file name, not path. The " — target" half is dropped when it would only
  // repeat the label (the common case, since the label defaults to the file name).
  const label = attachmentLabel(a);
  const target = packTarget(a);
  const shown = target === label ? '' : ` — ${target}`;
  if (a.kind === 'file' && a.extractedText != null) {
    if (a.includeInPack) {
      return [`- ${label}${shown} (${a.extractionKind ?? 'text'})`, renderExtractedText(a.extractedText)];
    }
    return [`- ${label}${shown}  [extracted: yes, not inlined]`];
  }
  return [`- ${label}${shown}`];
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

// v20 (DESIGN_MCP_INTENT_ROUTING §4.6) — the `↗` sub-line: where this block came from
// outside the library, and how old that is. Null on everything the user wrote by hand, so
// the overwhelming majority of blocks render exactly as they did before v20.
//
// ⚠️ `now` is a parameter, never Date.now(), and that is not only about tests: the pack is
// the one artifact designed to leave the machine, and "may be out of date" has to be
// decided at the moment the pack is BUILT — the same instant its header is dated — rather
// than at some other point in the same render. mcp.rs threads the identical value.
const provenanceLine = (b: Block, now: number): string | null => {
  const parts: string[] = [];
  if (b.sourceUrl) parts.push(b.sourceUrl);
  if (b.retrievedAt != null) parts.push(`${RETRIEVED_PREFIX}${formatUtcDate(b.retrievedAt)}`);
  if (b.recheckAfter != null) {
    const prefix = b.recheckAfter <= now ? RECHECK_OVERDUE_PREFIX : RECHECK_PREFIX;
    parts.push(`${prefix}${formatUtcDate(b.recheckAfter)}`);
  }
  if (parts.length === 0) return null;
  return `${NOTE_INDENT}${PROVENANCE_PREFIX}${parts.join(PROVENANCE_SEP)}`;
};

// v22 (§2.6 表头第八条): the 💭 band, decided from fields alone. A `ref` block is not a
// typed note — it is a pointer at another project — so it stays unmarked even though it
// carries no source either.
const isPersonal = (b: Block): boolean => b.kind !== 'ref' && !b.source;

const renderBlock = (
  b: Block,
  refTitles: Map<string, string> | undefined,
  refBlocks: Map<string, CitedBlock> | undefined,
  // v13: the newer blocks that corrected a point inside THIS one, by seq. Rendered under
  // the old block, which stays in the pack in full (§3.1.1).
  correctedBy: Map<string, Correction[]> | undefined,
  now: number,
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
    const band = isPersonal(b) ? PERSONAL_PREFIX : '';
    // v24（R2 §1d）：压过的块带记号。⚠️ 只有 pack 印它（digest 不印，和 💭 同一条规矩）——
    // 「这几句不是原话」只在读全文的时候才要紧。⛔ 压缩前的原文**不进 pack**：那是他定的，
    // pack 里只放记号，让收件 AI 主动来问（`get_block_original`）。
    const squeezed = b.compressedAt != null ? COMPRESSED_PREFIX : '';
    lines.push(`${star}${band}${squeezed}${n}[${bracket}] ${b.content.trim()}`);
  }

  // v20: directly under the head line — where the block came from is part of what it IS,
  // and it has to be read before the sentences commenting on it.
  const provenance = provenanceLine(b, now);
  if (provenance) lines.push(provenance);

  if (b.annotation?.trim()) {
    // v14 (§9.3 拍板乙): which marker decides how much authority the next model gives this
    // sentence — the whole point of recording who wrote it.
    // The AI-written slot keeps no band marker on purpose: 💭 is what the user wrote, and
    // the contrast between the two lines is the point (`ai note:` weighs as 🧩 Synthesis).
    const ai = annotationIsAi(b.annotationBy, b.source);
    const noteMarker = ai ? AI_NOTE_MARKER : `${PERSONAL_PREFIX}${NOTE_MARKER}`;
    lines.push(`${NOTE_INDENT}${noteMarker}${oneLine(b.annotation)}`);
  }
  if (b.refBlockId) {
    const cited = refBlocks?.get(b.refBlockId);
    const marker = refBlockMarker(b.refKind);
    // v28 (§2.Q1): the reason belongs to THIS block, not to the cited one — so it renders
    // even when the citee is gone. 「↩ cites: (cited block no longer exists) — why: …」 still
    // tells the reader what this block was building on; dropping it there would lose the
    // only surviving account of the relation. Byte-for-byte with mcp.rs render_block.
    const why = b.refNote?.trim() ? `${REF_NOTE_PREFIX}${oneLine(b.refNote)}` : '';
    lines.push(
      cited
        ? `${NOTE_INDENT}${marker}[${formatPackTime(cited.createdAt)}] ${blockLabel(cited.content, cited.annotation, cited.annotationIsAi)}${
            cited.foreignTitle ? `${REF_BLOCK_FROM}${cited.foreignTitle}` : ''
          }${why}`
        : `${NOTE_INDENT}${marker}${REF_BLOCK_MISSING}${why}`,
    );
  }
  const corrections = correctedBy?.get(b.id);
  if (corrections && corrections.length > 0) {
    lines.push(
      // v21: 「#6」 says a point is wrong; 「#6 (\u201c…\u201d)」 says WHICH. Same 40-char anchor
      // ladder as every other preview in the pack — this points into the body printed
      // directly above, it does not reprint it. Byte-for-byte with mcp.rs render_block.
      `${NOTE_INDENT}${CORRECTED_BY_PREFIX}${corrections
        .map((c) => (c.quote ? `#${c.seq} (\u201c${headAnchor(c.quote)}\u201d)` : `#${c.seq}`))
        .join(', ')}`,
    );
  }
  return lines;
};

// v13 (DESIGN_CONTEXT_HYGIENE §3.1.1): old block id → each newer block that corrected a
// point inside it. Derived from the pack's own block list, so a correction written in
// another project is not claimed here — the pack only speaks for what it holds. Blocks
// with no seq (pre-v9 rows) cannot be pointed at and are skipped: a warning naming nothing
// is worse than no warning.
//
// ⚠️ 2026-08-10: exported, because the GUI needs the same warning under the same blocks
// (Ocean: 「展开也不知道到底是哪里被修改了」— the pack had this line from v13 and the feed
// never did). One rule, one function: 「哪些块算更正了这一块」 is exactly the kind of predicate
// that gets copied and then drifts.
//
// Carries `id` as well as `seq` because the feed's version is clickable and the pack's is
// not — the pack names a block, the GUI has to be able to go there.
//
// v21: and the quote, so both surfaces can name the SENTENCE. Kept only while it still
// occurs in the block being warned about — the user may have edited that block since, and a
// quote pointing at words that are no longer there is worse than naming none. Mirrors
// mcp.rs corrections_by_source.
export interface Correction {
  id: string;
  seq: number;
  quote: string | null;
  /** ⭐ 2026-08-25（Ocean:「批注不能被更正」）—— 这句原话是在**哪一格**找到的。
   *  `null` = 哪一格都对不上（那条更正只能指着整块说话）。
   *  ⚠️ 两格是两套字符下标，画记号的那一头必须知道该按哪一串定位。 */
  field: 'content' | 'annotation' | null;
}

export const correctionsBySource = (blocks: Block[]): Map<string, Correction[]> => {
  const out = new Map<string, Correction[]>();
  for (const b of blocks) {
    if (b.refKind !== 'corrects' || !b.refBlockId || b.seq == null) continue;
    const q = b.correctedQuote?.trim();
    const target = blocks.find((t) => t.id === b.refBlockId);
    // ⭐ T4（2026-08-23）：和入库时那道闸同一把尺子（标点折叠）。⛔ 用 `includes` 的话，
    // 压缩把这一句的标点改写过之后，这里会退回只报块号 —— 而闸门当初是放行的。
    // ⭐ 2026-08-25：正文找不到就再问一次批注。**正文优先** —— 同一句话两格都有的时候，
    // 更正说的多半是正文那一份（批注是关于正文的话）。
    const inContent = !!q && !!target && quoteIsInBlock(target.content, q);
    const inNote =
      !inContent && !!q && !!target?.annotation && quoteIsInBlock(target.annotation, q);
    const entry: Correction = {
      id: b.id,
      seq: b.seq,
      quote: q && (inContent || inNote) ? q : null,
      field: inContent ? 'content' : inNote ? 'annotation' : null,
    };
    const list = out.get(b.refBlockId);
    if (list) list.push(entry);
    else out.set(b.refBlockId, [entry]);
  }
  return out;
};

// 2026-08-19 (Ocean) — corrections the FEED folds into the block they correct instead of
// giving them a card of their own. The rule is one condition, and it is a safety condition:
// fold only what the reader can still get to. A correction is reachable when its quote is
// still locatable in its target (the same test correctionsBySource already applies), because
// the marked sentence is the only thing that opens it. A correction whose quote never matched,
// or whose target lives in another project, keeps its place in the timeline — the alternative
// is a block that exists, sits in the pack, and cannot be seen anywhere on screen.
//
// ⚠️ Feed presentation only. The pack, the digest, seq numbering and the row itself are
// untouched: this hides no content from any reader, it moves where one is drawn.
export const foldedCorrectionIds = (blocks: Block[]): Set<string> => {
  const out = new Set<string>();
  for (const [targetId, list] of correctionsBySource(blocks).entries()) {
    // ⚠️ A merged block renders through SegmentedContent, which takes no `corrected` spans
    // — so its sentences carry no mark and there is nothing to click. Folding a correction
    // under one would put it behind a door with no handle, the same defect
    // DESIGN_MCP_INTENT_ROUTING §2.1 named on the file side.
    const target = blocks.find((b) => b.id === targetId);
    if (!target) continue;
    for (const c of list) {
      if (!c.quote) continue;
      // ⚠️ 合并块（SegmentedContent）不吃 `corrected` 记号，所以**划在正文里**的那种没有
      // 可点的记号 —— 折进去等于藏在一扇没有把手的门后面。
      // ⚠️ 划在**批注**里的不受这一条影响：批注永远走 ContentRuns，记号照常画。
      if (c.field === 'content' && hasSegmentAnnotations(target.content)) continue;
      out.add(c.id);
    }
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

/** ⭐ T6（2026-08-23，第五轮实测）：**退掉一块，给 AI 看的内容会变长还是变短。**
 *
 *  退掉一块，pack 里少了它那一整条，多了一行 `↩ replaces …` —— 而那一行是**固定开销**：
 *  一个前缀、一个时间戳、加上这一块开头那 40 个字。⛔ 块比那一行还短的时候，
 *  「退掉它」实际上让 pack **变长**。实测在〈申请帮助〉`#6` 上量到净 **+92 字符**。
 *
 *  ⚠️ 这里用的是渲染器**自己那几个函数**（`blockLabel` / `formatPackTime` / 那两个常量），
 *  ⛔ 不是照着它的输出另算一遍 —— 那一行以后改了，这里要跟着改，而不是各说各的。
 *
 *  `entryChars` 是这一块**现在**在 pack 里占了多少字符（正文 + 批注 + 那几条附行），
 *  由调用方从当前这份 pack 上量 —— 只有它知道这一块此刻长什么样。 */
export const retirementLineChars = (retired: Block): number =>
  NOTE_INDENT.length +
  REF_BLOCK_SUPERSEDES.length +
  `[${formatPackTime(retired.createdAt)}] `.length +
  blockLabel(retired.content, retired.annotation, annotationIsAi(retired.annotationBy, retired.source))
    .length;

const renderPinnedPlaceholder = (b: Block): string => {
  const time = formatPackTime(b.createdAt);
  const bracket =
    b.kind !== 'ref' && b.source ? `${time}${SOURCE_MARKER}${b.source}` : time;
  const head = blockLabel(b.content, b.annotation, annotationIsAi(b.annotationBy, b.source));
  const anchor = head.length > 0 ? `${head} ` : '';
  const band = isPersonal(b) ? PERSONAL_PREFIX : '';
  return `${PINNED_PREFIX}${band}${seqMarker(b)}[${bracket}] ${anchor}${PINNED_SEE_ABOVE}`;
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
  const at = now ?? Date.now();
  const dateStr = formatPackDate(at);
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

  // The pack's own boundary — outside the `instructions` switch on purpose (templates.ts).
  out.push(PACK_BEGIN);
  out.push('');

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

  // Pinned Blocks: blocks the user explicitly marked as core context, rendered with the
  // full block format (pinned blocks also appear again, in order, in the Full Record).
  out.push('');
  out.push(SECTION_PINNED);
  out.push('');
  const pinned = blocks.filter((b) => b.pinned);
  if (pinned.length === 0) {
    out.push(EMPTY_PINNED_LINE);
  } else {
    for (const b of pinned) out.push(...renderBlock(b, refTitles, refBlocks, correctedBy, at));
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
      else out.push(...renderBlock(b, refTitles, refBlocks, correctedBy, at));
    }
  }
  // v13: the gap is declared, never silent (§2.3 — a store that drops a fact without
  // saying so is exactly the failure TOKI separates supersession from deletion to avoid).
  if (staleCount > 0) {
    out.push(staleOmittedLine(staleCount));
  }

  // Related Files & Links: the project's files — v15, so this is the ONLY place they
  // appear, and it lists all of them.
  // ⚠️ The v13 filter that dropped an attachment whose block had been retired is gone with
  // the ownership it depended on: a file is no longer evidence for one conclusion, so
  // retiring a conclusion says nothing about whether the project still holds the file.
  const files = attachments ?? [];
  if (files.length > 0) {
    out.push('');
    out.push(SECTION_FILES);
    out.push('');
    for (const a of files) out.push(...renderProjectFile(a));
  }

  // Output Language: the closing directive asking the AI to respond in the user's language.
  out.push('');
  out.push('---');
  out.push('');
  out.push(OUTPUT_LANGUAGE_BY_LANG[outputLanguage ?? 'zh']);

  out.push('');
  out.push(PACK_END);

  // Trailing newline so consecutive paste actions don't run together.
  return out.join('\n') + '\n';
}
