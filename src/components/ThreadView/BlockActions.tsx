import {
  CircleSlash,
  Highlighter,
  Link as LinkIcon,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Replace,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';

interface Props {
  // Drives reveal. Owned by BlockItem's hovered state instead of CSS group-hover so a
  // fast cursor move always clears it — webkit sometimes leaves :hover stuck.
  visible: boolean;
  pinned: boolean;
  // v2.8 §20.5 follow-up: dogfooding showed users don't always discover the floating
  // "标为重点?" prompt — surface highlight as an explicit hover-bar action too. The
  // button is enabled iff a selection currently sits inside this block (display or
  // edit mode); BlockItem owns that state and reports it via `canHighlight`.
  canHighlight: boolean;
  // True iff the current selection already sits inside a `==…==` highlight — flips
  // the toolbar action's tooltip + visual into the "un-highlight" affordance. Drives
  // CLAUDE.md §1 "no silent mode change" — the user sees from the button that the
  // click will REMOVE rather than ADD.
  selectionAlreadyHighlighted: boolean;
  // DESIGN_CONTEXT_HYGIENE §3.1 — the two supersession entry points. `stale` reflects
  // whether the user has already retired this block, so the button is its own undo.
  // `hasSupersession` flips 「它更正了哪一条」 into the way to take that back.
  stale: boolean;
  hasSupersession: boolean;
  onTogglePin: () => void;
  onEdit: () => void;
  onAttachFile: () => void;
  onAttachUrl: () => void;
  onHighlight: () => void;
  onAnnotate: () => void;
  onToggleStale: () => void;
  onSupersede: () => void;
  onDelete: () => void;
}

interface ActionBtnProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
  emphasis?: 'normal' | 'accent';
  disabled?: boolean;
}

// Hover-revealed action bar per PLAN_EN.md §9.3: pin / edit / attach file / attach
// link / highlight / annotate / copy / delete.
function ActionBtn({
  title,
  onClick,
  children,
  emphasis = 'normal',
  disabled = false,
}: ActionBtnProps) {
  const hover = emphasis === 'accent' ? 'hover:text-accent' : 'hover:text-ink';
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      // mousedown.preventDefault on the highlight button avoids collapsing the user's
      // selection before onClick fires. Doing it on every button is harmless and
      // keeps focus stable when other buttons are clicked from inside an editor.
      onMouseDown={(e) => e.preventDefault()}
      className={`rounded p-1 text-muted hover:bg-paper-2 ${hover} disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}

export default function BlockActions({
  visible,
  pinned,
  canHighlight,
  selectionAlreadyHighlighted,
  stale,
  hasSupersession,
  onTogglePin,
  onEdit,
  onAttachFile,
  onAttachUrl,
  onHighlight,
  onAnnotate,
  onToggleStale,
  onSupersede,
  onDelete,
}: Props) {
  const t = useT();
  const highlightTitle = !canHighlight
    ? t('先选中要标重点的文字')
    : selectionAlreadyHighlighted
      ? t('取消重点（移除 ==…==）')
      : t('标为重点（包裹 ==选区==）');
  return (
    <div
      className={`ml-auto flex items-center gap-0.5 transition-opacity ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <ActionBtn title={pinned ? t('取消置顶') : t('置顶')} onClick={onTogglePin} emphasis="accent">
        {pinned ? <PinOff size={11} /> : <Pin size={11} />}
      </ActionBtn>
      <ActionBtn title={t('编辑文本')} onClick={onEdit}>
        <Pencil size={11} />
      </ActionBtn>
      <ActionBtn title={t('附加文件')} onClick={onAttachFile}>
        <Paperclip size={11} />
      </ActionBtn>
      <ActionBtn title={t('附加链接')} onClick={onAttachUrl}>
        <LinkIcon size={11} />
      </ActionBtn>
      <ActionBtn
        title={highlightTitle}
        onClick={onHighlight}
        emphasis="accent"
        disabled={!canHighlight}
      >
        {/* Icon flips: Highlighter for wrap, struck-through icon for unwrap.
            Using the same Highlighter glyph but desaturated + a small slash via
            line-through underline keeps the bar visually quiet. */}
        <Highlighter
          size={11}
          className={
            canHighlight && selectionAlreadyHighlighted ? 'line-through' : ''
          }
        />
      </ActionBtn>
      <ActionBtn title={t('添加批注')} onClick={onAnnotate}>
        <MessageSquarePlus size={11} />
      </ActionBtn>
      {/* DESIGN_CONTEXT_HYGIENE §3.1, the two entry points. The first is on the OLD block
          («这条不作数了»), the second on the NEW one («它更正了哪一条») — the design puts it
          there because the moment the user has just written the new conclusion is the
          moment they know what it replaces. Neither deletes anything. */}
      <ActionBtn
        title={
          stale
            ? t('还是作数的（重新放回上下文）')
            : t('这条不作数了（不再进上下文，但留在库里）')
        }
        onClick={onToggleStale}
        emphasis="accent"
      >
        <CircleSlash size={11} className={stale ? 'text-accent' : ''} />
      </ActionBtn>
      <ActionBtn
        title={hasSupersession ? t('取消这条更正关系') : t('它更正了哪一条？')}
        onClick={onSupersede}
      >
        <Replace size={11} className={hasSupersession ? 'text-accent' : ''} />
      </ActionBtn>
      <ActionBtn title={t('删除')} onClick={onDelete} emphasis="accent">
        <Trash2 size={11} />
      </ActionBtn>
    </div>
  );
}
