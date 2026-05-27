import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  isCurrentlyHighlighted,
  isHighlightable,
  toggleHighlight,
} from '@/lib/blocks/highlight';
import { SegmentedContent } from '@/lib/blocks/SegmentedContent';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { basename, pickFiles } from '@/lib/utils/openTarget';
import { formatBlockTime } from '@/lib/utils/time';
import { useActiveBlockStore } from '@/stores/activeBlockStore';
import { useBlocksStore } from '@/stores/blocksStore';
import { useDropStore } from '@/stores/dropStore';
import BlockActions from './BlockActions';
import BlockAttachments from './BlockAttachments';
import RefBlockItem from './RefBlockItem';
import SourceBadge from './SourceBadge';

interface Props {
  block: Block;
  attachments: readonly Attachment[];
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
  onCopy?: () => void;
  onDelete?: () => void;
}

// Collapsed line cap for smart truncation (PLAN_EN.md §9.3 / §Phase 6). 6 lines is
// enough that a paragraph-sized capture reads in full while a long PDF dump or chat
// snippet still earns the toggle. Compared via DOM scrollHeight vs clientHeight in a
// layout effect — driving it off `content.split('\n').length` alone misses wrap-long
// single lines and reports false positives on short blocks with display newlines.
const COLLAPSED_LINES = 6;

const isUrl = (s: string): boolean => /^https?:\/\//i.test(s.trim());

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

// Phase 10: ref blocks have an entirely different UI (no edit, source, annotation,
// attachments), so dispatch by kind rather than branching mid-component — keeps each
// renderer's hook order unconditional.
export default function BlockItem(props: Props) {
  if (props.block.kind === 'ref') {
    return <RefBlockItem block={props.block} readOnly={props.readOnly} onDelete={props.onDelete} />;
  }
  return <TextBlockItem {...props} />;
}

