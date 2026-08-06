import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { dateLocale, useT } from '@/lib/i18n';
import type { EngineRun } from '@/lib/db/engineRuns';
import { ACTION_LABEL, ENGINE_LABEL, type EngineKind } from '@/stores/engineStore';

// DESIGN_WORKBENCH §3.1 — one finished run, and the answer to Ocean's #6/#8.
//
// This card is where the bug in §1.1 gets fixed, and the fix is not a code change to the
// prompts — it is this component existing. The three maintenance prompts all end with "say
// the conclusion to the user first, and store it only once they agree". That instruction is
// RIGHT. What was missing was anywhere for the saying to happen and anyone to agree: a
// headless run has no user in the loop, so the model wrote its whole answer into a final
// message that Spool then dropped, and reported "跑完了，没有新增块".
//
// So the two buttons at the bottom are not a convenience. They are the "user agrees" step
// that the prompt has been asking for since it was written.

interface Props {
  run: EngineRun;
  onDismiss: (id: string) => void;
  /** Store the AI's text as a block. Absent for runs whose product was never prose
   *  (找找新进展 files proposals; a failed run has nothing to store). */
  onStore?: (run: EngineRun) => void;
  busy?: boolean;
}

/** DESIGN_WORKBENCH §5 — spend, never remaining quota. Neither CLI reports how much of the
 *  user's plan is left, so this must never be phrased as a balance. A run whose CLI said
 *  nothing shows nothing rather than "$0.00": "free" and "not reported" are different
 *  claims, and codex reports nothing at all today. */
const money = (usd: number | null): string | null =>
  usd === null ? null : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;

export default function RunCard({ run, onDismiss, onStore, busy }: Props) {
  const t = useT();
  const hasText = (run.resultText ?? '').trim().length > 0;
  // Answered cards collapse: the rail is a place to act, and a wall of resolved cards
  // would bury the one that still wants something.
  const [open, setOpen] = useState(run.reviewedAt === null && hasText);

  const when = new Date(run.finishedAt).toLocaleString(dateLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const engineName = ENGINE_LABEL[run.engine as EngineKind] ?? run.engine;
  const cost = money(run.usage.costUsd);
  const answered = run.reviewedAt !== null;

  // What actually came of it, in the words of the thing that happened. "没有新增块" was the
  // sentence that made a completed run look like an idle one — so a run with prose says it
  // has prose, and only a genuinely empty run says nothing came back.
  const outcomeLine =
    run.outcome === 'failed'
      ? t('没跑成')
      : run.outcome === 'cancelled'
        ? t('被你停下了')
        : run.blocksWritten > 0
          ? t('归档了 {n} 块', { n: run.blocksWritten })
          : run.proposalsQueued > 0
            ? t('提了 {n} 条待你过目', { n: run.proposalsQueued })
            : hasText
              ? t('写好了，等你过目')
              : t('这次没有新东西');

  return (
    <div
      className={`rounded-md border px-2.5 py-2 transition-colors ${
        answered || run.outcome !== 'ok'
          ? 'border-line bg-paper-2/30'
          : 'border-accent/40 bg-accent-soft/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasText && !run.detail}
        className="flex w-full items-start gap-1.5 text-left disabled:cursor-default"
      >
        <span className="mt-[3px] flex-none text-muted">
          {hasText || run.detail ? (
            open ? (
              <ChevronDown size={11} />
            ) : (
              <ChevronRight size={11} />
            )
          ) : (
            <span className="inline-block w-[11px]" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink">{t(ACTION_LABEL[run.action])}</span>
          <span className="mt-0.5 block text-[10px] text-muted">
            {outcomeLine} · {when}
          </span>
        </span>
      </button>

      {open && hasText && (
        <div className="mt-1.5 whitespace-pre-wrap border-t border-line/60 pt-1.5 text-[11px] leading-relaxed text-ink-2">
          {run.resultText}
        </div>
      )}
      {open && run.detail && (
        // §2.3: the CLI's own words, never a Spool paraphrase — "额度用完了，9/4 再来" is
        // the single most useful thing a failed run can hand back.
        <div className="mt-1.5 whitespace-pre-wrap border-t border-line/60 pt-1.5 font-mono text-[10px] leading-relaxed text-muted">
          {run.detail}
        </div>
      )}

      {/* The engine line. Ocean 2026-08-06: "我在使用过程中对使用了什么模型花了多少额度
          毫不知情，但这不是免费的". Model and cost sit on every card because every card is
          a thing that was paid for. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted">
        <span>{engineName}</span>
        {run.usage.model && <span>· {run.usage.model}</span>}
        <span>· {cost ?? t('花费未知')}</span>
      </div>

      {!answered && run.outcome === 'ok' && hasText && (
        <div className="mt-2 flex items-center gap-1.5">
          {onStore && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStore(run)}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-accent/60 bg-accent-soft px-2 py-1 text-[11px] text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 disabled:opacity-40"
            >
              <Check size={11} />
              {t('存成一块')}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onDismiss(run.id)}
            title={t('留着记录，不存进库')}
            className="flex flex-none items-center gap-1 rounded border border-line bg-paper px-2 py-1 text-[11px] text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-ink disabled:opacity-40"
          >
            <X size={11} />
            {t('不用了')}
          </button>
        </div>
      )}
    </div>
  );
}
