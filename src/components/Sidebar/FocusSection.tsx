import { useMemo } from 'react';
import CountdownBadge from '@/components/ui/CountdownBadge';
import { useThreadsStore } from '@/stores/threadsStore';

// "What is on fire" (PLAN_EN.md §9.9): every thread with a deadline and not yet done,
// across all workspaces, ascending by deadline, capped at 5. When nothing has a
// deadline the whole section is hidden (§14.5).

const FOCUS_MAX = 5;

export default function FocusSection() {
  const byWs = useThreadsStore((s) => s.threadsByWorkspace);
  const activeId = useThreadsStore((s) => s.activeId);
  const select = useThreadsStore((s) => s.select);

  const focus = useMemo(
    () =>
      Object.values(byWs)
        .flat()
        .filter((t) => t.deadline != null && t.status !== 'done')
        .sort((a, b) => a.deadline! - b.deadline!)
        .slice(0, FOCUS_MAX),
    [byWs],
  );

  if (focus.length === 0) return null;

  return (
    <div className="mb-1 border-b border-line px-2 pb-2">
      <div className="px-3 pb-1 pt-2 text-[10.5px] tracking-wide text-muted">聚焦</div>
      <ul className="space-y-0.5">
        {focus.map((t) => (
          <li
            key={t.id}
            onClick={() => select(t.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
              t.id === activeId ? 'bg-paper-2' : 'hover:bg-paper-2/60'
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {t.title.trim() || '无标题'}
            </span>
            <CountdownBadge deadline={t.deadline!} />
          </li>
        ))}
      </ul>
    </div>
  );
}
