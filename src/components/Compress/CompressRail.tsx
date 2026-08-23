import { X } from 'lucide-react';
import RailSection from '@/components/RightRail/RailSection';
import type { Thread } from '@/lib/db/threads';
import { useT } from '@/lib/i18n';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

// 压缩在右栏剩下的那一点东西。
//
// ⭐⭐ **2026-08-23（Ocean 真手指验收第 4 条）：这一格被掏空了大半。**
// 他的原话：「右侧边栏的压缩按钮不要了，压缩直接到面板去使用（overnight 的勾选也放里面，
// 此外，overnight 压缩可以在项目管理的面板里面加入，方便多项目加入）。」
//
// 撤走的三样：**「整理这个项目」那个按钮**、**排队的勾选**、**几点跑 / 现在就跑 / 队列清单** ——
// 它们现在都在项目里的「压缩」页签上（`CompressBoard`），多项目排队在「项目管理」的行里。
//
// ⚠️ **剩下的只有一件事，而且它是跨项目的**：夜里那一批压好之后，**别的项目**的那几份
// 得有个地方认领。这个项目自己的那一份在它自己的页签上（页签上会写「压缩（1）」），
// ⛔ 不在这儿重复列一遍 —— 同一件事出现在两个地方，就是 D3 骂的那种歧义。
//
// ⚠️ 没有东西要认领的时候**整格不出现**：一个永远空着的小标题只是在占地方。
export default function CompressRail({ thread }: { thread: Thread }) {
  const t = useT();
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);
  const results = useCompressStore((s) => s.results);
  const failures = useCompressStore((s) => s.failures);
  const openResult = useCompressStore((s) => s.openResult);
  const dropResult = useCompressStore((s) => s.dropResult);
  const selectThread = useThreadsStore((s) => s.select);

  // ⚠️ 默认关闭（§6.2 约束 5）。一个点了只会说「你还没配」的按钮不如没有。
  if (!enabled) return null;

  // ⭐ D2（2026-08-22，Ocean 原话「一个项目的压缩在另外一个项目里竟然能够点击跳转」）：
  // 点了**先切到那个项目**再开桌子，⛔ 不把别人的核对桌开在你这个项目上。
  const others = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.target.threadId !== thread.id);

  if (others.length === 0 && failures.length === 0) return null;

  return (
    <RailSection title={t('压缩')}>
      <div className="space-y-1.5 px-3">
        {others.length > 0 && (
          <>
            <div className="text-[11px] text-muted/70">
              {t('别的项目里压好的（{n}）', { n: others.length })}
            </div>
            <ul className="space-y-0.5">
              {others.map(({ r, i }) => (
                <li key={`${r.target.threadId}-${r.startedAt}`} className="flex items-baseline gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      selectThread(r.target.threadId);
                      openResult(i);
                    }}
                    title={t('会先切到《{name}》，再打开它的核对桌', { name: r.target.title })}
                    className="min-w-0 flex-1 truncate rounded px-0 py-0.5 text-left text-[12px] text-muted transition-colors hover:text-accent hover:underline"
                  >
                    {t('《{name}》—— 切过去核对', { name: r.target.title })}
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
          </>
        )}

        {/* ⛔ 一次失败不能拖垮整批，也不许让你早上看到一张空桌子然后自己猜。 */}
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
