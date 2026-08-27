import { Fragment, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { formatAccelerator } from '@/lib/capture/shortcut';
import type { Block } from '@/lib/db/blocks';
import { foldedCorrectionIds } from '@/lib/pack/assemble';
import {
  mountedBlockIds,
  scrollBlockIntoView,
  stepBlockIndex,
  topmostVisibleBlockId,
} from '@/lib/blocks/viewportAnchor';
import { useActiveBlockStore } from '@/stores/activeBlockStore';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useDropStore } from '@/stores/dropStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { IS_MAC } from '@/lib/platform';
import { useSearchStore } from '@/stores/searchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import BlockItem from './BlockItem';
import DateNotices from './DateNotices';
import { dateLocale, useT } from '@/lib/i18n';

// Tail-window cap for large threads (PLAN_EN.md §15 / Phase 12 — "enable virtual
// scrolling when blocks > 200"). Below the cap we render the whole feed unchanged;
// at or above we keep only the most recent WINDOW_SIZE blocks mounted and expose a
// "show earlier" affordance that grows the window in chunks. Trade-off: real
// row-virtualization would need height tracking that fights smart-truncation and
// date dividers; this pagination preserves the existing renderer while keeping the
// DOM bounded for the long-thread case the budget actually targets.
const WINDOW_SIZE = 200;

interface Props {
  threadId: string;
  // Forwarded from LogView so the §20.1 drag-marquee can auto-scroll the same container
  // and resolve block-element positions against the correct scroll origin.
  scrollRef: RefObject<HTMLDivElement | null>;
}

// v2.8 §20.1 drag-marquee constants.
// Edge-trigger band for auto-scroll while dragging near the top/bottom of the feed.
const MARQUEE_SCROLL_EDGE = 40;
// Pixels per animation frame while auto-scrolling — tuned so a long sweep feels
// continuous without being so fast the user overshoots the target block.
const MARQUEE_SCROLL_SPEED = 14;
// Bounding-box intersection — viewport coords for both rects.
const intersectsRect = (
  a: { left: number; right: number; top: number; bottom: number },
  b: DOMRect,
): boolean =>
  !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom);

// Module-level sentinel: a fresh `[]` inside the selector would change identity every
// render and trip React's useSyncExternalStore "snapshot is unstable" guard — the same
// trap that produced the Phase 3 "Maximum update depth exceeded" loop.
const EMPTY: readonly Block[] = [];

// ⛔ 2026-08-22（Ocean：「把项目中的 block 排序按钮删除，只能按时间顺序，这个按钮从来没用过，
// 但是占位置了」）：这里原来有一个「按来源分组」的排序模式和一个切换它的图标。整条撤掉 ——
// feed 永远是时间顺序（`blocks` 从库里出来就是 created_at ASC）。
// ⚠️ 跟着撤掉的还有日期分隔线上那个 `sortMode === 'time'` 判断：现在恒真。

// Two timestamps fall on the same local calendar day.
const isSameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

// "5月17日 周六" — the calendar date plus a short weekday, for divider labels.
const formatDayLabel = (ts: number): string => {
  const d = new Date(ts);
  const md = d.toLocaleDateString(dateLocale(), { month: 'numeric', day: 'numeric' });
  const wd = d.toLocaleDateString(dateLocale(), { weekday: 'short' });
  return `${md} ${wd}`;
};

