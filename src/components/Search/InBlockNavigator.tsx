import { ChevronDown, ChevronUp, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

// v2.9 §9.10 / §13.2 / §19.17: in-block search find bar. Mounted at the top of
// the destination thread's LogView (a fixed band above the scrollable feed)
// so it stays put while the user scrolls and is large enough to read at a
// glance — closer to vscode's find widget than a floating pill.
//
// The query field is a real editable input: typing re-runs buildHitOffsets
// against the target block (in LogView, via `onQueryChange`), so the user can
// refine the search inside the block without going back to the global overlay.
//
// `data-search-nav-bar` lets BlockItem's click-outside dismissal exclude the
// bar's own controls — the buttons live OUTSIDE articleRef (above the feed).

interface Props {
  query: string;
  index: number;
  total: number;
  onQueryChange: (next: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onDismiss: () => void;
}

export default function InBlockNavigator({
  query,
  index,
  total,
  onQueryChange,
  onPrev,
  onNext,
  onDismiss,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = total === 0;

  // Auto-focus the input on mount so the user can immediately refine the
  // search. preventScroll keeps focus from yanking the viewport.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
    // Esc / Cmd+G fall through to useSearch's document-level handler.
  };

  return (
    <div
      data-search-nav-bar
      role="toolbar"
      aria-label="块内查找"
      className="flex flex-none items-center gap-2 border-b border-line-strong bg-paper-2/80 px-4 py-2 backdrop-blur-sm"
    >
      <SearchIcon size={14} className="flex-none text-accent" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="块内查找…"
        spellCheck={false}
        className="w-[220px] flex-none rounded border border-line bg-paper px-2 py-1 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
      />
      <span
        className="font-mono text-[11px] text-muted"
        aria-live="polite"
      >
        {!query.trim() ? '' : empty ? '无匹配' : `${index + 1} / ${total}`}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onPrev}
        disabled={empty}
        title="上一个匹配 (⇧⌘G / ⇧↵)"
        aria-label="上一个匹配"
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted transition-colors hover:bg-paper hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={empty}
        title="下一个匹配 (⌘G / ↵)"
        aria-label="下一个匹配"
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
    </div>
  );
}
