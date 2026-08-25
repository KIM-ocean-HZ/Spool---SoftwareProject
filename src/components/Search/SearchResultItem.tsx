import { useEffect, useRef } from 'react';
import type { SearchHit, SearchSnippetLine } from '@/lib/search/query';
import { useSearchStore } from '@/stores/searchStore';
import { formatBlockTime } from '@/lib/utils/time';
import { useT } from '@/lib/i18n';

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
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  // Keep the keyboard-selected row in view as ↑/↓ moves past the fold.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // v2.9 §9.10 / §19.17: kick off in-block navigation BEFORE the overlay's
  // existing navigate(thread switch + scroll). BlockItem reads activeHits the
  // moment it mounts in the destination thread and renders the auto-expand +
  // highlights + the find bar in one paint. Always called — even with zero
  // literal offsets (e.g. the FTS5 trigram path matched without a substring),
  // because the auto-expand and active-block tint still need to fire.
  const activate = () => {
    const { query } = useSearchStore.getState();
    useSearchStore.getState().startNavigation(hit.blockId, hit.hitOffsets, query.trim());
    onActivate();
  };

  return (
    <div
      ref={ref}
      onMouseEnter={onSelect}
      onClick={activate}
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
      {/* ⭐ S8（2026-08-24）：**这一块整体是什么。**
          片段说的是「字在哪儿对上的」，这一行说的是「它们是什么的一部分」——
          一个 2,000 字的长块，只看片段是认不出来的。
          ⚠️ 没有人写过就整行不出现，⛔ 不占位、不写「（暂无）」。 */}
      {hit.gist?.trim() && (
        <div className="mt-1 truncate font-ui text-[11px] leading-snug text-muted/90">
          {hit.gist}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
        {hit.field === 'annotation' && (
          <span className="flex-none rounded-sm border border-line px-1 text-accent">{t('批注')}</span>
        )}
        <span className="truncate">
          {hit.workspaceTitle || t('收件箱')} / {hit.threadTitle || t('无标题')}
        </span>
        <span className="flex-none">· {formatBlockTime(hit.createdAt)}</span>
      </div>
    </div>
  );
}
