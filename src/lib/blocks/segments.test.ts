import { describe, expect, it } from 'vitest';
import {
  hasSegmentAnnotations,
  joinSegments,
  parseSegments,
  SEGMENT_NOTE_PREFIX,
  SEGMENT_SEPARATOR,
} from './segments';

describe('parseSegments', () => {
  it('returns one segment for an un-merged block (no marker anywhere)', () => {
    const out = parseSegments('just a normal block, no markers');
    expect(out).toEqual([
      { text: 'just a normal block, no markers', annotation: null, start: 0 },
    ]);
  });

  it('returns one segment even when the content contains a paragraph break, as long as no marker exists', () => {
    const out = parseSegments('first paragraph\n\nsecond paragraph');
    expect(out).toEqual([
      { text: 'first paragraph\n\nsecond paragraph', annotation: null, start: 0 },
    ]);
  });

  it('parses two segments each with their own annotation', () => {
    const content = 'alpha\n↪ note: first note\n\nbeta\n↪ note: second note';
    // 2026-08-19: `start` is where the segment's text begins in the WHOLE content — the
    // renderer stamps it into the DOM so a selection inside a merged block maps back to the
    // same coordinates every other block reports.
    expect(parseSegments(content)).toEqual([
      { text: 'alpha', annotation: 'first note', start: 0 },
      { text: 'beta', annotation: 'second note', start: content.indexOf('beta') },
    ]);
  });

  it('handles a mixed-annotation block (some segments annotated, some not)', () => {
    const content = 'alpha\n↪ note: only first\n\nbeta\n\n[from Notion] gamma';
    expect(parseSegments(content)).toEqual([
      { text: 'alpha', annotation: 'only first', start: 0 },
      { text: 'beta', annotation: null, start: content.indexOf('beta') },
      { text: '[from Notion] gamma', annotation: null, start: content.indexOf('[from') },
    ]);
  });

  it('preserves multi-line segment text (annotation marker is only the LAST line)', () => {
    const content = 'line one\nline two\n↪ note: my note\n\nbeta';
    expect(parseSegments(content)).toEqual([
      { text: 'line one\nline two', annotation: 'my note', start: 0 },
      { text: 'beta', annotation: null, start: content.indexOf('beta') },
    ]);
  });
});

describe('joinSegments', () => {
  it('emits no marker for segments without an annotation', () => {
    const text = joinSegments([
      { text: 'a', annotation: null },
      { text: 'b', annotation: '' },
      { text: 'c', annotation: '   ' },
    ]);
    expect(text).toBe('a\n\nb\n\nc');
    expect(text).not.toContain(SEGMENT_NOTE_PREFIX);
  });

  it('roundtrips with parseSegments when annotations are single-line', () => {
    const segments = [
      { text: 'alpha', annotation: 'first' },
      { text: 'beta', annotation: null },
      { text: 'gamma\nmulti-line content', annotation: 'third' },
    ];
    const joined = joinSegments(segments);
    // joinSegments takes no `start` (a segment being assembled has no place yet); parsing
    // the result back hands one out, so compare on the two fields that round-trip.
    expect(parseSegments(joined).map(({ text, annotation }) => ({ text, annotation }))).toEqual(
      segments,
    );
    // …and the offsets it hands out must actually point at that segment's text.
    for (const seg of parseSegments(joined)) {
      expect(joined.slice(seg.start, seg.start + seg.text.length)).toBe(seg.text);
    }
  });

  it('flattens a multi-line annotation onto a single ↪ note: line', () => {
    const joined = joinSegments([{ text: 'a', annotation: 'one\ntwo' }]);
    expect(joined).toBe('a\n↪ note: one two');
  });
});

describe('hasSegmentAnnotations', () => {
  it('is true iff the marker appears in the content', () => {
    expect(hasSegmentAnnotations('plain text')).toBe(false);
    expect(hasSegmentAnnotations('alpha\n\nbeta')).toBe(false);
    expect(hasSegmentAnnotations('alpha\n↪ note: n\n\nbeta')).toBe(true);
  });
});

describe('SEGMENT_SEPARATOR', () => {
  // The separator is exported for callers that want to construct/inspect segment
  // strings (e.g. the collect-mode Send path may build its own content).
  it('is a blank line', () => {
    expect(SEGMENT_SEPARATOR).toBe('\n\n');
  });
});
