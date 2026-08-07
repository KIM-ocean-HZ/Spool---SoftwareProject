import { useMemo, useState } from 'react';
import type { Block } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { blockLabel } from '@/lib/pack/assemble';
import { isImeComposing } from '@/lib/utils/ime';

interface Props {
  /** The block the user is declaring FROM — the newer one. Excluded from the list. */
  block: Block;
  /** Everything in this project, in feed order. */
  blocks: readonly Block[];
  onPick: (targetBlockId: string, kind: 'supersedes' | 'corrects') => void;
  onCancel: () => void;
}

// How many candidates the list shows before the filter box is the only way through. A
// project with 200 blocks would otherwise put a 200-row scroller inside the feed.
const LIST_CAP = 8;

/**
 * DESIGN_CONTEXT_HYGIENE §3.1 — 「它更正了哪一条」.
 *
 * The two strengths are the entire design decision here, and §3.1.1 is why they are two
 * buttons and not one. 「整条都不作数了」 retires the old block: it leaves every pack, and
 * this one stands in its place. 「只有一处要改」 leaves the old block completely alone — it
 * keeps rendering in full, with one line underneath pointing here. Ocean's question
 * («替代信息大多情况是大段文字里的一句话，ai 写回应该要复制这一段话的其余所有内容才对吧?») is
 * answered by that second button: no copy, because copying would manufacture a duplicate,
 * launder a 📖 Reference passage into 💭 Personal, and charge the price of rewriting two
 * thousand characters to fix one sentence.
 *
 * ⚠️ Only the user ever opens this. There is no MCP counterpart (§3.1 «谁能用»): an AI that
 * guesses wrong here takes a correct conclusion out of every future pack.
 */
export default function SupersedePicker({ block, blocks, onPick, onCancel }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Newest first: what a correction replaces is usually recent, and the user just wrote
    // the block doing the correcting.
    const pool = blocks
      .filter((b) => b.id !== block.id)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
    if (!q) return pool.slice(0, LIST_CAP);
    return pool
      .filter(
        (b) =>
          b.content.toLowerCase().includes(q) ||
          (b.annotation ?? '').toLowerCase().includes(q) ||
          `#${b.seq ?? ''}` === q,
      )
      .slice(0, LIST_CAP);
  }, [blocks, block.id, query]);

  const pickedBlock = picked ? blocks.find((b) => b.id === picked) ?? null : null;

  return (
    <div className="mt-2 rounded border border-line-strong bg-paper-2/40 p-2">
      <div className="mb-1.5 font-ui text-[12px] text-ink-2">
        {t('这一条更正了项目里的哪一条？')}
      </div>
      {pickedBlock ? (
        <>
          <div className="mb-2 truncate rounded border border-line bg-paper px-2 py-1 font-ui text-[12px] text-ink">
            {pickedBlock.seq != null && (
              <span className="mr-1.5 font-mono text-muted">#{pickedBlock.seq}</span>
            )}
            {blockLabel(pickedBlock.content, pickedBlock.annotation)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPick(pickedBlock.id, 'supersedes')}
              title={t('那一条整条退出上下文，这一条顶上。它还留在库里，搜得到')}
              className="rounded border border-accent bg-accent-soft px-2 py-0.5 font-ui text-[11px] text-accent hover:bg-accent/10"
            >
              {t('那条整条都不作数了')}
            </button>
            <button
              type="button"
              onClick={() => onPick(pickedBlock.id, 'corrects')}
              title={t('那一条原文照旧，底下多一行说明「其中一处已被这条更正」')}
              className="rounded border border-line-strong px-2 py-0.5 font-ui text-[11px] text-ink-2 hover:border-accent hover:text-accent"
            >
              {t('只有其中一处要改')}
            </button>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="px-1 font-ui text-[11px] text-muted hover:text-ink"
            >
              {t('换一条')}
            </button>
          </div>
        </>
      ) : (
        <>
          {blocks.length > LIST_CAP + 1 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (isImeComposing(e.nativeEvent)) return;
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              placeholder={t('输入几个字找那一条')}
              className="mb-1.5 w-full rounded border border-line bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-accent"
              spellCheck={false}
            />
          )}
          {candidates.length === 0 ? (
            <div className="px-1 py-1 font-ui text-[11px] text-muted">
              {t('没有匹配的块')}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {candidates.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(b.id)}
                    className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left font-ui text-[12px] text-ink-2 hover:bg-paper hover:text-ink"
                  >
                    {b.seq != null && (
                      <span className="shrink-0 font-mono text-[10px] text-muted">#{b.seq}</span>
                    )}
                    <span className="min-w-0 truncate">
                      {blockLabel(b.content, b.annotation)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-1 font-ui text-[11px] text-muted hover:text-ink"
            >
              {t('取消')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
