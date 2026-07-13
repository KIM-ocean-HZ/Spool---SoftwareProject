import { Pin } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import CountdownBadge from '@/components/ui/CountdownBadge';
import DeleteButton from '@/components/ui/DeleteButton';
import StatusDot from '@/components/ui/StatusDot';
import type { Thread } from '@/lib/db/threads';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
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
  const t = useT();
  const title = thread.title.trim() || t('无标题');
  const dimmed = thread.status === 'done';
  const flash = useCaptureStore((s) => s.flashThreadId === thread.id);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const patchThread = useThreadsStore((s) => s.patch);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);

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
      draggable={!editingTitle}
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
              className="flex-none text-[10px] text-accent"
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
          <DeleteButton
            onConfirm={onDelete}
            title={t('删除脉络')}
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
          <div className="px-3 py-1 text-[11px] text-muted">{t('移动到工作区')}</div>
          {otherWorkspaces.length === 0 ? (
            <div className="px-3 py-1 text-xs text-muted">{t('没有其他工作区')}</div>
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
                {ws.title || t('未命名')}
              </button>
            ))
          )}
        </div>
      )}
    </li>
  );
}
