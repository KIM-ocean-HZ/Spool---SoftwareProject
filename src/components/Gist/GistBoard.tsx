import { useMemo, useState } from 'react';
import { plainText } from '@/lib/blocks/contentRuns';
import type { Block } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { correctionsBySource } from '@/lib/pack/assemble';
import { formatBlockTime } from '@/lib/utils/time';
import { useBlocksStore } from '@/stores/blocksStore';
import SeqBadge from '@/components/ThreadView/SeqBadge';

// ⭐⭐ Q4（WORKPLAN §2.Q4，Ocean 2026-08-25）——「摘要」页签。
//
// 他的原话：「摘要也需要可视化，可以修改，放在内容，压缩，过期检测同级的新区域显示。」
// ⚠️ 「同级」指的是那三个**页签**（`ThreadView/index.tsx`），⛔ 不是块里再加一块区域。
//
// ⚠️ 我原本建议先不做界面编辑（怕它和批注打架，两句都在说「这一块是什么」），**他否了**，
// 理由成立：**AI 能改的东西，用户看不见就没法纠。**
// ⭐ 两句话不打架的办法是**把分工写清楚，不是藏起一句**，所以顶上那句说明是这一页的一部分，
// ⛔ 不是可有可无的装饰：
//   批注 = 你对这一块说的话（在块顶上，当标题，进 pack 是 💭 / 🧩）
//   摘要 = 给 AI 在**别处**认出这一块用的一行（搜索命中、引用行 —— ⛔ 从不进 pack）
//
// ⭐ **一行一块，⛔ 不是一行一个摘要** —— 没有摘要的块也要在列表里，
// 否则「哪些块还没被 AI 认过」这件事在界面上永远看不见。
export default function GistBoard({
  threadId,
  onJump,
}: {
  threadId: string;
  /** ⚠️ 跳转**必须由外面来做**：这一页是个页签，`highlight` 只在「内容」那一页上看得见，
   *  在这儿单独调它的话，用户点了一下、什么都没发生。 */
  onJump: (blockId: string) => void;
}) {
  const t = useT();
  const blocks = useBlocksStore((s) => s.byThread[threadId]);
  const setGist = useBlocksStore((s) => s.setGist);

  // 哪些块挂着更正。⚠️ 和 pack、和 `BlockItem` 用的是**同一个函数** —— 这种「哪些块算
  // 更正了这一块」的判断一旦抄一份出来就会漂。
  const corrected = useMemo(() => correctionsBySource(blocks ?? []), [blocks]);

  if (!blocks || blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-md text-xs leading-relaxed text-muted">
          {t('这个项目还没有块。摘要是给每一块写的一行说明，等有了块再回来。')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <p className="flex-none border-b border-line px-5 py-3 text-[11px] leading-relaxed text-muted">
        {t('摘要是一行说明，AI 在别的地方认出这一块靠它 —— 搜索命中旁边、引用行上。它不进 pack。')}
        <br />
        {t('批注是你对这一块说的话，画在块的顶上。两者不是一回事，都可以留空。')}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-line/60">
          {blocks.map((b) => (
            <GistRow
              key={b.id}
              block={b}
              stale={correctedAndFrozen(b, corrected.has(b.id))}
              onJump={() => onJump(b.id)}
              onSave={(next) => void setGist(b.id, next)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 「这一块挂着更正，而摘要还是更正之前那句」。
 *
 *  ⭐ 判断和 `mcp.rs` 搜索命中里那个 `gist_predates_the_correction` **是同一条**：
 *  `gistBy` 为 null = 这一句是 `add_block` 那一刻写下的，而更正必然在那之后 ⇒
 *  它必然停在更正之前那个说法上。有人回头看过一眼（AI 的 `set_block_gist` 落 'ai'，
 *  用户在这一页上改落 'user'），这个记号就该消失。
 *
 *  ⛔ 不需要「摘要写于何时」那一列 —— 那会是第四列，而这条判断不用它也成立。 */
const correctedAndFrozen = (b: Block, hasCorrection: boolean): boolean =>
  hasCorrection && !!b.gist?.trim() && b.gistBy == null;

export const staleGistCount = (blocks: readonly Block[]): number => {
  const corrected = correctionsBySource(blocks as Block[]);
  return blocks.filter((b) => correctedAndFrozen(b, corrected.has(b.id))).length;
};

function GistRow({
  block,
  stale,
  onJump,
  onSave,
}: {
  block: Block;
  stale: boolean;
  onJump: () => void;
  onSave: (next: string | null) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const value = block.gist ?? '';

  const commit = (): void => {
    if (draft !== null && draft.trim() !== value.trim()) onSave(draft);
    setDraft(null);
  };

  return (
    <li className="flex gap-3 px-5 py-3">
      <button
        type="button"
        onClick={onJump}
        title={t('点一下跳到那一块')}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left transition-colors hover:text-accent"
      >
        <span className="flex items-baseline gap-1.5 text-[11px] text-muted">
          {block.seq != null && <SeqBadge seq={block.seq} />}
          <time className="shrink-0 font-mono tabular-nums opacity-70">
            {formatBlockTime(block.createdAt)}
          </time>
        </span>
        {/* 那一块的一行正文，掐短 —— 和搜索结果那一行同一个做法。 */}
        <span className="line-clamp-2 text-[11px] leading-snug text-ink-2">
          {plainText(block.content)}
        </span>
      </button>
      <div className="flex w-1/2 min-w-0 flex-col gap-1">
        {editing ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(null);
              }
              // ⌘↵ 存下。⚠️ 单独的 ↵ 不存 —— 摘要允许换行，而这一格又是就地编辑，
              // 用 ↵ 当保存键的话打字打到一半按回车就提交了。
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={t('一句话说清这一块整体是什么')}
            className="w-full resize-none rounded border border-accent/50 bg-paper px-2 py-1 text-[11px] leading-snug text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setDraft(value)}
            title={t('点一下改这一句')}
            className="w-full rounded border border-transparent px-2 py-1 text-left text-[11px] leading-snug transition-colors hover:border-line hover:bg-paper/60"
          >
            {value ? (
              <span className="text-ink-2">{value}</span>
            ) : (
              // ⭐ 没有摘要的块也在列表里，这一格就是它说话的地方。
              <span className="italic text-muted opacity-70">{t('还没有摘要')}</span>
            )}
          </button>
        )}
        <span className="flex items-center gap-1.5 px-2 text-[10px] text-muted">
          {value && (
            <span className="rounded border border-line px-1">
              {block.gistBy === 'user' ? t('你写的') : t('AI 写的')}
            </span>
          )}
          {/* ⚠️ 只在「挂着更正而摘要没人回头看过」时出现。⛔ 不给「没有摘要」记号 ——
              大多数块本来就没有摘要，那个记号会永远亮着，三天之后没人再看它一眼。 */}
          {stale && (
            <span
              className="rounded border border-[var(--notice-warm-edge)] px-1 text-ink-2"
              title={t('这一块后来被更正过，而这一句是更正之前写的')}
            >
              {t('可能过期')}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
