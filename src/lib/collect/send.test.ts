import { describe, expect, it } from 'vitest';
import { mergeStagingItems } from './send';
import type { StagingAttachment, StagingItem } from './stagingBuffer';

let seq = 0;
const item = (over: Partial<StagingItem> = {}): StagingItem => ({
  id: `i${seq++}`,
  content: '',
  annotation: '',
  source: null,
  pinned: false,
  attachments: [],
  createdAt: seq,
  ...over,
});

const att = (label: string): StagingAttachment => ({
  kind: 'url',
  target: `https://example.com/${label}`,
  label,
});

describe('mergeStagingItems (§20.9 merge contract)', () => {
  it('single item → merged content equals that item content', () => {
    const m = mergeStagingItems([item({ content: 'hello world' })]);
    expect(m.content).toBe('hello world');
  });

  it('three items → content blank-line joined in chronological order', () => {
    const m = mergeStagingItems([
      item({ content: 'first' }),
      item({ content: 'second' }),
      item({ content: 'third' }),
    ]);
    expect(m.content).toBe('first\n\nsecond\n\nthird');
  });

  it('annotations are newline-joined onto the survivor (empty ones skipped)', () => {
    const m = mergeStagingItems([
      item({ content: 'a', annotation: 'note A' }),
      item({ content: 'b', annotation: '   ' }),
      item({ content: 'c', annotation: 'note C' }),
    ]);
    expect(m.annotation).toBe('note A\nnote C');
  });

  it('no annotations anywhere → annotation is null', () => {
    const m = mergeStagingItems([item({ content: 'a' }), item({ content: 'b' })]);
    expect(m.annotation).toBeNull();
  });

  it('all attachments collected onto the survivor in item order', () => {
    const m = mergeStagingItems([
      item({ content: 'a', attachments: [att('one'), att('two')] }),
      item({ content: 'b', attachments: [] }),
      item({ content: 'c', attachments: [att('three')] }),
    ]);
    expect(m.attachments.map((a) => a.label)).toEqual(['one', 'two', 'three']);
  });

  it('pinned=true on any item → survivor pinned', () => {
    expect(mergeStagingItems([item(), item({ pinned: true }), item()]).pinned).toBe(true);
    expect(mergeStagingItems([item(), item()]).pinned).toBe(false);
  });

  it('mixed sources → survivor source is the first item source', () => {
    const m = mergeStagingItems([
      item({ content: 'a', source: 'Safari' }),
      item({ content: 'b', source: 'Claude' }),
    ]);
    expect(m.source).toBe('Safari');
  });

  it('mixed sources with a null first item → survivor source is null', () => {
    const m = mergeStagingItems([
      item({ content: 'a', source: null }),
      item({ content: 'b', source: 'Claude' }),
    ]);
    expect(m.source).toBeNull();
  });

  it('common source on all items → survivor keeps that source', () => {
    const m = mergeStagingItems([
      item({ content: 'a', source: 'ChatGPT' }),
      item({ content: 'b', source: 'ChatGPT' }),
      item({ content: 'c', source: 'ChatGPT' }),
    ]);
    expect(m.source).toBe('ChatGPT');
  });
});
