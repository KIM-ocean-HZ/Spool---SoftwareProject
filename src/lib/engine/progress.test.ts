import { describe, expect, it } from 'vitest';
import { toolCaption } from './progress';

// The tool names are the same constant list engine.rs whitelists — a tool added there and
// forgotten here is not a bug, it just reads a little raw. What must never happen is a
// caption that goes blank, because a blank caption is indistinguishable from a frozen run.
describe('toolCaption', () => {
  it('says what the run is doing, in the user’s words', () => {
    expect(toolCaption('mcp__spool__get_pack')).toBe('在读这个项目');
    expect(toolCaption('mcp__spool__add_block')).toBe('在存一块');
    expect(toolCaption('WebSearch')).toBe('在网上搜');
  });

  it('falls through to the bare name rather than to silence', () => {
    // A tool Spool has not met yet, spelled the way MCP spells it.
    expect(toolCaption('mcp__spool__brand_new_tool')).toBe('brand_new_tool');
    // Not one of ours at all: passed through whole, so it is obvious it came from elsewhere.
    expect(toolCaption('Bash')).toBe('Bash');
    expect(toolCaption('')).toBe('');
  });
});