// A thin 1px rule with the calendar date centred on it (PLAN_EN.md §9.3) — the
// dominant scanning aid for long threads.
function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[10px] text-muted">{formatDayLabel(ts)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function BlockFeed({ threadId, scrollRef }: Props) {
  const t = useT();
  const load = useBlocksStore((s) => s.load);
  const togglePin = useBlocksStore((s) => s.togglePin);
  const remove = useBlocksStore((s) => s.remove);
  const blocks = useBlocksStore((s) => s.byThread[threadId] ?? EMPTY);
  const overEmpty = useDropStore((s) => s.overThread);
  const highlightBlockId = useSearchStore((s) => s.highlightBlockId);
  // 拍板点 2/5: the empty state forks on the capture grant, and the capture that takes a
  // new user to three gets a one-time line under it.
  const inputMonitoring = usePermissionStore((s) => s.inputMonitoring);
  // Only read for the empty state's copy — off macOS it is the capture trigger itself.
  const captureShortcut = useSettingsStore((s) => s.captureShortcut);
  // V2 ④: one-time reading-gesture line. Armed only by a first launch (App.tsx).
  const blockNavHint = useSettingsStore((s) => s.blockNavHintPending);
  const packHintBlockId = useCaptureStore((s) => s.packHintBlockId);
  // v2.8 §20.1 selection state. Anchor id drives shift-click range selection.
  const selectedBlockIds = useBlocksStore((s) => s.selectedBlockIds);
  const toggleSelect = useBlocksStore((s) => s.toggleSelect);
  const selectMany = useBlocksStore((s) => s.selectMany);
  const setSelection = useBlocksStore((s) => s.setSelection);
  const clearSelection = useBlocksStore((s) => s.clearSelection);
  const selectionAnchor = useRef<string | null>(null);

  // v2.8 §20.1 drag-marquee state. The visible rectangle's two corners are kept here
  // in viewport coords (for cheap rendering); the TRUE origin lives in
  // `marqueeOriginContent` as scroll-container content coords (mouseDown clientY +
  // scrollTop at that instant). Each frame the visible anchor is recomputed as
  // `originContent - currentScrollTop`, so when the feed auto-scrolls the rectangle
  // extends past the top of the viewport instead of staying pinned to the mouseDown
  // viewport Y — without this, blocks at the top scrolled out of the rectangle and
  // got dropped from the per-frame recomputed selection.
  const [marquee, setMarquee] = useState<{
    anchorX: number;
    anchorY: number;
    cursorX: number;
    cursorY: number;
  } | null>(null);
  // Drag origin in scroll-container content coords (invariant for the duration of a
  // drag). Held as a ref so updates don't trigger re-renders.
  const marqueeOriginContent = useRef<{ x: number; y: number } | null>(null);
  // Latest cursor position in viewport coords — refreshed by mousemove inside the
  // active-drag effect; refs because the rAF loop reads it every frame.
  const marqueeCursor = useRef<{ x: number; y: number } | null>(null);
  // Snapshot of the selection at drag start. Each frame the new selection is computed as
  // baseline ∪ (blocks the rectangle currently intersects), so dragging into and back out
  // of a block doesn't leave it stuck selected.
  const marqueeBaseline = useRef<Set<string>>(new Set());

  // Selection is per-thread implicitly — clear it on thread switch so a stale set from
  // the previous feed can't accidentally include blocks the user can no longer see.
  useEffect(() => {
    clearSelection();
    selectionAnchor.current = null;
  }, [threadId, clearSelection]);

  // Tail-window size for this thread. Reset on thread switch so a previously expanded
  // history doesn't carry into a different (possibly tiny) thread.
  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  useEffect(() => {
    setWindowSize(WINDOW_SIZE);
  }, [threadId]);

  useEffect(() => {
    void load(threadId);
  }, [threadId, load]);

  const ordered = useMemo(() => {
    // 2026-08-19: a correction the reader opens from the marked sentence is drawn under that
    // sentence (CorrectionNote), so it must not ALSO get a card here — that duplicate is
    // what Ocean read as 「多条重复信息」 the first time MCP corrected three blocks at once.
    // ⚠️ 搜索落点是例外：「跳到命中处」必须落得下去。
    const folded = foldedCorrectionIds(blocks);
    const shown =
      folded.size === 0
        ? blocks
        : blocks.filter((b) => !folded.has(b.id) || b.id === highlightBlockId);
    return shown;
  }, [blocks, highlightBlockId]);

  // If a search result targets a block outside the current tail window, widen so it's
  // mounted before the scrollIntoView below runs. Runs before the highlight effect so
  // the DOM lookup hits a rendered node, not a virtualized one.
  useEffect(() => {
    if (!highlightBlockId) return;
    const idx = ordered.findIndex((b) => b.id === highlightBlockId);
    if (idx === -1) return;
    const minWindow = ordered.length - idx;
    if (minWindow > windowSize) setWindowSize(minWindow);
  }, [highlightBlockId, ordered, windowSize]);

  // After a search result navigates here, scroll the target block into view. The
  // effect re-runs once `blocks` has loaded for the newly-selected thread; BlockItem
  // applies the flash highlight off the same store field.
  useEffect(() => {
    if (!highlightBlockId) return;
    if (!blocks.some((b) => b.id === highlightBlockId)) return;
    const el = document.querySelector(`[data-block-id="${highlightBlockId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightBlockId, blocks, windowSize]);

  // ⭐ V2 ② (WORKPLAN §2.V2, Ocean 2026-08-25: 「这个一定要加」): ↓ / ↑ move the focus one
  // block down / up. ↑ is not in his words — the workplan asks for it because a feed you can
  // only walk one direction through is a half-built control.
  //
  // The landing looks exactly like clicking a block does (`setActive` → the §19.18 tint), so
  // there is no second "focused" visual to learn.
  //
  // ⚠️ The cursor cannot BE `activeBlockId`: that store fades itself to null after 3s
  // (activeBlockStore FADE_MS — it is a tint, not a cursor). Read as the cursor, ↓ would
  // silently restart from the top of the feed whenever the user paused for three seconds.
  // So the position is kept here, and refreshed from the store whenever something else sets
  // it — which is what makes ↓ continue from a block the user just clicked.
  const cursorRef = useRef<string | null>(null);
  const activeBlockId = useActiveBlockStore((s) => s.activeBlockId);
  useEffect(() => {
    if (activeBlockId) cursorRef.current = activeBlockId;
  }, [activeBlockId]);
  useEffect(() => {
    cursorRef.current = null;
  }, [threadId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      // ⚠️ Modifier-held arrows belong to the OS and to text editing (⌥↓ / ⇧↓ extend a
      // selection), never to us.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // ⚠️ Typing beats navigating, always: in the composer, a block's content or annotation
      // editor, the capture note box or any search field, ↓ moves the caret.
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      // ⚠️ Already-spoken-for arrows: ThreadPicker's list and Composer's @-mention candidates
      // both preventDefault on ArrowDown (ThreadPicker.tsx / Composer.tsx). React dispatches
      // its synthetic handlers at the root container, i.e. BEFORE this window-level bubble
      // listener, so by the time we run their claim is already visible here.
      if (e.defaultPrevented) return;
      // ⚠️ A modal owns the keyboard while it is up — otherwise ↓ scrolls the feed behind
      // Settings / the pack dialog / the review panel. Every one of them is a `fixed inset-0`
      // layer, which is the only thing they have in common to test for.
      if (document.activeElement?.closest('.fixed.inset-0')) return;

      const container = scrollRef.current;
      const ids = mountedBlockIds(container);
      if (ids.length === 0) return;

      // No cursor yet (fresh thread, or the user has only scrolled): start from what they are
      // looking at, not from the top of a 200-block feed.
      const from = cursorRef.current ?? topmostVisibleBlockId(container);
      const nextId = stepBlockIndex(ids, from, e.key === 'ArrowDown' ? 1 : -1);
      if (!nextId) return;

      e.preventDefault();
      cursorRef.current = nextId;
      useActiveBlockStore.getState().setActive(nextId);
      scrollBlockIntoView(container, nextId);
      // V2 ④: the hint has done its job the moment the gesture is used.
      if (useSettingsStore.getState().blockNavHintPending) {
        void useSettingsStore.getState().update({ blockNavHintPending: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollRef]);

  // v2.8 §20.1 drag-marquee: mouseDown on empty feed space (no block, no button, no
  // textarea …) starts a rubber-band selection like Finder. Modifier-held mouseDown is
  // skipped so shift/cmd-click on a checkbox keeps its own meaning. Origin is captured
  // in CONTENT coordinates (clientY + current scrollTop), not viewport coords — so the
  // rectangle keeps stretching from the original mouseDown point as the feed
  // auto-scrolls, instead of collapsing back into the visible window.
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[data-block-id], button, textarea, input, a, select, label, [contenteditable]',
      )
    ) {
      return;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    marqueeOriginContent.current = {
      x: e.clientX + scrollEl.scrollLeft,
      y: e.clientY + scrollEl.scrollTop,
    };
    marqueeCursor.current = { x: e.clientX, y: e.clientY };
    marqueeBaseline.current = new Set(useBlocksStore.getState().selectedBlockIds);
    setMarquee({
      anchorX: e.clientX,
      anchorY: e.clientY,
      cursorX: e.clientX,
      cursorY: e.clientY,
    });
    // Wipe any browser text selection that might have started on the empty-space click;
    // preventDefault on a non-focusable div also keeps a new selection from forming.
    window.getSelection()?.removeAllRanges();
    e.preventDefault();
  };

  // While a marquee drag is active: track cursor, auto-scroll near edges, recompute the
  // selection from rectangle ∩ block bounding rects. Esc reverts to the pre-drag baseline.
  // Effect re-runs only when a drag opens (null → state) or closes (state → null); the
  // rAF loop reads the live cursor + scroll from refs, so per-frame updates skip React.
  const marqueeActive = marquee !== null;
  useEffect(() => {
    if (!marqueeActive) return;
    let rafId = 0;
    let dirty = true; // ensure at least one recompute fires after mouseDown

    // Compute current rectangle in viewport coords from refs + live scroll. Used by
    // both the selection recompute and the visible-rectangle state push.
    const currentRect = (): { left: number; right: number; top: number; bottom: number } | null => {
      const scrollEl = scrollRef.current;
      const origin = marqueeOriginContent.current;
      const cursor = marqueeCursor.current;
      if (!scrollEl || !origin || !cursor) return null;
      const anchorX = origin.x - scrollEl.scrollLeft;
      const anchorY = origin.y - scrollEl.scrollTop;
      return {
        left: Math.min(anchorX, cursor.x),
        right: Math.max(anchorX, cursor.x),
        top: Math.min(anchorY, cursor.y),
        bottom: Math.max(anchorY, cursor.y),
      };
    };

    const recompute = (): void => {
      const rect = currentRect();
      if (!rect) return;
      const next = new Set(marqueeBaseline.current);
      document.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        if (intersectsRect(rect, el.getBoundingClientRect())) {
          const id = el.dataset.blockId;
          if (id) next.add(id);
        }
      });
      setSelection(next);
    };

    const pushVisualState = (): void => {
      const scrollEl = scrollRef.current;
      const origin = marqueeOriginContent.current;
      const cursor = marqueeCursor.current;
      if (!scrollEl || !origin || !cursor) return;
      const anchorX = origin.x - scrollEl.scrollLeft;
      const anchorY = origin.y - scrollEl.scrollTop;
      setMarquee((m) => {
        if (!m) return null;
        if (
          m.anchorX === anchorX &&
          m.anchorY === anchorY &&
          m.cursorX === cursor.x &&
          m.cursorY === cursor.y
        ) {
          return m;
        }
        return { anchorX, anchorY, cursorX: cursor.x, cursorY: cursor.y };
      });
    };

    const tick = (): void => {
      const scrollEl = scrollRef.current;
      const cursor = marqueeCursor.current;
      if (scrollEl && cursor) {
        const r = scrollEl.getBoundingClientRect();
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (cursor.y < r.top + MARQUEE_SCROLL_EDGE && scrollEl.scrollTop > 0) {
          scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - MARQUEE_SCROLL_SPEED);
          dirty = true;
        } else if (cursor.y > r.bottom - MARQUEE_SCROLL_EDGE && scrollEl.scrollTop < maxScroll) {
          scrollEl.scrollTop = Math.min(
            maxScroll,
            scrollEl.scrollTop + MARQUEE_SCROLL_SPEED,
          );
          dirty = true;
        }
      }
      if (dirty) {
        recompute();
        pushVisualState();
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent): void => {
      marqueeCursor.current = { x: e.clientX, y: e.clientY };
      dirty = true;
    };
    const onUp = (): void => {
      marqueeOriginContent.current = null;
      marqueeCursor.current = null;
      setMarquee(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Revert any additions this drag made; keep the pre-drag selection intact.
      setSelection(marqueeBaseline.current);
      marqueeOriginContent.current = null;
      marqueeCursor.current = null;
      setMarquee(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
    };
  }, [marqueeActive, setSelection, scrollRef]);

  // Range-select between the anchor and the just-clicked block, using current feed
  // order (whichever sort mode is active). Plain click sets the anchor; shift-click
  // extends to it. Re-clicking the anchor with shift collapses to a single toggle.
  const handleSelectClick = (id: string, shiftKey: boolean): void => {
    if (shiftKey && selectionAnchor.current && selectionAnchor.current !== id) {
      const ids = ordered.map((b) => b.id);
      const a = ids.indexOf(selectionAnchor.current);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        selectMany(ids.slice(lo, hi + 1));
        return;
      }
    }
    toggleSelect(id);
    selectionAnchor.current = id;
  };

  const anySelected = selectedBlockIds.size > 0;

  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12">
        {overEmpty ? (
          <p className="rounded-md border-2 border-dashed border-accent bg-accent/5 px-8 py-10 text-center text-sm font-ui text-accent">
            {/* 同上：空项目里松手一样是「加文件」，⛔ 不是「新建第一个块」。 */}
            {t('松开，把文件加进这个项目')}
          </p>
        ) : (
          <div className="text-center">
            {/* 任务三 #6: layered empty state — one primary gesture, the alternatives
                one size down so the blank thread reads calm, not instructional.
                2026-08-02 (DESIGN_FIRST_RUN 拍板点 2): without the Input Monitoring
                grant, double-tapping ⌥ in another app does nothing at all — so that
                state gets the draft box, the one path that needs no permission.
                Never send the user after a gesture that cannot work yet. */}
            {/* Off macOS the same rule applies with a different missing piece: the
                gesture does not exist, so what stands in for "permission not granted
                yet" is "no shortcut chosen yet" — and until one is, this screen must
                not name a chord. Once bound it prints THAT chord, read from settings,
                rather than a key the copy happens to remember. */}
            {inputMonitoring === false || (!IS_MAC && !captureShortcut) ? (
              <>
                <p className="text-sm italic text-muted">
                  {t('先在下面写一条试试——打字、按 Enter 就存下来了，不需要任何权限。')}
                </p>
                <p className="mt-2 text-xs italic text-muted/70">
                  {IS_MAC
                    ? t('想在别的 app 里复制就能存？那一步需要打开输入监听权限。')
                    : t('想在别的 app 里复制就能存？在设置里给捕捉定一个快捷键。')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm italic text-muted">
                  {IS_MAC ? t('⌘C 复制后双击') : t('复制之后按')}{' '}
                  <kbd className="rounded border border-line-strong bg-paper px-1 font-mono text-[10px] not-italic">
                    {IS_MAC ? '⌥' : formatAccelerator(captureShortcut!)}
                  </kbd>{' '}
                  {t('捕捉第一条信息')}
                </p>
                <p className="mt-2 text-xs italic text-muted/70">
                  {t('捕捉后可以顺手留一句想法；或在下方直接写。')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Tail window: keep only the most recent `windowSize` blocks mounted once the feed
  // grows past WINDOW_SIZE. Older blocks stay one click away via the "show earlier"
  // button below. visible/hiddenCount drive both the slice and the divider/index math.
  const hiddenCount = Math.max(0, ordered.length - windowSize);
  const visible = hiddenCount > 0 ? ordered.slice(hiddenCount) : ordered;

  return (
    <div onMouseDown={handleMouseDown} className="px-6 py-3">
      {/* ⛔ 2026-08-23（Ocean 真手指验收第 1 条：「工作区『只看我写的』筛选按钮去掉」）：
          这一行原来右边还挂着一个笔形图标，点一下只留下自己写的块。整条撤掉 ——
          和排序按钮同一个理由：占着位置，从来没被用过。
          ⚠️ 留下来的只有日期提示，它仍然住在滚动容器里面（Ocean:「不要固定在顶部，
          需要可以跟随 blocks 滑动」）—— 挪到上一层就会卡在滚动区外面。 */}
      <div className="mb-2 flex items-start gap-2">
        <DateNotices threadId={threadId} blocks={blocks} />
      </div>
      {/* V2 ④ (Ocean 2026-08-25:「在用户首装时教学一下」). One line, once in a library's
          lifetime, at the top of the first feed a new user opens — the tutorial thread, which
          is what App.tsx lands a first launch on.
          ⛔ NOT a floating hint window: Ocean's redline on V2 is 「不做悬浮窗 —— 不希望破坏
          安静的特性」. This sits in the feed and scrolls away with it, the same shape as the
          one-time pack line further down.
          ⚠️ It is deliberately NOT a seeded tutorial block, which is where 教学 normally
          lives in this app (client.ts TUTORIAL): appending a 7th block to that thread would
          make retranslateTutorial's byte-for-byte matcher fail to pair up every EXISTING
          install's 6 rows, silently killing the tutorial's language switch for everyone who
          already installed Spool. */}
      {blockNavHint && (
        <div className="mb-2 flex items-start gap-2 px-3 text-xs italic text-muted">
          <p className="flex-1">{t('块是整条展开的。按 ↓ / ↑ 可以一块一块地看,右边那列刻度是你在第几块。')}</p>
          <button
            type="button"
            onClick={() => void useSettingsStore.getState().update({ blockNavHintPending: false })}
            className="not-italic text-muted/70 transition-colors hover:text-accent"
            title={t('知道了')}
          >
            ✕
          </button>
        </div>
      )}
      {hiddenCount > 0 && (
        <div className="mb-2 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setWindowSize((n) => n + WINDOW_SIZE)}
            className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {t('查看更早的 {n} 条', { n: hiddenCount })}
          </button>
        </div>
      )}
      <div className="space-y-1 [&_article+article]:border-t [&_article+article]:border-line/40">
        {visible.map((b, i) => {
          // Date divider above any block that opens a new calendar day — the first
          // visible block always gets one. The previous-day comparison uses the full
          // `ordered` array via the absolute index so the boundary stays correct
          // across the tail-window cut.
          const absIdx = hiddenCount + i;
          const showDivider = i === 0 || !isSameDay(ordered[absIdx - 1]!.createdAt, b.createdAt);
          return (
            <Fragment key={b.id}>
              {showDivider && <DateDivider ts={b.createdAt} />}
              <BlockItem
                block={b}
                highlight={b.id === highlightBlockId}
                selected={selectedBlockIds.has(b.id)}
                anySelected={anySelected}
                onSelectClick={(shiftKey) => handleSelectClick(b.id, shiftKey)}
                onTogglePin={() => void togglePin(b.id)}
                onDelete={() => void remove(b.id)}
              />
              {/* 拍板点 5 / 首日价值 §4.5: one line, once, under the block that took the
                  user to three captures — the point at which 「打个包试试」 is something
                  they can do now rather than remember for later. */}
              {b.id === packHintBlockId && (
                <p className="px-3 pb-1 pt-0.5 text-xs italic text-muted">
                  {t('现在够打一个包了 —— 按 ⌘⇧P 打包，粘给任何 AI 试试。')}
                </p>
              )}
            </Fragment>
          );
        })}
        {/* 拖文件进来时落在哪儿。⚠️⚠️ 2026-08-27 改了这句话，因为**它说的不是真的**：
            写着「新建一个块」，而 v15（DESIGN_PROJECT_FILES）之后从访达拖进来的文件
            是加进**这个项目的文件清单**的，一个块都不会新建（useThreadDropTarget 顶上
            那段说明写着旧行为「已经没有了」，这句文案是那次改动漏下的）。
            ⇒ 现在它说的就是松手之后真会发生的事。Ocean 2026-08-27 选的就是这一条
            （「改成说实话」）。 */}
        {overEmpty && (
          <div className="flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent/5 px-3.5 py-5 font-ui text-[12px] text-accent">
            {t('松开，把文件加进这个项目')}
          </div>
        )}
      </div>
      {/* §20.1 drag-marquee rectangle. Fixed position so it lives in viewport coords
          and isn't clipped by the scroll container; pointer-events:none so it never
          steals events from the blocks beneath. The anchor is recomputed each frame
          as (origin-in-content − current scrollTop), so during auto-scroll the
          rectangle's top extends past the visible viewport (off-screen, clipped)
          rather than collapsing — that's what keeps previously-selected blocks at
          the top of the sweep inside the per-frame recomputed selection. */}
      {marquee && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm border border-accent/70 bg-accent/10"
          style={{
            left: Math.min(marquee.anchorX, marquee.cursorX),
            top: Math.min(marquee.anchorY, marquee.cursorY),
            width: Math.abs(marquee.cursorX - marquee.anchorX),
            height: Math.abs(marquee.cursorY - marquee.anchorY),
          }}
        />
      )}
    </div>
  );
}
