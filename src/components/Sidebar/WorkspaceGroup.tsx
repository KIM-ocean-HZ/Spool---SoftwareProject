import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import ThreadListItem, { THREAD_DRAG_MIME } from './ThreadListItem';

interface Props {
  workspace: Workspace;
  threads: Thread[];
  activeThreadId: string | null;
}

// Thread ordering within a group (§9.9): active/parked on top — those with a deadline
// by urgency, the rest by recency — then done threads sink to the bottom (dimmed by
// ThreadListItem itself).
const sortThreads = (threads: Thread[]): Thread[] => {
  const live = threads.filter((t) => t.status !== 'done');
  const done = threads.filter((t) => t.status === 'done');
  const withDeadline = live
    .filter((t) => t.deadline != null)
    .sort((a, b) => a.deadline! - b.deadline!);
  const noDeadline = live
    .filter((t) => t.deadline == null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  done.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  return [...withDeadline, ...noDeadline, ...done];
};

export default function WorkspaceGroup({ workspace, threads, activeThreadId }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(workspace.title);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rename = useWorkspacesStore((s) => s.rename);
  const createThread = useThreadsStore((s) => s.create);
  const selectThread = useThreadsStore((s) => s.select);
  const patchThread = useThreadsStore((s) => s.patch);

  // Sync titleInput when external workspace title changes (e.g. another tab edits)
  useEffect(() => {
    if (!editing) setTitleInput(workspace.title);
  }, [workspace.title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Debounce save while editing
  useEffect(() => {
    if (!editing) return;
    if (titleInput === workspace.title) return;
    const t = setTimeout(() => {
      void rename(workspace.id, titleInput);
    }, 200);
    return () => clearTimeout(t);
  }, [titleInput, workspace.title, workspace.id, editing, rename]);

  const exitEdit = () => setEditing(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      exitEdit();
    }
  };

  const onAddThread = async () => {
    const t = await createThread(workspace.id);
    selectThread(t.id);
  };

  // Cross-workspace drag-and-drop (§9.9): dropping a ThreadListItem here re-parents it.
  // The OS file drag (Tauri's native bridge) carries no THREAD_DRAG_MIME, so it is
  // ignored — preventDefault is what marks a drop zone, and we only call it for ours.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(THREAD_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const threadId = e.dataTransfer.getData(THREAD_DRAG_MIME);
    setDragOver(false);
    if (!threadId) return;
    e.preventDefault();
    const dragged = Object.values(useThreadsStore.getState().threadsByWorkspace)
      .flat()
      .find((t) => t.id === threadId);
    if (dragged && dragged.workspaceId !== workspace.id) {
      void patchThread(threadId, { workspaceId: workspace.id });
    }
  };

  const sortedThreads = useMemo(() => sortThreads(threads), [threads]);
  const visibleThreads = collapsed ? [] : sortedThreads;
  const headerTitle = workspace.title.trim() || '未命名';

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`mb-1.5 rounded-md ${
        dragOver ? 'bg-accent/5 ring-1 ring-accent/50' : ''
      }`}
    >
      <div className="group flex items-center gap-1 px-2 py-1">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex-none rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink"
          aria-label={collapsed ? '展开' : '收起'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={exitEdit}
            onKeyDown={handleKeyDown}
            placeholder="未命名"
            className="min-w-0 flex-1 bg-transparent font-serif text-base text-ink outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left font-serif text-base text-ink"
            title="双击重命名"
          >
            {headerTitle}
          </button>
        )}

        <button
          onClick={() => void onAddThread()}
          className="invisible flex-none rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink group-hover:visible"
          aria-label="新建脉络"
          title="新建脉络"
        >
          <Plus size={12} />
        </button>
      </div>

      {!collapsed && (
        <ul className="space-y-0.5 pb-1 pl-5">
          {visibleThreads.length === 0 && (
            <li
              onClick={() => void onAddThread()}
              className="cursor-pointer rounded px-3 py-1.5 text-xs italic text-muted hover:bg-paper-2/50"
            >
              + 创建第一条脉络
            </li>
          )}
          {visibleThreads.map((t) => (
            <ThreadListItem
              key={t.id}
              thread={t}
              active={t.id === activeThreadId}
              onSelect={() => selectThread(t.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
