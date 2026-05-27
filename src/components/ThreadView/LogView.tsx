import { useLayoutEffect, useRef } from 'react';
import { useThreadDropTarget } from '@/hooks/useThreadDropTarget';
import { buildHitOffsets } from '@/lib/search/query';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSearchStore } from '@/stores/searchStore';
import InBlockNavigator from '../Search/InBlockNavigator';
import BlockFeed from './BlockFeed';
import Composer from './Composer';
import MergeToolbar from './MergeToolbar';

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

  // v2.9 §9.10 / §19.17: the in-block find bar lives at the top of this thread
  // whenever a search result has landed on one of its blocks. Mounting it here
  // (above the scrollable feed) keeps it visible and at a readable size as the
  // user pages through matches, the way vscode's find widget does.
  const navBlockId = useSearchStore((s) => s.activeNavigationBlockId);
  const navHits = useSearchStore((s) => s.activeHits);
  const navHitIndex = useSearchStore((s) => s.activeHitIndex);
  const navQuery = useSearchStore((s) => s.activeQuery);
  const threadBlocks = useBlocksStore((s) => s.byThread[threadId]);
  const showNavBar =
    navBlockId !== null && (threadBlocks?.some((b) => b.id === navBlockId) ?? false);

  return (
    <div ref={rootRef} className="flex flex-1 flex-col overflow-hidden">
      {showNavBar && (
        <InBlockNavigator
          query={navQuery}
          index={navHitIndex}
          total={navHits.length}
          onQueryChange={(next) => {
            // Live in-block re-search: recompute hit positions on the
            // destination block as the user types. Falls through to the
            // store's setNavigationQuery which also resets index + bumps
            // flashTick so BlockItem re-scrolls to the new active hit.
            const target = threadBlocks?.find((b) => b.id === navBlockId);
            const hits = target ? buildHitOffsets(target.content, target.annotation, next) : [];
            useSearchStore.getState().setNavigationQuery(next, hits);
          }}
          onPrev={() => useSearchStore.getState().prevHit()}
          onNext={() => useSearchStore.getState().nextHit()}
          onDismiss={() => useSearchStore.getState().clearNavigation()}
        />
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* scrollRef is forwarded so BlockFeed's §20.1 drag-marquee selection can
            auto-scroll near the top/bottom edges and resolve block positions against
            the same scroll container. */}
        <BlockFeed threadId={threadId} scrollRef={scrollRef} />
        {/* §20.1 merge toolbar — sticky bottom of the scroll area, only appears when
            ≥1 block is selected (component returns null otherwise). */}
        <MergeToolbar />
      </div>
      <Composer threadId={threadId} />
    </div>
  );
}
