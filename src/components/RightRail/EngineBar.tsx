import { ChevronDown, ChevronRight, PanelRightClose } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { ENGINE_LABEL, useEngineStore, type EngineKind } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';

// DESIGN_WORKBENCH §9.3 #3 — the top of the rail.
//
// Ocean, having used it: 「最顶部一个 AI 毫无意义，不写」 and, in the same breath,
// 「切换模型没有选择权」. Both are the same complaint from opposite ends — the top row spent
// its space on a word ("AI") and a fact (which CLI) instead of on the one decision that
// actually costs money. So the label is gone and the row is a control now: engine, model,
// and what the week has cost, on one line, folding open only when there is a choice to make.
//
// §9.1 puts this in the 附属 layer, so it stays one line high unless the user opens it.

/**
 * §9.13.6-bis — **the model picker, restored** (2026-08-10, with the third engine, exactly as
 * Ocean scheduled it on 2026-08-07 晚: 「模型先删掉，但是记录，后续还是要更新回去，和
 * Gemini CLI 放一起做」).
 *
 * It was removed because it offered `opus` / `sonnet` / `haiku` and `opus` was measured broken
 * on this machine (404 `claude-opus-4-1-20250805`, §9.13.5) — a choice that fails at the API is
 * worse than no choice. It comes back as **one table keyed by engine**, which is the shape the
 * third engine forced: a claude-only picker had no place to put gemini's names.
 *
 * ⚠️ **`opus` is still out.** The measurement that removed it has not been re-run, and putting
 * a known-404 name back would restore the original bug, not the original feature. It returns
 * the day a `claude` update makes it resolve — this list is the only edit that takes.
 *
 * ⚠️ **codex has no entry, and that is also a measurement** (§9.10 / CLAUDE_MODELS): its models
 * come from a server-fetched catalog it does not validate locally, so any name offered here
 * would fail at the API rather than at the click. An engine with no entry shows no picker.
 *
 * ⚠️ The names must stay in step with engine.rs's `CLAUDE_MODELS` / `GEMINI_MODELS`, which is
 * where a run's model is actually validated — anything not in those lists is dropped before it
 * reaches a flag, so a name added only here would silently do nothing.
 */
