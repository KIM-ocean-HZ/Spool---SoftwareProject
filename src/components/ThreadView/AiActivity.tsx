import { Bot } from 'lucide-react';
import { useState } from 'react';
import { countAiBlocks, groupAiActivity } from '@/lib/engine/activity';
import { dateLocale, useT } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { ACTION_LABEL, useEngineStore } from '@/stores/engineStore';
import { useSearchStore } from '@/stores/searchStore';

interface Props {
  threadId: string;
}

// DESIGN_AI_ENGINE §5 M3 — the trace half of the action → trace loop, and the answer to
// "what did the AI actually put in my library" (three-way review, HANDOFF §3.1-2).
//
// Two things are stacked here, and they are different in kind:
//   * The RUNS this session started (engineStore.runs) — what the user pressed and what
//     came of it, including the ones that wrote nothing. In-memory: the action's name is
//     only interesting while the person who clicked it is still here.
//   * The BLOCKS an AI wrote, whenever and through whichever client (derived from the
//     source label). This is the durable half, and it is what an audit surface must show:
//     a run through Spool's own menu and a write from Claude Desktop at midnight look the
//     same to the library, so they look the same here.
//
// Collapsed by default and absent entirely when there is nothing to show (§2.5 安静原则 —
// a thread the user keeps to themselves must not grow an AI panel).
export default function AiActivity({ threadId }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const blocks = useBlocksStore((s) => s.byThread[threadId]);
  const runs = useEngineStore((s) => s.runs);
  const highlight = useSearchStore((s) => s.highlight);

  const written = countAiBlocks(blocks ?? []);
  const threadRuns = runs.filter((r) => r.threadId === threadId);
  if (written === 0 && threadRuns.length === 0) return null;

  const groups = groupAiActivity(blocks ?? []);
  const when = (ms: number): string =>
    new Date(ms).toLocaleString(dateLocale(), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="flex-none border-b border-line px-6 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-ink-2"
      >
        <Bot size={12} className="flex-none" />
        <span>
          {open ? '▾ ' : '▸ '}
          {written > 0
            ? t('AI 活动 · 这个项目里有 {n} 块是 AI 写的', { n: written })
            : t('AI 活动')}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-2 pb-1">
          {/* What you pressed, and what came of it. Kept above the blocks because it is
              the thing the user is looking for right after a run finishes. */}
          {threadRuns.length > 0 && (
            <ul className="space-y-0.5">
              {threadRuns.map((r) => (
                <li key={r.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className="flex-none font-mono text-muted">{when(r.finishedAt)}</span>
                  <span className="text-ink-2">{t(ACTION_LABEL[r.action])}</span>
                  <span className="text-muted">
                    {r.outcome === 'ok'
                      ? r.blocksWritten > 0
                        ? t('归档了 {n} 块', { n: r.blocksWritten })
                        : t('没有新增块')
                      : r.outcome === 'cancelled'
                        ? r.blocksWritten > 0
                          ? t('被你停下了，写进去的 {n} 块留着', { n: r.blocksWritten })
                          : t('被你停下了')
                        : t('没跑成')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The durable half: every AI-written block in this thread, whoever wrote it.
              Clicking scrolls to it and flashes it — the same path a search result takes,
              so "go look at it and change your mind" is one click from the audit line. */}
          {groups.map((g) => (
            <div key={`${g.source}-${g.at}`}>
              <div className="text-[10px] text-muted">
                {t('{source} · {when} · {n} 块', {
                  source: g.source,
                  when: when(g.at),
                  n: g.blocks.length,
                })}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {g.blocks.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => highlight(b.id)}
                      title={t('跳到这一块')}
                      className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-paper-2"
                    >
                      {b.seq !== null && (
                        <span className="flex-none font-mono text-[10px] text-muted">
                          #{b.seq}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                        {b.content}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
