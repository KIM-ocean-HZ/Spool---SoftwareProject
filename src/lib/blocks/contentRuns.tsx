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

export interface HitRange {
  start: number;
  end: number;
  idx: number;
}

export interface ContentRun {
  text: string;
  // Heavier-weight first line / first paragraph (§13.4). Display-only.
  spine: boolean;
  // Inside a persistent ==…== highlight (§20.5). The == markers themselves are stripped.
  highlight: boolean;
  // Search-hit attribution (§9.10), or null. `active` is the currently-focused hit.
  hit: { idx: number; active: boolean } | null;
}

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
}

// Tokenize content into runs. Offsets (spine end, hit ranges, == matches) all live in the
// original content coordinate space — the same space the search layer reports hits in — so
// they compose without remapping. == cap characters are dropped from the output.
export function tokenizeContent(content: string, opts: TokenizeOptions = {}): ContentRun[] {
  const hits = opts.hits ?? [];
  const activeHitIndex = opts.activeHitIndex ?? -1;
  const sEnd = opts.withSpine ? spineEnd(content) : 0;

  type Interval =
    | { kind: 'hit'; start: number; end: number; idx: number }
    | { kind: 'highlight'; start: number; end: number }
    | { kind: 'cap'; start: number; end: number };

  const intervals: Interval[] = [];
  // Persistent ==…== highlights: inner span is a highlight interval; the surrounding
  // two-char markers are caps (never rendered).
  for (const m of content.matchAll(HIGHLIGHT_RE)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    intervals.push({ kind: 'cap', start: s, end: s + 2 });
    intervals.push({ kind: 'highlight', start: s + 2, end: e - 2 });
    intervals.push({ kind: 'cap', start: e - 2, end: e });
  }
  for (const h of hits) intervals.push({ kind: 'hit', start: h.start, end: h.end, idx: h.idx });

  const breakpoints = new Set<number>([0, content.length]);
  if (sEnd > 0 && sEnd < content.length) breakpoints.add(sEnd);
  for (const it of intervals) {
    breakpoints.add(it.start);
    breakpoints.add(it.end);
  }
  const sorted = [...breakpoints].sort((a, b) => a - b);

  const runs: ContentRun[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i]!;
    const segEnd = sorted[i + 1]!;
    if (segStart >= segEnd) continue;
    // == cap chars: never render visibly.
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
    runs.push({
      text: content.slice(segStart, segEnd),
      spine: sEnd > 0 && segStart < sEnd,
      highlight,
      hit: hit ? { idx: hit.idx, active: hit.idx === activeHitIndex } : null,
    });
  }
  return runs;
}

interface ContentRunsProps {
  content: string;
  hits?: readonly HitRange[];
  activeHitIndex?: number;
  // Spine applies to block content; off for annotations (which have no title line).
  withSpine?: boolean;
}

// Display-only renderer (§2.6 — no rich text). Maps each run to a styled node: the
// first-line spine (font-weight 500, §13.4), persistent ==…== highlights
// (var(--selection)), and search hits (active one brighter, with an inset accent ring so
// orientation holds after landing). Active hit marks keep `data-hit-index` so BlockItem's
// nav scroll-into-view can target them.
export function ContentRuns({
  content,
  hits,
  activeHitIndex = -1,
  withSpine = false,
}: ContentRunsProps): ReactNode {
  const runs = tokenizeContent(content, { hits, activeHitIndex, withSpine });
  return (
    <Fragment>
      {runs.map((run, i) => {
        const spineCls = run.spine ? 'font-medium' : '';
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
        if (run.spine) {
          return (
            <span key={i} className="font-medium">
              {run.text}
            </span>
          );
        }
        return <Fragment key={i}>{run.text}</Fragment>;
      })}
    </Fragment>
  );
}
