import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Thread } from '@/lib/db/threads';
import { isImeComposing } from '@/lib/utils/ime';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

export interface PickedThread {
  threadId: string;
  threadTitle: string;
  workspaceTitle: string;
}

interface Props {
  // The source thread, excluded so a forward always targets ANOTHER thread.
  excludeThreadId: string | null;
  onPick: (picked: PickedThread) => void;
  onCancel: () => void;
}

// §20.1 forward thread-picker: a quiet, fuzzy, keyboard-navigable list of threads grouped by
// workspace ACROSS ALL workspaces — cross-workspace targeting is allowed here, unlike the
// same-workspace @-mention (§9.7). Adapts the overlay Redirect dropdown's grouped layout and
// the composer mention's substring ranking. Done threads are excluded, matching the Redirect /
// tray target lists (a completed project isn't a forward destination). Esc / clicking an item
// resolve it; the caller (MergeToolbar) closes it on a click outside the toolbar.
export default function ThreadPicker({ excludeThreadId, onPick, onCancel }: Props) {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Groups follow workspace order; within each, threads are substring-filtered (earlier match
  // first, ties alphabetical). `flatIdx` is a running index across all visible rows so arrow
  // keys move through the whole list while the grouping stays intact.
  const { groups, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const grouped: {
      wsId: string;
      wsTitle: string;
      items: { thread: Thread; title: string; flatIdx: number }[];
    }[] = [];
    const flatList: PickedThread[] = [];
    for (const ws of workspaces) {
      const wsTitle = ws.title.trim() || '未命名';
      const matched = (threadsByWs[ws.id] ?? [])
        .filter((t) => t.id !== excludeThreadId && t.status !== 'done')
        .map((t) => {
          const title = t.title.trim() || '无标题';
          return { thread: t, title, idx: q ? title.toLowerCase().indexOf(q) : 0 };
        })
        .filter((c) => c.idx >= 0)
        .sort((a, b) => a.idx - b.idx || a.title.localeCompare(b.title));
      if (matched.length === 0) continue;
      const items = matched.map((c) => {
        const flatIdx = flatList.length;
        flatList.push({ threadId: c.thread.id, threadTitle: c.title, workspaceTitle: wsTitle });
        return { thread: c.thread, title: c.title, flatIdx };
      });
      grouped.push({ wsId: ws.id, wsTitle, items });
    }
    return { groups: grouped, flat: flatList };
  }, [query, workspaces, threadsByWs, excludeThreadId]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const pick = (i: number): void => {
    const p = flat[i];
    if (p) onPick(p);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActiveIdx((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActiveIdx((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(activeIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="w-64 overflow-hidden rounded-lg border border-line-strong bg-paper font-ui text-[12px]"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="复制到… 搜索脉络"
        spellCheck={false}
        className="w-full border-b border-line bg-paper-2/40 px-2.5 py-1.5 text-ink outline-none placeholder:text-muted/70"
      />
      <div className="max-h-64 overflow-y-auto py-1">
        {flat.length === 0 ? (
          <div className="px-2.5 py-2 text-muted">没有匹配的脉络</div>
        ) : (
          groups.map((g) => (
            <div key={g.wsId} className="py-0.5">
              <div className="px-2.5 py-0.5 font-serif text-[11px] text-muted">{g.wsTitle}</div>
              {g.items.map((it) => (
                <button
                  key={it.thread.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(it.flatIdx)}
                  onClick={() => pick(it.flatIdx)}
                  className={`block w-full truncate px-2.5 py-1 text-left ${
                    it.flatIdx === activeIdx ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-paper-2'
                  }`}
                >
                  {it.title}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
