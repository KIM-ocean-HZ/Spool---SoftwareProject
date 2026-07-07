import { Fragment, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import { useSearchStore } from '@/stores/searchStore';
import BlockItem from './BlockItem';
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
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);
  const overEmpty = useDropStore((s) => s.overEmpty);
  const highlightBlockId = useSearchStore((s) => s.highlightBlockId);
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

  const [sortMode, setSortMode] = useState<SortMode>('time');
  // Tail-window size for this thread. Reset on thread switch so a previously expanded
  // history doesn't carry into a different (possibly tiny) thread.
  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  useEffect(() => {
    setWindowSize(WINDOW_SIZE);
  }, [threadId]);

  useEffect(() => {
    void load(threadId);
  }, [threadId, load]);

  const ordered = useMemo(() => sortBlocks(blocks, sortMode), [blocks, sortMode]);

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

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

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
            {t('松开以新建第一个块')}
          </p>
        ) : (
          <p className="text-center text-sm italic text-muted">
            {t('双击')}{' '}
            <kbd className="rounded border border-line-strong bg-paper px-1 font-mono text-[10px] not-italic">
              ⌥
            </kbd>{' '}
            {t('捕捉第一条信息，或在下方直接写。')}
          </p>
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
      <div className="mb-2 flex items-center justify-end gap-0.5 text-[11px]">
        <span className="mr-1 text-muted">{t('排序')}</span>
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
            {m === 'time' ? t('按时间') : t('按来源')}
          </button>
        ))}
      </div>
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
      <div className="space-y-2">
        {visible.map((b, i) => {
          // Date divider above any block that opens a new calendar day — the first
          // visible block always gets one. Skipped in "by source" mode, where the feed
          // is not time-ordered (§9.3). The previous-day comparison uses the full
          // `ordered` array via the absolute index so the boundary stays correct
          // across the tail-window cut.
          const absIdx = hiddenCount + i;
          const showDivider =
            sortMode === 'time' &&
            (i === 0 || !isSameDay(ordered[absIdx - 1]!.createdAt, b.createdAt));
          return (
            <Fragment key={b.id}>
              {showDivider && <DateDivider ts={b.createdAt} />}
              <BlockItem
                block={b}
                attachments={attachmentsByBlock[b.id] ?? EMPTY_ATTACHMENTS}
                highlight={b.id === highlightBlockId}
                selected={selectedBlockIds.has(b.id)}
                anySelected={anySelected}
                onSelectClick={(shiftKey) => handleSelectClick(b.id, shiftKey)}
                onTogglePin={() => void togglePin(b.id)}
                onCopy={() => handleCopy(b.content)}
                onDelete={() => void remove(b.id)}
              />
            </Fragment>
          );
        })}
        {/* Explicit drop zone: when a Finder drag is over empty timeline space (not
            over a block), this names the outcome — a new block — instead of leaving
            the user guessing. */}
        {overEmpty && (
          <div className="flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent/5 px-3.5 py-5 font-ui text-[12px] text-accent">
            {t('松开以新建一个块')}
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
