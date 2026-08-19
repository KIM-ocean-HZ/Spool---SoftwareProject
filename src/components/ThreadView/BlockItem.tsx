import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { ContentRuns } from '@/lib/blocks/contentRuns';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { isHighlightable, rangeIsHighlighted, toggleHighlightRange } from '@/lib/blocks/highlight';
import { hasSegmentAnnotations } from '@/lib/blocks/segments';
import { rawRangeFromSelection } from '@/lib/blocks/selectionRange';
import { SegmentedContent } from '@/lib/blocks/SegmentedContent';
import type { Block } from '@/lib/db/blocks';
import { correctionsBySource, type Correction } from '@/lib/pack/assemble';
import type { HitOffset } from '@/lib/search/query';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import { formatBlockTime } from '@/lib/utils/time';
import { useActiveBlockStore } from '@/stores/activeBlockStore';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSearchStore } from '@/stores/searchStore';
import { toast } from '@/stores/toastStore';
import { buildHighlightUndo, useUndoStore } from '@/stores/undoStore';
import BlockActions from './BlockActions';
import CitationLine from './CitationLine';
import CorrectedByLine from './CorrectedByLine';
import CorrectionNote from './CorrectionNote';
import RefBlockItem from './RefBlockItem';
import SeqBadge from './SeqBadge';
import SourceBadge from './SourceBadge';

interface Props {
  block: Block;
  // True briefly after a search result navigated here — drives the flash highlight.
  highlight?: boolean;
  // Digest view renders blocks read-only: no hover action bar, no inline edit (§11.2).
  readOnly?: boolean;
  // v2.8 §20.1: multi-select state for the merge action. `selected` reflects whether
  // this block is in the current selection; `anySelected` keeps every checkbox visible
  // once a selection exists (not just the hovered one); `onSelectClick` receives the
  // shift modifier so the feed can compute a range select.
  selected?: boolean;
  anySelected?: boolean;
  onSelectClick?: (shiftKey: boolean) => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}

// Collapsed display height for smart truncation (PLAN_EN.md §9.3 / §Phase 6) — a
// collapsed block shows ~6 lines, with the last fading out (.feed-fade) instead of a
// hard cut.
//
// ⚠️ Ocean 2026-08-13 changed WHEN it engages: 「需要超过字数限制才能折叠，字数限制为默认打开
// 界面的窗口大小，默认右侧边栏关闭的情况下，一个 block 如果占据的位置小于等于这个工作区域的
// 窗口，就不折叠」. So the cap is one screenful of the feed, not the old flat 8 lines — a block
// you can read without scrolling past it is shown whole. The screenful is MEASURED off the feed's
// own scroll container rather than hardcoded off the 1360×840 default window, so the rule stays
// true after a resize; at the default size the two are the same thing. Overflow is still measured
// via DOM scrollHeight (full content height even under the max-height clamp), because driving it
// off `content.split('\n').length` misses wrap-long single lines.
const COLLAPSED_LINES = 6;
// Em line-height matching the content's `leading-[1.65]`, used to derive the collapsed
// max-height from COLLAPSED_LINES without a JS measurement round-trip.
const LINE_HEIGHT_EM = 1.65;


// v2.9 §14.3 / §19.19: walk up to the nearest scrollable ancestor (the feed's
// overflow-y-auto wrapper in LogView). Used to capture and restore scrollTop
// around the read-only → editable DOM swap so the viewport stays put.
const findScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return cur;
    cur = cur.parentElement;
  }
  return null;
};

// v2.9 §9.10 / §19.17: how far the user must scroll away from the destination
// block before in-block navigation auto-dismisses. Long enough that an
// incidental wheel nudge doesn't drop the highlights mid-read.
const NAV_SCROLL_DISMISS_PX = 200;

// §6.2-bis's rule about selectors, applied to a memo input: a fresh [] here would make the
// span memo below recompute on every render of every uncorrected block — which is all of them.
const EMPTY_CORRECTIONS: Correction[] = [];

// Filter the flat hits array down to one field and keep each hit's global
// index in the original array — InBlockNavigator counts and the active-index
// comparison still operate over the unified order.
const hitsForField = (
  hits: readonly HitOffset[],
  field: 'content' | 'annotation',
): Array<{ start: number; end: number; idx: number }> => {
  const out: Array<{ start: number; end: number; idx: number }> = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    if (h.field === field) out.push({ start: h.start, end: h.end, idx: i });
  }
  return out;
};

// Phase 10: ref blocks have an entirely different UI (no edit, source, annotation), so
// dispatch by kind rather than branching mid-component — keeps each renderer's hook order
// unconditional.
export default function BlockItem(props: Props) {
  if (props.block.kind === 'ref') {
    return <RefBlockItem block={props.block} readOnly={props.readOnly} onDelete={props.onDelete} />;
  }
  return <TextBlockItem {...props} />;
}

