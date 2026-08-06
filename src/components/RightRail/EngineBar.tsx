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

/** The claude aliases engine.rs will accept (`CLAUDE_MODELS`). Aliases, never pinned ids:
 *  an alias follows the account's current model, an id rots when that model retires. */
const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'] as const;

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
  const model = useSettingsStore((s) => s.aiModelClaude);
  const update = useSettingsStore((s) => s.update);

  const engineName = status?.selected ? ENGINE_LABEL[status.selected] : null;
  // The model picker is claude's alone. Codex resolves its model list from a server-fetched
  // catalog and does not validate `-c` overrides locally (measured 2026-08-07), so offering
  // names there would mean a run that fails at the API instead of at the click.
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
            {showModels && model && <span className="text-muted"> · {model}</span>}
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

          {/* W3-c. 「默认」 is not a model — it means the flag is not passed at all, so the
              account's own setting stands. Spool overriding it silently would be worse than
              offering no choice. */}
          {showModels && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted">{t('用哪个模型')}</span>
              <select
                value={model ?? ''}
                onChange={(e) => void update({ aiModelClaude: e.target.value || null })}
                className="flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
              >
                <option value="">{t('默认')}</option>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
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
