import { Pin } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import CountdownBadge from '@/components/ui/CountdownBadge';
import MenuDeleteItem from '@/components/ui/MenuDeleteItem';
import StatusDot from '@/components/ui/StatusDot';
import type { Thread } from '@/lib/db/threads';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import { useCaptureStore } from '@/stores/captureStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

// dataTransfer MIME for an in-app thread drag. WorkspaceGroup checks for this type to
// distinguish a thread being moved between workspaces from an OS file drag (§9.9).
//
// ⚠️ v23: the payload is now a COMMA-SEPARATED LIST of thread ids, because dragging a row
// that is part of a multi-selection drags the whole selection. A single drag is a
// one-element list, so `split(',')` covers both and there is no second format.
export const THREAD_DRAG_MIME = 'application/x-spool-thread';

interface Props {
  thread: Thread;
  active: boolean;
  /** v23: part of the sidebar multi-selection (≠ `active`, which is 「开在主区的那个」). */
  selected?: boolean;
  /** v23: the ids of the list this row was drawn in, top to bottom — ⇧-click needs it. */
  ordered?: string[];
  onSelect: () => void;
  onDelete: () => void;
}

export default function ThreadListItem({
  thread,
  active,
  selected = false,
  ordered,
  onSelect,
  onDelete,
}: Props) {
  const t = useT();
  const title = thread.title.trim() || t('无标题');
  const dimmed = thread.status === 'done';
  const flash = useCaptureStore((s) => s.flashThreadId === thread.id);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const patchThread = useThreadsStore((s) => s.patch);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);
  const selectedIds = useThreadsStore((s) => s.selectedIds);
  const clickRow = useThreadsStore((s) => s.clickRow);
  const moveMany = useThreadsStore((s) => s.moveMany);
  const removeMany = useThreadsStore((s) => s.removeMany);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);

  // Inline rename (§9.1 double-click pattern; §8.3 debounced save). Esc cancels (§14.1).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(thread.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // Set when Esc abandons the edit so the trailing debounce + revert don't persist it.
  const canceledRef = useRef(false);

  useEffect(() => {
    if (!editingTitle) setTitleInput(thread.title);
  }, [thread.title, editingTitle]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (!editingTitle || canceledRef.current) return;
    if (titleInput === thread.title) return;
    const t = setTimeout(() => void patchThread(thread.id, { title: titleInput }), 200);
    return () => clearTimeout(t);
  }, [titleInput, thread.title, thread.id, editingTitle, patchThread]);

  const enterRename = (): void => {
    canceledRef.current = false;
    setTitleInput(thread.title);
    setEditingTitle(true);
  };
  const commitRename = (): void => setEditingTitle(false); // debounce already persisted
  const cancelRename = (): void => {
    canceledRef.current = true;
    setTitleInput(thread.title);
    setEditingTitle(false);
  };

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

  // v23: what this gesture applies to. Dragging / right-clicking a row that is part of the
  // selection acts on the whole selection; touching a row OUTSIDE it acts on that row alone
  // (and does not silently drag rows the user cannot see the connection to).
  const acting = selected && selectedIds.size > 1 ? [...selectedIds] : [thread.id];

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData(THREAD_DRAG_MIME, acting.join(','));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    const meta = e.metaKey || e.ctrlKey;
    // Without a list to measure against there is no 「一段」 — fall back to plain-click.
    if ((meta || e.shiftKey) && ordered) {
      clickRow(thread.id, ordered, { meta, shift: e.shiftKey });
      return;
    }
    if (ordered) clickRow(thread.id, ordered, { meta: false, shift: false });
    onSelect();
  };

  const onContextMenu = (e: MouseEvent<HTMLLIElement>) => {
    e.preventDefault();
    // Right-clicking outside the selection moves the selection to this row first — the menu
    // must never act on rows the click did not point at (VS Code does the same).
    if (!selected && ordered) clickRow(thread.id, ordered, { meta: false, shift: false });
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // Only workspaces that would actually move something: one that already holds every row
  // being acted on is a no-op, and offering it makes the menu look like it did nothing.
  const actingWorkspaceIds = new Set(
    Object.entries(threadsByWs)
      .filter(([, list]) => list.some((th) => acting.includes(th.id)))
      .map(([wsId]) => wsId),
  );
  const otherWorkspaces = workspaces.filter(
    (w) => !(actingWorkspaceIds.size === 1 && actingWorkspaceIds.has(w.id)),
  );

  return (
    <li
      draggable={!editingTitle}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onClick={onRowClick}
      /* ⚠️ 选中 and 打开 are two different states and must not look the same. `active` (the
         project on screen) keeps the solid `bg-paper-2` it always had; a multi-selected row
         gets a ring instead — so a selection of five with one of them open reads as five
         circled rows, one of which is also the one you are reading. */
      className={`group relative cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
        active ? 'bg-paper-2' : 'hover:bg-paper-2/60'
      } ${selected && selectedIds.size > 1 ? 'ring-1 ring-inset ring-accent/50' : ''} ${
        dimmed ? 'opacity-50' : ''
      } ${flash ? 'flash' : ''}`}
    >
      {active && (
        <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r bg-accent" />
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (isImeComposing(e.nativeEvent)) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              placeholder={t('无标题')}
              spellCheck={false}
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                enterRename();
              }}
              className="block truncate text-sm text-ink"
              title={t('双击重命名')}
            >
              {title}
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <StatusDot status={thread.status} />
          {/* A completed project has no live deadline — never show a countdown / 逾期 on it
              (mirrors FocusSection's done filter). The deadline itself is kept and still
              editable in the thread header. */}
          {thread.deadline != null && thread.status !== 'done' && (
            <CountdownBadge deadline={thread.deadline} />
          )}
          {/* Capture-target marker (§9.2 / §10.2, #7 2026-07-13): the target row says
              捕捉中 in words — a bare pin icon meant nothing to first-time users. Other
              rows keep the quiet hover-only pin that sets the target without selecting
              or navigating (separate actions). */}
          {thread.isCaptureTarget ? (
            <span
              title={t('当前捕捉目标')}
              className="flex-none text-[12px] text-accent"
            >
              {t('捕捉中')}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void setCaptureTarget(thread.id);
              }}
              aria-label={t('设为捕捉目标')}
              title={t('设为捕捉目标')}
              className="invisible flex-none rounded p-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink group-hover:visible"
            >
              <Pin size={11} />
            </button>
          )}
          {/* ⚠️ The hover 🗑 used to be here. Ocean 2026-08-17: 「把删除键放到右键点击之后，
              左侧边栏不直接显示（删除动作本来就不多）」— and with multi-select it had become
              actively dangerous: a trash icon on one row, next to five circled rows, cannot
              say which of the two it means. It is in the context menu now, where it is
              spelled out in words and counted. */}
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
          {/* What this menu is about to act on, said before any action — the one thing that
              makes a batch delete safe to put one click away. */}
          {acting.length > 1 && (
            <div className="border-b border-line px-3 py-1 text-[13px] text-ink">
              {t('选中的 {n} 个项目', { n: acting.length })}
            </div>
          )}
          <div className="px-3 py-1 text-[13px] text-muted">{t('移动到工作区')}</div>
          {otherWorkspaces.length === 0 ? (
            <div className="px-3 py-1 text-xs text-muted">{t('没有其他工作区')}</div>
          ) : (
            otherWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (acting.length > 1) void moveMany(acting, ws.id);
                  else void patchThread(thread.id, { workspaceId: ws.id });
                  setMenu(null);
                }}
                className="block w-full px-3 py-1 text-left text-xs text-ink hover:bg-paper-2"
              >
                {ws.title || t('未命名')}
              </button>
            ))
          )}
          <div className="mt-1 border-t border-line pt-1">
            <MenuDeleteItem
              label={acting.length > 1 ? t('删除这 {n} 个项目', { n: acting.length }) : t('删除项目')}
              onConfirm={() => {
                if (acting.length > 1) void removeMany(acting);
                else onDelete();
                setMenu(null);
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}
