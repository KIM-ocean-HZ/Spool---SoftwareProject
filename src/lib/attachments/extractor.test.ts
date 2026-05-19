import { describe, expect, it } from 'vitest';
import { extractAttachmentText } from './extractor';

describe('extractAttachmentText', () => {
  it('rejects an unsupported extension before reading the file', async () => {
    const r = await extractAttachmentText('/some/where/photo.JPG');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('failed');
      expect(r.reason).toContain('unsupported extension');
    }
  });

  it('treats a path with no extension as unsupported', async () => {
    const r = await extractAttachmentText('/some/where/Makefile');
    expect(r.ok).toBe(false);
  });

  it('never throws — an unreadable file resolves to a failed result', async () => {
    const r = await extractAttachmentText('/no/such/file/here.pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('failed');
  });
});
