// v2.9 §13.2 / §9.10 / §19.17: a small floating pill anchored top-right of the
// destination block during search navigation. Renders `index/total ▲ ▼ ✕` in
// Geist Mono. Button clicks delegate to the parent BlockItem, which in turn
// delegates to the searchStore — keyboard shortcuts (Cmd+G / Cmd+Shift+G /
// F3 / Esc) live in useSearch.ts so they only fire while this pill is mounted.

interface Props {
  index: number; // zero-based active hit index
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDismiss: () => void;
}

export default function InBlockNavigator({ index, total, onPrev, onNext, onDismiss }: Props) {
  if (total === 0) return null;
  return (
    <div
      className="absolute right-2 top-2 z-20 flex select-none items-center gap-1 rounded-full border border-line-strong bg-paper px-2 py-0.5 font-mono text-[10.5px] text-ink-2"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      <span aria-live="polite">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        onClick={onPrev}
        aria-label="上一个匹配"
        title="上一个 (⇧⌘G)"
        className="rounded px-1 leading-none hover:text-accent"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="下一个匹配"
        title="下一个 (⌘G)"
        className="rounded px-1 leading-none hover:text-accent"
      >
        ▼
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="关闭"
        title="关闭"
        className="rounded px-1 leading-none hover:text-accent"
      >
        ✕
      </button>
    </div>
  );
}
