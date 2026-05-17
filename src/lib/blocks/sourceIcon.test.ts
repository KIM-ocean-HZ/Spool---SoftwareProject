import { Circle, Code2, FileText, Globe, MessageSquare, Sparkles, Terminal } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { sourceIcon } from './sourceIcon';

describe('sourceIcon', () => {
  it('maps browser sources to Globe', () => {
    expect(sourceIcon('Safari')).toBe(Globe);
    expect(sourceIcon('Arc')).toBe(Globe);
    expect(sourceIcon('Spool 实现蓝图 — https://example.com/plan')).toBe(Globe);
  });

  it('maps chat-assistant sources to Sparkles', () => {
    expect(sourceIcon('ChatGPT')).toBe(Sparkles);
    expect(sourceIcon('Gemini')).toBe(Sparkles);
  });

  it('maps file / document sources to FileText', () => {
    expect(sourceIcon('Preview')).toBe(FileText);
    expect(sourceIcon('Microsoft Word')).toBe(FileText);
  });

  it('maps code editors to Code2', () => {
    expect(sourceIcon('Xcode')).toBe(Code2);
    expect(sourceIcon('JetBrains Rider')).toBe(Code2);
  });

  it('maps mail / messaging sources to MessageSquare', () => {
    expect(sourceIcon('Slack')).toBe(MessageSquare);
    expect(sourceIcon('WeChat')).toBe(MessageSquare);
  });

  it('maps terminal sources to Terminal', () => {
    expect(sourceIcon('Terminal')).toBe(Terminal);
    expect(sourceIcon('iTerm')).toBe(Terminal);
  });

  it('matches case-insensitively', () => {
    expect(sourceIcon('Google Chrome')).toBe(Globe);
    expect(sourceIcon('GOOGLE CHROME')).toBe(Globe);
  });

  it('keeps "Mail" on MessageSquare despite the chat-assistant rule\'s "ai" token', () => {
    // "mail" contains "ai" — the chat-assistant rule is ordered last so the more
    // specific messaging rule wins first. Guards the rule ordering in sourceIcon.ts.
    expect(sourceIcon('Mail')).toBe(MessageSquare);
  });

  it('falls back to Circle for null, empty, or unrecognized sources', () => {
    expect(sourceIcon(null)).toBe(Circle);
    expect(sourceIcon('')).toBe(Circle);
    expect(sourceIcon('面试笔记')).toBe(Circle);
  });
});
