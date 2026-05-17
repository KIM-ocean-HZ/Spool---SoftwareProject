import { CalendarDays, CornerDownRight, Package, Pin, X } from 'lucide-react';
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

// Local-state mirror of a thread field with a 200ms debounced write-back (§8.3). Three
// header fields edit free-form (title, next_step, progress), so the debounce lives in
// one place. While the user is typing the local value wins; `resetKey` (the thread id)
// force-resyncs on a thread switch so a mid-edit switch can't carry text across.
function useDebouncedField<T>(
  external: T,
  resetKey: string,
  write: (value: T) => void,
): [T, (value: T) => void] {
  const [value, setValue] = useState(external);
  const dirty = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  const writeRef = useRef(write);
  writeRef.current = write;

  // Thread switch: adopt the new thread's value unconditionally and drop any edit.
  useEffect(() => {
    setValue(external);
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Same thread, value changed elsewhere: adopt it only when not mid-edit.
  useEffect(() => {
    if (!dirty.current) setValue(external);
  }, [external]);

  useEffect(() => {
    if (value === external) {
      dirty.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(() => {
      writeRef.current(latest.current);
      dirty.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [value, external]);

  return [value, setValue];
}

// A deadline is stored as the ms epoch of the picked day's last moment, so the thread
// reads as "due today" for the whole due date rather than flipping to overdue at 00:00.
const toDateInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fromDateInput = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime();
};

export default function ThreadHeader({ thread, workspaces, onPack }: Props) {
  const patch = useThreadsStore((s) => s.patch);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);

  const [title, setTitle] = useDebouncedField(thread.title, thread.id, (v) =>
    void patch(thread.id, { title: v }),
  );
  const [nextStep, setNextStep] = useDebouncedField(
    thread.nextStep ?? '',
    thread.id,
    (v) => void patch(thread.id, { nextStep: v.trim() ? v : null }),
  );
  const [progress, setProgress] = useDebouncedField(thread.progress, thread.id, (v) =>
    void patch(thread.id, { progress: v }),
  );

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

      {/* next_step — the re-entry cue, shown prominently right under the title (§9.9) */}
      <div className="mt-2 flex items-center gap-2">
        <CornerDownRight size={13} className="flex-none text-accent" />
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="下一步…（离开前记一句，回来就知道从哪儿继续）"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-2 outline-none placeholder:text-muted/60"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
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

        <div className="flex items-center gap-1.5 text-muted">
          <CalendarDays size={12} className="flex-none" />
          <input
            type="date"
            value={thread.deadline != null ? toDateInput(thread.deadline) : ''}
            onChange={(e) =>
              void patch(thread.id, {
                deadline: e.target.value ? fromDateInput(e.target.value) : null,
              })
            }
            className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-line-strong"
          />
          {thread.deadline != null && (
            <button
              onClick={() => void patch(thread.id, { deadline: null })}
              className="rounded p-0.5 hover:bg-paper-2 hover:text-ink"
              title="清除截止日期"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted">
          <span>进度</span>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="h-1 w-28 cursor-pointer"
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="w-9 text-right font-mono text-[10.5px] tabular-nums text-ink-2">
            {progress}%
          </span>
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
