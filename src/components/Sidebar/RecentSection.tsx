import { useMemo } from 'react';
import { useT } from '@/lib/i18n';
import { useThreadsStore } from '@/stores/threadsStore';

// #6 快速捕捉 (Ocean 2026-07-13): the sidebar's OPEN-EDITORS counterpart — the 3-5
// threads you are actually working in, one click from anywhere to open or to retarget
// capture. The capture target always leads with a standing 捕捉中 text badge (words,
// not an icon — #7 discoverability); other rows reveal a 设为捕捉 text button on
// hover. The tree below stays a pure file tree.

const RECENT_MAX = 4;

export default function RecentSection() {
  const t = useT();
  const byWs = useThreadsStore((s) => s.threadsByWorkspace);
  const activeId = useThreadsStore((s) => s.activeId);
  const select = useThreadsStore((s) => s.select);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);

  const recent = useMemo(() => {
    const live = Object.values(byWs)
      .flat()
      .filter((t) => t.status !== 'done');
    const target = live.filter((t) => t.isCaptureTarget);
    const rest = live
      .filter((t) => !t.isCaptureTarget)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return [...target, ...rest].slice(0, RECENT_MAX);
  }, [byWs]);

  if (recent.length === 0) return null;

  return (
    <div className="mb-1 border-b border-line px-2 pb-2">
      <div className="px-3 pb-1 pt-2 text-[10.5px] tracking-wide text-muted">{t('最近')}</div>
      <ul className="space-y-0.5">
        {recent.map((th) => (
          <li
            key={th.id}
            onClick={() => select(th.id)}
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
              th.id === activeId ? 'bg-paper-2' : 'hover:bg-paper-2/60'
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {th.title.trim() || t('无标题')}
            </span>
            {th.isCaptureTarget ? (
              <span className="flex flex-none items-center gap-1 text-[10.5px] text-accent">
                {t('捕捉中')}
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void setCaptureTarget(th.id);
                }}
                className="invisible flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[10.5px] text-muted transition-colors hover:border-accent hover:text-accent group-hover:visible"
              >
                {t('设为捕捉')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
