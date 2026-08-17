import { ChevronDown, ChevronRight, FolderPlus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import MenuDeleteItem from '@/components/ui/MenuDeleteItem';
import type { Thread } from '@/lib/db/threads';
import { isDormant } from '@/lib/threads/dormancy';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import type { WorkspaceNode } from '@/lib/workspaces/tree';
import { compareWorkspaceTitles } from '@/lib/workspaces/tree';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import SectionLabel from './SectionLabel';
import ThreadListItem, { THREAD_DRAG_MIME } from './ThreadListItem';

interface Props {
  node: WorkspaceNode;
  threadsByWorkspace: Record<string, Thread[]>;
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

export default function WorkspaceGroup({ node, threadsByWorkspace, activeThreadId }: Props) {
  const t = useT();
  const workspace = node.workspace;
  const threads = threadsByWorkspace[workspace.id] ?? [];
  const [collapsed, setCollapsed] = useState(false);
  const [dormantOpen, setDormantOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(workspace.title);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allWorkspaces = useWorkspacesStore((s) => s.workspaces);
  const rename = useWorkspacesStore((s) => s.rename);
  const createWorkspace = useWorkspacesStore((s) => s.create);
  const moveWorkspace = useWorkspacesStore((s) => s.move);
  const removeWorkspace = useWorkspacesStore((s) => s.remove);
  const createThread = useThreadsStore((s) => s.create);
  const selectThread = useThreadsStore((s) => s.select);
  const patchThread = useThreadsStore((s) => s.patch);
  const removeThread = useThreadsStore((s) => s.remove);
  const selectedIds = useThreadsStore((s) => s.selectedIds);

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

  // v23: right-click the heading → move this workspace into another one, or back out to the
  // top. The same interaction a project row already has (ThreadListItem §9.2), for the same
  // reason: it is the one path that works without a drag, and it can list only the legal
  // destinations rather than letting the user find out on drop.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // Everything this workspace could legally be moved into: not itself, not its current
  // parent (that move does nothing), and ⚠️ not anything nested inside it — that one would
  // build a ring, and setWorkspaceParent throws on it. Filtering here means the user is
  // never offered a destination that will fail.
  const subtreeIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (n: WorkspaceNode): void => {
      ids.add(n.workspace.id);
      n.children.forEach(walk);
    };
    walk(node);
    return ids;
  }, [node]);
  const moveTargets = useMemo(
    () =>
      allWorkspaces
        .filter((w) => !subtreeIds.has(w.id) && w.id !== workspace.parentId)
        .sort(compareWorkspaceTitles),
    [allWorkspaces, subtreeIds, workspace.parentId],
  );

  // Cross-workspace drag-and-drop (§9.9): dropping a ThreadListItem here re-parents it.
  // The OS file drag (Tauri's native bridge) carries no THREAD_DRAG_MIME, so it is
  // ignored — preventDefault is what marks a drop zone, and we only call it for ours.
  //
  // ⚠️ v23: a nested group renders INSIDE this one's drop zone, so both handlers stop the
  // event. Without that, a drop on 「材料准备」 bubbles to 「升学」 and the second handler wins
  // — the project lands in the parent, one row above where the user let go of it.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(THREAD_DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    // v23: the payload is a list — dragging one row of a multi-selection brings the whole
    // selection. A single drag arrives as a one-element list, so there is one path, not two.
    const ids = e.dataTransfer.getData(THREAD_DRAG_MIME).split(',').filter(Boolean);
    setDragOver(false);
    if (ids.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const all = Object.values(useThreadsStore.getState().threadsByWorkspace).flat();
    const moving = ids.filter((id) =>
      all.some((t) => t.id === id && t.workspaceId !== workspace.id),
    );
    for (const id of moving) void patchThread(id, { workspaceId: workspace.id });
  };

  const { fresh, dormant, done } = useMemo(() => sortThreads(threads, Date.now()), [threads]);
  const headerTitle = workspace.title.trim() || t('未命名');

  // v23: the rows of THIS group, in the order they are drawn — what ⇧-click measures a run
  // against. ⚠️ It follows `dormantOpen`, because a run can only cover rows the user can
  // actually see: with 沉睡 folded, shift-selecting across it would silently pick up rows
  // that are not on screen.
  const orderedIds = useMemo(
    () => [...fresh, ...(dormantOpen ? dormant : []), ...done].map((th) => th.id),
    [fresh, dormant, done, dormantOpen],
  );

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative mt-3.5 rounded-md ${node.depth > 0 ? 'pl-3' : ''} ${
        dragOver ? 'bg-accent/5 ring-1 ring-accent/50' : ''
      }`}
    >
      {/* v23 — 「这块在上面那个工作区里面」, said by the indent.

          ⚠️ It was a hairline in the gutter first (Ocean picked that on 2026-08-17 from a
          sketch, before it existed). Installed, he overruled it the same day:
          「竖线体现不出文件夹的从属关系，尤其是项目数量多的时候」 — a line running down the
          side of twenty rows says 「something spans these」, not 「these are inside that」.

          ⚠️⚠️ This is the deliberate exception to SectionLabel's one-left-edge rule, and the
          reason that rule survives it is in that file — read it before "fixing" this back.
          `pl-3` is per LEVEL, not per depth: a nested group renders inside its parent's
          padded div, so the steps compound on their own and any depth works. */}
      {/* ⚠️ This used to be a 16px serif name with the collapse chevron in front of it, and it
          was the loudest of the three heading styles the rail had grown (Ocean 2026-08-11:
          「没有严谨的结构，很散乱」). It is a SectionLabel now, same as 最近/聚焦 — see that file
          for why the left edge is the thing being protected.

          Two consequences worth not undoing by accident:
          - **The chevron follows the name.** In front of it, it pushed the name off the rail's
            one left edge; parked at the far right it read as unattached to the name.
          - **The name is not uppercased in EN** (uppercaseInEn={false}) — it is the user's own
            text, unlike 最近/聚焦. */}
      <SectionLabel uppercaseInEn={false} className="group" onContextMenu={onContextMenu}>
        {editing ? (
          <input
            ref={inputRef}
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={exitEdit}
            onKeyDown={handleKeyDown}
            placeholder={t('未命名')}
            className="min-w-0 flex-1 bg-transparent text-[12px] tracking-wide text-muted outline-none"
          />
        ) : (
          /* ⚠️ `py-1 -my-1` (and the same on the chevron): the heading is 10.5px now, and a
             10px-tall double-click target for 重命名 is not one. The negative margin gives
             the hit area back without giving the row height back, which would put workspace
             headings on a different rhythm from 最近/聚焦. */
          <button
            onDoubleClick={() => setEditing(true)}
            className="-my-1 min-w-0 truncate py-1 text-left"
            title={t('双击重命名')}
          >
            {headerTitle}
          </button>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="-m-0.5 flex-none rounded p-0.5 text-muted hover:text-ink"
          aria-label={collapsed ? t('展开') : t('收起')}
        >
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        </button>

        <button
          onClick={() => void onAddThread()}
          className="invisible ml-auto flex-none rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink group-hover:visible"
          aria-label={t('新建项目')}
          title={t('新建项目')}
        >
          <Plus size={12} />
        </button>

        {/* v23 — 「可以在每个工作区内再新建工作区」 (Ocean 2026-08-15). It sits next to ＋ on the
            same hover, because a folder inside a folder is the same kind of act as a project
            inside a folder: the icon is what says which one you get. */}
        <button
          onClick={() => void createWorkspace('', workspace.id)}
          className="invisible flex-none rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink group-hover:visible"
          aria-label={t('在里面新建工作区')}
          title={t('在里面新建工作区')}
        >
          <FolderPlus size={12} />
        </button>

        {/* ⚠️ The hover 🗑 used to be here too. Same rule as the project rows (Ocean
            2026-08-17): 「左侧边栏不直接显示」删除, it lives behind the right-click menu. Two
            different ways to delete two kinds of row in one rail would be the inconsistency
            2026-08-11 was about. */}
      </SectionLabel>

      {/* ⚠️ No `pl-5` of its own: within one level, a project row sits at the same left edge
          whether it is here, under 最近, or under 聚焦 — that single vertical is what 变体 A
          bought, and it is still what says 「这些是同一种东西」. The only thing that moves a
          row off it is the depth of the workspace it lives in (see the group's `pl-3`), which
          is information rather than an accident of which section drew it. */}
      {!collapsed && (
        <ul className="space-y-0.5">
          {fresh.length + dormant.length + done.length === 0 && (
            <li
              onClick={() => void onAddThread()}
              className="cursor-pointer rounded px-3 py-1.5 text-xs italic text-muted hover:bg-paper-2/50"
            >
              {t('+ 创建第一个项目')}
            </li>
          )}
          {fresh.map((th) => (
            <ThreadListItem
              key={th.id}
              thread={th}
              active={th.id === activeThreadId}
              selected={selectedIds.has(th.id)}
              ordered={orderedIds}
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
                className="flex w-full items-center gap-1 rounded px-3 py-1 text-[12px] text-muted transition-colors hover:bg-paper-2/50 hover:text-ink-2"
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
                selected={selectedIds.has(th.id)}
                ordered={orderedIds}
                onSelect={() => selectThread(th.id)}
                onDelete={() => void removeThread(th.id)}
              />
            ))}
          {done.map((th) => (
            <ThreadListItem
              key={th.id}
              thread={th}
              active={th.id === activeThreadId}
              selected={selectedIds.has(th.id)}
              ordered={orderedIds}
              onSelect={() => selectThread(th.id)}
              onDelete={() => void removeThread(th.id)}
            />
          ))}
        </ul>
      )}

      {/* The workspaces inside this one, drawn by the same component one level down. They
          hang below this workspace's own projects, and collapsing the parent takes them with
          it — that is what「收起一个文件夹」means. */}
      {!collapsed &&
        node.children.map((child) => (
          <WorkspaceGroup
            key={child.workspace.id}
            node={child}
            threadsByWorkspace={threadsByWorkspace}
            activeThreadId={activeThreadId}
          />
        ))}

      {menu && (
        <div
          role="menu"
          className="fixed z-50 min-w-[160px] rounded-md border border-line-strong bg-paper py-1 shadow-[var(--shadow-card)]"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {workspace.parentId !== null && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void moveWorkspace(workspace.id, null);
                setMenu(null);
              }}
              className="block w-full px-3 py-1 text-left text-xs text-ink hover:bg-paper-2"
            >
              {t('移到最外层')}
            </button>
          )}
          <div className="px-3 py-1 text-[13px] text-muted">{t('移进工作区')}</div>
          {moveTargets.length === 0 ? (
            <div className="px-3 py-1 text-xs text-muted">{t('没有其他工作区')}</div>
          ) : (
            moveTargets.map((ws) => (
              <button
                key={ws.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  void moveWorkspace(workspace.id, ws.id);
                  setMenu(null);
                }}
                className="block w-full px-3 py-1 text-left text-xs text-ink hover:bg-paper-2"
              >
                {ws.title.trim() || t('未命名')}
              </button>
            ))
          )}
          <div className="mt-1 border-t border-line pt-1">
            <MenuDeleteItem
              label={
                node.children.length > 0
                  ? t('删除工作区（连同里面的工作区）')
                  : t('删除工作区')
              }
              onConfirm={() => {
                void removeWorkspace(workspace.id);
                setMenu(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