function TextBlockItem({
  block,
  attachments,
  highlight,
  readOnly,
  selected,
  anySelected,
  onSelectClick,
  onTogglePin,
  onCopy,
  onDelete,
}: Props) {
  const setContent = useBlocksStore((s) => s.setContent);
  const setAnnotation = useBlocksStore((s) => s.setAnnotation);
  const attach = useBlocksStore((s) => s.attach);
  const detach = useBlocksStore((s) => s.detach);
  const setIncludeInPack = useBlocksStore((s) => s.setIncludeInPack);

  // Action-bar reveal is JS-driven (not CSS group-hover): mouseleave deterministically
  // clears it, so the bar can't get stuck visible when the cursor moves to the block
  // below. See PLAN_EN.md §9.3.
  const [hovered, setHovered] = useState(false);

  // True while a Finder drag hovers *this* block — draws the drop-target ring so the
  // user can see exactly which block the attachment will land on (§9.6).
  const isDropTarget = useDropStore((s) => s.targetBlockId === block.id);

  // v2.9 §9.3 / §19.18: brief background tint marking the most-recently-acted-upon
  // block, so the user keeps orientation across edit / collapse / annotate cycles.
  const isActive = useActiveBlockStore((s) => s.activeBlockId === block.id);
  const setActive = useActiveBlockStore((s) => s.setActive);

  // Inline-edit state for the captured text. We commit on blur/Enter (per §9.3) so
  // the user never has to look for a Save button. Esc reverts to the pre-edit value.
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(block.content);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Annotation editor. Visually separate (paper-2 background) so a reader can tell
  // "the user wrote this" apart from "the user captured this".
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(block.annotation ?? '');
  const annotationRef = useRef<HTMLTextAreaElement>(null);

  // URL attach affordance for the 📎 hover action. Files/folders come via drag from
  // Finder (handled in LogView), so the button is purposefully URL-only — see Phase 6
  // decision: keeping a hidden file-input would not return absolute paths in a Tauri
  // webview, and adding plugin-dialog needs PLAN §4 sign-off.
  const [attachingUrl, setAttachingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const urlRef = useRef<HTMLInputElement>(null);

  // Smart truncation: detect overflow against the collapsed cap. Re-measure when the
  // content text changes (the block could just have been edited).
  const measureRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [needsTruncation, setNeedsTruncation] = useState(false);

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
    { x: number; y: number; text: string } | null
  >(null);
  // Last-known selected text *within this block*, refreshed on selectionchange.
  // Drives `canHighlight` for the toolbar button in both display and edit mode.
  const [highlightableSelection, setHighlightableSelection] = useState<string | null>(null);
  // True iff the current selection already sits inside a `==…==` highlight — flips
  // the toolbar button into "un-highlight" mode (different icon + title) so the user
  // can undo a highlight without retyping. Updated on the same selectionchange tick
  // as highlightableSelection.
  const [selectionAlreadyHighlighted, setSelectionAlreadyHighlighted] = useState(false);

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

  useEffect(() => {
    if (attachingUrl && urlRef.current) urlRef.current.focus();
  }, [attachingUrl]);

  useLayoutEffect(() => {
    if (editingContent) return; // measurement only applies to the rendered prose path
    const el = measureRef.current;
    if (!el) return;
    setNeedsTruncation(el.scrollHeight - el.clientHeight > 1);
  }, [block.content, collapsed, editingContent]);

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
      // Edit mode: read directly from the textarea.
      if (editingContent) {
        const ta = contentRef.current;
        if (ta && document.activeElement === ta && ta.selectionStart !== ta.selectionEnd) {
          const text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
          if (isHighlightable(text)) {
            setHighlightableSelection(text);
            // Edit-mode highlight check: read the textarea's own buffer (the draft),
            // not the persisted block.content — the user may have just typed ==.
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const before = ta.value.slice(Math.max(0, start - 2), start);
            const after = ta.value.slice(end, end + 2);
            setSelectionAlreadyHighlighted(before === '==' && after === '==');
          } else {
            setHighlightableSelection(null);
            setSelectionAlreadyHighlighted(false);
          }
        } else {
          setHighlightableSelection(null);
          setSelectionAlreadyHighlighted(false);
        }
        return;
      }
      // Display mode: window selection must be inside this block's content.
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setHighlightableSelection(null);
        setSelectionAlreadyHighlighted(false);
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const container = measureRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setHighlightableSelection(null);
        setSelectionAlreadyHighlighted(false);
        return;
      }
      const text = sel.toString();
      if (!isHighlightable(text)) {
        setHighlightableSelection(null);
        setSelectionAlreadyHighlighted(false);
        if (highlightPrompt) setHighlightPrompt(null);
        return;
      }
      setHighlightableSelection(text);
      setSelectionAlreadyHighlighted(isCurrentlyHighlighted(block.content, text));
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
    const text = sel.toString();
    if (!isHighlightable(text)) {
      setHighlightPrompt(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const blockRect = container.getBoundingClientRect();
    setHighlightPrompt({
      x: rect.left + rect.width / 2 - blockRect.left,
      y: rect.top - blockRect.top - 4,
      text,
    });
  };

  // Unified toggle action used by BOTH the floating prompt and the toolbar button.
  // Wraps a plain selection in `==…==`; UN-wraps it when the selection already sits
  // inside an existing highlight. The wrap/unwrap routing lives in
  // toggleHighlight (highlight.ts) so the UI doesn't branch twice.
  //
  // `editingContent` controls where the change lands:
  //  - display → persist via setContent immediately.
  //  - edit    → mutate the textarea draft, so the change rides the normal
  //              blur-commit and the user keeps editing without losing context.
  const runHighlight = async (selected: string): Promise<void> => {
    const trimmed = selected.trim();
    if (!trimmed) return;
    if (editingContent) {
      const ta = contentRef.current;
      const draft = contentDraft;
      // Prefer the textarea's actual selection range — lets us toggle the exact
      // span the user grabbed instead of the first-match heuristic.
      if (ta && ta.selectionStart !== ta.selectionEnd) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const inSel = draft.slice(start, end);
        const before = draft.slice(Math.max(0, start - 2), start);
        const after = draft.slice(end, end + 2);
        if (before === '==' && after === '==') {
          // Un-highlight: strip the surrounding markers.
          const next = draft.slice(0, start - 2) + inSel + draft.slice(end + 2);
          setContentDraft(next);
          setTimeout(() => {
            if (!ta) return;
            ta.focus();
            ta.setSelectionRange(start - 2, end - 2);
          }, 0);
          return;
        }
        // Wrap, but only for plain selections (no embedded markers).
        if (!isHighlightable(inSel)) return;
        const next = draft.slice(0, start) + '==' + inSel + '==' + draft.slice(end);
        setContentDraft(next);
        setTimeout(() => {
          if (!ta) return;
          ta.focus();
          ta.setSelectionRange(end + 4, end + 4);
        }, 0);
        return;
      }
      const { content: next, changed } = toggleHighlight(draft, trimmed);
      if (!changed) return;
      setContentDraft(next);
      return;
    }
    // Display-mode path: persist immediately via the store.
    const { content: next, changed } = toggleHighlight(block.content, trimmed);
    if (!changed) return;
    try {
      await setContent(block.id, next);
    } catch (e) {
      console.error('[highlight] save failed', e);
    }
  };

  const confirmHighlight = async (): Promise<void> => {
    if (!highlightPrompt) return;
    const text = highlightPrompt.text;
    setHighlightPrompt(null);
    window.getSelection()?.removeAllRanges();
    await runHighlight(text);
  };

  // Toolbar-button entry: works in both modes. Falls back to the floating prompt's
  // last captured selection if there isn't a live window selection (e.g. the user
  // moved focus to the toolbar via keyboard after selecting).
  const runHighlightFromToolbar = async (): Promise<void> => {
    const live = highlightableSelection;
    if (!live) return;
    setHighlightPrompt(null);
    await runHighlight(live);
    // Clear the cached selection so the button disables until the user re-selects.
    setHighlightableSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const commitUrl = async (): Promise<void> => {
    const target = urlDraft.trim();
    setAttachingUrl(false);
    setUrlDraft('');
    if (!target) return;
    if (!isUrl(target)) {
      console.warn('[attach] ignored non-URL input:', target);
      return;
    }
    try {
      // Default label = the URL's host, falling back to the raw string. Domain reads
      // cleaner than a 200-char share URL in the chip row.
      let label = target;
      try {
        label = new URL(target).host || target;
      } catch {
        /* keep raw */
      }
      await attach({ blockId: block.id, kind: 'url', target, label });
    } catch (e) {
      console.error('[attach] failed', e);
    }
  };

  const cancelUrl = (): void => {
    setUrlDraft('');
    setAttachingUrl(false);
  };

  // 📎 action: pick one or more files via the native dialog and attach each to this
  // block. Folders still come through Finder drag (the open panel can't mix them).
  const handleAttachFile = async (): Promise<void> => {
    try {
      const paths = await pickFiles();
      for (const p of paths) {
        await attach({ blockId: block.id, kind: 'file', target: p, label: basename(p) });
      }
    } catch (e) {
      console.error('[attach] file picker failed', e);
    }
  };

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
              // setActive explicitly; the rest (pin/copy/delete/attach/highlight,
              // attachment chips, source-badge editor, inline textareas) are
              // deliberately excluded so a destructive click doesn't tint the row.
              if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
              setActive(block.id);
            }
      }
      className={`group relative rounded-md border bg-paper/40 px-3.5 py-2.5 transition-shadow ${
        block.pinned ? 'pl-4' : ''
      } ${
        isDropTarget
          ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-paper'
          : 'border-line/60'
      } ${highlight ? 'flash' : ''} ${isActive ? 'block-active' : ''}`}
    >
      {block.pinned && (
        <span className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r bg-accent" />
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
            title={selected ? '取消选择' : 'Shift 点击可范围选择'}
            aria-label={selected ? '取消选择' : '选择此 block'}
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
              selected
                ? 'border-accent bg-accent text-paper'
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
        <time className="font-mono">{formatBlockTime(block.createdAt)}</time>
        <SourceBadge block={block} readOnly={readOnly} />
        {!readOnly && (
          <BlockActions
            // v2.8 §20.5 follow-up: keep the action bar visible while editing so the
            // highlight button can wrap a textarea selection without the user having
            // to leave edit mode first.
            visible={hovered || editingContent}
            pinned={block.pinned}
            canHighlight={highlightableSelection !== null}
            selectionAlreadyHighlighted={selectionAlreadyHighlighted}
            onTogglePin={() => onTogglePin?.()}
            onEdit={() => enterEditMode(() => setEditingContent(true))}
            onAttachFile={() => void handleAttachFile()}
            onAttachUrl={() => setAttachingUrl((v) => !v)}
            onHighlight={() => void runHighlightFromToolbar()}
            onAnnotate={() => {
              setActive(block.id);
              enterEditMode(() => setEditingAnnotation(true));
            }}
            onCopy={() => onCopy?.()}
            onDelete={() => onDelete?.()}
          />
        )}
      </div>

      {editingContent ? (
        <textarea
          ref={contentRef}
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onBlur={() => void commitContent()}
          onKeyDown={(e) => {
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
            title={readOnly ? undefined : '双击编辑（含批注）'}
            style={
              collapsed
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: COLLAPSED_LINES,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
                : undefined
            }
            className="whitespace-pre-wrap break-words font-ui text-[15px] leading-[1.65] text-ink"
          >
            {/* v2.8 §20.1 follow-up: merged blocks whose content carries the per-
                segment annotation marker render as a list of segments with each
                annotation visually attached. Un-merged blocks (and merged blocks
                without per-segment annotations) take SegmentedContent's fast path
                and render identically to HighlightedContent. */}
            <SegmentedContent content={block.content} />
          </div>
          {highlightPrompt && (
            <button
              type="button"
              onMouseDown={(e) => {
                // Prevent the click from collapsing the selection before our handler reads it.
                e.preventDefault();
              }}
              onClick={() => void confirmHighlight()}
              style={{
                position: 'absolute',
                left: highlightPrompt.x,
                top: highlightPrompt.y,
                transform: 'translate(-50%, -100%)',
              }}
              className="z-20 whitespace-nowrap rounded-md border border-line-strong bg-paper px-2 py-1 font-ui text-[11px] text-ink shadow-[var(--shadow-toast)] hover:border-accent hover:text-accent"
            >
              {selectionAlreadyHighlighted ? '取消重点?' : '标为重点?'}
            </button>
          )}
          {(needsTruncation || !collapsed) && (
            <button
              type="button"
              onClick={() => {
                setActive(block.id);
                setCollapsed((v) => !v);
              }}
              className="mt-1 text-[11px] text-muted hover:text-accent"
            >
              {collapsed ? '展开全部' : '收起'}
            </button>
          )}
        </div>
      )}

      {/* Annotation. Read-only view stays visually distinct (left rule + paper-2 tint)
          so it never reads as part of the captured source text. The edit textarea (v2.8
          §20.4) is quiet and subordinate to the content textarea above — smaller font,
          muted color, lighter border — so most blocks (which won't have annotations)
          show a barely-there input rather than competing for attention. */}
      {(block.annotation || editingAnnotation) &&
        (editingAnnotation ? (
          <textarea
            ref={annotationRef}
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            onBlur={() => void commitAnnotation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                // v2.8 §20.4: in unified edit mode Esc on either field cancels both.
                if (editingContent) cancelAll();
                else cancelAnnotation();
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void commitAnnotation();
              }
            }}
            rows={2}
            placeholder="批注（可选）"
            className="mt-1.5 w-full resize-none rounded border border-line bg-paper-2/30 px-2 py-1 font-ui text-[12px] italic leading-[1.5] text-muted placeholder:text-muted/60 outline-none focus:border-line-strong focus:text-ink-2"
            spellCheck={false}
          />
        ) : (
          <div className="mt-2 border-l-2 border-accent/60 bg-paper-2/30 px-2 py-1 font-ui text-[13px] italic leading-[1.55] text-ink-2">
            {block.annotation}
          </div>
        ))}

      {attachingUrl && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            ref={urlRef}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => {
              if (!urlDraft.trim()) cancelUrl();
              else void commitUrl();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitUrl();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelUrl();
              }
            }}
            placeholder="https://…  （Enter 添加，Esc 取消）"
            className="flex-1 rounded border border-line-strong bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-accent"
            spellCheck={false}
          />
        </div>
      )}

      <BlockAttachments
        attachments={attachments}
        onDetach={readOnly ? undefined : (aid) => void detach(aid, block.id)}
        onSetIncludeInPack={
          readOnly ? undefined : (aid, v) => void setIncludeInPack(aid, block.id, v)
        }
      />
    </article>
  );
}
