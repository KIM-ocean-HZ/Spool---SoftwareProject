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
  /** ⭐ v24（R2 §1g）：这一块被压过、而且压缩前的原文还在 —— 打开来看一眼。
   *
   *  ⚠️⚠️ **2026-08-23（Ocean 真手指验收第 5 条）：它从「一键还原」变成了「看一眼」。**
   *  他的原话：「如果用户想看压缩前的 block，现在的按钮只能回退到原文，**不能再次回到
   *  压缩后文本**，修改。」—— 原来点一下就把库改了，而且改完 `original_content` 就清空，
   *  想看回压缩稿已经没有了。**看一眼是个来回的动作，不该是一次单程的写库。**
   *
   *  所以这个按钮现在只是把原文摊在块底下（读的时候不动库一个字），
   *  「真的换回去」是摊开之后里面那一行 —— ⛔ 别把两件事合成一个按钮。
   *  `undefined` = 这一块没压过，或者压的时候用户关了「备份原文」。 */
  onToggleOriginal?: () => void;
  /** 原文现在摊开着没有。⚠️ 图标要跟着变色，不然用户不知道自己刚才点开的是哪一块。 */
  showingOriginal?: boolean;
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
  onToggleOriginal,
  showingOriginal,
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
      {onToggleOriginal && (
        <ActionBtn
          title={showingOriginal ? t('收起压缩前的原文') : t('看看压缩前的原文')}
          onClick={onToggleOriginal}
        >
          <RotateCcw size={13} className={showingOriginal ? 'text-accent' : ''} />
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
