import { useEffect, useMemo, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import { useSearchStore } from '@/stores/searchStore';
import BlockItem from './BlockItem';

interface Props {
  threadId: string;
}

// Module-level sentinel: a fresh `[]` inside the selector would change identity every
// render and trip React's useSyncExternalStore "snapshot is unstable" guard — the same
// trap that produced the Phase 3 "Maximum update depth exceeded" loop.
const EMPTY: readonly Block[] = [];
const EMPTY_ATTACHMENTS: readonly Attachment[] = [];

type SortMode = 'time' | 'source';

// Source-grouped order: blocks sharing a source sit together (sources ordered
// alphabetically), no-source blocks last; within a group chronological order is kept.
// `blocks` already arrives created_at ASC so the within-group order comes for free.
const sortBlocks = (blocks: readonly Block[], mode: SortMode): readonly Block[] => {
  if (mode === 'time') return blocks;
  return [...blocks].sort((a, b) => {
    const sa = (a.source ?? '').trim();
    const sb = (b.source ?? '').trim();
    if (sa === sb) return a.createdAt - b.createdAt;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb);
  });
};

export default function BlockFeed({ threadId }: Props) {
  const load = useBlocksStore((s) => s.load);
  const togglePin = useBlocksStore((s) => s.togglePin);
  const remove = useBlocksStore((s) => s.remove);
  const blocks = useBlocksStore((s) => s.byThread[threadId] ?? EMPTY);
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);
  const overEmpty = useDropStore((s) => s.overEmpty);
  const highlightBlockId = useSearchStore((s) => s.highlightBlockId);

  const [sortMode, setSortMode] = useState<SortMode>('time');

  useEffect(() => {
    void load(threadId);
  }, [threadId, load]);

  // After a search result navigates here, scroll the target block into view. The
  // effect re-runs once `blocks` has loaded for the newly-selected thread; BlockItem
  // applies the flash highlight off the same store field.
  useEffect(() => {
    if (!highlightBlockId) return;
    if (!blocks.some((b) => b.id === highlightBlockId)) return;
    const el = document.querySelector(`[data-block-id="${highlightBlockId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightBlockId, blocks]);

  const ordered = useMemo(() => sortBlocks(blocks, sortMode), [blocks, sortMode]);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12">
        {overEmpty ? (
          <p className="rounded-md border-2 border-dashed border-accent bg-accent/5 px-8 py-10 text-center text-sm font-ui text-accent">
            松开以新建第一个块
          </p>
        ) : (
          <p className="text-center text-sm italic text-muted">
            双击{' '}
            <kbd className="rounded border border-line-strong bg-paper px-1 font-mono text-[10px] not-italic">
              ⌥
            </kbd>{' '}
            捕捉第一条信息，或在下方直接写。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-3">
      <div className="mb-2 flex items-center justify-end gap-0.5 text-[11px]">
        <span className="mr-1 text-muted">排序</span>
        {(['time', 'source'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSortMode(m)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${
              sortMode === m
                ? 'border-accent text-accent'
                : 'border-line text-muted hover:border-line-strong'
            }`}
          >
            {m === 'time' ? '按时间' : '按来源'}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {ordered.map((b) => (
          <BlockItem
            key={b.id}
            block={b}
            attachments={attachmentsByBlock[b.id] ?? EMPTY_ATTACHMENTS}
            highlight={b.id === highlightBlockId}
            onTogglePin={() => void togglePin(b.id)}
            onCopy={() => handleCopy(b.content)}
            onDelete={() => void remove(b.id)}
          />
        ))}
        {/* Explicit drop zone: when a Finder drag is over empty timeline space (not
            over a block), this names the outcome — a new block — instead of leaving
            the user guessing. */}
        {overEmpty && (
          <div className="flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent/5 px-3.5 py-5 font-ui text-[12px] text-accent">
            松开以新建一个块
          </div>
        )}
      </div>
    </div>
  );
}
