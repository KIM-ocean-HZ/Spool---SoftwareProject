import { Fragment, type ReactNode } from 'react';
import { HIGHLIGHT_RE } from './highlight';

// v2.8 §20.5: render block content with ==…== spans turned into a quiet visual highlight.
// Display-only; the textarea in edit mode keeps the raw markers so editing returns to
// source (same principle as future Markdown rendering — the user sees what the AI sees).
export function HighlightedContent({ content }: { content: string }): ReactNode {
  if (!content.includes('==')) return content;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  // matchAll resets the regex's internal lastIndex each call, so the module-level
  // `/g` instance is safe to share across renders.
  for (const m of content.matchAll(HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) parts.push(content.slice(lastIndex, start));
    parts.push(
      <mark
        key={key++}
        className="rounded-sm bg-[var(--selection)] px-0.5 text-ink"
      >
        {m[1]}
      </mark>,
    );
    lastIndex = start + m[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return <Fragment>{parts}</Fragment>;
}
