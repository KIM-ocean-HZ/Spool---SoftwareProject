import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import ThreadListItem from './ThreadListItem';

interface Props {
  workspace: Workspace;
  threads: Thread[];
  activeThreadId: string | null;
}

export default function WorkspaceGroup({ workspace, threads, activeThreadId }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(workspace.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const rename = useWorkspacesStore((s) => s.rename);
  const createThread = useThreadsStore((s) => s.create);
  const selectThread = useThreadsStore((s) => s.select);

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

  const visibleThreads = collapsed ? [] : threads;
  const headerTitle = workspace.title.trim() || '未命名';

  return (
    <div className="mb-1.5">
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
        <ul className="space-y-0.5 pl-5">
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
