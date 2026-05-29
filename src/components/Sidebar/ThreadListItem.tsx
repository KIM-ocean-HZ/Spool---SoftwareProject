import { Pin } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import CountdownBadge from '@/components/ui/CountdownBadge';
import DeleteButton from '@/components/ui/DeleteButton';
import StatusDot from '@/components/ui/StatusDot';
import type { Thread } from '@/lib/db/threads';
import { useCaptureStore } from '@/stores/captureStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

// dataTransfer MIME for an in-app thread drag. WorkspaceGroup checks for this type to
// distinguish a thread being moved between workspaces from an OS file drag (§9.9).
export const THREAD_DRAG_MIME = 'application/x-spool-thread';

interface Props {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function ThreadListItem({ thread, active, onSelect, onDelete }: Props) {
  const title = thread.title.trim() || '无标题';
  const dimmed = thread.status === 'done';
  const flash = useCaptureStore((s) => s.flashThreadId === thread.id);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const patchThread = useThreadsStore((s) => s.patch);

  // Right-click → move-to-workspace menu (§9.2; the other move path is drag). Tracked by
  // viewport coords so the menu anchors to the cursor regardless of sidebar scroll.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData(THREAD_DRAG_MIME, thread.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onContextMenu = (e: MouseEvent<HTMLLIElement>) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const otherWorkspaces = workspaces.filter((w) => w.id !== thread.workspaceId);

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
        active ? 'bg-paper-2' : 'hover:bg-paper-2/60'
      } ${dimmed ? 'opacity-50' : ''} ${flash ? 'flash' : ''}`}
    >
      {active && (
        <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r bg-accent" />
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{title}</span>
            {thread.isCaptureTarget && (
              <Pin size={11} className="flex-none text-accent" aria-label="捕捉目标" />
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <StatusDot status={thread.status} />
          {thread.deadline != null && <CountdownBadge deadline={thread.deadline} />}
          <DeleteButton
            onConfirm={onDelete}
            title="删除脉络"
            size={11}
            className="invisible group-hover:visible"
          />
        </div>
      </div>

      {menu && (
        <div
          role="menu"
          className="fixed z-50 min-w-[160px] rounded-md border border-line-strong bg-paper py-1 shadow-[var(--shadow-card)]"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[11px] text-muted">移动到工作区</div>
          {otherWorkspaces.length === 0 ? (
            <div className="px-3 py-1 text-xs text-muted">没有其他工作区</div>
          ) : (
            otherWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  void patchThread(thread.id, { workspaceId: ws.id });
                  setMenu(null);
                }}
                className="block w-full px-3 py-1 text-left text-xs text-ink hover:bg-paper-2"
              >
                {ws.title || '未命名'}
              </button>
            ))
          )}
        </div>
      )}
    </li>
  );
}
