import { Fragment, type ReactNode } from 'react';
import { HighlightedContent } from './HighlightedContent';
import { hasSegmentAnnotations, parseSegments } from './segments';

// v2.8 §20.1 follow-up — display a merged block's content as a list of segments, each
// with its own annotation attached visually. Falls back to a plain HighlightedContent
// render for un-merged blocks (which is every block whose content carries no
// `↪ note: ` marker — see segments.ts on when the marker is emitted).
//
// The visual: each segment is a small group of "the text" + a quiet, indented
// per-segment note that mirrors the styling of the top-level annotation row in
// BlockItem.tsx. A thin left rule + extra space between segments makes the boundary
// readable without becoming a heavy list.
export function SegmentedContent({ content }: { content: string }): ReactNode {
  if (!hasSegmentAnnotations(content)) {
    // Fast path — un-merged block, or merged block with no annotations. Rendering
    // is identical to the pre-segments behavior.
    return <HighlightedContent content={content} />;
  }
  const segments = parseSegments(content);
  return (
    <Fragment>
      {segments.map((seg, i) => (
        <div
          key={i}
          // Segments after the first get a top divider so the reader can see the
          // boundary even when both adjacent segments are short. Kept quiet — a thin
          // dashed line in the line color, not a heavy border.
          className={i > 0 ? 'mt-2 border-t border-dashed border-line/70 pt-2' : ''}
        >
          <div className="whitespace-pre-wrap break-words">
            <HighlightedContent content={seg.text} />
          </div>
          {seg.annotation && (
            // Styling mirrors BlockItem's top-level annotation row (paper-2 tint,
            // accent left rule, italic ink-2) so the visual vocabulary is the same.
            <div className="mt-1.5 border-l-2 border-accent/60 bg-paper-2/30 px-2 py-1 font-ui text-[13px] italic leading-[1.55] text-ink-2">
              {seg.annotation}
            </div>
          )}
        </div>
      ))}
    </Fragment>
  );
}
