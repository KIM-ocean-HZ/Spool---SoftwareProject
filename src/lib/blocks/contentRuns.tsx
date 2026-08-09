// Step 2 (§9.3 / §13.4 / §2.6) — content run tokenizer + display-only renderer.
//
// Block content is rendered as a flat list of styled text runs, NOT a rich-text model and
// NOT nested regex string-replaces (which break when a search hit overlaps a ==…==
// highlight). Each run carries independent attributes — spine (heavier first line),
// highlight (==…== span), and search hit — so a single run can be any combination and the
// renderer composes the styles on one node rather than nesting wrappers.
//
// Step 3 plugs into this same tokenizer: the highlight attribute is already a first-class
// run flag, so consistent ==…== rendering in read mode (collapsed + expanded) needs no
// further structural change.

import { Fragment, type ReactNode } from 'react';
import { HIGHLIGHT_RE } from './highlight';
import type { MdSpan } from './markdown';

export interface HitRange {
  start: number;
  end: number;
  idx: number;
}

// §10.1 — the inline half of Markdown. One more attribute on the same run, for the same
// reason `highlight` is one: a search hit can overlap a bold span, and flat runs with
// independent attributes is what lets both render without nesting wrappers.
export type InlineMark = 'strong' | 'em' | 'code';

export interface ContentRun {
  text: string;
  // Heavier-weight first line / first paragraph (§13.4). Display-only.
  spine: boolean;
  // Inside a persistent ==…== highlight (§20.5). The == markers themselves are stripped.
  highlight: boolean;
  // Search-hit attribution (§9.10), or null. `active` is the currently-focused hit.
  hit: { idx: number; active: boolean } | null;
  // §10.1 inline Markdown: **bold**, *italic*, `code`. Markers are stripped like ==.
  mark?: InlineMark;
}

// Inline markers, in precedence order — first claim wins, and a later pattern overlapping
// an already-claimed range is skipped. Code first, because backticks are the one marker
// whose whole job is "what is inside me is literal".
//
// ⚠️ `em` is deliberately the fussiest pattern here. A lone `*` shows up in ordinary prose
// (「3 * 4」, footnote stars), so it only counts when it hugs its text and follows a
// boundary — a false italic silently eats two characters of the user's text.
const INLINE_MARKS: { mark: InlineMark; re: RegExp; cap: number }[] = [
  { mark: 'code', re: /`([^`\n]+)`/g, cap: 1 },
  { mark: 'strong', re: /\*\*([^\n]+?)\*\*/g, cap: 2 },
  { mark: 'em', re: /(?<![*\w])\*(?!\s)([^*\n]*[^*\s\n])\*(?![*\w])/g, cap: 1 },
];

// End offset of the "spine" — the slightly-heavier opening of a text block. Rule:
//   - content has a blank line ("\n\n"): spine = everything before the first blank line
//     (the first paragraph; itself possibly multiple physical lines).
//   - no blank line but multi-line: spine = the first physical line.
//   - single line: no spine.
// Returns 0 when there is no spine. Display-only; never mutates content and never parses
// markdown headings.
export function spineEnd(content: string): number {
  const blank = content.indexOf('\n\n');
  if (blank > 0) return blank;
  if (blank === 0) return 0; // leading blank line → no spine
  const nl = content.indexOf('\n');
  if (nl > 0) return nl;
  return 0; // single line (or leading newline / empty) → no spine
}

interface TokenizeOptions {
  hits?: readonly HitRange[];
  activeHitIndex?: number;
  withSpine?: boolean;
  // §10.1: tokenize only this slice, in the SAME coordinate space (hit offsets and marker
  // positions stay absolute). MarkdownContent renders one structural block at a time and
  // must not have to remap anything to do it.
  from?: number;
  to?: number;
  // Ranges where inline markers are literal — inside a fenced code block.
  raw?: readonly MdSpan[];
  // Marker ranges the parser identified as structure (`## `, `- `, the fences).
  hidden?: readonly MdSpan[];
}

