import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { annotationEdited, annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { ContentRuns } from '@/lib/blocks/contentRuns';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { isHighlightable, rangeIsHighlighted, toggleHighlightRange } from '@/lib/blocks/highlight';
import { locateQuote } from '@/lib/blocks/quoteFold';
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
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
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

// §6.2-bis's rule about selectors, applied to a memo input: a fresh [] here would make the
// span memo below recompute on every render of every uncorrected block — which is all of them.
const EMPTY_CORRECTIONS: Correction[] = [];

/** 这一块上可以划词的两格。⚠️ 它们各有一套字符下标（一套是 `content` 的，一套是
 *  `annotation` 的）—— 划词、`==重点` 都必须带着这个字段走，见 selectionRaw。 */
type BlockField = 'content' | 'annotation';
interface FieldRange {
  start: number;
  end: number;
  field: BlockField;
}

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
  // §9.6.6 单块压缩：从块自己的菜单进，和右侧栏的「压缩这个项目」通向同一张核对桌。
  const apiEngineEnabled = useSettingsStore((s) => s.apiEngineEnabled);
  const openCompressBlock = useCompressStore((s) => s.openBlock);
  const restoreOriginal = useBlocksStore((s) => s.restoreOriginal);
  const compressThread = useThreadsStore(selectThreadById(block.threadId));
  const setContent = useBlocksStore((s) => s.setContent);
  const setAnnotation = useBlocksStore((s) => s.setAnnotation);
  const setStale = useBlocksStore((s) => s.setStale);
  const removeBlock = useBlocksStore((s) => s.remove);
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
  // 压过、而且压缩前的原文还留着。⚠️ 两个条件都要 —— 关了「备份原文」那一次是不可逆的，
  // 那时候 `compressedAt` 有值而 `originalContent` 是空的（`blocks.ts` 上写着）。
  const hasOriginal = block.compressedAt != null && block.originalContent != null;
  /** 这一条更正挂不挂得到某一句上（挂得上 = 画在那一句底下；挂不上 = 只能指着整块说）。
   *  ⚠️ 必须和 `assemble.ts` 的 `foldedCorrectionIds` 同一条件：那边从时间线上折走的，
   *  这边必须画出来，⛔ 少一条就是一块存在于库里、屏幕上哪儿都看不到的更正。
   *  ⭐ 2026-08-25：划在**批注**里的不受合并块那条限制 —— 批注永远走 ContentRuns，记号照画。 */
  const isAttached = useCallback(
    (c: Correction): boolean => !!c.quote && (c.field === 'annotation' || foldable),
    [foldable],
  );
  const attachedCorrections = useMemo(
    () => corrections.filter(isAttached),
    [corrections, isAttached],
  );
  const pointerCorrections = useMemo(
    () => corrections.filter((c) => !isAttached(c)),
    [corrections, isAttached],
  );
  const correctionBlocks = useMemo(
    () =>
      attachedCorrections
        .map((c) => (siblings ?? []).find((b) => b.id === c.id))
        .filter((b): b is Block => !!b),
    [attachedCorrections, siblings],
  );
  /** 一格里所有被更正的位置。⭐ T4（2026-08-23）：和入库时那道闸同一把尺子（标点折叠）。
   *  ⛔ 用 `indexOf` 的话，压缩把这一句的标点改写过之后，这处记号就**悄悄消失**，而屏幕上
   *  没有任何提示。⚠️ 折叠长度守恒，所以拿到的下标就是这一格自己那串字符上的下标。 */
  const spansIn = useCallback(
    (field: 'content' | 'annotation', text: string) => {
      const spans: { start: number; end: number; id: string }[] = [];
      for (const c of corrections) {
        if (!c.quote || c.field !== field) continue;
        let from = locateQuote(text, c.quote);
        while (from !== -1) {
          // 2026-08-19: the span carries WHICH correction marked it, so clicking one sentence opens
          // that sentence's correction and not every correction on the block.
          spans.push({ start: from, end: from + c.quote.length, id: c.id });
          from = locateQuote(text, c.quote, from + c.quote.length);
        }
      }
      return spans;
    },
    [corrections],
  );
  const correctedSpans = useMemo(
    () => spansIn('content', block.content),
    [spansIn, block.content],
  );
  /** ⭐ 2026-08-25（Ocean:「批注不能被更正」）—— 批注那一格上的同一件事。 */
  const noteCorrectedSpans = useMemo(
    () => spansIn('annotation', block.annotation ?? ''),
    [spansIn, block.annotation],
  );

  // ⭐ S5（2026-08-24，Ocean 选丙）—— **一块上多条更正，要配得上对。**
  //
  // 之前是「一次只开一条」：从「句子 → 更正」通（点一句只开那一句的更正，这是有意的），
  // **反方向没有** —— 卡片上没有任何东西指回它划的是哪一句。⚠️ 一条更正的时候够用，
  // 两条就不够：真库 seq 21 上挂着两条，Ocean 只能点一次、记住、再点一次、再比对。
  // **它随更正条数变差。**
  //
  // 丙：不再一次只开一条，**每条直接跟在它划的那一句底下**，按那一句在正文里的先后排。
  // ⛔ 两条别弄坏的：① 折走的那几条**只在这一处画**（`BlockFeed` 把它们挡在时间线外）——
  // 不许出现「时间线一份、块底下一份」的双份；② `correctedSpans` 上那个 `id` 是配对的
  // **唯一依据**（2026-08-19 加的），⛔ 别在重构里丢掉。
  //
  // ⚠️ 定位不到的更正**到不了这儿**：`correctionsBySource` 已经把对不上的 `quote` 置空，
  // 而 `attachedCorrections` 只收有 quote 的 —— 对不上的那几条留在时间线上有自己的卡片
  // （`foldedCorrectionIds` 同一个条件）。所以下面每一条都一定有 span。
  /** 每条更正划的是哪一句 —— 卡片上要指回去。⚠️ 同一段里挂着两条的时候，位置本身
   *  分不出谁是谁（两条都跟在同一段底下），⛔ 所以这一句不许省。 */
  const correctionQuote = useMemo(
    () => new Map(corrections.flatMap((c) => (c.quote ? [[c.id, c.quote] as const] : []))),
    [corrections],
  );
  /** ⭐ 2026-08-25：划在批注上的那几条 —— 卡片跟在批注底下（正文那边是跟在段落底下）。
   *  ⚠️ 按 seq 排，不按位置：批注是一句话，几条更正挤在同一句上时位置分不出先后。 */
  const noteCorrectionBlocks = useMemo(
    () =>
      attachedCorrections
        .filter((c) => c.field === 'annotation')
        .map((c) => (siblings ?? []).find((b) => b.id === c.id))
        .filter((b): b is Block => !!b),
    [attachedCorrections, siblings],
  );
  const correctionAt = useMemo(() => {
    const firstSpan = new Map<string, number>();
    for (const sp of correctedSpans) {
      const at = firstSpan.get(sp.id);
      if (at === undefined || sp.start < at) firstSpan.set(sp.id, sp.start);
    }
    return correctionBlocks
      .flatMap((c) => {
        const at = firstSpan.get(c.id);
        return at === undefined ? [] : [{ block: c, at }];
      })
      .sort((x, y) => x.at - y.at);
  }, [correctedSpans, correctionBlocks]);

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
  // here. Clears on ✕ / Esc ONLY —— 见下面被删掉的那两个 effect 的说明。
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
  /** ⭐ 2026-08-23（Ocean 第 5 条）：压缩前的原文摊开着没有。⚠️ **纯界面状态，不进库** ——
   *  「看一眼」不该改任何东西，这正是他说旧按钮不对的地方。 */
  const [showingOriginal, setShowingOriginal] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // DESIGN_CONTEXT_HYGIENE §3.1: whether the "which one does this correct" picker is open
  // on this block. Local, because only one block can be answering that question at a time
  // and the answer is over in one click.

  // ⭐ 2026-08-25 (Ocean, V3 验收) — which field the editing panel opens focused on.
  // 「双击批注 → 输入框跳到批注」. Both fields are always present in the panel; this only
  // decides where the cursor lands, so there is one editing surface and not two modes.
  const [focusField, setFocusField] = useState<'content' | 'annotation'>('content');

  // Annotation editor. Visually separate (paper-2 background) so a reader can tell
  // "the user wrote this" apart from "the user captured this".
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(block.annotation ?? '');
  const annotationRef = useRef<HTMLTextAreaElement>(null);
  /** 面板开着 —— 两个字段一起开，一起关（openEditor / commitAll / cancelAll）。
   *  ⚠️ 声明在这么靠上，是因为下面划词那条 effect 的依赖数组要用它（`const` 有暂时性死区，
   *  声明在 effect 下面的话，第一次 render 就当场抛 ReferenceError）。 */
  const editorOpen = editingContent || editingAnnotation;

  // Smart truncation: detect overflow against the collapsed cap. Re-measure when the
  // content text changes (the block could just have been edited).
  const measureRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  // ⚠️ V2 ① (WORKPLAN §2.V2, Ocean 2026-08-25): starts EXPANDED. It used to be `true`.
  // His words: 「让 block 默认展开吧,不展开,文字的更改信息不能被看到。」— the S-batch
  // correction marks (§2.S5/§2.S6) sit under the sentence they correct, and in a long block
  // that sentence is usually past line 6, i.e. under the fold. A reader who does not know
  // something is down there never expands to find it, so the marks were invisible in
  // practice. Truncation still EXISTS (`needsTruncation`, the 收起 button) — it is now
  // opt-in per block instead of the default for every block.
  const [collapsed, setCollapsed] = useState(false);
  // Whether the block's current expanded state came from the user pressing 展开全部,
  // as opposed to just being the default. Only the former re-folds on outside-click —
  // see the auto-collapse effect below for why that distinction is load-bearing.
  const manuallyExpanded = useRef(false);
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
    { x: number; y: number; raw: FieldRange | null } | null
  >(null);
  // True iff the current selection already sits inside a `==…==` highlight — flips
  // the toolbar button into "un-highlight" mode (different icon + title) so the user
  // can undo a highlight without retyping. Updated on the same selectionchange tick
  // as highlightableSelection.
  const [selectionAlreadyHighlighted, setSelectionAlreadyHighlighted] = useState(false);
  // Same range, for the toolbar button — which fires without a live selection.
  // ⭐ 2026-08-25（Ocean:「批注无法高亮和更正」）：它现在**带着这段划在哪一格**。
  // ⚠️ 正文和批注是**两套字符坐标**，只传 start/end 的话，划在批注上的那一段会拿正文的下标
  // 去包 `==` —— 包到另一句话上，而且屏幕上看不出来。
  const [selectionRaw, setSelectionRaw] = useState<FieldRange | null>(null);
  /** 批注**读**的时候画在哪个节点里（两个 view 只会挂一个）—— 划词按它映射下标。 */
  const noteViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editingContent) setContentDraft(block.content);
  }, [block.content, editingContent]);

  useEffect(() => {
    if (!editingAnnotation) setAnnotationDraft(block.annotation ?? '');
  }, [block.annotation, editingAnnotation]);

  // ⛔ 这里以前有两条「进编辑就聚焦」的 effect（一条盯 editingContent、一条盯 editingAnnotation），
  // 是**合成面板之前**留下的。⚠️ 2026-08-25 Ocean 报的「双击批注和工具栏的批注都跳不进批注框,
  // 打的字还是进正文」就是它们：现在 openEditor 一次把两个字段都打开,所以盯 editingContent
  // 那条**每次都成立**,而它是 passive effect —— 跑在下面那条 layout effect **之后**,
  // 于是刚落到批注上的光标又被抢回正文。⛔ 别把它们加回来:落点只有下面那一处说了算。

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

  // ⛔⛔ 这里原来有两个「自动关掉查找」的 effect，2026-08-27 一起删掉了。
  //
  // Ocean 的报告：「查找固定的导航有 bug，不能长期显示，点击外面就会消失」。两个都是元凶：
  //   1. click-outside —— 在正文里点一下（想把光标放到某个词上、想划一段、想点另一块看看
  //      是不是它），查找条就没了。而**点外面正是查找的用法**：找到了就要去看、去改。
  //   2. 滚开两百像素就关（wheel / touchmove）—— 上下翻着看别的命中，翻着翻着它自己关了。
  // 两条都是「替用户决定他找完了」。⌘F 那一栏在别的软件里从来不这样：开着就是开着，
  // 直到人按 ✕ 或 Esc。现在也是——那两条路仍然在（InBlockNavigator 的 ✕、useSearch 的 Esc）。
  //
  // ⚠️ 想加回任何一条之前先问一句：用户下一步要做的事，是不是正好会触发它。

  // Auto-collapse on outside-click: once a block is expanded, a mousedown anywhere
  // outside its article snaps it back to truncated view. Skipped while editing —
  // the textarea covers the truncation path, so the listener firing mid-edit would
  // leave the block silently collapsed and the user would land on a re-truncated
  // view after blur. Only attached when the listener has work to do.
  //
  // ⚠️⚠️ V2 ① (2026-08-25) — `manuallyExpanded` is why this effect still has a job.
  // This effect was written when collapsed-by-default was the rule: "expanded" could only
  // ever mean "the user opened this one", so snapping back on outside-click RESTORED the
  // default. Now that every block starts expanded, an unguarded version would read
  // "expanded" on all of them at mount and the FIRST click anywhere — another block, the
  // sidebar, empty space — would collapse the entire feed. That is not a smaller version
  // of V2, it is V2 undone by the first click, and worse than today because it is invisible
  // until it happens.
  // ⛔ So this is deliberately NOT deleted (the workplan's 「别顺手删掉」): scoped to blocks
  // the user expanded BY HAND, it does exactly the job it was written for — you collapsed a
  // long block, opened it again to read it, clicked away, and it returns to how you left it.
  useEffect(() => {
    if (collapsed || !manuallyExpanded.current || editingContent || editingAnnotation) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const article = articleRef.current;
      if (!article) return;
      if (article.contains(e.target as Node)) return;
      setCollapsed(true);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [collapsed, editingContent, editingAnnotation]);

  /** 一格现在存的是什么。⚠️ 读**库里那一份**，不是 draft —— 显示态划词是对已保存文本划的。 */
  const fieldText = useCallback(
    (field: BlockField): string => (field === 'annotation' ? (block.annotation ?? '') : block.content),
    [block.annotation, block.content],
  );

  /** 显示态：这段选区落在哪一格、对应那一格的哪一段字符。null = 不在这一块里，或者不值得包。
   *  ⚠️ 先问正文再问批注，两个节点互不包含，所以谁先问不影响结果。 */
  const resolveSelection = useCallback(
    (sel: Selection): FieldRange | null => {
      const roots: Array<[BlockField, HTMLElement | null]> = [
        ['content', measureRef.current],
        ['annotation', noteViewRef.current],
      ];
      for (const [field, root] of roots) {
        if (!root) continue;
        const raw = rawRangeFromSelection(root, sel);
        if (!raw) continue;
        const text = field === 'annotation' ? (block.annotation ?? '') : block.content;
        if (!isHighlightable(text.slice(raw.start, raw.end))) return null;
        return { ...raw, field };
      }
      return null;
    },
    [block.annotation, block.content],
  );

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
      // Edit mode: whichever of the panel's two textareas holds the cursor. Its own
      // selectionStart/End ARE raw offsets into that field's draft — the same shape display
      // mode arrives at the long way.
      // ⭐ 2026-08-25：以前这里只认正文那一个 textarea，所以光标一进批注框，
      // 「标为重点」就灰掉了（Ocean:「批注无法高亮」）。
      if (editorOpen) {
        const active = document.activeElement;
        const ta =
          active === annotationRef.current
            ? annotationRef.current
            : active === contentRef.current
              ? contentRef.current
              : null;
        if (ta && ta.selectionStart !== ta.selectionEnd) {
          const range = {
            start: ta.selectionStart,
            end: ta.selectionEnd,
            field: (ta === annotationRef.current ? 'annotation' : 'content') as BlockField,
          };
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
      // Display mode: the window selection, in whichever of the two read surfaces it landed.
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clear();
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      // ⚠️ The range, not sel.toString(). The rendered text is missing every marker it
      // spans, so it is the wrong thing to reason about and the wrong thing to search for.
      const found = resolveSelection(sel);
      if (!found) {
        clear();
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      setSelectionRaw(found);
      setSelectionAlreadyHighlighted(
        rangeIsHighlighted(fieldText(found.field), found.start, found.end),
      );
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
  }, [readOnly, editorOpen, highlightPrompt, block.content, block.annotation, resolveSelection]);

  // ⭐ Where the editing panel is drawn: the pane-level host LogView renders. Looked up when
  // the panel opens rather than held from mount, so it survives a thread switch remounting
  // LogView. Null in DigestView (read-only, never edits) — the panel simply never opens.
  const [editorHost, setEditorHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!editorOpen) return;
    setEditorHost(document.querySelector<HTMLElement>('[data-block-editor-host]'));
  }, [editorOpen]);

  // ⭐ 「双击批注 → 输入框跳到批注」. One panel, two fields; this is the only difference the
  // entry point makes. Runs after the portal has mounted, hence layout-effect.
  useLayoutEffect(() => {
    if (!editorOpen || !editorHost) return;
    const el = focusField === 'annotation' ? annotationRef.current : contentRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editorOpen, editorHost, focusField]);

  // Leaving the panel: a click anywhere outside it saves and closes, which is the 「点外面出」
  // half of the gesture Ocean said was already right. ⚠️ mousedown, not click — a click that
  // starts inside the panel and releases outside (a drag-select that overshoots) must NOT
  // count as leaving.
  useEffect(() => {
    if (!editorOpen) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-block-editor-panel]')) return;
      void commitAll();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  });

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

  // ⭐ Every way into edit mode goes through here: double-click on the content, double-click
  // on the note, the ✑ hover action, the toolbar's edit button. They differ ONLY in where the
  // cursor lands —「全部做到一个面板进行编辑」.
  const openEditor = (field: 'content' | 'annotation'): void => {
    setActive(block.id);
    setFocusField(field);
    enterEditMode(() => {
      setEditingContent(true);
      setEditingAnnotation(true);
    });
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

  // v2.8 §20.4: unified-mode cancel. When the user entered edit via double-click both
  // fields are open at once; Esc on either should drop both drafts and close both, so
  // they can't get out of step (one revert, one stale draft committed by a later blur).
  // Save both fields and close. The 完成 button, and a click outside the panel.
  const commitAll = async (): Promise<void> => {
    await Promise.all([commitContent(), commitAnnotation()]);
  };

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
  // ⭐ 2026-08-25：正文和批注**同一个处理器**（Ocean:「批注无法高亮」）。锚点仍然量在正文那
  // 个节点上 —— 提示条画在正文的 `relative` 盒子里，批注在它上面，所以批注那一段量出来的
  // y 是负的，正好把提示条画到批注头上。
  const onSurfaceMouseUp = (): void => {
    if (readOnly || editorOpen) {
      setHighlightPrompt(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setHighlightPrompt(null);
      return;
    }
    const anchor = measureRef.current;
    if (!anchor) {
      setHighlightPrompt(null);
      return;
    }
    // Ocean 2026-08-19:「用鼠标划词的时候也需要出现『更正这里？』的提示，点击可以直接更正，
    // 点击工具栏摩擦太大了」. The range is captured HERE, with the selection still live —
    // clicking either button collapses it, so reading it back later is too late. Both
    // actions in the chip run off this one range.
    const found = resolveSelection(sel);
    if (!found) {
      setHighlightPrompt(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const blockRect = anchor.getBoundingClientRect();
    setHighlightPrompt({
      x: rect.left + rect.width / 2 - blockRect.left,
      y: rect.top - blockRect.top - 4,
      raw: found,
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
  const runHighlight = async (range: FieldRange | null): Promise<void> => {
    if (!range) return;
    const onNote = range.field === 'annotation';
    if (editorOpen) {
      const ta = onNote ? annotationRef.current : contentRef.current;
      const draft = onNote ? annotationDraft : contentDraft;
      const { content: next, changed } = toggleHighlightRange(draft, range.start, range.end);
      if (!changed) return;
      if (onNote) setAnnotationDraft(next);
      else setContentDraft(next);
      // Put the caret after what was just wrapped, so typing continues where they were.
      const caret = next.length - (draft.length - range.end);
      setTimeout(() => {
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(caret, caret);
      }, 0);
      return;
    }
    // Display-mode, on the note: persist it the same way editing the note does.
    // ⚠️ ⛔ 不push撤销 —— `HighlightPayload` 复原的是 `content`，拿它去回滚一次批注改动会把
    // 正文写回旧版本。批注的每一次改动本来就不进撤销栈（`setAnnotation` 也没有），这里一致。
    if (onNote) {
      const before = block.annotation ?? '';
      const { content: next, changed } = toggleHighlightRange(before, range.start, range.end);
      if (!changed) return;
      try {
        await setAnnotation(block.id, next);
      } catch (e) {
        console.error('[highlight] annotation save failed', e);
      }
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
  const startCorrection = (raw: FieldRange | null): void => {
    // ⭐ 2026-08-25（Ocean:「批注不能被更正」）—— 批注上划的句子也能更正了。
    // ⚠️ 存进去的仍然只有 `corrected_quote` 一句原话，**没有「哪一格」这个字段**：
    // 定位那一头（`correctionsBySource`）先在正文里找，找不到再问批注。⛔ 别在这儿多存一个
    // 字段去「记住」它划的是哪一格 —— 那一份记录会在用户改动那一格之后立刻过期，而定位是
    // 每次现算的，永远不会。
    const quote = raw ? fieldText(raw.field).slice(raw.start, raw.end).trim() : '';
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
  // ⭐ An AI note the user has edited by hand. Shown apart from a clean AI note so a reader
  // is never told an AI said something in words the AI did not choose (Ocean:「需要做区分」).
  const noteEdited = annotationEdited(block.annotationBy);
  // ⭐⭐ 2026-08-25（Ocean）：「AI 的批注 UI 应该和用户批注一样，放在 block 顶上，
  // 只是加了 AI 批注的标签。」
  //
  // ⛔ 这一行推翻的是 v14 §9.3「拍板乙」的**排版**那一半：那时候 AI 批注被压到正文下面、
  // 12px 灰字，理由是「W7 让批注成为这一块的名字，而那个名字该由写它的人来起」。
  // 他现在看到的是另一面：**同一件东西（这一块是关于什么的）画在两个地方**，读的时候
  // 要在心里换一次算法。⇒ 位置统一，作者身份改由**标签**来说。
  // ⚠️⚠️ **只动画在哪儿，⛔ 没动权限。** pack 里 AI 批注仍然是 `ai note:`（🧩 Synthesis），
  // 拿不到 💭 Personal —— `annotationAuthor.ts` 一个字没改，`ai-edited` 也仍然算 AI 的。
  const annotationAsTitle = hasNote;
  const annotationView = (
    <div
      // Double-click the annotation itself to edit just the annotation in place
      // (separate from double-clicking the content, which opens both fields).
      onDoubleClick={
        readOnly
          ? undefined
          : () => {
              openEditor('annotation');
            }
      }
      title={readOnly ? undefined : t('双击编辑批注')}
      ref={noteViewRef}
      onMouseUp={readOnly ? undefined : onSurfaceMouseUp}
      className="mb-1.5 font-ui text-[length:var(--block-text)] font-medium leading-[1.55] text-ink"
    >
      {/* 标签走**行内**，不另起一行也不占一列：批注常常是一整句话，用 flex 分成两栏的话
          第二行会缩进到标签右边，读起来像引文。行内的话文字自然绕回左边缘。 */}
      {noteIsAi && (
        <span className="mr-1.5 rounded border border-line px-1 align-[0.15em] text-[10px] font-normal text-muted">
          {noteEdited ? t('AI 批注 · 你改过') : t('AI 批注')}
        </span>
      )}
      {/* Step 3 §20.5: annotations are a read surface too — route through the same
          tokenizer so a ==…== span (and search hits when navigated) renders as a
          highlight, never literal markers. No spine on annotations.
          ⭐ `withOffsets`（2026-08-25）：划词靠 `data-o` 把选区映射回原字符串，没有它这一格
          就只能读、不能划 —— 这正是 Ocean 说的「批注无法高亮」。 */}
      <ContentRuns
        content={block.annotation ?? ''}
        hits={isNavTarget ? hitsForField(navHits, 'annotation') : undefined}
        activeHitIndex={navHitIndex}
        withOffsets
        corrected={noteCorrectedSpans}
        onCorrectedClick={
          noteCorrectionBlocks.length > 0
            ? (id) => setOpenCorrectionId((cur) => (cur === id ? null : (id ?? null)))
            : undefined
        }
      />
    </div>
  );
  /** 批注上那几条更正的卡片。⚠️ 画在批注**外面**：批注那个 div 是 15px / font-medium 的标题
   *  样式，卡片长在里面会连字重一起继承过去。 */
  const noteCorrectionCards = noteCorrectionBlocks.length > 0 && (
    <div className="mb-1.5">
      {noteCorrectionBlocks.map((c) => (
        <CorrectionNote
          key={c.id}
          correction={c}
          quote={correctionQuote.get(c.id) ?? null}
          dimmed={openCorrectionId !== null && openCorrectionId !== c.id}
          onRemove={
            readOnly
              ? undefined
              : () => {
                  setOpenCorrectionId(null);
                  void removeBlock(c.id);
                }
          }
        />
      ))}
    </div>
  );
  // ⛔ 这里以前还有一个「被压到正文底下」的 AI 批注视图（`aiAnnotationView`）。
  // 2026-08-25 Ocean 定了「AI 批注和用户批注一样放在顶上，只是加个标签」之后它就是重复的了 ——
  // 同一句话画两遍。⛔ 别把它加回来：要区分作者，标签在上面那一个视图里。

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
            canCorrect={!editorOpen && selectionRaw !== null}
            onCorrect={() => startCorrection(selectionRaw)}
            onTogglePin={() => onTogglePin?.()}
            onEdit={() => openEditor('content')}
            onHighlight={() => void runHighlightFromToolbar()}
            onAnnotate={() => openEditor('annotation')}
            stale={block.staleAt != null}
            onToggleStale={() => {
              setActive(block.id);
              void setStale(block.id, block.staleAt == null);
            }}
            onDelete={() => onDelete?.()}
            // §9.6.6：单块压缩。⚠️ 只在 API 引擎开着、而且这一块所在的项目还在的时候出现 ——
            // 默认关闭（§6.2 约束 5），一个点了只会说「你还没配」的按钮不如没有。
            onCompress={
              apiEngineEnabled && compressThread
                ? () => void openCompressBlock(compressThread, block)
                : undefined
            }
            // ⭐ v24（R2 §1g）：只有**压过、而且原文还留着**的块才有这个入口。
            // ⚠️ 压过但没留原文（用户关了备份）的块**不给**这个按钮 —— 一个点了会说
            // 「还原不了」的按钮，比没有更伤：它承诺了一件做不到的事。
            // ⭐ 2026-08-23（Ocean 第 5 条）：点它只是**摊开来看**，随时收回去。
            onToggleOriginal={
              hasOriginal ? () => setShowingOriginal((v) => !v) : undefined
            }
            showingOriginal={showingOriginal}
          />
        )}
      </div>

      {/* W7 (DESIGN_WORKBENCH §7, DESIGN_CONTEXT_HYGIENE §3.2 rung one): when someone
          wrote a note about this block, THAT is what the block is — so it reads first and
          the captured original drops below it as quoted material. Blocks with no note are
          untouched: §7 rejected the unconditional version precisely because most blocks
          have none and would have carried a blank headline over demoted prose.
          ⚠️ 2026-08-25 起「someone」包括 AI（Ocean 拍的，见 annotationView 上面那段）——
          谁写的由标签说，不再由位置说。 */}
      {annotationAsTitle && annotationView}
      {annotationAsTitle && noteCorrectionCards}

      {/* ⭐ 2026-08-25 (Ocean, V3 验收): read mode is now the ONLY thing a block draws inline.
          The editor moved out to a pane-filling panel (see the portal at the bottom of this
          component) —「编辑窗口不是固定的,用户需要下滑才能找到」 was the report: the editor
          used to grow in place, so on a long block it opened below the fold. */}
      <div className="relative">
          <div
            ref={measureRef}
            // ⭐ Double-click opens the editing panel with BOTH fields in it and puts the
            // cursor in the content —「全部做到一个面板进行编辑」.
            onDoubleClick={readOnly ? undefined : () => openEditor('content')}
            // v2.8 §20.5: capture selection on mouseup so the prompt anchors to the
            // user's released selection rect.
            onMouseUp={readOnly ? undefined : onSurfaceMouseUp}
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
              // ⚠️ AI 批注也算（08-25）：Ocean 要的是「和用户批注一样」，⛔ 一样就包括
              // 正文让位这一半 —— 只把标签挪上去、正文还占着 15px 的话，两句会打架。
              annotationAsTitle
                ? 'border-l-2 border-line pl-2 text-[length:var(--block-text-2)] text-ink-2'
                : 'text-[length:var(--block-text)] text-ink'
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
                // ⭐ S5：更正卡跟在**它划的那一句所在的那一段**底下。⛔ 这是它们**唯一**
                // 被画出来的地方 —— `BlockFeed` 把这几块挡在时间线外，多画一处就是双份。
                afterBlock={
                  correctionAt.length === 0
                    ? undefined
                    : (start, end) => {
                        const here = correctionAt.filter(
                          (c) => c.at >= start && c.at < end,
                        );
                        if (here.length === 0) return null;
                        return here.map(({ block: c }) => (
                          <CorrectionNote
                            key={c.id}
                            correction={c}
                            quote={correctionQuote.get(c.id) ?? null}
                            dimmed={openCorrectionId !== null && openCorrectionId !== c.id}
                            onRemove={
                              readOnly
                                ? undefined
                                : () => {
                                    setOpenCorrectionId(null);
                                    // ⭐ 2026-08-25（Ocean）:「取消更正后，更正的内容会变成
                                    // 一个 block，修复，直接消失。」
                                    // ⛔ 以前这里只是**解开关系**（`clearSupersession`）——
                                    // 那一块本身留在时间线上，成了一条没头没尾的孤块：
                                    // 它的全部内容就是「这句话应该是……」，脱离了它更正的那
                                    // 一句之后没人读得懂。现在整块删掉。
                                    // ⚠️ 走的是普通删除那条路，所以它进撤销栈 —— ⌘Z 能拿回来。
                                    void removeBlock(c.id);
                                  }
                            }
                          />
                        ));
                      }
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
              {!readOnly && !editorOpen && highlightPrompt.raw && (
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
                setCollapsed((v) => {
                  // Records "expanded is the user's choice here", which is what arms the
                  // outside-click re-fold above. Collapsing disarms it again.
                  manuallyExpanded.current = v;
                  return !v;
                });
              }}
              className="mt-1 text-[11px] text-muted hover:text-accent"
            >
              {collapsed ? t('展开全部') : t('收起')}
            </button>
          )}
      </div>


      {/* v2.4 P2-3: quiet citation line — the feed counterpart of the pack's ↩ cites
          row. Only MCP-written blocks carry refBlockId, so most blocks skip this.
          v13: the same line, with the relation's own verb (DESIGN_CONTEXT_HYGIENE §3.1). */}
      {block.refBlockId && (
        <CitationLine
          refBlockId={block.refBlockId}
          refKind={block.refKind}
          fromThreadId={block.threadId}
        />
      )}

      {/* 2026-08-19 — the corrections attached to this block, under the sentence they are about,
          joined to it by the dashed rule in CorrectionNote.
          ⭐ S5（2026-08-24）：它们**搬到正文里面去了**（`MarkdownContent` 的 `afterBlock`），
          每条跟在它划的那一句所在的那一段底下 —— ⛔ 所以这里不许再画一遍。
          点一句仍然有用：那一句的卡片亮起来，别的暗下去（`dimmed`）。 */}

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

      {/* ⭐⭐ 2026-08-23（Ocean 真手指验收第 5 条）：压缩前的原文，摊在这一块底下。
          他的原话：「如果用户想看压缩前的 block，现在的按钮只能回退到原文，**不能再次
          回到压缩后文本**，修改。」

          ⚠️⚠️ **它是一块另开的只读区域，⛔ 不是把上面那段正文换掉。** 这不是排版偏好：
          上面那段带着 `withOffsets`，划词、高亮、更正全都按 `block.content` 的字符下标定位
          （工程护栏：「选区一律走 data-o 偏移映射」）。在那个节点里塞另一份文本，
          下一次划词就会落到错的字上 —— 而且屏幕上看不出来。

          ⚠️ 打包出去的**永远是上面那一份**（`assemble` 读 `b.content`），压过就带压缩后的，
          原文一份都不进 pack —— 收件 AI 想看原文要自己来问（MCP 的 `get_block_original`）。
          ⛔ 这一条是 Ocean 定的：「打包的时候只能带上一份 block，只要有压缩就带有压缩的。」 */}
      {hasOriginal && showingOriginal && (
        <div className="mt-2 rounded-md border border-line bg-paper-2/40 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-muted">
            <span>{t('压缩前的原文（只是给你看，库里存的还是上面那一份）')}</span>
            <button
              type="button"
              onClick={() => setShowingOriginal(false)}
              className="transition-colors hover:text-accent"
            >
              {t('收起')}
            </button>
            {/* ⭐ 真的换回去是**另一件事**，所以它在这儿、要多点一下 ——
                ⚠️ 换回去之后这一块就当没压过（🗜 记号没了，以后还会被排进压缩）。 */}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  // 换回去之后这一块就没有「压缩前的原文」了，摊开的这一块跟着收起来。
                  setShowingOriginal(false);
                  void restoreOriginal(block.id);
                }}
                title={t('把上面那段正文换成这一份原文。这一块从此当作没压过，以后还会被排进压缩。')}
                className="transition-colors hover:text-accent"
              >
                {t('用回这一份')}
              </button>
            )}
          </div>
          <div className="whitespace-pre-wrap break-words font-ui text-[length:var(--block-text-2)] leading-[1.65] text-ink-2">
            <MarkdownContent content={block.originalContent!} />
          </div>
        </div>
      )}


      {/* ⭐⭐ 2026-08-25 (Ocean, V3 验收) — THE editing surface. One panel, both fields,
          filling the whole thread pane:「让编辑窗口直接填满整个背景,让背景窗口成为一个
          block 的工作区」.
          ⛔ No dim behind it (that was the first version and he rejected it) and ⛔ it does
          not grow inline any more —「用户需要下滑才能找到编辑窗口」 was the bug.
          ⚠️ Neither textarea commits on blur. They used to, and in a two-field panel that is
          a trap: moving the cursor from the content to the note would have blurred the
          content, committed it and closed the panel out from under the user. Saving happens
          on 完成, on Esc-cancel, or on a click outside the panel. */}
      {editorOpen &&
        editorHost &&
        createPortal(
          <div
            data-block-editor-panel
            className="pointer-events-auto absolute inset-0 flex flex-col bg-paper"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-2.5">
              <span className="font-ui text-[11px] text-muted">
                {t('正在编辑这一块 · Esc 放弃')}
              </span>
              <div className="flex items-center gap-2">
                {/* ⚠️ The hover toolbar lives on the article, which this panel now covers, so
                    ==重点== had to come along or it would have quietly stopped being
                    reachable while editing — the one mode where you are most likely to want
                    it. Same handler as the toolbar's button. */}
                <button
                  type="button"
                  disabled={selectionRaw === null}
                  onMouseDown={(e) => e.preventDefault()} // keep the selection alive
                  onClick={() => void runHighlightFromToolbar()}
                  className="rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                  title={t('标为重点（包裹 ==选区==）')}
                >
                  {selectionAlreadyHighlighted ? t('取消重点') : t('标为重点')}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // don't pull focus out of the field first
                  onClick={() => void commitAll()}
                  className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[11px] text-accent hover:bg-accent/10"
                >
                  {t('完成')}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
              <textarea
                ref={contentRef}
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (isImeComposing(e.nativeEvent)) return;
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelAll();
                  }
                }}
                // `flex-1` + `min-h-0`: the content field takes whatever the note leaves,
                // so the panel is full at any window size without a hardcoded height.
                className="min-h-0 flex-1 resize-none rounded-md border border-line-strong bg-paper px-3.5 py-3 font-ui text-[length:var(--block-text)] leading-[1.65] text-ink outline-none focus:border-accent"
                spellCheck={false}
              />

              <div className="shrink-0">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="font-ui text-[11px] text-muted">{t('批注')}</span>
                  {/* ⭐「AI 批注可以人为修改,不能人为新增」 —— the label says who wrote it, and
                      once the user edits an AI note it says BOTH things (annotationAuthor.ts
                      'ai-edited'). ⛔ There is no control here that creates an AI note. */}
                  {hasNote && noteIsAi && (
                    <span className="rounded border border-line px-1 text-[10px] text-muted">
                      {noteEdited ? t('AI 批注 · 你改过') : t('AI 批注')}
                    </span>
                  )}
                </div>
                <textarea
                  ref={annotationRef}
                  value={annotationDraft}
                  onChange={(e) => setAnnotationDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (isImeComposing(e.nativeEvent)) return;
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelAll();
                    }
                    // §3.6: Enter inserts a newline — never commits. Also what keeps a
                    // Chinese-IME Enter (confirming a candidate) from ending the note.
                  }}
                  rows={3}
                  placeholder={
                    hasNote && noteIsAi ? t('改这条 AI 批注（不会变成你写的）') : t('批注（可选）')
                  }
                  className="w-full resize-none rounded border border-line bg-paper-2/30 px-2.5 py-2 font-ui text-[length:var(--block-text-2)] italic leading-[1.55] text-ink-2 placeholder:text-muted/60 outline-none focus:border-line-strong"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>,
          editorHost,
        )}
    </article>
  );
}