function TextBlockItem({
  block,
  highlight,
  readOnly,
  selected,
  anySelected,
  onSelectClick,
  onTogglePin,
  onDelete,
}: Props) {
  const t = useT();
  const setContent = useBlocksStore((s) => s.setContent);
  const setAnnotation = useBlocksStore((s) => s.setAnnotation);
  const setStale = useBlocksStore((s) => s.setStale);
  const clearSupersession = useBlocksStore((s) => s.clearSupersession);
  const addCorrection = useBlocksStore((s) => s.addCorrection);
  const siblings = useBlocksStore((s) => s.byThread[block.threadId]);
  // v13's warning, seen from the corrected block — the half the feed never had. Derived
  // from the project's own blocks through the SAME function the pack uses, so 「哪些块算更正
  // 了这一块」 cannot drift between the briefing and the screen.
  const corrections = useMemo(
    () => correctionsBySource(siblings ?? []).get(block.id) ?? EMPTY_CORRECTIONS,
    [siblings, block.id],
  );
  // v21 — where those corrections say the wrong sentence is. Located by exact substring:
  // stored offsets would silently point at the wrong words the first time the user edits
  // this block, and correctionsBySource has already dropped any quote that no longer occurs
  // here. Every occurrence is marked; an identical sentence twice in one block says the
  // same wrong thing twice, and picking one of them would be arbitrary.
  // 2026-08-19: the two halves get two presentations, and never both for one correction.
  // A correction whose quote still occurs here is drawn UNDER this block as a note the
  // marked sentence opens (and BlockFeed keeps it out of the timeline). One whose quote
  // never matched has nothing to click, so it keeps its card and this block keeps the old
  // pointer line — the reader can still get to it.
  // ⚠️ Same condition as foldedCorrectionIds, and it has to stay the same: a correction the
  // feed folded away must be drawn here, and one it kept must NOT be drawn twice.
  const foldable = !hasSegmentAnnotations(block.content);
  const attachedCorrections = useMemo(
    () => (foldable ? corrections.filter((c) => c.quote) : []),
    [corrections, foldable],
  );
  const pointerCorrections = useMemo(
    () => (foldable ? corrections.filter((c) => !c.quote) : corrections),
    [corrections, foldable],
  );
  const correctionBlocks = useMemo(
    () =>
      attachedCorrections
        .map((c) => (siblings ?? []).find((b) => b.id === c.id))
        .filter((b): b is Block => !!b),
    [attachedCorrections, siblings],
  );
  const correctedSpans = useMemo(() => {
    const spans: { start: number; end: number; id: string }[] = [];
    for (const c of corrections) {
      if (!c.quote) continue;
      let from = block.content.indexOf(c.quote);
      while (from !== -1) {
        // 2026-08-19: the span carries WHICH correction marked it, so clicking one sentence opens
        // that sentence's correction and not every correction on the block.
        spans.push({ start: from, end: from + c.quote.length, id: c.id });
        from = block.content.indexOf(c.quote, from + c.quote.length);
      }
    }
    return spans;
  }, [corrections, block.content]);

  // Action-bar reveal is JS-driven (not CSS group-hover): mouseleave deterministically
  // clears it, so the bar can't get stuck visible when the cursor moves to the block
  // below. See PLAN_EN.md §9.3.
  const [hovered, setHovered] = useState(false);

  // v2.9 §9.3 / §19.18: brief background tint marking the most-recently-acted-upon
  // block, so the user keeps orientation across edit / collapse / annotate cycles.
  const isActive = useActiveBlockStore((s) => s.activeBlockId === block.id);
  const setActive = useActiveBlockStore((s) => s.setActive);

  // v2.9 §9.10 / §19.17: in-block search navigation. When this block is the
  // active target, force-expand the truncation and wrap each hit position in
  // <mark>. The find bar itself is mounted in LogView (above the feed), not
  // here. Clears on ✕/Esc/click-outside/wheel-away.
  const isNavTarget = useSearchStore((s) => s.activeNavigationBlockId === block.id);
  const navHits = useSearchStore((s) => s.activeHits);
  const navHitIndex = useSearchStore((s) => s.activeHitIndex);
  const flashTick = useSearchStore((s) => s.flashTick);

  // Flash fired by clicking this block's own #n. Separate from the search-driven
  // `highlight` prop so a locate never fights an in-progress search navigation; it
  // clears itself once the animation has run.
  const [selfFlash, setSelfFlash] = useState(false);
  useEffect(() => {
    if (!selfFlash) return;
    const id = setTimeout(() => setSelfFlash(false), 900);
    return () => clearTimeout(id);
  }, [selfFlash]);

  // Inline-edit state for the captured text. We commit on blur/Enter (per §9.3) so
  // the user never has to look for a Save button. Esc reverts to the pre-edit value.
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(block.content);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // DESIGN_CONTEXT_HYGIENE §3.1: whether the "which one does this correct" picker is open
  // on this block. Local, because only one block can be answering that question at a time
  // and the answer is over in one click.

  // Annotation editor. Visually separate (paper-2 background) so a reader can tell
  // "the user wrote this" apart from "the user captured this".
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(block.annotation ?? '');
  const annotationRef = useRef<HTMLTextAreaElement>(null);

  // Smart truncation: detect overflow against the collapsed cap. Re-measure when the
  // content text changes (the block could just have been edited).
  const measureRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [needsTruncation, setNeedsTruncation] = useState(false);

  // 2026-08-19: which correction is open, by the correcting block's id. Closed until the reader
  // asks for it by clicking the marked sentence — the mark itself is always visible, so
  // nothing is hidden; what is deferred is the correction's text, which is a second voice
  // in the middle of the user's own block. One id rather than a set, because opening a
  // second sentence's correction while the first is open reads as the panel following the
  // click.
  const [openCorrectionId, setOpenCorrectionId] = useState<string | null>(null);
  // The manual entry point: the sentence the user selected, waiting for what is right.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');

  // v2.8 §20.5 (Track B): select-to-highlight.
  //
  // Two entry points share one wrap action:
  //  - Display mode: select text → small floating "标为重点?" prompt appears anchored
  //    to the selection rect, OR the highlight button in the hover toolbar fires.
  //  - Edit mode (textarea): select text inside the textarea → the floating prompt
  //    does not appear (the browser's native selection highlight is enough cue), but
  //    the toolbar's highlight button is still enabled and wraps the textarea's
  //    selection in the draft (committed when the user finishes editing).
  //
  // Selection state is tracked unified for both modes so the toolbar's `canHighlight`
  // chip enables/disables correctly. The whole feature stays isolated behind
  // highlight.ts + HighlightedContent.tsx for a clean §20.8 revert.
  const [highlightPrompt, setHighlightPrompt] = useState<
    { x: number; y: number; raw: { start: number; end: number } | null } | null
  >(null);
  // True iff the current selection already sits inside a `==…==` highlight — flips
  // the toolbar button into "un-highlight" mode (different icon + title) so the user
  // can undo a highlight without retyping. Updated on the same selectionchange tick
  // as highlightableSelection.
  const [selectionAlreadyHighlighted, setSelectionAlreadyHighlighted] = useState(false);
  // Same range, for the toolbar button — which fires without a live selection.
  const [selectionRaw, setSelectionRaw] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!editingContent) setContentDraft(block.content);
  }, [block.content, editingContent]);

  useEffect(() => {
    if (!editingAnnotation) setAnnotationDraft(block.annotation ?? '');
  }, [block.annotation, editingAnnotation]);

  useEffect(() => {
    if (editingContent && contentRef.current) {
      const el = contentRef.current;
      // v2.9 §14.3 / §19.19: preventScroll suppresses the browser's default
      // scrollIntoView-on-focus, which was one half of the edit-entry viewport jump.
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingContent]);

  useEffect(() => {
    // v2.8 §20.4: when both fields enter edit together (double-click path), keep focus
    // on the content textarea — the spec says double-click lands focus on content by
    // default. Auto-focus the annotation only when it's the standalone ✑ entry point.
    if (editingAnnotation && !editingContent && annotationRef.current) {
      const el = annotationRef.current;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingAnnotation, editingContent]);

  useLayoutEffect(() => {
    if (editingContent) return; // measurement only applies to the rendered prose path
    const measure = (): void => {
      const el = measureRef.current;
      if (!el) return;
      // scrollHeight reports the full content height even under the max-height clamp, so
      // this is stable across collapse toggles. The cap is the feed viewport itself — a block
      // that fits on one screen is never truncated. `|| innerHeight` covers both "no scrollable
      // ancestor found" and a container not laid out yet (clientHeight 0), which would otherwise
      // collapse everything.
      const viewportPx = findScrollContainer(el)?.clientHeight || window.innerHeight;
      setNeedsTruncation(el.scrollHeight > viewportPx + 1);
    };
    measure();
    // The cap moves with the window, so the answer has to be recomputed when it does.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [block.content, editingContent]);

  // v2.9 §9.10 / §19.17: while this block owns the active search navigation,
  // override the collapsed truncation so every hit is visible (auto-expand).
  // The user's own toggle resumes control as soon as navigation clears — the
  // override is read-only on `collapsed`, not a write, so the prior value is
  // preserved. Also gated on needsTruncation so short blocks never get clamped/faded.
  const showCollapsed = collapsed && needsTruncation && !isNavTarget;

  // Search-navigation also triggers the active-block tint per §13.3, so the
  // destination block reads orientation just like any other deliberate action.
  useEffect(() => {
    if (isNavTarget) setActive(block.id);
  }, [isNavTarget, block.id, setActive]);

  // Bring the currently-active hit into view as ▲/▼ move through them. Runs
  // on every activeHitIndex tick (via flashTick) so wrap-around still scrolls.
  useEffect(() => {
    if (!isNavTarget) return;
    const article = articleRef.current;
    if (!article) return;
    const mark = article.querySelector(`mark[data-hit-index="${navHitIndex}"]`);
    if (mark instanceof HTMLElement) {
      mark.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isNavTarget, navHitIndex, flashTick]);

  // User-initiated scroll-away dismissal. Listens to `wheel` and `touchmove`
  // (not `scroll`) so programmatic `scrollIntoView` from BlockFeed's landing
  // logic — which itself can move >200px to center a distant block — does NOT
  // fire dismissal mid-landing. The first version of this effect anchored on
  // raw scrollTop and then watched `scroll`, which killed nav before the user
  // ever saw the highlights.
  //
  // Threshold is checked against the block's bounding rect relative to the
  // scroll container, so "scrolled away" is independent of how far raw
  // scrollTop has moved.
  useEffect(() => {
    if (!isNavTarget) return;
    const article = articleRef.current;
    const scrollContainer = findScrollContainer(article);
    if (!scrollContainer || !article) return;
    const onUserScroll = () => {
      const blockRect = article.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const offTop = containerRect.top - blockRect.bottom;
      const offBottom = blockRect.top - containerRect.bottom;
      if (Math.max(offTop, offBottom) > NAV_SCROLL_DISMISS_PX) {
        useSearchStore.getState().clearNavigation();
      }
    };
    scrollContainer.addEventListener('wheel', onUserScroll, { passive: true });
    scrollContainer.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('wheel', onUserScroll);
      scrollContainer.removeEventListener('touchmove', onUserScroll);
    };
  }, [isNavTarget]);

  // Click outside both the destination block and the find bar clears
  // navigation. The bar mounts above the feed (in LogView), outside this
  // article, so we exempt it with a data-search-nav-bar selector check.
  useEffect(() => {
    if (!isNavTarget) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const article = articleRef.current;
      if (!article) return;
      const target = e.target as HTMLElement;
      if (article.contains(target)) return;
      if (target.closest('[data-search-nav-bar]')) return;
      useSearchStore.getState().clearNavigation();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isNavTarget]);

  // Auto-collapse on outside-click: once a block is expanded, a mousedown anywhere
  // outside its article snaps it back to truncated view. Skipped while editing —
  // the textarea covers the truncation path, so the listener firing mid-edit would
  // leave the block silently collapsed and the user would land on a re-truncated
  // view after blur. Only attached when the listener has work to do.
  useEffect(() => {
    if (collapsed || editingContent || editingAnnotation) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const article = articleRef.current;
      if (!article) return;
      if (article.contains(e.target as Node)) return;
      setCollapsed(true);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [collapsed, editingContent, editingAnnotation]);

  // v2.8 §20.5: track the live selection so (a) the floating prompt dismisses when
  // it becomes stale and (b) the toolbar's highlight button enables/disables based
  // on whether the current selection sits inside THIS block. Works in both display
  // mode (selection inside measureRef) and edit mode (selection inside contentRef
  // textarea — read via selectionStart/End, since selectionchange fires for
  // textareas too).
  useEffect(() => {
    if (readOnly) return;
    const onSelectionChange = (): void => {
      const clear = (): void => {
        setSelectionRaw(null);
        setSelectionAlreadyHighlighted(false);
      };
      // Edit mode: the textarea's own selection is ALREADY a raw range into the draft, so
      // it needs no mapping — it is the same shape display mode arrives at the long way.
      if (editingContent) {
        const ta = contentRef.current;
        if (ta && document.activeElement === ta && ta.selectionStart !== ta.selectionEnd) {
          const range = { start: ta.selectionStart, end: ta.selectionEnd };
          if (isHighlightable(ta.value.slice(range.start, range.end))) {
            setSelectionRaw(range);
            // Read the textarea's own buffer (the draft), not the persisted block.content —
            // the user may have just typed the markers themselves.
            setSelectionAlreadyHighlighted(rangeIsHighlighted(ta.value, range.start, range.end));
          } else {
            clear();
          }
        } else {
          clear();
        }
        return;
      }
      // Display mode: window selection must be inside this block's content.
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clear();
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      const container = measureRef.current;
      if (!container) {
        clear();
        return;
      }
      // ⚠️ The range, not sel.toString(). The rendered text is missing every marker it
      // spans, so it is the wrong thing to reason about and the wrong thing to search for.
      const raw = rawRangeFromSelection(container, sel);
      if (!raw || !isHighlightable(block.content.slice(raw.start, raw.end))) {
        clear();
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      setSelectionRaw(raw);
      setSelectionAlreadyHighlighted(rangeIsHighlighted(block.content, raw.start, raw.end));
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setHighlightPrompt(null);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKey);
    };
  }, [readOnly, editingContent, highlightPrompt, block.content]);

  // v2.9 §14.3 / §19.19: the read-only → editable swap changes the block's
  // intrinsic height (textarea vs. wrapped prose), which can shift the article's
  // viewport position. flushSync forces React to commit the state update in this
  // same tick so we can re-measure and compensate scrollTop before the browser
  // paints. Pairs with focus({ preventScroll: true }) above — both halves are
  // needed: this one covers layout shift, that one covers focus auto-scroll.
  const enterEditMode = (apply: () => void): void => {
    const article = articleRef.current;
    const scrollContainer = findScrollContainer(article);
    const beforeRect = article?.getBoundingClientRect() ?? null;
    const beforeScrollTop = scrollContainer?.scrollTop ?? null;

    flushSync(apply);

    if (article && scrollContainer && beforeRect && beforeScrollTop !== null) {
      const afterRect = article.getBoundingClientRect();
      const delta = afterRect.top - beforeRect.top;
      if (delta !== 0) {
        scrollContainer.scrollTop = beforeScrollTop + delta;
      }
    }
  };

  const commitContent = async (): Promise<void> => {
    const next = contentDraft;
    setEditingContent(false);
    if (next === block.content) return;
    try {
      await setContent(block.id, next);
    } catch (e) {
      console.error('[block] content save failed', e);
    }
  };

  const cancelContent = (): void => {
    setContentDraft(block.content);
    setEditingContent(false);
  };

  const commitAnnotation = async (): Promise<void> => {
    const trimmed = annotationDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setEditingAnnotation(false);
    if (next === (block.annotation ?? null)) return;
    try {
      await setAnnotation(block.id, next);
    } catch (e) {
      console.error('[block] annotation save failed', e);
    }
  };

  const cancelAnnotation = (): void => {
    setAnnotationDraft(block.annotation ?? '');
    setEditingAnnotation(false);
  };

  // v2.8 §20.4: unified-mode cancel. When the user entered edit via double-click both
  // fields are open at once; Esc on either should drop both drafts and close both, so
  // they can't get out of step (one revert, one stale draft committed by a later blur).
  const cancelAll = (): void => {
    setContentDraft(block.content);
    setEditingContent(false);
    setAnnotationDraft(block.annotation ?? '');
    setEditingAnnotation(false);
  };

  // v2.8 §20.5: capture the current selection and anchor the floating prompt to it.
  // Runs on mouseup so the selection is stable; ignores selections collapsed by the
  // click, selections that escape this block, and selections that aren't wrap-worthy
  // (whitespace-only or already-nested ==).
  const onContentMouseUp = (): void => {
    if (readOnly || editingContent) {
      setHighlightPrompt(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setHighlightPrompt(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = measureRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setHighlightPrompt(null);
      return;
    }
    // Ocean 2026-08-19:「用鼠标划词的时候也需要出现『更正这里？』的提示，点击可以直接更正，
    // 点击工具栏摩擦太大了」. The range is captured HERE, with the selection still live —
    // clicking either button collapses it, so reading it back later is too late. Both
    // actions in the chip run off this one range.
    const raw = rawRangeFromSelection(container, sel);
    if (!raw || !isHighlightable(block.content.slice(raw.start, raw.end))) {
      setHighlightPrompt(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const blockRect = container.getBoundingClientRect();
    setHighlightPrompt({
      x: rect.left + rect.width / 2 - blockRect.left,
      y: rect.top - blockRect.top - 4,
      raw,
    });
  };

  // Unified toggle used by BOTH the floating prompt and the toolbar button. Wraps a range
  // in `==…==`; UN-wraps it when the range already sits inside a highlight.
  //
  // ⚠️ 2026-08-19 (Ocean:「标为重点的功能有类似问题，只能划一行」): this takes a character RANGE,
  // not the selected string. The old version searched `content` for the words on screen,
  // which the renderer has already stripped `**` and `## ` out of — so any selection
  // crossing a marker, or spanning two lines, silently did nothing. It is the same defect
  // corrections had, so it is now the same fix: one range, mapped once, for both actions.
  //
  // `editingContent` controls where the change lands:
  //  - display → persist via setContent immediately.
  //  - edit    → mutate the textarea draft, so the change rides the normal blur-commit and
  //              the user keeps editing without losing context. The textarea's own
  //              selectionStart/End ARE raw offsets into the draft, so no mapping is needed.
  const runHighlight = async (range: { start: number; end: number } | null): Promise<void> => {
    if (!range) return;
    if (editingContent) {
      const ta = contentRef.current;
      const draft = contentDraft;
      const { content: next, changed } = toggleHighlightRange(draft, range.start, range.end);
      if (!changed) return;
      setContentDraft(next);
      // Put the caret after what was just wrapped, so typing continues where they were.
      const caret = next.length - (draft.length - range.end);
      setTimeout(() => {
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(caret, caret);
      }, 0);
      return;
    }
    // Display-mode path: persist immediately via the store, then record an undo entry
    // (§9.13 / Step 6). setContent invalidates the block's prior undo entries first, so
    // pushing afterward leaves this highlight entry valid until the block is next edited.
    const before = block.content;
    const { content: next, changed } = toggleHighlightRange(before, range.start, range.end);
    if (!changed) return;
    try {
      await setContent(block.id, next);
      useUndoStore.getState().pushUndo(
        buildHighlightUndo({ blockId: block.id, threadId: block.threadId, beforeContent: before }),
      );
    } catch (e) {
      console.error('[highlight] save failed', e);
    }
  };

  const confirmHighlight = async (): Promise<void> => {
    if (!highlightPrompt) return;
    const raw = highlightPrompt.raw;
    setHighlightPrompt(null);
    window.getSelection()?.removeAllRanges();
    await runHighlight(raw);
  };

  // Toolbar-button entry: works in both modes. Falls back to the floating prompt's
  // last captured selection if there isn't a live window selection (e.g. the user
  // moved focus to the toolbar via keyboard after selecting).
  const runHighlightFromToolbar = async (): Promise<void> => {
    const live = selectionRaw;
    if (!live) return;
    setHighlightPrompt(null);
    await runHighlight(live);
    // Clear the cached selection so the button disables until the user re-selects.
    setSelectionRaw(null);
    window.getSelection()?.removeAllRanges();
  };


  // 2026-08-19 — manual correction, from the block being corrected. Ocean:「划词除了高亮选择，
  // 现在多了一个修正信息选择」, and then:「为什么不能选整段进行修改？所有更正的逻辑应该一样」.
  //
  // ⚠️ The quote is cut out of `content` by OFFSET, never found by searching for the words
  // on screen. The renderer drops `**`, `==` and `## `, so any selection crossing one of
  // them is text that appears nowhere in the stored string — the first cut refused those,
  // which made selecting a whole paragraph (the normal thing to do) the case that failed.
  // Slicing the raw range instead means the stored quote always occurs in the block, for a
  // one-word selection and a five-paragraph one alike. See selectionRange.ts.
  const startCorrection = (raw: { start: number; end: number } | null): void => {
    const quote = raw ? block.content.slice(raw.start, raw.end).trim() : '';
    if (!quote) return;
    setActive(block.id);
    setCorrecting(quote);
    setCorrectionDraft('');
    setHighlightPrompt(null);
    setSelectionRaw(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveCorrection = async (): Promise<void> => {
    const quote = correcting;
    const text = correctionDraft.trim();
    if (!quote || !text) return;
    setCorrecting(null);
    setCorrectionDraft('');
    try {
      await addCorrection(block, quote, text);
    } catch (e) {
      console.error('[correction] save failed', e);
      toast.error(t('更正没能保存。'));
    }
  };

  // W7 (DESIGN_WORKBENCH §7 / DESIGN_CONTEXT_HYGIENE §3.2): a block that carries the
  // user's own note is titled by that note. Only while it is not being edited — the editor
  // keeps the source layout (content first, note below), the same principle as showing raw
  // `==` markers in the content textarea.
  //
  // v14 (§9.3 拍板乙): an AI-written note does not get the title slot. W7 gives the note the
  // block's voice, and that voice belongs to whoever actually wrote it. The note is still
  // shown — demoted below the content and labelled — so the user can see what the AI said
  // about their block; hiding it would trade one misrepresentation for a blind spot.
  const hasNote = !!block.annotation?.trim() && !editingAnnotation;
  const noteIsAi = annotationIsAi(block.annotationBy, block.source);
  const annotationAsTitle = hasNote && !noteIsAi;
  const annotationView = (
    <div
      // Double-click the annotation itself to edit just the annotation in place
      // (separate from double-clicking the content, which opens both fields).
      onDoubleClick={
        readOnly
          ? undefined
          : () => {
              setActive(block.id);
              enterEditMode(() => setEditingAnnotation(true));
            }
      }
      title={readOnly ? undefined : t('双击编辑批注')}
      className="mb-1.5 font-ui text-[15px] font-medium leading-[1.55] text-ink"
    >
      {/* Step 3 §20.5: annotations are a read surface too — route through the same
          tokenizer so a ==…== span (and search hits when navigated) renders as a
          highlight, never literal markers. No spine on annotations. */}
      <ContentRuns
        content={block.annotation ?? ''}
        hits={isNavTarget ? hitsForField(navHits, 'annotation') : undefined}
        activeHitIndex={navHitIndex}
      />
    </div>
  );
  // The demoted twin. Same double-click target on purpose: the user editing this note is
  // exactly the moment it becomes theirs, and updateBlockAnnotation stamps 'user' — after
  // which it takes the title slot like any other note they wrote.
  const aiAnnotationView = (
    <div
      onDoubleClick={
        readOnly
          ? undefined
          : () => {
              setActive(block.id);
              enterEditMode(() => setEditingAnnotation(true));
            }
      }
      title={readOnly ? undefined : t('双击编辑批注')}
      className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[12px] leading-[1.5] text-muted"
    >
      <span className="shrink-0 rounded border border-line px-1 text-[10px]">
        {t('AI 批注')}
      </span>
      <span className="min-w-0 italic">
        <ContentRuns
          content={block.annotation ?? ''}
          hits={isNavTarget ? hitsForField(navHits, 'annotation') : undefined}
          activeHitIndex={navHitIndex}
        />
      </span>
    </div>
  );

  return (
    <article
      ref={articleRef}
      data-block-id={block.id}
      onMouseEnter={readOnly ? undefined : () => setHovered(true)}
      onMouseLeave={readOnly ? undefined : () => setHovered(false)}
      onClick={
        readOnly
          ? undefined
          : (e) => {
              // v2.9 §9.3 / §19.18: passive "I'm looking at this" cue. Interactive
              // children carry their own action handlers — the ones that should
              // trigger orientation (annotate, show more/less, double-click) wire
              // setActive explicitly; the rest (pin/delete/highlight, source-badge
              // editor, inline textareas) are deliberately excluded so a destructive
              // click doesn't tint the row.
              if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
              setActive(block.id);
            }
      }
      className={`group relative rounded-md px-3.5 py-3 transition-colors hover:bg-paper-2/40 ${
        block.pinned ? 'pl-4' : ''
      } ${block.staleAt != null ? 'opacity-55' : ''} ${
        highlight || selfFlash ? 'flash' : ''
      } ${isActive ? 'block-active' : ''}`}
    >
      {block.pinned && (
        <span className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r bg-accent" />
      )}

      {/* DESIGN_CONTEXT_HYGIENE §3.1: a retired block stays exactly where it is, readable,
          searchable, undeletable-by-accident — it has simply stopped going out in packs.
          The row says which, because the block looking normal is the failure mode: the
          user would keep reading a conclusion they had already retired. */}
      {block.staleAt != null && (
        <div className="mb-1 font-ui text-[11px] text-muted">
          {t('已标记「不作数了」· {when} 起不再进上下文（还在库里，搜得到）', {
            when: formatBlockTime(block.staleAt),
          })}
        </div>
      )}

      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted">
        {/* v2.8 §20.1 selection checkbox: visible on hover, and on every block once any
            block is selected (so the user can see what's already in the set). */}
        {!readOnly && onSelectClick && (hovered || anySelected) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectClick(e.shiftKey);
            }}
            title={selected ? t('取消选择') : t('Shift 点击可范围选择')}
            aria-label={selected ? t('取消选择') : t('选择此 block')}
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
              selected
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line-strong bg-paper hover:border-accent'
            }`}
          >
            {selected && (
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
        {/* v9 (DESIGN_SCHEMA_V9 H-1, Ocean approved style a): the block's own number,
            the same #12 an AI says over MCP. Grey and small so it never competes with
            the text; clicking it scrolls this block to the middle and flashes it, which
            is what "point at that one" looks like when the AI just named it.
            2026-08-10 (Ocean 拍板「两处一起改」): the `#` is now a ring — see SeqBadge.
            The tooltip is what still teaches 「#12」→ this one, so it stays. */}
        {block.seq != null && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActive(block.id);
              articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setSelfFlash(true);
            }}
            title={t('这一块的编号 — AI 说「#12」指的就是它。点一下定位')}
            className="shrink-0 text-muted transition-colors hover:text-accent"
          >
            <SeqBadge seq={block.seq} />
          </button>
        )}
        <time className="font-mono">{formatBlockTime(block.createdAt)}</time>
        <SourceBadge block={block} readOnly={readOnly} />
        {!readOnly && (
          <BlockActions
            // v2.8 §20.5 follow-up: keep the action bar visible while editing so the
            // highlight button can wrap a textarea selection without the user having
            // to leave edit mode first.
            visible={hovered || editingContent}
            pinned={block.pinned}
            canHighlight={selectionRaw !== null}
            selectionAlreadyHighlighted={selectionAlreadyHighlighted}
            // 2026-08-19: corrections apply to the SAVED text, so the entry point is closed while
            // the content is a draft in a textarea.
            canCorrect={!editingContent && selectionRaw !== null}
            onCorrect={() => startCorrection(selectionRaw)}
            onTogglePin={() => onTogglePin?.()}
            onEdit={() => enterEditMode(() => setEditingContent(true))}
            onHighlight={() => void runHighlightFromToolbar()}
            onAnnotate={() => {
              setActive(block.id);
              enterEditMode(() => setEditingAnnotation(true));
            }}
            stale={block.staleAt != null}
            onToggleStale={() => {
              setActive(block.id);
              void setStale(block.id, block.staleAt == null);
            }}
            onDelete={() => onDelete?.()}
          />
        )}
      </div>

      {/* W7 (DESIGN_WORKBENCH §7, DESIGN_CONTEXT_HYGIENE §3.2 rung one): when the user
          wrote a note about this block, THAT is what the block is — so it reads first, in
          the block's own voice, and the captured original drops below it as quoted
          material. Blocks with no note are untouched: §7 rejected the unconditional
          version precisely because most blocks have none and would have carried a blank
          headline over demoted prose. */}
      {annotationAsTitle && annotationView}

      {editingContent ? (
        <textarea
          ref={contentRef}
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onBlur={() => void commitContent()}
          onKeyDown={(e) => {
            if (isImeComposing(e.nativeEvent)) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              // v2.8 §20.4: in unified edit mode (double-click) Esc cancels both fields.
              if (editingAnnotation) cancelAll();
              else cancelContent();
            }
          }}
          rows={Math.min(12, Math.max(2, contentDraft.split('\n').length + 1))}
          className="w-full resize-none rounded border border-line-strong bg-paper px-2 py-1.5 font-ui text-[15px] leading-[1.65] text-ink outline-none focus:border-accent"
          spellCheck={false}
        />
      ) : (
        <div className="relative">
          <div
            ref={measureRef}
            // v2.8 §20.4: double-click opens content AND annotation together — annotation
            // becomes a quiet area at the bottom of edit mode. Both save on blur; Esc on
            // either cancels both. The ✑ hover action still opens annotation alone for
            // users who reach for it instead (decide post-dogfooding which stays).
            onDoubleClick={
              readOnly
                ? undefined
                : () => {
                    setActive(block.id);
                    enterEditMode(() => {
                      setEditingContent(true);
                      setEditingAnnotation(true);
                    });
                  }
            }
            // v2.8 §20.5: capture selection on mouseup so the prompt anchors to the
            // user's released selection rect.
            onMouseUp={readOnly ? undefined : onContentMouseUp}
            title={readOnly ? undefined : t('双击编辑（含批注）')}
            style={
              showCollapsed
                ? {
                    maxHeight: `${COLLAPSED_LINES * LINE_HEIGHT_EM}em`,
                    overflow: 'hidden',
                  }
                : undefined
            }
            className={`whitespace-pre-wrap break-words font-ui leading-[1.65] ${
              // W7: demoted to quoted material when the note above is carrying the block.
              // Neutral rule, not the accent one — accent means "the user's own words",
              // and under W7 those are the line above, not this one.
              annotationAsTitle
                ? 'border-l-2 border-line pl-2 text-[13px] text-ink-2'
                : 'text-[15px] text-ink'
            } ${showCollapsed ? 'feed-fade' : ''}`}
          >
            {/* Step 2 §9.3 / §13.4: content renders through the run tokenizer
                (ContentRuns) — the first-line spine, ==…== highlights, and search
                hits compose as styled text runs (display-only, §2.6). Merged blocks
                whose content carries the per-segment annotation marker keep their
                segmented layout (SegmentedContent); search-nav flattens them so every
                hit is reachable.

                Step 3 §20.5: this is the single READ-mode renderer for content, used in
                BOTH collapse states — so a ==…== span reads identically collapsed and
                expanded, never as literal markers. EDIT mode (the textarea below) keeps
                the raw == source on purpose: editing returns to source. */}
            {hasSegmentAnnotations(block.content) && !isNavTarget ? (
              <SegmentedContent content={block.content} withOffsets />
            ) : (
              // §10.1: content goes through the Markdown renderer; annotations above stay
              // on the plain tokenizer (they are one line of prose, never a document).
              <MarkdownContent
                content={block.content}
                hits={isNavTarget ? hitsForField(navHits, 'content') : undefined}
                activeHitIndex={navHitIndex}
                withSpine
                corrected={correctedSpans}
                withOffsets
                onCorrectedClick={
                  correctionBlocks.length > 0
                    ? (id) =>
                        setOpenCorrectionId((cur) => (cur === id ? null : (id ?? null)))
                    : undefined
                }
              />
            )}
          </div>
          {highlightPrompt && (
            // Ocean 2026-08-19:「点击工具栏摩擦太大了」— so the second action sits in the same
            // chip the first one already appears in, on the same gesture. Two buttons rather
            // than one wider one: they do different things to the same words.
            <div
              onMouseDown={(e) => {
                // Prevent the click from collapsing the selection before our handler reads it.
                e.preventDefault();
              }}
              style={{
                position: 'absolute',
                left: highlightPrompt.x,
                top: highlightPrompt.y,
                transform: 'translate(-50%, -100%)',
              }}
              className="z-20 flex items-stretch overflow-hidden whitespace-nowrap rounded-md border border-line-strong bg-paper font-ui text-[11px] text-ink shadow-[var(--shadow-toast)]"
            >
              <button
                type="button"
                onClick={() => void confirmHighlight()}
                className="px-2 py-1 transition-colors hover:text-accent"
              >
                {selectionAlreadyHighlighted ? t('取消重点?') : t('标为重点?')}
              </button>
              {!readOnly && !editingContent && highlightPrompt.raw && (
                <>
                  <span aria-hidden="true" className="w-px shrink-0 bg-line" />
                  <button
                    type="button"
                    onClick={() => startCorrection(highlightPrompt.raw)}
                    className="px-2 py-1 transition-colors hover:text-accent"
                  >
                    {t('更正这里?')}
                  </button>
                </>
              )}
            </div>
          )}
          {needsTruncation && !isNavTarget && (
            <button
              type="button"
              onClick={() => {
                setActive(block.id);
                setCollapsed((v) => !v);
              }}
              className="mt-1 text-[11px] text-muted hover:text-accent"
            >
              {collapsed ? t('展开全部') : t('收起')}
            </button>
          )}
        </div>
      )}

      {/* v14 (§9.3 拍板乙): an AI's note about this block, kept visible but kept in its
          place — under the content, muted, and labelled as the AI's. */}
      {hasNote && noteIsAi && aiAnnotationView}

      {/* The annotation EDITOR always sits below the content — editing returns to the
          source layout (same reason the content textarea keeps raw `==` markers). Quiet
          and subordinate to the content textarea above, so a block being annotated for the
          first time shows a barely-there input rather than competing for attention. */}
      {editingAnnotation && (
        <div className="mt-1.5">
          <textarea
            ref={annotationRef}
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            onBlur={() => void commitAnnotation()}
            onKeyDown={(e) => {
              if (isImeComposing(e.nativeEvent)) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                // v2.8 §20.4: in unified edit mode Esc on either field cancels both.
                if (editingContent) cancelAll();
                else cancelAnnotation();
              }
              // §3.6: Enter inserts a newline (commit is the 完成 button or blur). This is
              // also why a Chinese-IME Enter that confirms a candidate no longer ends the
              // note prematurely — Enter never commits here.
            }}
            rows={2}
            placeholder={t('批注（可选）')}
            className="w-full resize-none rounded border border-line bg-paper-2/30 px-2 py-1 font-ui text-[12px] italic leading-[1.5] text-muted placeholder:text-muted/60 outline-none focus:border-line-strong focus:text-ink-2"
            spellCheck={false}
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // don't blur the textarea first
              onClick={() => {
                if (editingContent) void commitContent();
                void commitAnnotation();
              }}
              className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10"
            >
              {t('完成')}
            </button>
          </div>
        </div>
      )}

      {/* v2.4 P2-3: quiet citation line — the feed counterpart of the pack's ↩ cites
          row. Only MCP-written blocks carry refBlockId, so most blocks skip this.
          v13: the same line, with the relation's own verb (DESIGN_CONTEXT_HYGIENE §3.1). */}
      {block.refBlockId && (
        <CitationLine refBlockId={block.refBlockId} refKind={block.refKind} />
      )}

      {/* 2026-08-19 — the corrections attached to this block, under the sentence they are about,
          joined to it by the dashed rule in CorrectionNote. Opened by clicking the marked
          sentence; BlockFeed keeps these same blocks out of the timeline, so this is the
          one place each of them is drawn. */}
      {correctionBlocks
        .filter((c) => c.id === openCorrectionId)
        .map((c) => (
          <CorrectionNote
            key={c.id}
            correction={c}
            onRemove={
              readOnly
                ? undefined
                : () => {
                    setOpenCorrectionId(null);
                    void clearSupersession(c.id);
                  }
            }
          />
        ))}

      {/* The manual entry point's second half: the user has picked the wrong sentence and
          now says what is right. Shown under the block for the same reason the note is —
          this is a statement about the text above it. */}
      {correcting !== null && !readOnly && (
        <div className="mt-1.5 border-l border-dashed border-accent/45 pl-2.5">
          <div className="mb-1 font-ui text-[11px] text-muted">
            {t('更正这一句：')}
            <span className="rounded-sm bg-[var(--notice-warm)] px-1 text-ink-2">{correcting}</span>
          </div>
          <textarea
            autoFocus
            value={correctionDraft}
            onChange={(e) => setCorrectionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCorrecting(null);
                return;
              }
              // ⌘/Ctrl+Enter saves; plain Enter stays a newline, because a correction is
              // prose and often more than one line. IME guard for the same reason every
              // other composer here has one.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isImeComposing(e.nativeEvent)) {
                e.preventDefault();
                void saveCorrection();
              }
            }}
            rows={2}
            placeholder={t('写下正确的说法')}
            className="w-full resize-none rounded border border-line bg-paper px-2 py-1 font-ui text-[13px] leading-[1.55] text-ink outline-none focus:border-accent"
          />
          <div className="mt-1 flex items-center gap-2 font-ui text-[11px]">
            <button
              type="button"
              onClick={() => void saveCorrection()}
              disabled={correctionDraft.trim().length === 0}
              className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('保存更正')}
            </button>
            <button
              type="button"
              onClick={() => setCorrecting(null)}
              className="text-muted transition-colors hover:text-ink"
            >
              {t('取消')}
            </button>
          </div>
        </div>
      )}

      {/* v13/v21, the other direction: a correction whose quote no longer occurs here has no
          sentence to hang under, so it keeps its own card in the feed and this line is how
          the reader gets to it. The SegmentedContent branch above takes no `corrected` spans
          either, so on those few blocks this line is again the whole marking. */}
      <CorrectedByLine corrections={pointerCorrections} />

    </article>
  );
}