const ENGINE_MODELS: Record<EngineKind, readonly string[]> = {
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

/**
 * §9.13 — Ocean: 「Claude code 模型为什么没有 effort。加进去」.
 *
 * ⚠️ **Measured 2026-08-07, and the answer is that this CLI cannot use it at all.** The
 * mechanism is real and it is wired end to end (settings → engineStore → engine.rs
 * `claude_effort_env` → the child's `CLAUDE_CODE_EFFORT_LEVEL`), but every model
 * claude 2.0.50 can reach REJECTS the parameter at the API:
 *
 * ```
 * CLAUDE_CODE_EFFORT_LEVEL=low claude -p "…" --model haiku
 *   → API Error: 400 "This model does not support the effort parameter."
 *   --model sonnet   → the same 400
 *   no --model       → the same 400   (so the account default does not escape it either)
 *   --model opus     → 404 "model: claude-opus-4-1-20250805"  ← separate bug, see below
 * The same call with the variable UNSET returns OK and costs $0.035.
 * ```
 *
 * So the variable is not ignored, as reading the binary suggested — the CLI forwards it and
 * the API refuses it. Offering the picker today would turn **every** run into a failed run,
 * which is the exact trap §2.2 already avoided for codex's models: 宁可不给选.
 *
 * The list stays, and the plumbing behind it stays tested (engine.rs
 * `effort_reaches_claude_as_an_env_var_and_only_when_it_is_one_of_the_three`), because the
 * fix is not in Spool — effort works on Opus 4.5+ / Sonnet 4.6+, and this CLI maps `sonnet`
 * and `opus` to older snapshots. **Re-measure after a `claude` update; when a reachable
 * model accepts it, restoring the picker is the one `<select>` block below this comment.**
 */
const CLAUDE_EFFORTS = ['low', 'medium', 'high'] as const;
/** Flipped on the day the measurement above changes. Nothing else needs to move. */
const EFFORT_PICKER_ENABLED = false;

interface Props {
  onCollapse: () => void;
  /** Spend across Spool's own runs in the last 7 days, or null while it loads. §5: this is
   *  what was SPENT. Neither CLI reports what is left, and nothing here may imply it does. */
  spendUsd: number | null;
}

export default function EngineBar({ onCollapse, spendUsd }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = useEngineStore((s) => s.status);
  const probe = useEngineStore((s) => s.probe);
  const effort = useSettingsStore((s) => s.aiEffortClaude);
  const modelClaude = useSettingsStore((s) => s.aiModelClaude);
  const modelGemini = useSettingsStore((s) => s.aiModelGemini);
  const update = useSettingsStore((s) => s.update);

  const engineName = status?.selected ? ENGINE_LABEL[status.selected] : null;
  // The effort picker is claude's alone (see EFFORT_PICKER_ENABLED). The model picker is
  // per-engine now, and an engine with no verified catalogue simply has none.
  const showModels = status?.selected === 'claude';
  const selected = status?.selected ?? null;
  const models = selected ? ENGINE_MODELS[selected] : [];
  const model = selected === 'gemini' ? modelGemini : modelClaude;
  const setModel = (v: string): Promise<void> =>
    update(selected === 'gemini' ? { aiModelGemini: v || null } : { aiModelClaude: v || null });

  return (
    <div className="flex-none border-b border-line">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!status?.available}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-ink-2 transition-colors enabled:hover:bg-paper-2 disabled:cursor-default"
        >
          {status?.available &&
            (open ? (
              <ChevronDown size={11} className="flex-none text-muted" />
            ) : (
              <ChevronRight size={11} className="flex-none text-muted" />
            ))}
          <span className="truncate">
            {engineName ?? <span className="text-muted">{t('没检测到引擎')}</span>}
            {EFFORT_PICKER_ENABLED && showModels && effort && (
              <span className="text-muted"> · {effort}</span>
            )}
          </span>
        </button>
        {spendUsd !== null && spendUsd > 0 && (
          <span
            title={t('Spool 自己跑的这些运行，近 7 天一共花了这么多。剩多少额度 Spool 看不到。')}
            className="flex-none font-mono text-[10px] text-muted"
          >
            ${spendUsd.toFixed(2)}
          </span>
        )}
        <button
          type="button"
          onClick={onCollapse}
          title={t('收起')}
          aria-label={t('收起')}
          className="flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <PanelRightClose size={13} />
        </button>
      </div>

      {open && status?.available && (
        <div className="space-y-1.5 px-3 pb-2">
          {/* §7.4: a picker only when there is something to pick. */}
          {status.engines.length > 1 && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted">{t('用哪个')}</span>
              <select
                value={status.selected ?? ''}
                onChange={(e) => void update({ aiEngine: e.target.value as EngineKind }).then(probe)}
                className="flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
              >
                {status.engines.map((e) => (
                  <option key={e.kind} value={e.kind}>
                    {ENGINE_LABEL[e.kind]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* §9.13.6-bis restored. 「默认」 = no `--model` flag at all, which is not the same
              as picking one: it leaves whatever the user set up in their own CLI alone. */}
          {models.length > 0 && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted">{t('用哪个模型')}</span>
              <select
                value={model ?? ''}
                onChange={(e) => void setModel(e.target.value)}
                className="min-w-0 flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
              >
                <option value="">{t('默认')}</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* §7.8.4 — a per-model daily allowance is not a footnote on this engine, it is the
              thing that decides whether the next run happens. Said once, here, next to the
              control that changes it. */}
          {selected === 'gemini' && (
            <p className="text-[10px] leading-relaxed text-muted">
              {t('Gemini 免费额度按模型分开算，每个每天大约 20 次。用完了换一个模型还能接着跑。')}
            </p>
          )}

          {/* §9.13 — 「加进去」, built and then held back. See EFFORT_PICKER_ENABLED above:
              the wiring works, but every model this CLI can reach 400s on the parameter, so
              showing the picker would break every run instead of tuning it. 「默认」 means the
              variable is never set, which is what happens today. */}
          {EFFORT_PICKER_ENABLED && showModels && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted">{t('想多久')}</span>
              <select
                value={effort ?? ''}
                onChange={(e) => void update({ aiEffortClaude: e.target.value || null })}
                title={t('想得越久越贵，也越慢')}
                className="flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
              >
                <option value="">{t('默认')}</option>
                {CLAUDE_EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-[10px] leading-relaxed text-muted">
            {t('用的是你自己 CLI 账号的额度。')}
          </p>
        </div>
      )}
    </div>
  );
}
