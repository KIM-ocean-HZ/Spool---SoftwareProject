import { describe, expect, it } from 'vitest';
import { annotationIsAi } from './annotationAuthor';

// DESIGN_CONTEXT_HYGIENE §9.3 (拍板乙). The rendering side is pinned by the golden fixture;
// what these cover is the resolution rule itself, because it is the one place where "who
// wrote this sentence" is decided, and both wrong answers are expensive:
//   saying "user" about an AI note  → the hole 拍板乙 exists to close;
//   saying "ai" about a user note   → demoting the highest-authority signal Spool has.
describe('annotationIsAi', () => {
  it('takes the recorded author over the source label, in both directions', () => {
    // The case Ocean paid a schema bump for: the user annotating an AI-written block.
    expect(annotationIsAi('user', 'Codex · MCP')).toBe(false);
    // And its mirror: an AI note on a block whose source is not MCP-shaped at all.
    expect(annotationIsAi('ai', 'Safari')).toBe(true);
    expect(annotationIsAi('ai', null)).toBe(true);
  });

  it('falls back to the source label when nothing was recorded (every pre-v14 row)', () => {
    expect(annotationIsAi(null, 'Codex · MCP')).toBe(true);
    expect(annotationIsAi(null, 'MCP')).toBe(true);
    expect(annotationIsAi(null, 'MCP — 用户原文')).toBe(true);
    expect(annotationIsAi(undefined, 'Claude · MCP')).toBe(true);
  });

  it('reads a sourceless or non-MCP pre-v14 row as the user, which is what it was', () => {
    expect(annotationIsAi(null, null)).toBe(false);
    expect(annotationIsAi(null, 'Safari')).toBe(false);
    // Not MCP: the badge rule this mirrors is deliberately narrow, so a project named
    // after the protocol is not mistaken for a write by one.
    expect(annotationIsAi(null, 'MCP 协议笔记')).toBe(false);
    expect(annotationIsAi(null, 'Claude')).toBe(false);
  });
});
