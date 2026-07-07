import { useT } from '@/lib/i18n';
import { useThreadsStore } from '@/stores/threadsStore';

// The top aggregate line (PLAN_EN.md §9.9): "X active · Y due this week · Z parked".
// This is the sidebar's presentation of "global progress" — kept deliberately quiet.

const WEEK = 7 * 86_400_000;

export default function SidebarSummary() {
  const t = useT();
  const byWs = useThreadsStore((s) => s.threadsByWorkspace);

  const now = Date.now();
  let active = 0;
  let parked = 0;
  let dueThisWeek = 0;
  for (const list of Object.values(byWs)) {
    for (const t of list) {
      if (t.status === 'active') active++;
      else if (t.status === 'parked') parked++;
      if (t.status !== 'done' && t.deadline != null && t.deadline <= now + WEEK) {
        dueThisWeek++;
      }
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-5 pb-2 pt-1 font-mono text-[10.5px] text-muted">
      <span>{active} {t('进行中')}</span>
      <span aria-hidden>·</span>
      <span style={dueThisWeek > 0 ? { color: 'var(--urgent)' } : undefined}>
        {dueThisWeek} {t('本周到期')}
      </span>
      <span aria-hidden>·</span>
      <span>{parked} {t('搁置')}</span>
    </div>
  );
}
