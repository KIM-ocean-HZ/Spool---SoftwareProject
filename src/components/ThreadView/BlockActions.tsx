import {
  Copy,
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
  onTogglePin: () => void;
  onEdit: () => void;
  onAttachFile: () => void;
  onAttachUrl: () => void;
  onAnnotate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

interface ActionBtnProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
  emphasis?: 'normal' | 'accent';
}

// Hover-revealed action bar per PLAN_EN.md §9.3: pin / edit / attach file / attach
// link / annotate / copy / delete.
function ActionBtn({ title, onClick, children, emphasis = 'normal' }: ActionBtnProps) {
  const hover = emphasis === 'accent' ? 'hover:text-accent' : 'hover:text-ink';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded p-1 text-muted hover:bg-paper-2 ${hover}`}
    >
      {children}
    </button>
  );
}

export default function BlockActions({
  visible,
  pinned,
  onTogglePin,
  onEdit,
  onAttachFile,
  onAttachUrl,
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