// Tokenize content into runs. Offsets (spine end, hit ranges, == matches) all live in the
// original content coordinate space — the same space the search layer reports hits in — so
// they compose without remapping. == cap characters are dropped from the output.
export function tokenizeContent(content: string, opts: TokenizeOptions = {}): ContentRun[] {
  const hits = opts.hits ?? [];
  const activeHitIndex = opts.activeHitIndex ?? -1;
  const sEnd = opts.withSpine ? spineEnd(content) : 0;
  const from = opts.from ?? 0;
  const to = opts.to ?? content.length;
  const isRaw = (s: number, e: number): boolean =>
    (opts.raw ?? []).some((r) => s >= r.start && e <= r.end);

  type Interval =
    | { kind: 'hit'; start: number; end: number; idx: number }
    | { kind: 'highlight'; start: number; end: number }
    | { kind: 'mark'; start: number; end: number; mark: InlineMark }
    | { kind: 'cap'; start: number; end: number };

  const intervals: Interval[] = [];
  // Claimed spans, marker chars included — a later inline pattern that overlaps one is
  // not a marker at all (「**a *b** c*」 is one bold span, not a tangle).
  const claimed: MdSpan[] = [];
  const free = (s: number, e: number): boolean =>
    !claimed.some((c) => s < c.end && c.start < e) && !isRaw(s, e);
  // Persistent ==…== highlights: inner span is a highlight interval; the surrounding
  // two-char markers are caps (never rendered).
  for (const m of content.matchAll(HIGHLIGHT_RE)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (!free(s, e)) continue;
    claimed.push({ start: s, end: e });
    intervals.push({ kind: 'cap', start: s, end: s + 2 });
    intervals.push({ kind: 'highlight', start: s + 2, end: e - 2 });
    intervals.push({ kind: 'cap', start: e - 2, end: e });
  }
  // §10.1 inline Markdown, same shape: the marker chars are caps, the inside is a mark.
  for (const { mark, re, cap } of INLINE_MARKS) {
    for (const m of content.matchAll(re)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (!free(s, e)) continue;
      claimed.push({ start: s, end: e });
      intervals.push({ kind: 'cap', start: s, end: s + cap });
      intervals.push({ kind: 'mark', start: s + cap, end: e - cap, mark });
      intervals.push({ kind: 'cap', start: e - cap, end: e });
    }
  }
  // Structural markers (`## `, `- `, the fences) are hidden exactly like a == cap.
  for (const h of opts.hidden ?? []) intervals.push({ kind: 'cap', start: h.start, end: h.end });
  for (const h of hits) intervals.push({ kind: 'hit', start: h.start, end: h.end, idx: h.idx });

  const breakpoints = new Set<number>([from, to]);
  if (sEnd > from && sEnd < to) breakpoints.add(sEnd);
  for (const it of intervals) {
    if (it.start > from && it.start < to) breakpoints.add(it.start);
    if (it.end > from && it.end < to) breakpoints.add(it.end);
  }
  const sorted = [...breakpoints].sort((a, b) => a - b);

  const runs: ContentRun[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i]!;
    const segEnd = sorted[i + 1]!;
    if (segStart >= segEnd) continue;
    // Marker chars (== caps, ** caps, `## `): never render visibly.
    if (intervals.some((it) => it.kind === 'cap' && segStart >= it.start && segEnd <= it.end)) {
      continue;
    }
    const hit = intervals.find(
      (it): it is Extract<Interval, { kind: 'hit' }> =>
        it.kind === 'hit' && segStart >= it.start && segEnd <= it.end,
    );
    const highlight = intervals.some(
      (it) => it.kind === 'highlight' && segStart >= it.start && segEnd <= it.end,
    );
    const mark = intervals.find(
      (it): it is Extract<Interval, { kind: 'mark' }> =>
        it.kind === 'mark' && segStart >= it.start && segEnd <= it.end,
    )?.mark;
    runs.push({
      text: content.slice(segStart, segEnd),
      spine: sEnd > 0 && segStart < sEnd,
      highlight,
      hit: hit ? { idx: hit.idx, active: hit.idx === activeHitIndex } : null,
      mark,
    });
  }
  return runs;
}

interface ContentRunsProps extends TokenizeOptions {
  content: string;
}

// Display-only renderer (§2.6 — no rich text). Maps each run to a styled node: the
// first-line spine (font-weight 500, §13.4), persistent ==…== highlights
// (var(--selection)), and search hits (active one brighter, with an inset accent ring so
// orientation holds after landing). Active hit marks keep `data-hit-index` so BlockItem's
// nav scroll-into-view can target them.
export function ContentRuns({ content, ...opts }: ContentRunsProps): ReactNode {
  const runs = tokenizeContent(content, opts);
  return (
    <Fragment>
      {runs.map((run, i) => {
        // §10.1: an inline mark composes with everything else — it is a class (and, for
        // code, an element), never a wrapper that would nest inside a hit or a highlight.
        //
        // ⚠️ Ocean 2026-08-12「粗体字太粗了」: bold is ONE step above whatever the run already
        // sits at, not a fixed 600. Most block content is Chinese, and 600 lands on PingFang SC
        // Semibold, which reads as shouting rather than emphasis. 500 (Medium) is the emphasis
        // weight there — except inside the spine, which is already 500, so bold has to clear it.
        const markCls =
          run.mark === 'strong'
            ? run.spine
              ? 'font-semibold'
              : 'font-medium'
            : run.mark === 'em'
              ? 'italic'
              : run.mark === 'code'
                ? 'rounded-sm bg-paper-2 px-1 font-mono text-[0.9em] text-ink'
                : '';
        // A strong run inside the spine already carries its own weight — emitting both would
        // leave which one wins up to the order Tailwind happens to write them out in.
        const spineWeight = run.spine && run.mark !== 'strong' ? 'font-medium' : '';
        const spineCls = `${spineWeight} ${markCls}`.trim();
        if (run.hit) {
          return (
            <mark
              key={i}
              data-hit-index={run.hit.idx}
              className={`rounded-sm px-0.5 text-ink transition-colors duration-200 ${
                run.hit.active
                  ? 'bg-[var(--highlight)] shadow-[inset_0_0_0_1px_var(--accent-2)]'
                  : 'bg-[var(--selection)]'
              } ${spineCls}`}
            >
              {run.text}
            </mark>
          );
        }
        if (run.highlight) {
          return (
            <mark
              key={i}
              className={`rounded-sm bg-[var(--selection)] px-0.5 text-ink ${spineCls}`}
            >
              {run.text}
            </mark>
          );
        }
        if (run.mark === 'code') {
          return (
            <code key={i} className={markCls}>
              {run.text}
            </code>
          );
        }
        if (spineCls) {
          return (
            <span key={i} className={spineCls}>
              {run.text}
            </span>
          );
        }
        return <Fragment key={i}>{run.text}</Fragment>;
      })}
    </Fragment>
  );
}
