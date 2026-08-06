import { CalendarRange } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { useT } from '@/lib/i18n';
import { ACTION_LABEL, useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';

// DESIGN_WORKBENCH §9.4 — the right rail of 项目管理, and it is deliberately NOT the rail a
// normal project gets.
//
// Ocean 2026-08-07: 「这个项目管理也有右边栏，他的右边栏和普通项目不一样，他会用来管理周总结」.
// That is the sentence that finally makes the rail unambiguous: the panel is always about
// whatever is open on the left, and 项目管理 is open, so the rail is about all projects. The
// per-project half (三个维护按钮 + 它自己的流式进度 + 它自己的待过目) is simply not here.
//
// Which leaves exactly the two things that were never about one project:
//   * 周回顾 — a whole-library action. §3.4 took it out of the project menu; §9.5 refused to
//     add a per-project version of it (that is 压缩 under a second name). This is its home.
//   * 自动维护 — the master switch. It governs the weekly cadence as well as the per-project
//     one, so it belongs beside the review rather than inside any single project.
export default function BoardRail({ engineReady }: { engineReady: boolean }) {
  const t = useT();
  const current = useEngineStore((s) => s.current);
  const enqueue = useEngineStore((s) => s.enqueue);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);
  const update = useSettingsStore((s) => s.update);

  if (!engineReady) {
    return (
      <p className="px-1 pt-1 text-[10px] leading-relaxed text-muted">
        {t('装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{t('全部项目')}</div>

      <button
        type="button"
        disabled={current !== null}
        onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
        title={t('回顾最近一周——跨所有项目，存进「回顾」项目')}
        className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1.5 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
      >
        <CalendarRange size={11} className="flex-none" />
        {t(ACTION_LABEL.weekly_review)}
      </button>

      {/* §4.3 — automation, where the runs it produces appear rather than buried in settings.
          ⚠️ Default OFF, and that stays a deliberate reading of a request that pulled two
          ways: Ocean asked for automation AND for 「必须节约token」/「让用户放心」 in one
          breath, and this switch spends real money without asking again. */}
      <label className="flex items-start justify-between gap-2 border-t border-line pt-2">
        <span className="min-w-0">
          <span className="block text-[11px] text-ink-2">{t('自动维护')}</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
            {t('项目有新内容、放了一阵子之后，自动压一次。每个项目一天最多一次，周回顾一周一次。')}
          </span>
        </span>
        <Toggle checked={autoMaintain} onChange={(v) => void update({ aiAutoMaintain: v })} />
      </label>
    </div>
  );
}
