import { Pin } from 'lucide-react';
import type { DragEvent } from 'react';
import CountdownBadge from '@/components/ui/CountdownBadge';
import StatusDot from '@/components/ui/StatusDot';
import type { Thread } from '@/lib/db/threads';
import { useCaptureStore } from '@/stores/captureStore';

// dataTransfer MIME for an in-app thread drag. WorkspaceGroup checks for this type to
// distinguish a thread being moved between workspaces from an OS file drag (§9.9).
export const THREAD_DRAG_MIME = 'application/x-spool-thread';

interface Props {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
}

export default function ThreadListItem({ thread, active, onSelect }: Props) {
  const title = thread.title.trim() || '无标题';
  const dimmed = thread.status === 'done';
  const flash = useCaptureStore((s) => s.flashThreadId === thread.id);

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData(THREAD_DRAG_MIME, thread.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
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
        </div>
      </div>
    </li>
  );
}
