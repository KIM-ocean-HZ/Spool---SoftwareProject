import { ChevronDown, ChevronUp, List, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import type { SearchHit } from '@/lib/search/query';
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
// `data-search-nav-bar` lets BlockItem's click-outside dismissal exclude the
// bar's own controls — the buttons live OUTSIDE articleRef (above the feed).

interface Props {
  query: string;
  index: number;
  total: number;
  // All blocks matching the original search (across workspaces) + the currently-shown one,
  // for the jump-to-any-match list.
  results: SearchHit[];
  currentBlockId: string | null;
  onQueryChange: (next: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onPickResult: (blockId: string) => void;
  onDismiss: () => void;
}

const hitLine = (hit: SearchHit): string => {
  const line = hit.snippet.find((l) => l.isHit) ?? hit.snippet[0];
  return (line?.text ?? '').trim();
};

export default function InBlockNavigator({
  query,
  index,
  total,
  results,
  currentBlockId,
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
      className="relative flex flex-none items-center gap-2 border-b border-line-strong bg-paper-2/80 px-4 py-2 backdrop-blur-sm"
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
      <span
        className="font-mono text-[11px] text-muted"
        aria-live="polite"
      >
        {!query.trim() ? '' : empty ? t('无匹配') : `${index + 1} / ${total}`}
      </span>

      {/* All matching blocks across every workspace — jump to any of them. */}
      <button
        type="button"
        onClick={() => setListOpen((v) => !v)}
        disabled={results.length === 0}
        title={t('所有包含该文字的块（全部工作区）')}
        aria-label={t('所有匹配的块')}
        className={`flex h-6 flex-none items-center gap-1 rounded px-1.5 font-mono text-[11px] transition-colors disabled:opacity-40 ${
          listOpen ? 'bg-paper text-accent' : 'text-muted hover:bg-paper hover:text-accent'
        }`}
      >
        <List size={13} />
        {results.length}
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
