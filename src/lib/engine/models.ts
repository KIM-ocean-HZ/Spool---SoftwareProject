import type { EngineKind } from '@/stores/engineStore';

/**
 * §9.13.6-bis — **the model picker's catalogue**, lifted out of `RightRail/EngineBar` on
 * 2026-08-26 because it now has two call sites (Ocean: 「每周自动回顾无法选模型」 — the picker
 * lived in the right rail, and the pinned 周回顾 view does not carry a right rail at all).
 * A table with two readers belongs to neither of them.
 *
 * It was removed once because it offered `opus` / `sonnet` / `haiku` and `opus` was measured
 * broken on this machine (404 `claude-opus-4-1-20250805`, §9.13.5) — a choice that fails at
 * the API is worse than no choice. It came back as **one table keyed by engine**, which is the
 * shape the third engine forced: a claude-only picker had no place to put gemini's names.
 *
 * ⚠️ **`opus` is still out.** The measurement that removed it has not been re-run, and putting
 * a known-404 name back would restore the original bug, not the original feature.
 *
 * ⚠️ **codex has no entry, and that is a measurement, not an omission** (engine.rs
 * CLAUDE_MODELS' note): its models come from a server-fetched catalog it does not validate
 * locally, so any name offered here would fail at the API rather than at the click. Ocean
 * 2026-08-26 chose 乙 — keep offering none, and **say so on screen** (`CODEX_NO_MODELS`)
 * rather than rendering nothing, because "no picker at all" reads as 「坏了」.
 *
 * ⚠️ The names must stay in step with engine.rs's `CLAUDE_MODELS` / `GEMINI_MODELS`, which is
 * where a run's model is actually validated — anything not in those lists is dropped before it
 * reaches a flag, so a name added only here would silently do nothing.
 */
export const ENGINE_MODELS: Record<EngineKind, readonly string[]> = {
  claude: ['sonnet', 'haiku'],
  codex: [],
  // Full ids, not aliases: gemini's free quota is metered per model (DESIGN_AI_ENGINE §7.8.4),
  // so this picker is the control that decides whether today's runs still work. Every name
  // was called once for real on 2026-08-10 — the CLI's own catalogue lists 42, of which
  // several 404 or 429 before a token is spent.
  gemini: [
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ],
};

/** The one sentence codex gets instead of a picker (Ocean 2026-08-26, 乙). */
export const CODEX_NO_MODELS =
  'codex 的模型名由它自己的服务端说了算，本地校验不了，所以 Spool 不给单子——用它账号里的默认模型跑。';

/** Which settings key holds this engine's chosen model. Two engines, two catalogues, two
 *  keys — they share no names, so one key could not hold both.
 *
 *  ⚠️ codex lands on `aiModelClaude` like everything else, and that is harmless **only**
 *  because `ENGINE_MODELS.codex` is empty, so nothing can ever be written for it. If codex
 *  ever gets a catalogue this needs its own key — engineStore's `model:` reads through here
 *  for exactly that reason. */
export const modelKeyFor = (engine: EngineKind | null): 'aiModelClaude' | 'aiModelGemini' =>
  engine === 'gemini' ? 'aiModelGemini' : 'aiModelClaude';
