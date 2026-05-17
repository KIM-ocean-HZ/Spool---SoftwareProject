import { Pin } from 'lucide-react';
import type { Thread } from '@/lib/db/threads';
import { useCaptureStore } from '@/stores/captureStore';

interface Props {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
}

export default function ThreadListItem({ thread, active, onSelect }: Props) {
  const title = thread.title.trim() || '无标题';
  const dimmed = thread.status === 'done';
  const flash = useCaptureStore((s) => s.flashThreadId === thread.id);

  return (
    <li
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
        active ? 'bg-paper-2' : 'hover:bg-paper-2/60'
      } ${dimmed ? 'opacity-50' : ''} ${flash ? 'flash' : ''}`}
    >
      {active && (
        <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r bg-accent" />
      )}
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{title}</span>
        {thread.isCaptureTarget && (
          <Pin size={11} className="flex-none text-accent" aria-label="捕捉目标" />
        )}
      </div>
    </li>
  );
}
