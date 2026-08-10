import { Fragment, type ReactNode } from 'react';
import { ContentRuns, type HitRange } from './contentRuns';
import { isPlainParagraph, parseMarkdown, type MdBlock, type MdDoc, type MdSpan } from './markdown';

// DESIGN_WORKBENCH §10.1 — the read-mode renderer for block content.
//
// Structure comes from `parseMarkdown` as offsets; every piece of text still goes through
// the ONE tokenizer (`ContentRuns`), sliced with from/to. That is what keeps 「跳到命中处」
// working: a search hit is a character range in the same string, so it lands in whichever
// structural block contains it without anything being remapped.
//
// Edit mode is untouched — the textarea keeps the raw `#` and `**`, the same contract
// `==…==` has always had (HighlightedContent line 6): the user sees what the AI sees.

interface Props {
  content: string;
  hits?: readonly HitRange[];
  activeHitIndex?: number;
  withSpine?: boolean;
  /** v21: sentences a later block corrected, as ranges in `content`. */
  corrected?: readonly MdSpan[];
}

// Ocean 2026-08-12, after reading real blocks in the first version of this renderer:
// 「粗体字太粗了，大小区分不明显，字看起来太挤了，参照标准的 markdown 渲染来做」— which put
// the headings on the standard (GitHub-ish) scale, up to 1.45em for an h1.
//
// Ocean 2026-08-13, after reading the result: 「标题字体太太大了，改回原来的」. So the sizes are
// the ORIGINAL six steps again — 17/16/15/14/13/13px against a 15px body — but expressed in em,
// because the other half of §12 stands: the same renderer runs at 15px in the block feed and at
// 13px in 周回顾, and a heading has to keep its proportion in both. Spacing and bold weight are
// untouched; the complaint was about size alone.
const HEADING_CLS: Record<number, string> = {
  1: 'font-ui text-[1.13em] font-semibold leading-[1.3] text-ink',
  2: 'font-ui text-[1.07em] font-semibold leading-[1.35] text-ink',
  3: 'font-ui text-[1em] font-semibold leading-[1.4] text-ink',
  4: 'font-ui text-[0.93em] font-semibold leading-[1.45] text-ink',
  5: 'font-ui text-[0.87em] font-semibold leading-[1.45] text-ink-2',
  6: 'font-ui text-[0.87em] font-semibold leading-[1.45] text-muted',
};

// Vertical rhythm, also in em, and TOP margins only: adjacent margins collapse, so the gap
// between any two blocks is one number rather than the sum of a mb and an mt.
// ⚠️ Each value is relative to the element's OWN font-size — a heading's em is the bigger
// one, which is why 1.15em there lands near 1.5 body-em, the standard gap above a heading.
const gapFor = (b: MdBlock, prev: MdBlock | undefined): string => {
  if (!prev) return '';
  // Rows of one list belong together — the gap between them is not a paragraph gap.
  if (b.kind === 'item' && prev.kind === 'item') return 'mt-[0.3em]';
  if (b.kind === 'heading') return 'mt-[1.15em]';
  return 'mt-[0.9em]';
};

export function MarkdownContent({
  content,
  hits,
  activeHitIndex = -1,
  withSpine = false,
  corrected,
}: Props): ReactNode {
  const doc: MdDoc = parseMarkdown(content);
  // Nothing structural in this block: render exactly what the old path rendered, down to
  // the node shape. Most blocks are this, and they must not shift by a pixel.
  if (isPlainParagraph(doc, content)) {
    return (
      <ContentRuns
        content={content}
        hits={hits}
        activeHitIndex={activeHitIndex}
        withSpine={withSpine}
        corrected={corrected}
      />
    );
  }
  // The spine (heavier opening) is a plain-prose device. When the block opens with a
  // heading, the heading IS the emphasis — doubling them makes a title look shouted.
  const spine = withSpine && doc.blocks[0]?.kind === 'para';

  const runsFor = (b: MdBlock): ReactNode => (
    <ContentRuns
      content={content}
      hits={hits}
      activeHitIndex={activeHitIndex}
      withSpine={spine}
      corrected={corrected}
      from={b.text.start}
      to={b.text.end}
      raw={doc.raw}
      hidden={doc.hidden}
    />
  );

  return (
    <Fragment>
      {doc.blocks.map((b, i) => {
        const gap = gapFor(b, doc.blocks[i - 1]);
        if (b.kind === 'heading') {
          return (
            <div key={i} className={`${HEADING_CLS[b.level] ?? HEADING_CLS[6]!} ${gap}`}>
              {runsFor(b)}
            </div>
          );
        }
        if (b.kind === 'item') {
          return (
            <div
              key={i}
              className={`flex gap-[0.5em] ${gap}`}
              style={{ paddingLeft: `${b.indent * 1.2}em` }}
            >
              <span className="flex-none select-none text-muted">{b.marker}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{runsFor(b)}</span>
            </div>
          );
        }
        if (b.kind === 'code') {
          return (
            <pre
              key={i}
              className={`overflow-x-auto rounded border border-line bg-paper-2/60 px-3 py-2 font-mono text-[0.85em] leading-[1.55] text-ink-2 ${gap}`}
            >
              {runsFor(b)}
            </pre>
          );
        }
        return (
          <div key={i} className={`whitespace-pre-wrap break-words ${gap}`}>
            {runsFor(b)}
          </div>
        );
      })}
    </Fragment>
  );
}
