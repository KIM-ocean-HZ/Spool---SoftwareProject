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
 * §9.13.6-bis — **the model picker is gone** (Ocean 2026-08-07 晚: 「模型先删掉，但是记录，
 * 后续还是要更新回去，和 Gemini CLI 放一起做」).
 *
 * What it offered was `opus` / `sonnet` / `haiku`, and `opus` was measured broken on this
 * machine the same day (404 `claude-opus-4-1-20250805`, §9.13.5) — a choice that fails at the
 * API is worse than no choice, the same rule §9.10 already applied to codex: 宁可不给选.
 *
 * It comes back with the third engine (DESIGN_AI_ENGINE §7.7, Gemini CLI), because 「哪个引擎
 * 能选哪些模型」 has to be rebuilt as one table then anyway — this picker was claude-only, and
 * a half of it left standing is what that work would have to unpick first.
 *
 * **Nothing behind the surface was removed**: `aiModelClaude` still exists, `ai_engine_run`
 * still takes `model`, engine.rs still passes `--model`. Restoring is the `<select>` this
 * comment replaced plus the one read in engineStore.ts (which is `null` today, so a value
 * left in settings.json by an older build cannot keep applying).
 */

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
  const update = useSettingsStore((s) => s.update);

  const engineName = status?.selected ? ENGINE_LABEL[status.selected] : null;
  // The model and effort pickers are claude's alone. Codex resolves its model list from a
  // server-fetched catalog and validates neither `-c` model names nor reasoning-effort
  // values locally (measured 2026-08-07), so offering either there would mean a run that
  // fails at the API instead of at the click.
  const showModels = status?.selected === 'claude';

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
          {status.selected === 'codex' && (
            <p className="text-[10px] leading-relaxed text-muted">
              {t('Codex 的模型要等它的额度恢复（9/4）才能测出来，先不给选，免得给你一个跑不通的名字。')}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-muted">
            {t('花的是你自己那个 CLI 账号的额度。上面只写花了多少——还剩多少，两个 CLI 都不告诉外面。')}
          </p>
        </div>
      )}
    </div>
  );
}
