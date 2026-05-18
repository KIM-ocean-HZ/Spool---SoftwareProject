import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { basename, pickFiles } from '@/lib/utils/openTarget';
import { formatBlockTime } from '@/lib/utils/time';
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
  onTogglePin,
  onCopy,
  onDelete,
}: Props) {
  const setContent = useBlocksStore((s) => s.setContent);
  const setAnnotation = useBlocksStore((s) => s.setAnnotation);
  const attach = useBlocksStore((s) => s.attach);
  const detach = useBlocksStore((s) => s.detach);

  // Action-bar reveal is JS-driven (not CSS group-hover): mouseleave deterministically
  // clears it, so the bar can't get stuck visible when the cursor moves to the block
  // below. See PLAN_EN.md §9.3.
  const [hovered, setHovered] = useState(false);

  // True while a Finder drag hovers *this* block — draws the drop-target ring so the
  // user can see exactly which block the attachment will land on (§9.6).
  const isDropTarget = useDropStore((s) => s.targetBlockId === block.id);

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
  const [collapsed, setCollapsed] = useState(true);
  const [needsTruncation, setNeedsTruncation] = useState(false);

  useEffect(() => {
    if (!editingContent) setContentDraft(block.content);
  }, [block.content, editingContent]);

  useEffect(() => {
    if (!editingAnnotation) setAnnotationDraft(block.annotation ?? '');
  }, [block.annotation, editingAnnotation]);

  useEffect(() => {
    if (editingContent && contentRef.current) {
      const el = contentRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingContent]);

  useEffect(() => {
    if (editingAnnotation && annotationRef.current) {
      const el = annotationRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingAnnotation]);

  useEffect(() => {
    if (attachingUrl && urlRef.current) urlRef.current.focus();
  }, [attachingUrl]);

  useLayoutEffect(() => {
    if (editingContent) return; // measurement only applies to the rendered prose path
    const el = measureRef.current;
    if (!el) return;
    setNeedsTruncation(el.scrollHeight - el.clientHeight > 1);
  }, [block.content, collapsed, editingContent]);

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
      data-block-id={block.id}
      onMouseEnter={readOnly ? undefined : () => setHovered(true)}
      onMouseLeave={readOnly ? undefined : () => setHovered(false)}
      className={`group relative rounded-md border bg-paper/40 px-3.5 py-2.5 transition-shadow ${
        block.pinned ? 'pl-4' : ''
      } ${
        isDropTarget
          ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-paper'
          : 'border-line/60'
      } ${highlight ? 'flash' : ''}`}
    >
      {block.pinned && (
        <span className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r bg-accent" />
      )}

      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted">
        <time className="font-mono">{formatBlockTime(block.createdAt)}</time>
        <SourceBadge block={block} readOnly={readOnly} />
        {!readOnly && (
          <BlockActions
            visible={hovered}
            pinned={block.pinned}
            onTogglePin={() => onTogglePin?.()}
            onEdit={() => setEditingContent(true)}
            onAttachFile={() => void handleAttachFile()}
            onAttachUrl={() => setAttachingUrl((v) => !v)}
            onAnnotate={() => setEditingAnnotation(true)}
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
              cancelContent();
            }
          }}
          rows={Math.min(12, Math.max(2, contentDraft.split('\n').length + 1))}
          className="w-full resize-none rounded border border-line-strong bg-paper px-2 py-1.5 font-ui text-[15px] leading-[1.65] text-ink outline-none focus:border-accent"
          spellCheck={false}
        />
      ) : (
        <>
          <div
            ref={measureRef}
            onDoubleClick={readOnly ? undefined : () => setEditingContent(true)}
            title={readOnly ? undefined : '双击编辑'}
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
            {block.content}
          </div>
          {(needsTruncation || !collapsed) && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="mt-1 text-[11px] text-muted hover:text-accent"
            >
              {collapsed ? '展开全部' : '收起'}
            </button>
          )}
        </>
      )}

      {/* Annotation — visually distinct (left rule + paper-2 tint) so it never reads
          as part of the captured source text. */}
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
                cancelAnnotation();
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void commitAnnotation();
              }
            }}
            rows={2}
            placeholder="写一条批注…（Enter 保存，Shift+Enter 换行，Esc 取消）"
            className="mt-2 w-full resize-none rounded border-l-2 border-accent bg-paper-2/40 px-2 py-1 font-ui text-[13px] italic leading-[1.55] text-ink-2 outline-none focus:border-accent"
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
      />
    </article>
  );
}
