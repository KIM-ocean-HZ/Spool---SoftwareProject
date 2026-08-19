import { Fragment, type ReactNode } from 'react';
import { HIGHLIGHT_RE } from './highlight';

// v2.8 §20.5: render block content with ==…== spans turned into a quiet visual highlight.
// Display-only; the textarea in edit mode keeps the raw markers so editing returns to
// source (same principle as future Markdown rendering — the user sees what the AI sees).
export function HighlightedContent({
  content,
  withOffsets,
  offset = 0,
}: {
  content: string;
  /** Stamp `data-o` so a selection here maps back to raw content — see ContentRuns. */
  withOffsets?: boolean;
  /** Where `content` begins in the string the offsets should be reported against. Non-zero
   *  when this is one segment of a merged block. */
  offset?: number;
}): ReactNode {
  if (!content.includes('==') && !withOffsets) return content;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  // Every emitted piece knows where it starts, so `data-o` is the same contract the
  // Markdown renderer publishes: offset + distance into this node's text = raw offset.
  const push = (node: ReactNode, at: number): void => {
    parts.push(
      withOffsets ? (
        <span key={key++} data-o={offset + at}>
          {node}
        </span>
      ) : (
        node
      ),
    );
  };
  // matchAll resets the regex's internal lastIndex each call, so the module-level
  // `/g` instance is safe to share across renders.
  for (const m of content.matchAll(HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) push(content.slice(lastIndex, start), lastIndex);
    push(
      <mark key={key++} className="rounded-sm bg-[var(--selection)] px-0.5 text-ink">
        {m[1]}
      </mark>,
      // The marker chars are not rendered, so the text inside starts two chars in.
      start + 2,
    );
    lastIndex = start + m[0].length;
  }
  if (lastIndex < content.length) push(content.slice(lastIndex), lastIndex);
  return <Fragment>{parts}</Fragment>;
}
