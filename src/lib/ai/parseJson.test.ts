import { describe, expect, it } from 'vitest';
import { parseJson } from './parseJson';

describe('parseJson', () => {
  it('parses clean JSON', () => {
    expect(parseJson('{"threadId":"abc","confidence":"high"}')).toEqual({
      threadId: 'abc',
      confidence: 'high',
    });
  });

  it('strips ```json code-fence wrapping', () => {
    expect(parseJson('```json\n{"confidence":"low"}\n```')).toEqual({
      confidence: 'low',
    });
  });

  it('tolerates trailing commas', () => {
    expect(parseJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
    expect(parseJson('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  it('escapes unescaped newlines inside string values', () => {
    expect(parseJson('{"note":"line one\nline two"}')).toEqual({
      note: 'line one\nline two',
    });
  });

  it('converts single-quoted strings to valid JSON', () => {
    expect(parseJson("{'threadId': 'abc', 'confidence': 'medium'}")).toEqual({
      threadId: 'abc',
      confidence: 'medium',
    });
  });

  it('handles a leading "json" echo and surrounding prose', () => {
    expect(parseJson('json\n{"threadId":null,"confidence":"low"}')).toEqual({
      threadId: null,
      confidence: 'low',
    });
  });

  it('throws on genuinely unparseable input', () => {
    expect(() => parseJson('not json at all')).toThrow(/parseJson failed/);
  });
});
