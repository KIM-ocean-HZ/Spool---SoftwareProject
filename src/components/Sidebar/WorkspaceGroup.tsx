import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import DeleteButton from '@/components/ui/DeleteButton';
import type { Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { isDormant } from '@/lib/threads/dormancy';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import ThreadListItem, { THREAD_DRAG_MIME } from './ThreadListItem';

interface Props {
  workspace: Workspace;
  threads: Thread[];
  activeThreadId: string | null;
}

// Thread ordering within a group (§9.9, #5 auto-dormancy 2026-07-13): awake threads
// on top — those with a deadline by urgency, the rest by recency; idle ones sink into
// a collapsed 沉睡 row (derived, zero clicks — see lib/threads/dormancy); done stays
// at the very bottom (dimmed by ThreadListItem itself).
const sortThreads = (
  threads: Thread[],
  now: number,
): { fresh: Thread[]; dormant: Thread[]; done: Thread[] } => {
  const live = threads.filter((t) => t.status !== 'done');
  const done = threads.filter((t) => t.status === 'done');
  const dormant = live
    .filter((t) => isDormant(t, now))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const awake = live.filter((t) => !isDormant(t, now));
  const withDeadline = awake
    .filter((t) => t.deadline != null)
    .sort((a, b) => a.deadline! - b.deadline!);
  const noDeadline = awake
    .filter((t) => t.deadline == null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  done.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  return { fresh: [...withDeadline, ...noDeadline], dormant, done };
};

export default function WorkspaceGroup({ workspace, threads, activeThreadId }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [dormantOpen, setDormantOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(workspace.title);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rename = useWorkspacesStore((s) => s.rename);
  const removeWorkspace = useWorkspacesStore((s) => s.remove);
  const createThread = useThreadsStore((s) => s.create);
  const selectThread = useThreadsStore((s) => s.select);
  const patchThread = useThreadsStore((s) => s.patch);
  const removeThread = useThreadsStore((s) => s.remove);

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
    if (isImeComposing(e.nativeEvent)) return;
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

  const { fresh, dormant, done } = useMemo(() => sortThreads(threads, Date.now()), [threads]);
  const headerTitle = workspace.title.trim() || t('未命名');

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
          aria-label={collapsed ? t('展开') : t('收起')}
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
            placeholder={t('未命名')}
            className="min-w-0 flex-1 bg-transparent font-serif text-base text-ink outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left font-serif text-base text-ink"
            title={t('双击重命名')}
          >
            {headerTitle}
          </button>
        )}

        <button
          onClick={() => void onAddThread()}
          className="invisible flex-none rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink group-hover:visible"
          aria-label={t('新建脉络')}
          title={t('新建脉络')}
        >
          <Plus size={12} />
        </button>

        <DeleteButton
          onConfirm={() => void removeWorkspace(workspace.id)}
          title={t('删除工作区')}
          className="invisible group-hover:visible"
        />
      </div>

      {!collapsed && (
        <ul className="space-y-0.5 pb-1 pl-5">
          {fresh.length + dormant.length + done.length === 0 && (
            <li
              onClick={() => void onAddThread()}
              className="cursor-pointer rounded px-3 py-1.5 text-xs italic text-muted hover:bg-paper-2/50"
            >
              {t('+ 创建第一条脉络')}
            </li>
          )}
          {fresh.map((th) => (
            <ThreadListItem
              key={th.id}
              thread={th}
              active={th.id === activeThreadId}
              onSelect={() => selectThread(th.id)}
              onDelete={() => void removeThread(th.id)}
            />
          ))}
          {/* #5 auto-dormancy: idle threads live behind one quiet row — no manual
              parking. Expanding is per-workspace, session-local. */}
          {dormant.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setDormantOpen((v) => !v)}
                className="flex w-full items-center gap-1 rounded px-3 py-1 text-[10.5px] text-muted transition-colors hover:bg-paper-2/50 hover:text-ink-2"
              >
                {dormantOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {t('沉睡 {n} 条', { n: dormant.length })}
              </button>
            </li>
          )}
          {dormantOpen &&
            dormant.map((th) => (
              <ThreadListItem
                key={th.id}
                thread={th}
                active={th.id === activeThreadId}
                onSelect={() => selectThread(th.id)}
                onDelete={() => void removeThread(th.id)}
              />
            ))}
          {done.map((th) => (
            <ThreadListItem
              key={th.id}
              thread={th}
              active={th.id === activeThreadId}
              onSelect={() => selectThread(th.id)}
              onDelete={() => void removeThread(th.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
