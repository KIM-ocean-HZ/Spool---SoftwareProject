import { useMemo } from 'react';
import { useT } from '@/lib/i18n';
import { useThreadsStore } from '@/stores/threadsStore';
import SectionLabel from './SectionLabel';

// #6 快速捕捉 (Ocean 2026-07-13): the sidebar's OPEN-EDITORS counterpart — the 3-5
// threads you are actually working in, one click from anywhere to open or to retarget
// capture. The capture target always leads with a standing 捕捉中 text badge (words,
// not an icon — #7 discoverability); other rows reveal a 设为捕捉 text button on
// hover. The tree below stays a pure file tree.

// 4 → 3 (Ocean 2026-08-11, 「最近现在是四个项目，去掉一个」). It came down with the rest of the
// rail's tidy-up: this list repeats rows that also exist in the workspaces below it, so its
// length is what decides how much of the rail is duplication.
const RECENT_MAX = 3;

export default function RecentSection() {
  const t = useT();
  const byWs = useThreadsStore((s) => s.threadsByWorkspace);
  const activeId = useThreadsStore((s) => s.activeId);
  // v23: a plain click here means 「只要这一个」 — it opens the project AND drops any
  // multi-selection made in the tree below. ⚠️ Multi-select itself is not offered in
  // these two lists: they repeat rows that also exist under a workspace, so a run
  // selected here would have no single top-to-bottom order to mean anything against.
  const clickRow = useThreadsStore((s) => s.clickRow);
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
    /* ⚠️ No rule of its own any more — the one under 聚焦 closes off both of these sections
       together (see Sidebar/index). One section, one heading, one left edge: SectionLabel. */
    <div className="mt-3.5">
      <SectionLabel>{t('最近')}</SectionLabel>
      <ul className="space-y-0.5">
        {recent.map((th) => (
          <li
            key={th.id}
            onClick={() => clickRow(th.id, [th.id], { meta: false, shift: false })}
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
              th.id === activeId ? 'bg-paper-2' : 'hover:bg-paper-2/60'
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {th.title.trim() || t('无标题')}
            </span>
            {th.isCaptureTarget ? (
              <span className="flex flex-none items-center gap-1 text-[12px] text-accent">
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
                className="invisible flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent group-hover:visible"
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
