import { Circle, Code2, FileText, Globe, MessageSquare, Sparkles, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Maps a block's free-text `source` to a category icon for the source badge
// (PLAN_EN.md §9.3) — v2.6's shape-not-hue answer to the rejected "color-coded
// blocks" idea (§2.6).
//
// Case-insensitive contains-match, first hit wins. The chat-assistant rule is
// checked last on purpose: its bare `ai` token is a substring of common words —
// notably "mail" — so every more specific category gets first refusal. §19.11
// tracks tuning this table against real dogfooding data.
const RULES: readonly [RegExp, LucideIcon][] = [
  [/safari|chrome|edge|brave|arc|firefox|http/i, Globe],
  [/preview|word|pdf|pages|keynote/i, FileText],
  [/vscode|xcode|jetbrains|sublime|cursor/i, Code2],
  [/mail|wechat|slack|messages|discord|telegram/i, MessageSquare],
  [/terminal|iterm|warp/i, Terminal],
  [/chatgpt|gpt|gemini|claude|copilot|ai/i, Sparkles],
];

// Unknown source / no match → a small filled dot, rendered muted at the badge head.
export function sourceIcon(source: string | null): LucideIcon {
  if (!source) return Circle;
  for (const [pattern, icon] of RULES) {
    if (pattern.test(source)) return icon;
  }
  return Circle;
}
