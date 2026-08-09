// DESIGN_WORKBENCH §10.1 — block-level Markdown structure, as OFFSETS into the block's own
// content string.
//
// Ocean 2026-08-08: 「`**`、`#`、`-` 这些符号看着有些混乱,不美观」. The rule the rest of the
// read surface already follows (HighlightedContent line 6) applies here too: **display-only,
// and edit mode returns to the raw source** — so nothing here rewrites content, it only says
// which ranges are structure and which ranges are text.
//
// ⚠️ Why offsets and not a string transform. Search hits are reported as character ranges in
// this exact string (`buildHitOffsets`), and 「跳到命中处」 scrolls to the mark carrying that
// range. Anything that rewrote the text would have to remap every offset — the §10.1 trap.
// Parsing to ranges instead means the tokenizer keeps working in one coordinate space and
// the hit machinery never learns Markdown exists.
//
// No dependency on purpose (§10.1, three reasons): six markers is not worth a general parser;
// `==…==` is not standard Markdown and lives in the same inline layer here; and hand-written
// means raw HTML in a captured block is never interpreted, so there is nothing to sanitise.

export interface MdSpan {
  start: number;
  end: number;
}

export type MdBlock =
  | { kind: 'para'; text: MdSpan }
  | { kind: 'heading'; level: number; text: MdSpan }
  /** A list row. `marker` is what to draw in the gutter — a bullet, or the user's own "3." */
  | { kind: 'item'; marker: string; indent: number; text: MdSpan }
  | { kind: 'code'; text: MdSpan };

export interface MdDoc {
  blocks: MdBlock[];
  /** Marker ranges (`## `, `- `, the ``` fences) — parsed, never shown. */
  hidden: MdSpan[];
  /** Ranges where inline markers are literal text: inside a fenced code block. */
  raw: MdSpan[];
}

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const BULLET = /^([ \t]*)([-*])[ \t]+(.*)$/;
const ORDERED = /^([ \t]*)(\d{1,3}[.)])[ \t]+(.*)$/;
const FENCE = /^[ \t]*```/;

/** One indent step. Two spaces or one tab — the shapes an AI-written list actually uses. */
const indentOf = (ws: string): number =>
  Math.min(3, Math.floor(ws.replace(/\t/g, '  ').length / 2));

/**
 * Split `content` into display blocks. Every offset is into `content` itself.
 *
 * A run of ordinary lines becomes ONE paragraph — blank lines separate paragraphs rather
 * than being rendered as empty lines, which is the whole point of the change (the gap
 * becomes margin). A block with no structure at all comes back as a single `para` covering
 * everything, and the renderer short-circuits that to exactly the old output.
 */
export function parseMarkdown(content: string): MdDoc {
  const blocks: MdBlock[] = [];
  const hidden: MdSpan[] = [];
  const raw: MdSpan[] = [];
  // Paragraph accumulator: start of the current run of ordinary lines, and the end of the
  // last non-blank one (so a trailing blank line is not swallowed into the paragraph).
  let paraStart = -1;
  let paraEnd = -1;
  const flushPara = (): void => {
    if (paraStart >= 0 && paraEnd > paraStart) {
      blocks.push({ kind: 'para', text: { start: paraStart, end: paraEnd } });
    }
    paraStart = -1;
    paraEnd = -1;
  };

  // Fence state: where the code text began, and the offsets of the opening fence line.
  let fenceTextStart = -1;

  let pos = 0;
  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(pos, lineEnd);

    if (fenceTextStart >= 0) {
      if (FENCE.test(line)) {
        // Closing fence: the code is everything up to the newline before this line.
        const textEnd = Math.max(fenceTextStart, pos > 0 ? pos - 1 : 0);
        blocks.push({ kind: 'code', text: { start: fenceTextStart, end: textEnd } });
        raw.push({ start: fenceTextStart, end: textEnd });
        hidden.push({ start: textEnd, end: lineEnd });
        fenceTextStart = -1;
      }
    } else if (FENCE.test(line)) {
      flushPara();
      // The fence line itself (and its newline) is structure.
      hidden.push({ start: pos, end: Math.min(content.length, lineEnd + 1) });
      fenceTextStart = Math.min(content.length, lineEnd + 1);
    } else if (HEADING.test(line)) {
      flushPara();
      const m = HEADING.exec(line)!;
      const textStart = lineEnd - m[2]!.length; // after "### "
      hidden.push({ start: pos, end: textStart });
      blocks.push({ kind: 'heading', level: m[1]!.length, text: { start: textStart, end: lineEnd } });
    } else if (BULLET.test(line) || ORDERED.test(line)) {
      flushPara();
      const bullet = BULLET.exec(line);
      const m = bullet ?? ORDERED.exec(line)!;
      const body = m[3]!;
      const textStart = lineEnd - body.length;
      hidden.push({ start: pos, end: textStart });
      blocks.push({
        kind: 'item',
        // A middot is what a `·` list marker looks like at body size: almost nothing. The
        // bullet standard Markdown draws is `•`.
        marker: bullet ? '•' : m[2]!,
        indent: indentOf(m[1]!),
        text: { start: textStart, end: lineEnd },
      });
    } else if (line.trim() === '') {
      flushPara();
    } else {
      if (paraStart < 0) paraStart = pos;
      paraEnd = lineEnd;
    }

    if (nl === -1) break;
    pos = nl + 1;
  }
  // An unterminated fence: the rest of the block is code, and nothing is lost.
  if (fenceTextStart >= 0 && fenceTextStart < content.length) {
    blocks.push({ kind: 'code', text: { start: fenceTextStart, end: content.length } });
    raw.push({ start: fenceTextStart, end: content.length });
  }
  flushPara();
  return { blocks, hidden, raw };
}

/** True when the whole block is one ordinary paragraph — the "nothing to render" fast path. */
export const isPlainParagraph = (doc: MdDoc, content: string): boolean =>
  doc.blocks.length === 1 &&
  doc.blocks[0]!.kind === 'para' &&
  doc.blocks[0]!.text.start === 0 &&
  doc.blocks[0]!.text.end === content.length;
