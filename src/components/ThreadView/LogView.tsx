import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useThreadDropTarget } from '@/hooks/useThreadDropTarget';
import { scrollBlockIntoView, topmostVisibleBlockId } from '@/lib/blocks/viewportAnchor';
import { isTutorialSource } from '@/lib/db/client';
import {
  getReadPosition,
  resolveLanding,
  saveReadPosition,
  type ReadPosition,
} from '@/lib/db/readPositions';
import { buildHitOffsets } from '@/lib/search/query';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSearchStore } from '@/stores/searchStore';
import InBlockNavigator from '../Search/InBlockNavigator';
import BlockFeed from './BlockFeed';
import Composer from './Composer';
import MergeToolbar from './MergeToolbar';
import ScaleRail from './ScaleRail';

interface Props {
  threadId: string;
}

export default function LogView({ threadId }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Wires Finder file/folder drops to either an existing block (hit-tested via
  // data-block-id) or a fresh "anchor" block in empty space. See §9.6.
  useThreadDropTarget({ rootRef, threadId });

  // Where opening this project lands (§3.3, §9.3). Three answers, in order:
  //
  //   1. Ocean 2026-08-03 — a thread that is still nothing but seeded tutorial blocks opens
  //      at the TOP: a guide is read from its first line, and landing mid-thread skipped the
  //      block that explains what Spool even is.
  //   2. 🆕 V1 (WORKPLAN §2.V1, Ocean 2026-08-25) — otherwise, back to the block the user was
  //      reading when they left, if this project remembers one within 30 days.
  //      ⚠️ The comment that used to sit here said "No cross-session scroll memory — that is
  //      the §17 architectural hook, deliberately not built in v2.6." This IS that hook, and
  //      it is anchored to a block rather than a pixel; see lib/db/readPositions.ts.
  //   3. The bottom — the newest blocks — which is what every project did before, and what a
  //      project with new material in it still does (resolveLanding's rule).
  //
  // BlockFeed loads blocks asynchronously, so this fires once the count first goes non-zero;
  // `scrolledThread` keeps it once-per-thread, not on every later append.
  const threadBlocks = useBlocksStore((s) => s.byThread[threadId]);
  const blockCount = threadBlocks?.length ?? 0;
  const isUntouchedTutorial =
    blockCount > 0 && (threadBlocks ?? []).every((b) => isTutorialSource(b.source));
  const scrolledThread = useRef<string | null>(null);

  // Read the remembered position BEFORE the landing runs, so the feed never lands at the
  // bottom and then visibly jumps. `null` inside the state object means "asked, nothing
  // remembered"; the state being null at all means "still asking".
  const [saved, setSaved] = useState<{
    threadId: string;
    position: ReadPosition | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const position = await getReadPosition(threadId);
        if (!cancelled) setSaved({ threadId, position });
      } catch (e) {
        // A missing position is not worth failing an open over — fall through to the bottom.
        console.warn('[read-position] load failed', e);
        if (!cancelled) setSaved({ threadId, position: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useLayoutEffect(() => {
    if (scrolledThread.current === threadId || blockCount === 0) return;
    // Wait for the remembered position to arrive before choosing where to land.
    if (saved?.threadId !== threadId) return;
    const el = scrollRef.current;
    if (!el) return;
    if (isUntouchedTutorial) {
      el.scrollTop = 0;
    } else {
      const landing = resolveLanding(saved.position, threadBlocks ?? []);
      if (landing.at === 'block') {
        // 'auto': this is the first paint of the project, not a movement to follow.
        scrollBlockIntoView(el, landing.blockId, 'auto');
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    scrolledThread.current = threadId;
  }, [threadId, blockCount, isUntouchedTutorial, saved, threadBlocks]);

  // Save on the way out. LogView is mounted with `key={thread.id}` (ThreadView/index.tsx), so
  // this cleanup running IS "the user left this project" — switching away, or closing it.
  // ⚠️ Refs, not the values themselves: the cleanup must see the LAST state, and a cleanup
  // that closed over the values would re-run on every scroll to stay current.
  const latest = useRef({
    threadId,
    blocks: threadBlocks,
    tutorial: isUntouchedTutorial,
  });
  latest.current = {
    threadId,
    blocks: threadBlocks,
    tutorial: isUntouchedTutorial,
  };
  // ⚠️⚠️ useLayoutEffect, NOT useEffect. On unmount React runs LAYOUT cleanups while the
  // subtree is still in the document, but defers PASSIVE (useEffect) cleanups until after
  // the nodes have been removed. Reading the anchor from a detached container finds no
  // blocks, so with useEffect this would quietly save nothing, every time, forever.
  // ⚠️ And `el` is read here at mount rather than in the cleanup on purpose: React detaches
  // refs during deletion, so `scrollRef.current` can already be null by the time we run.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    return () => {
      const { threadId: id, blocks, tutorial } = latest.current;
      // ⛔ Never for an untouched tutorial: rule 1 above owns that thread's landing, and a
      // remembered position would quietly outrank it on the second open.
      if (tutorial || !blocks || blocks.length === 0) return;
      const anchor = topmostVisibleBlockId(el);
      if (!anchor) return;
      const newest = blocks.reduce((max, b) => Math.max(max, b.createdAt), 0);
      void saveReadPosition(id, anchor, newest).catch((e) =>
        console.warn('[read-position] save failed', e),
      );
    };
  }, []);

  // ⑦（2026-08-27，Ocean:「发完一条自动定位到最底下刚输入的位置」）—— 刚发出去、还没滚过去
  // 的那一块。
  //
  // ⚠️⚠️ **和上面那三条落点规则不打架，因为它根本不走那条路。** 落点规则（教程置顶 / 记住的
  // 位置 / 底部）由 `scrolledThread` 管着，一个项目只跑一次，而且在用户按下 Enter 之前早就
  // 跑完了。这一条是**用户刚做的动作**，Ocean 的规矩是它压过记忆位置 —— 所以它单独走，
  // ⛔ 不要改 resolveLanding，那会让「记住浏览位置」在下一次开这个项目时也跟着变。
  //
  // ⚠️ 为什么要等一个 effect 而不是发完就滚：`append` 返回的时候，那一块才刚进 store，
  // React 还没把它画出来 —— 这时候 `querySelector` 找不到它，滚了个寂寞。
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!pendingScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    if (!(threadBlocks ?? []).some((b) => b.id === pendingScroll)) return;
    if (!el.querySelector(`[data-block-id="${CSS.escape(pendingScroll)}"]`)) return;
    scrollBlockIntoView(el, pendingScroll, 'smooth');
    setPendingScroll(null);
  }, [pendingScroll, threadBlocks]);

  // v2.9 §9.10 / §19.17: the in-block find bar lives at the top of this thread
  // whenever a search result has landed on one of its blocks. Mounting it here
  // (above the scrollable feed) keeps it visible and at a readable size as the
  // user pages through matches, the way vscode's find widget does.
  const navBlockId = useSearchStore((s) => s.activeNavigationBlockId);
  const navHits = useSearchStore((s) => s.activeHits);
  const navHitIndex = useSearchStore((s) => s.activeHitIndex);
  const navQuery = useSearchStore((s) => s.activeQuery);
  const navResults = useSearchStore((s) => s.navResults);
  const showNavBar =
    navBlockId !== null && (threadBlocks?.some((b) => b.id === navBlockId) ?? false);

  return (
    <div ref={rootRef} className="relative flex flex-1 flex-col overflow-hidden">
      {/* ⭐ 2026-08-25 (Ocean, V3 验收) — where the block editor is drawn.
          His two corrections to the first version:
          「背景不要变暗了,直接让编辑窗口直接填满整个背景,让背景窗口成为一个 block 的工作区」
          and「编辑窗口不是固定的,用户需要下滑才能找到,改成固定的」.
          ⇒ ⛔ the dim is GONE (it was `bg-ink/25` here) and the panel is opaque and fills
          this whole pane instead: while you are editing, the thread pane IS that block.
          ⇒ Fixed, because it hangs off the PANE and not off the block — the feed can be
          scrolled to wherever, the editor is still exactly here.
          ⚠️ The left rail is outside this pane and stays untouched, which is still what
          keeps this a workspace and not a modal dialog.
          ⚠️ BlockItem portals into this node rather than LogView owning the editor state:
          the drafts, the `==` highlight path and the correction flow are all wired to the
          block, and moving them up here would have been a rewrite of all three.
          `pointer-events-none` so an empty host never eats a click meant for the feed; the
          panel inside sets `pointer-events-auto`. */}
      <div data-block-editor-host className="pointer-events-none absolute inset-0 z-30" />
      {showNavBar && (
        <InBlockNavigator
          query={navQuery}
          index={navHitIndex}
          total={navHits.length}
          results={navResults}
          currentBlockId={navBlockId}
          threadId={threadId}
          onPickResult={(blockId) => useSearchStore.getState().jumpToResult(blockId)}
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
      {/* `relative` is what the V2 ③ scale rail positions against — it must be the SCROLL
          VIEWPORT, not the feed content inside it, or the rail would scroll away with the
          blocks instead of standing still beside them. */}
      {/* ⚠️⚠️ This wrapper exists for ONE reason: it is a `relative` box that does NOT
          scroll, which is the only correct anchor for the scale rail. The rail used to live
          inside the scroll container below, where `absolute inset-y-0` resolves against the
          scrolled CONTENT — so it scrolled away with the feed and Ocean could only see it at
          the very top (「刻度条根本调不出来,只有划到最顶部才能看到」). Same trap the editor
          dim hit earlier in this batch. ⛔ Do not move ScaleRail back inside. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="no-native-scrollbar flex-1 overflow-y-auto">
          {/* scrollRef is forwarded so BlockFeed's §20.1 drag-marquee selection can
            auto-scroll near the top/bottom edges and resolve block positions against
            the same scroll container. */}
          <BlockFeed threadId={threadId} scrollRef={scrollRef} />
          {/* §20.1 merge toolbar — sticky bottom of the scroll area, only appears when
            ≥1 block is selected (component returns null otherwise). threadId is the
            forward source, excluded from the "复制到…" picker. */}
          <MergeToolbar threadId={threadId} />
        </div>
        {/* V2 ③: one tick per block down the right edge, the current one lit. Sibling of the
          scroll container, not a child — see the wrapper's comment. */}
        <ScaleRail scrollRef={scrollRef} revision={blockCount} threadId={threadId} />
      </div>
      <Composer threadId={threadId} onSubmitted={setPendingScroll} />
    </div>
  );
}
