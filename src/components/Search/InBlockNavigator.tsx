import { ChevronDown, ChevronUp, List, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import { hitLine, type SearchHit } from '@/lib/search/query';
import { countMatches } from '@/stores/searchStore';
import { useT } from '@/lib/i18n';

// v2.9 §9.10 / §13.2 / §19.17: in-block search find bar. Mounted at the top of
// the destination thread's LogView (a fixed band above the scrollable feed)
// so it stays put while the user scrolls and is large enough to read at a
// glance — closer to vscode's find widget than a floating pill.
//
// The query field is a real editable input: typing re-runs buildHitOffsets
// against the target block (in LogView, via `onQueryChange`), so the user can
// refine the search inside the block without going back to the global overlay.
//
// v2.10: a 全部 list (the count chip) opens every block that contains the text —
// across ALL workspaces — so the user can jump to any match, in any thread, from
// here. Picking one navigates to that thread/block (`onPickResult`).
//
// `data-search-nav-bar` 是这一栏的记号。2026-08-27 之后它只剩一个用处：useSearch 的 Esc
// 处理要认出「焦点在查找框里」，好让 Esc 从这里也能关掉查找（原来还有一个 BlockItem 的
// click-outside 关闭要靠它排除自己，那条路已经删了 —— 见 BlockItem 里那段说明）。

interface Props {
  query: string;
  index: number;
  total: number;
  // All blocks matching the original search (across workspaces) + the currently-shown one,
  // for the jump-to-any-match list.
  results: SearchHit[];
  currentBlockId: string | null;
  /** 数「本项目」那两个数要知道现在是哪个项目。⚠️ ⛔ 不能从 `currentBlockId` 反推 —— 查找
   *  可以停在别的项目的块上，那时候「本项目」说的仍然是屏幕上这个。 */
  threadId: string;
  onQueryChange: (next: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onPickResult: (blockId: string) => void;
  onDismiss: () => void;
}

export default function InBlockNavigator({
  query,
  index,
  total,
  results,
  currentBlockId,
  threadId,
  onQueryChange,
  onPrev,
  onNext,
  onPickResult,
  onDismiss,
}: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const empty = total === 0;
  const counts = useMemo(() => countMatches(results, threadId), [results, threadId]);

  // Auto-focus the input on mount so the user can immediately refine the
  // search. preventScroll keeps focus from yanking the viewport.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  // Close the all-matches list on a click outside the bar.
  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setListOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [listOpen]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME composition Enter must commit the candidate, not advance to the
    // next match.
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
    // Esc / Cmd+G fall through to useSearch's document-level handler.
  };

  return (
    <div
      ref={rootRef}
      data-search-nav-bar
      role="toolbar"
      aria-label={t('块内查找')}
      // ⚠️⚠️ `z-20` —— 2026-08-27 Ocean:「点击调出所有项目的查找词，背景透明的，和其他文字
      // 重叠，导致看不清」。⛔ 那张列表**没有**透明（它就是 bg-paper），是它画在正文底下：
      // `backdrop-blur-sm` 让这一栏自己成了一个层叠上下文，里面的 z-20 出不去；而下面那个
      // 装滚动区的盒子是 `relative` 且在 DOM 里排在后面，于是**正文压在列表上面**——透出来
      // 的是正文的字，看着就像列表背景是透明的。这里给整条栏一个 z 值，才轮得到它在上面。
      // ⛔ 别超过 30：LogView 的编辑面板（block editor host）是 z-30，它得盖住这一栏。
      className="relative z-20 flex flex-none items-center gap-2 border-b border-line-strong bg-paper-2/80 px-4 py-2 backdrop-blur-sm"
    >
      <SearchIcon size={14} className="flex-none text-accent" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder={t('块内查找…')}
        spellCheck={false}
        className="w-[220px] flex-none rounded border border-line bg-paper px-2 py-1 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
      />
      {/* ⭐ 2026-08-27（Ocean:「搜索的计数有歧义」）——**三个数，各自说清自己在数什么**。
          原来只有两个：`1 / N`（这一块里的第几处）和 `≡ 6`（全部工作区里几个块），
          谁也答不上「这个项目里一共多少处」。⚠️ 处 ≠ 块，所以两个都写出来。 */}
      <span className="whitespace-nowrap font-ui text-[11px] text-muted" aria-live="polite">
        {!query.trim()
          ? ''
          : empty
            ? t('这一块里没有')
            : t('这一块 第 {i} / {n} 处', { i: index + 1, n: total })}
      </span>
      {query.trim() && counts.allHits > 0 && (
        <span className="whitespace-nowrap font-ui text-[11px] text-ink-2">
          {t('本项目 {hits} 处 · {blocks} 块', {
            hits: counts.threadHits,
            blocks: counts.threadBlocks,
          })}
        </span>
      )}

      {/* All matching blocks across every workspace — jump to any of them. */}
      <button
        type="button"
        onClick={() => setListOpen((v) => !v)}
        disabled={results.length === 0}
        title={t('所有包含该文字的块（全部工作区）')}
        aria-label={t('所有匹配的块')}
        className={`flex h-6 flex-none items-center gap-1 whitespace-nowrap rounded px-1.5 font-ui text-[11px] transition-colors disabled:opacity-40 ${
          listOpen ? 'bg-paper text-accent' : 'text-muted hover:bg-paper hover:text-accent'
        }`}
      >
        <List size={13} />
        {t('全部 {hits} 处 · {blocks} 块', {
          hits: counts.allHits,
          blocks: counts.allBlocks,
        })}
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onPrev}
        disabled={empty}
        title={t('上一个匹配 (⇧⌘G / ⇧↵)')}
        aria-label={t('上一个匹配')}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted transition-colors hover:bg-paper hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={empty}
        title={t('下一个匹配 (⌘G / ↵)')}
        aria-label={t('下一个匹配')}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted transition-colors hover:bg-paper hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <ChevronDown size={14} />
      </button>
      <div className="h-4 w-px flex-none bg-line" />
      <button
        type="button"
        onClick={onDismiss}
        title="关闭 (Esc)"
        aria-label="关闭查找"
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted transition-colors hover:bg-paper hover:text-accent"
      >
        <X size={14} />
      </button>

      {listOpen && results.length > 0 && (
        <div
          className="absolute left-4 top-full z-20 mt-1 max-h-72 w-[380px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-md border border-line-strong bg-paper py-1"
          style={{ boxShadow: 'var(--shadow-toast)' }}
        >
          {results.map((hit) => (
            <button
              key={hit.blockId}
              type="button"
              onClick={() => {
                onPickResult(hit.blockId);
                setListOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left transition-colors ${
                hit.blockId === currentBlockId ? 'bg-accent/10' : 'hover:bg-paper-2'
              }`}
            >
              <div className="truncate font-ui text-[12px] text-ink-2">{hitLine(hit) || ' '}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                {hit.field === 'annotation' && (
                  <span className="flex-none rounded-sm border border-line px-1 text-accent">批注</span>
                )}
                <span className="truncate">
                  {hit.workspaceTitle || '收件箱'} / {hit.threadTitle || '无标题'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
