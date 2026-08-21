import { useEffect } from 'react';
import { Loader2, Moon, Shrink, X } from 'lucide-react';
import RailSection from '@/components/RightRail/RailSection';
import { estimateYuanForChars, formatYuan } from '@/lib/ai/compress';
import type { Thread } from '@/lib/db/threads';
import { useT } from '@/lib/i18n';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

// 压缩的**动作和状态**（WORKPLAN-2026-08-20 §9.6.2）。
//
// Ocean 的原话：「压缩功能不要放在 pack 里面，放到右边栏，他不是和 pack 绑定的工作，
// 也可以给 mcp 服务。」
//
// ⚠️ **只有动作和状态在这儿。** 核对桌开在中间区域 —— 这一栏宽度是 `railWidth`
// （三百来像素），并排比对塞不下。
//
// ⚠️ 「也可以给 mcp 服务」那句取的是第一种读法（§9.6.2 那张表）：压缩稿按 §6.4.1 存成块并标
// `supersedes` 之后，`get_pack` 和所有读路径**自然**就拿到压缩后的版本，**零新增**。
// ⛔ 不给 MCP 加一个「帮我压缩」的工具——那是第三方 AI 一句话就能花掉用户的钱。
export default function CompressRail({ thread }: { thread: Thread }) {
  const t = useT();
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);
  const model = useSettingsStore((s) => s.apiModel);
  const openProject = useCompressStore((s) => s.openProject);
  const running = useCompressStore((s) => s.running);
  const batchRunning = useCompressStore((s) => s.batchRunning);
  const results = useCompressStore((s) => s.results);
  const failures = useCompressStore((s) => s.failures);
  const openResult = useCompressStore((s) => s.openResult);
  const runQueue = useCompressStore((s) => s.runQueue);
  const dropResult = useCompressStore((s) => s.dropResult);
  const sizes = useCompressStore((s) => s.sizes);
  const threadsByWorkspace = useThreadsStore((s) => s.threadsByWorkspace);
  const measureQueue = useCompressStore((s) => s.measureQueue);
  const queue = useSettingsStore((s) => s.compressQueue);
  const nightlyAt = useSettingsStore((s) => s.compressNightlyAt);
  const update = useSettingsStore((s) => s.update);

  // 排进队之后量一次大小 —— 纯本地，不出网、不花钱。
  useEffect(() => {
    if (enabled) void measureQueue();
  }, [enabled, queue, measureQueue]);

  // ⚠️ 默认关闭（§6.2 约束 5）。一个点了只会说「你还没配」的按钮不如没有。
  if (!enabled) return null;

  const titles = new Map<string, string>();
  for (const list of Object.values(threadsByWorkspace)) {
    for (const th of list) titles.set(th.id, th.title);
  }
  // 合计只把**量出来的**那几行加进去 —— ⛔ 少量出一个就不显示合计，不拿半份数字当全份。
  const measured = queue.map((id) => sizes[id]).filter((n): n is number => n !== undefined);
  const totalYuan =
    measured.length === queue.length && queue.length > 0
      ? measured.reduce((sum, c) => sum + (estimateYuanForChars(c, model) ?? 0), 0)
      : null;

  const queued = queue.includes(thread.id);
  const toggle = () =>
    void update({
      compressQueue: queued ? queue.filter((id) => id !== thread.id) : [...queue, thread.id],
    });

  return (
    <RailSection title={t('压缩')}>
      <div className="space-y-1.5 px-3">
        <button
          type="button"
          disabled={running || batchRunning}
          onClick={() => void openProject(thread)}
          title={t('把这个项目的上下文压短一点，压完一块一块给你核对')}
          className="flex items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[13px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
        >
          {running && !batchRunning ? (
            <Loader2 size={12} className="flex-none animate-spin" />
          ) : (
            <Shrink size={12} className="flex-none" />
          )}
          {t('压缩这个项目')}
        </button>

        {/* ⑥ 睡前排队（§9.6.4）。⭐ 授权发生在花钱之前，核对仍然在你手上 ——
            这不是无人值守，是排队。 */}
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink">
          <input
            type="checkbox"
            checked={queued}
            onChange={toggle}
            className="h-3 w-3 flex-none accent-current"
          />
          <Moon size={11} className="flex-none" />
          {nightlyAt
            ? t('今晚 {at} 一起压（还有 {n} 个）', { at: nightlyAt, n: queue.length })
            : t('排进「一起压」（还有 {n} 个）', { n: queue.length })}
        </label>

        {/* ⭐ 授权发生在花钱之前，核对仍然在你手上 —— 这不是无人值守，是排队。
            ⛔ 没有 launchd、没有后台常驻：应用开着的时候到点跑，到点没开、下次启动补跑。 */}
        {queue.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <label className="flex items-center gap-1">
              <span>{t('几点跑')}</span>
              <input
                type="time"
                value={nightlyAt}
                onChange={(e) => void update({ compressNightlyAt: e.target.value })}
                className="rounded border border-line bg-paper px-1 py-0.5 text-[12px] text-ink-2"
              />
            </label>
            {nightlyAt && (
              <button
                type="button"
                onClick={() => void update({ compressNightlyAt: '' })}
                className="transition-colors hover:text-accent"
              >
                {t('取消定时')}
              </button>
            )}
            <button
              type="button"
              disabled={batchRunning || running}
              onClick={() => void runQueue()}
              className="transition-colors enabled:hover:text-accent disabled:opacity-50"
            >
              {t('现在就跑')}
            </button>
          </div>
        )}

        {/* 睡前那张单子：每一行多大、大概多少钱，底下一个合计。
            ⚠️⚠️ **这是估算，不是账单。** 跑完之后每一份自己那条账里写的才是真实数字。 */}
        {queue.length > 0 && (
          <ul className="space-y-0.5 text-[12px] text-muted">
            {queue.map((id) => {
              const title = titles.get(id) ?? id;
              const chars = sizes[id];
              const yuan = chars === undefined ? null : estimateYuanForChars(chars, model);
              return (
                <li key={id} className="flex items-baseline gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="flex-none">
                    {chars === undefined
                      ? t('量一下…')
                      : yuan === null
                        ? t('{k} 千字', { k: Math.round(chars / 100) / 10 })
                        : t('{k} 千字 · 约 {y}', {
                            k: Math.round(chars / 100) / 10,
                            y: formatYuan(yuan),
                          })}
                  </span>
                </li>
              );
            })}
            <li className="flex items-baseline gap-1.5 border-t border-line pt-0.5">
              <span className="min-w-0 flex-1 truncate">{t('合计（估算）')}</span>
              <span className="flex-none">{totalYuan === null ? '—' : t('约 {y}', { y: formatYuan(totalYuan) })}</span>
            </li>
          </ul>
        )}

        {batchRunning && (
          <p className="text-[12px] leading-relaxed text-muted">
            {t('正在按队列一个一个压…压完的会在这儿等你核对。')}
          </p>
        )}

        {/* 早上：结果在这儿等着。⚠️ 一次失败不能拖垮整批，也不许让你早上看到一张空桌子。 */}
        {results.length > 0 && (
          <ul className="space-y-0.5 pt-0.5">
            {results.map((r, i) => (
              <li key={`${r.target.threadId}-${r.startedAt}`} className="flex items-baseline gap-1">
                <button
                  type="button"
                  onClick={() => openResult(i)}
                  className="min-w-0 flex-1 truncate rounded px-0 py-0.5 text-left text-[12px] text-accent transition-colors hover:underline"
                >
                  {t('《{name}》压好了，等你核对', { name: r.target.title })}
                </button>
                {/* 核对完了就把它划掉。⚠️ 这只是从这张单子上拿掉 —— 库里本来就什么都没写。 */}
                <button
                  type="button"
                  onClick={() => dropResult(i)}
                  title={t('核对完了，从单子上去掉')}
                  className="flex-none rounded p-0.5 text-muted transition-colors hover:text-ink"
                >
                  <X size={10} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {failures.length > 0 && (
          <ul className="space-y-0.5 pt-0.5 text-[12px]" style={{ color: 'var(--urgent)' }}>
            {failures.map((f) => (
              <li key={f.title}>{t('《{name}》没压成：{why}', { name: f.title, why: f.why })}</li>
            ))}
          </ul>
        )}
      </div>
    </RailSection>
  );
}
