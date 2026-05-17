import { Package, Pin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Thread, ThreadStatus } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { useThreadsStore } from '@/stores/threadsStore';

interface Props {
  thread: Thread;
  workspaces: Workspace[];
  onPack: () => void;
}

const STATUS_OPTIONS: { value: ThreadStatus; label: string; cls: string }[] = [
  { value: 'active', label: '进行中', cls: 'text-[var(--status-active)]' },
  { value: 'parked', label: '搁置', cls: 'text-[var(--status-parked)]' },
];

export default function ThreadHeader({ thread, workspaces, onPack }: Props) {
  const patch = useThreadsStore((s) => s.patch);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);

  const [title, setTitle] = useState(thread.title);
  const titleDirty = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    if (!titleDirty.current) setTitle(thread.title);
  }, [thread.title, thread.id]);

  useEffect(() => {
    if (title === thread.title) {
      titleDirty.current = false;
      return;
    }
    titleDirty.current = true;
    const t = setTimeout(() => {
      void patch(thread.id, { title: titleRef.current });
      titleDirty.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [title, thread.title, thread.id, patch]);

  return (
    <header className="flex-none border-b border-line px-6 py-3">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题"
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl text-ink outline-none placeholder:text-muted/50"
        />

        <button
          onClick={onPack}
          className="flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
          title="打包上下文（⌘⇧P）"
        >
          <Package size={11} />
          <span>打包</span>
        </button>

        <button
          onClick={() => void setCaptureTarget(thread.id)}
          disabled={thread.isCaptureTarget}
          className={`flex flex-none items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
            thread.isCaptureTarget
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line text-muted hover:border-accent hover:text-accent'
          }`}
          title={thread.isCaptureTarget ? '当前捕捉目标' : '设为捕捉目标'}
        >
          <Pin size={11} />
          <span>{thread.isCaptureTarget ? '捕捉目标' : '设为目标'}</span>
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => void patch(thread.id, { status: opt.value })}
              className={`rounded-full border px-2 py-0.5 transition-colors ${
                thread.status === opt.value
                  ? `border-current ${opt.cls}`
                  : 'border-line text-muted hover:border-line-strong'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {thread.status === 'done' && (
            <span className="rounded-full border border-current px-2 py-0.5 text-[var(--status-done)]">
              已完成
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-muted">
          <span>工作区</span>
          <select
            value={thread.workspaceId}
            onChange={(e) => void patch(thread.id, { workspaceId: e.target.value })}
            className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs text-ink outline-none focus:border-line-strong"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.title || '未命名'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
