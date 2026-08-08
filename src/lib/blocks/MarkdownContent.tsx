import { Fragment, type ReactNode } from 'react';
import { ContentRuns, type HitRange } from './contentRuns';
import { isPlainParagraph, parseMarkdown, type MdBlock, type MdDoc } from './markdown';

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
}

const HEADING_CLS: Record<number, string> = {
  1: 'mt-3 font-ui text-[17px] font-semibold leading-snug text-ink first:mt-0',
  2: 'mt-3 font-ui text-[16px] font-semibold leading-snug text-ink first:mt-0',
  3: 'mt-2.5 font-ui text-[15px] font-semibold leading-snug text-ink first:mt-0',
  4: 'mt-2 font-ui text-[14px] font-semibold leading-snug text-ink-2 first:mt-0',
  5: 'mt-2 font-ui text-[13px] font-semibold leading-snug text-ink-2 first:mt-0',
  6: 'mt-2 font-ui text-[13px] font-semibold leading-snug text-muted first:mt-0',
};

export function MarkdownContent({
  content,
  hits,
  activeHitIndex = -1,
  withSpine = false,
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
      from={b.text.start}
      to={b.text.end}
      raw={doc.raw}
      hidden={doc.hidden}
    />
  );

  return (
    <Fragment>
      {doc.blocks.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <div key={i} className={HEADING_CLS[b.level] ?? HEADING_CLS[6]!}>
              {runsFor(b)}
            </div>
          );
        }
        if (b.kind === 'item') {
          return (
            <div
              key={i}
              className="flex gap-1.5"
              style={{ paddingLeft: `${b.indent * 1.1}rem` }}
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
              className="my-1.5 overflow-x-auto rounded border border-line bg-paper-2/60 px-2 py-1.5 font-mono text-[12px] leading-[1.5] text-ink-2"
            >
              {runsFor(b)}
            </pre>
          );
        }
        return (
          <div key={i} className="whitespace-pre-wrap break-words [&:not(:first-child)]:mt-2">
            {runsFor(b)}
          </div>
        );
      })}
    </Fragment>
  );
}
