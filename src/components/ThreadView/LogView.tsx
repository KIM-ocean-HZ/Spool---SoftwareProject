import { useLayoutEffect, useRef } from 'react';
import { useThreadDropTarget } from '@/hooks/useThreadDropTarget';
import { useBlocksStore } from '@/stores/blocksStore';
import BlockFeed from './BlockFeed';
import Composer from './Composer';

interface Props {
  threadId: string;
}

export default function LogView({ threadId }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Wires Finder file/folder drops to either an existing block (hit-tested via
  // data-block-id) or a fresh "anchor" block in empty space. See §9.6.
  useThreadDropTarget({ rootRef, threadId });

  // Auto-scroll the feed to the bottom on open (§3.3, §9.3): the newest blocks ARE
  // "where you left off." BlockFeed loads blocks asynchronously, so this fires once
  // the count first goes non-zero; `scrolledThread` keeps it once-per-thread, not on
  // every later append. No cross-session scroll memory — that is the §17 architectural
  // hook, deliberately not built in v2.6.
  const blockCount = useBlocksStore((s) => s.byThread[threadId]?.length ?? 0);
  const scrolledThread = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (scrolledThread.current === threadId || blockCount === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    scrolledThread.current = threadId;
  }, [threadId, blockCount]);

  return (
    <div ref={rootRef} className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <BlockFeed threadId={threadId} />
      </div>
      <Composer threadId={threadId} />
    </div>
  );
}
