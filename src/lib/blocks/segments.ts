// v2.8 §20.1 follow-up — per-segment annotations inside a merged block.
//
// Without a schema change (Track B = SCHEMA_VERSION pinned at 5) the only place to
// store "this annotation belongs to THIS chunk of the merged content" is inline in
// the content string. Convention: append `↪ note: <text>` as the LAST line of each
// segment in the merged content. Segments are separated by a blank line ("\n\n") —
// the same separator computeMergedFields has used since 5c9d89f.
//
// Detection is conservative: if no `↪ note: ` line appears in the content, treat
// the whole string as one segment with no per-segment annotation (preserves the
// pre-change rendering path for every un-merged block AND for merged blocks where
// none of the source blocks carried an annotation).
//
// Old merged blocks created before this change have their annotations newline-
// joined into the top-level `annotation` column and no markers in content — they
// keep working under the single-segment path, exactly as before.

export const SEGMENT_SEPARATOR = '\n\n';
export const SEGMENT_NOTE_PREFIX = '↪ note: ';

export interface Segment {
  text: string;
  // Per-segment annotation parsed off the trailing `↪ note: ` line, if any.
  annotation: string | null;
  /** Where `text` begins in the whole merged content. 2026-08-19: the renderer stamps it
   *  into the DOM so a selection inside a merged block maps back to the same character
   *  range every other block reports — without it, highlighting a merged block would have
   *  gone from "one line only" straight to "not at all". */
  start: number;
}

const stripMarker = (line: string): string => line.slice(SEGMENT_NOTE_PREFIX.length);

// Parse a merged block's content into its segments. For un-merged blocks (no marker
// anywhere), returns a single segment with the content verbatim.
export const parseSegments = (content: string): Segment[] => {
  if (!content.includes(SEGMENT_NOTE_PREFIX)) {
    return [{ text: content, annotation: null, start: 0 }];
  }
  // `start` is tracked by walking the split rather than searching for each segment: two
  // identical segments would otherwise both resolve to the first one's offset.
  let cursor = 0;
  return content.split(SEGMENT_SEPARATOR).map((seg) => {
    const start = cursor;
    cursor += seg.length + SEGMENT_SEPARATOR.length;
    const lines = seg.split('\n');
    const last = lines[lines.length - 1] ?? '';
    if (last.startsWith(SEGMENT_NOTE_PREFIX)) {
      return {
        text: lines.slice(0, -1).join('\n'),
        annotation: stripMarker(last),
        start,
      };
    }
    return { text: seg, annotation: null, start };
  });
};

// True iff content carries the per-segment annotation marker — used by the display
// layer to decide whether to render segments as a list vs. as a single prose blob.
export const hasSegmentAnnotations = (content: string): boolean =>
  content.includes(SEGMENT_NOTE_PREFIX);

// Join an array of segments back into a merged-content string. Inverse of
// parseSegments. Used by computeMergedFields.
/** ⚠️ Takes only the two fields it writes. `start` is an output of PARSING (where each
 *  segment sits in the string it came out of); a segment being assembled for a merge has no
 *  such place yet, so requiring it here would be asking the caller to invent a number. */
export const joinSegments = (segments: readonly Pick<Segment, 'text' | 'annotation'>[]): string =>
  segments
    .map((s) => {
      const trimmed = s.annotation?.trim();
      if (!trimmed) return s.text;
      // Annotation must occupy its own last line so the parser can lift it off.
      return `${s.text}\n${SEGMENT_NOTE_PREFIX}${trimmed.replace(/\n/g, ' ')}`;
    })
    .join(SEGMENT_SEPARATOR);
