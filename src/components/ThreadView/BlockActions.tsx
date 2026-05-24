import {
  Copy,
  Highlighter,
  Link as LinkIcon,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';

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
  onTogglePin: () => void;
  onEdit: () => void;
  onAttachFile: () => void;
  onAttachUrl: () => void;
  onHighlight: () => void;
  onAnnotate: () => void;
  onCopy: () => void;
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
  onTogglePin,
  onEdit,
  onAttachFile,
  onAttachUrl,
  onHighlight,
  onAnnotate,
  onCopy,
  onDelete,
}: Props) {
  return (
    <div
      className={`ml-auto flex items-center gap-0.5 transition-opacity ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <ActionBtn title={pinned ? '取消置顶' : '置顶'} onClick={onTogglePin} emphasis="accent">
        {pinned ? <PinOff size={11} /> : <Pin size={11} />}
      </ActionBtn>
      <ActionBtn title="编辑文本" onClick={onEdit}>
        <Pencil size={11} />
      </ActionBtn>
      <ActionBtn title="附加文件" onClick={onAttachFile}>
        <Paperclip size={11} />
      </ActionBtn>
      <ActionBtn title="附加链接" onClick={onAttachUrl}>
        <LinkIcon size={11} />
      </ActionBtn>
      <ActionBtn
        title={canHighlight ? '标为重点（包裹 ==选区==）' : '先选中要标重点的文字'}
        onClick={onHighlight}
        emphasis="accent"
        disabled={!canHighlight}
      >
        <Highlighter size={11} />
      </ActionBtn>
      <ActionBtn title="添加批注" onClick={onAnnotate}>
        <MessageSquarePlus size={11} />
      </ActionBtn>
      <ActionBtn title="复制" onClick={onCopy}>
        <Copy size={11} />
      </ActionBtn>
      <ActionBtn title="删除" onClick={onDelete} emphasis="accent">
        <Trash2 size={11} />
      </ActionBtn>
    </div>
  );
}
