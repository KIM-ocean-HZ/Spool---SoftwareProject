import { ChevronDown, ChevronUp, Search as SearchIcon, X } from 'lucide-react';

// v2.9 §9.10 / §13.2 / §19.17: in-block search find bar. Mounted at the top of
// the destination thread's LogView (a fixed band above the scrollable feed)
// so it stays put while the user scrolls and is large enough to read at a
// glance — closer to vscode's find widget than a floating pill.
//
// Buttons delegate to the searchStore via callbacks. Keyboard shortcuts
// (Cmd/Ctrl+G, Shift+Cmd/Ctrl+G, F3, Shift+F3, Esc) are wired in useSearch.ts
// and gated on `activeNavigationBlockId` so they only fire while this bar is
// mounted.
//
// `data-search-nav-bar` lets BlockItem's click-outside dismissal exclude the
// bar's own controls — the buttons live OUTSIDE articleRef (above the feed).

interface Props {
  query: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDismiss: () => void;
}

export default function InBlockNavigator({
  query,
  index,
  total,
  onPrev,
  onNext,
  onDismiss,
}: Props) {
  const empty = total === 0;
  return (
    <div
      data-search-nav-bar
      role="toolbar"
      aria-label="块内查找"
      className="flex flex-none items-center gap-2 border-b border-line-strong bg-paper-2/80 px-4 py-2 backdrop-blur-sm"
    >
      <SearchIcon size={14} className="flex-none text-accent" />
      <span className="font-ui text-[12px] text-muted">查找</span>
      <span
        className="max-w-[260px] truncate rounded border border-line bg-paper px-2 py-0.5 font-mono text-[12px] text-ink"
        title={query}
      >
        {query || ' '}
      </span>
      <span
        className="font-mono text-[11px] text-muted"
        aria-live="polite"
      >
        {empty ? '无匹配' : `${index + 1} / ${total}`}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onPrev}
        disabled={empty}
        title="上一个匹配 (⇧⌘G)"
        aria-label="上一个匹配"
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted transition-colors hover:bg-paper hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={empty}
        title="下一个匹配 (⌘G)"
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
