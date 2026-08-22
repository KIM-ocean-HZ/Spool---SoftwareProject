import { CircleSlash, Highlighter, MessageSquarePlus, Pencil, PencilLine, Pin, PinOff, RotateCcw, Shrink, Trash2 } from 'lucide-react';
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
  // 2026-08-19 (Ocean) — the manual half of 「入口两种」, next to highlight because it is
  // the same gesture on the same selection: 「划词除了高亮选择，现在多了一个修正信息选择」.
  // Enabled on the same condition as highlight, minus edit mode: a correction names a
  // sentence in the SAVED text, and a draft has not got one yet.
  canCorrect: boolean;
  onCorrect: () => void;
  // DESIGN_CONTEXT_HYGIENE §3.1 — `stale` reflects whether the user has already retired
  // this block, so the button is its own undo.
  stale: boolean;
  onTogglePin: () => void;
  onEdit: () => void;
  onHighlight: () => void;
  onAnnotate: () => void;
  onToggleStale: () => void;
  onDelete: () => void;
  // WORKPLAN-2026-08-20 §9.6.6 —— 单块压缩。Ocean:「可以项目压缩也可以 block 压缩」。
  // ⚠️ **它不是「项目压缩缩小版」**：压缩干的主要活是合并重复，而重复是跨块的，单独压一块
  // 看不见别的块。所以它只在**这一块特别长**的时候值得点（一整篇网页正文那种），
  // 而核对桌上会把这句话写出来。`undefined` = API 引擎没开，这个按钮就不存在。
  onCompress?: () => void;
  /** ⭐ v24（R2 §1g）：这一块被压过、而且压缩前的原文还在 —— 一键换回去。
   *  ⛔ 原文还在，还原是白拿的；不做还原就等于让 AI 产物盖掉用户自己的字。 */
  onRestoreOriginal?: () => void;
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
  canCorrect,
  onCorrect,
  stale,
  onTogglePin,
  onEdit,
  onHighlight,
  onAnnotate,
  onToggleStale,
  onDelete,
  onCompress,
  onRestoreOriginal,
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
      {/* Sits beside highlight, not beside 「它更正了哪一条」 below: that one is declared FROM
          the newer block and picks a target; this one is declared ON the block being
          corrected, about the sentence the user just selected. Same gesture, same place. */}
      <ActionBtn
        title={canCorrect ? t('更正选中的这一句') : t('先选中写错了的那一句')}
        onClick={onCorrect}
        emphasis="accent"
        disabled={!canCorrect}
      >
        <PencilLine size={11} />
      </ActionBtn>
      <ActionBtn title={t('添加批注')} onClick={onAnnotate}>
        <MessageSquarePlus size={11} />
      </ActionBtn>
      {/* DESIGN_CONTEXT_HYGIENE §3.1. 「它更正了哪一条？」 used to sit beside this one —
          declared FROM the newer block, picking its target out of a list. Ocean retired it
          2026-08-19:「这个功能不要了，删掉，留下批注式更正就行」. Correcting now starts where
          the mistake is, on the sentence itself (the ✎ above), which is the same statement
          without the picking. Retiring a block whole is still here, and still deletes
          nothing. */}
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
      {/* §9.6.6：两个入口，同一张核对桌 —— 项目压缩在右侧栏，单块压缩在这儿。 */}
      {onRestoreOriginal && (
        <ActionBtn title={t('还原成压缩时的原文')} onClick={onRestoreOriginal}>
          <RotateCcw size={13} />
        </ActionBtn>
      )}
      {onCompress && (
        <ActionBtn title={t('把这一块压短（压完给你核对，不改库）')} onClick={onCompress}>
          <Shrink size={11} />
        </ActionBtn>
      )}
      <ActionBtn title={t('删除')} onClick={onDelete} emphasis="accent">
        <Trash2 size={11} />
      </ActionBtn>
    </div>
  );
}
