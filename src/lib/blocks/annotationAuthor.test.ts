import { describe, expect, it } from 'vitest';
import { annotationIsAi, isUserWritten } from './annotationAuthor';

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

// 「只看我写的」(§4.4). A wrong answer here hides the user's own thinking behind a filter
// whose whole purpose is to show it, so both halves of the 💭 Personal rule get a case.
describe('isUserWritten', () => {
  const block = (
    source: string | null,
    annotation: string | null = null,
    annotationBy: 'user' | 'ai' | null = null,
  ) => ({ source, annotation, annotationBy });

  it('counts anything the user typed themselves — no source is the signature', () => {
    expect(isUserWritten(block(null))).toBe(true);
    expect(isUserWritten(block('   '))).toBe(true);
  });

  it('counts a captured block the user annotated by hand, whoever wrote the block', () => {
    expect(isUserWritten(block('Safari', '这条是关键'))).toBe(true);
    // The case 拍板乙 paid a schema bump for: the user's note on an AI-written block.
    expect(isUserWritten(block('Codex · MCP', '我不同意这段', 'user'))).toBe(true);
  });

  it('leaves out what the user has not touched', () => {
    expect(isUserWritten(block('Safari'))).toBe(false);
    expect(isUserWritten(block('Safari', '   '))).toBe(false);
    // An AI's own note does not make the block the user's.
    expect(isUserWritten(block('Claude · MCP', 'ai wrote this', 'ai'))).toBe(false);
    // Pre-v14 row with no recorded author: the MCP source label decides, as everywhere else.
    expect(isUserWritten(block('Claude · MCP', 'ai wrote this'))).toBe(false);
  });
});
