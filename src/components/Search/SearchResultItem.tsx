import { useEffect, useRef } from 'react';
import type { SearchHit, SearchSnippetLine } from '@/lib/search/query';
import { formatBlockTime } from '@/lib/utils/time';

interface Props {
  hit: SearchHit;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}

// Render one snippet line. The hit line carries a match range; the keyword inside
// it is wrapped in <mark>. Context lines and the no-match fallback render plainly.
const renderLine = (line: SearchSnippetLine) => {
  if (!line.isHit || !line.match) return line.text || ' ';
  const { start, end } = line.match;
  return (
    <>
      {line.text.slice(0, start)}
      <mark
        className="rounded-sm px-0.5 text-ink"
        style={{ backgroundColor: 'rgba(251, 191, 36, 0.45)' }}
      >
        {line.text.slice(start, end)}
      </mark>
      {line.text.slice(end)}
    </>
  );
};

export default function SearchResultItem({ hit, selected, onSelect, onActivate }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the keyboard-selected row in view as ↑/↓ moves past the fold.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div
      ref={ref}
      onMouseEnter={onSelect}
      onClick={onActivate}
      className={`cursor-pointer rounded-md border px-3 py-2 transition-colors ${
        selected ? 'border-accent bg-paper-2' : 'border-transparent hover:bg-paper-2/50'
      }`}
    >
      <div className="space-y-0.5 font-ui text-[12.5px] leading-[1.5]">
        {hit.snippet.map((line, i) => (
          <div
            key={i}
            className={`break-words border-l-2 pl-2 ${
              line.isHit ? 'border-accent text-ink-2' : 'border-transparent text-muted'
            }`}
          >
            {renderLine(line)}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
        {hit.field === 'annotation' && (
          <span className="flex-none rounded-sm border border-line px-1 text-accent">批注</span>
        )}
        <span className="truncate">
          {hit.workspaceTitle || '收件箱'} / {hit.threadTitle || '无标题'}
        </span>
        <span className="flex-none">· {formatBlockTime(hit.createdAt)}</span>
      </div>
    </div>
  );
}
