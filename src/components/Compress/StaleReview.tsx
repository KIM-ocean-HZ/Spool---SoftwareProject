import { AlertTriangle, Loader2, ScanSearch } from 'lucide-react';
import { splitPackEntries } from '@/lib/ai/compressBlocks';
import { useT } from '@/lib/i18n';
import { retirementLineChars } from '@/lib/pack/assemble';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { StaleSession } from '@/stores/compressStore';

// E3 · 作废检测的核对面（COMPRESS-UX-R2-2026-08-22 §7 / WORKPLAN §2.E3）。
//
// ⭐ **它进「整理」页签，不另开一个面** —— Ocean 原话：「后续的作废都可以放进现在的
// 压缩工作区，统一一个名字」。
//
// ⛔⛔ **这个面上不许出现「作废」两个字。** 这不是措辞洁癖，是实测结论：
// 60 次里 39 条提议，**35 条是「同一件事、旧块还剩很多」** —— 问「要不要作废」，
// 用户点头就会让一个**内容仍然有效**的块退出以后每一份 pack，而他不会发现。
// 所以问的是三件事：**合并 / 只退旧的 / 不动**，语义写在 `StaleAction` 上。
//
// ⛔ **不做 confidence 过滤**（§2.E3 写死的）：实测最离谱那条自标 `high`。
//    模型对自己有多少把握这件事，在这一轮数据里是没有信息量的。
export default function StaleReview({ threadId }: { threadId: string }) {
  const t = useT();
  const session = useCompressStore((s) => s.stale[threadId] ?? null);
  const running = useCompressStore((s) => s.running && s.runningThreadId === threadId);
  const busy = useCompressStore((s) => s.running || s.batchRunning);
  const scan = useCompressStore((s) => s.runStaleScan);
  const decide = useCompressStore((s) => s.decideStale);
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);

  if (!enabled) return null;

  const left = session
    ? session.proposals.filter((_, i) => session.decided[i] === undefined).length
    : 0;

  return (
    <section className="flex-none border-b border-line px-5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        <span className="text-ink">{t('可能已经过期的块')}</span>
        <span className="min-w-0 flex-1 text-muted">
          {session
            ? session.proposals.length === 0
              ? t('这一次没找到被后面的块整条取代的旧块。')
              : t('找到 {n} 条，还剩 {k} 条没决定。', {
                  n: session.proposals.length,
                  k: left,
                })
            : t('查一遍这个项目里，有没有被后面的块整条取代的旧块。这一步要花钱。')}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void scan(threadId)}
          className="flex flex-none items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
        >
          {running ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <ScanSearch size={12} />
          )}
          {session ? t('再查一遍') : t('查一遍')}
        </button>
      </div>

      {/* ⭐ T2（2026-08-23）：库里已经有这条关系、于是没拿出来问的，也要说出来。
          「一条都没找到」和「找到的那几条你已经处理过了」是两件事。 */}
      {session && session.already > 0 && (
        <div className="mt-1.5 text-[11px] text-muted">
          {t('另有 {n} 条你已经处理过了 —— 库里记着，这里不再问一遍。', {
            n: session.already,
          })}
        </div>
      )}

      {/* ⛔ 引文对不上被整条丢掉的，必须报出来：模型提了 5 条只留下 2 条，
          和它本来就只提了 2 条，是两件完全不同的事。 */}
      {session && session.dropped > 0 && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted">
          <AlertTriangle size={12} className="mt-0.5 flex-none" />
          <span>
            {t('另有 {n} 条被丢掉了 —— 它给的引文在块里对不上，Spool 不拿它给你看。', {
              n: session.dropped,
            })}
          </span>
        </div>
      )}

      {session && session.proposals.length > 0 && (
        <ul className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto">
          {session.proposals.map((p, i) => {
            const done = session.decided[i];
            return (
              <li
                key={`${p.staleSeq}-${p.bySeq}-${i}`}
                className={`rounded-md border border-line bg-paper px-3 py-2 text-[11px] ${
                  done ? 'opacity-50' : ''
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-muted">
                    #{p.staleSeq} → #{p.bySeq}
                  </span>
                  <span className="min-w-0 flex-1 text-ink-2">{p.why}</span>
                  {/* ⚠️ 重打了标点要说出来：它确实破了「逐字」，只是没改内容。 */}
                  {p.retyped && (
                    <span className="flex-none text-muted/70">{t('（引文的标点被重打过）')}</span>
                  )}
                </div>

                {/* ⭐ 指到句子上，不报编号 —— 和压缩那一面同一条规矩：
                    「根本看不到丢掉的是哪一块的……需要指到文字内容上去」。
                    ⚠️ 这两句都过了逐字闸，所以它们**确实**出现在那两块里。 */}
                <div className="mt-1.5 space-y-1 text-ink-2">
                  <div>
                    <span className="text-muted">{t('旧的 #{n} 里：', { n: p.staleSeq })}</span>
                    「{p.quoteStale}」
                  </div>
                  <div>
                    <span className="text-muted">{t('新的 #{n} 里：', { n: p.bySeq })}</span>
                    「{p.quoteNew}」
                  </div>
                </div>

                {done ? (
                  <div className="mt-1.5 text-muted">
                    {done === 'merge'
                      ? t('已合并：#{n} 标成「更正了 #{m}」，#{m} 原样留着。', {
                          n: p.bySeq,
                          m: p.staleSeq,
                        })
                      : done === 'retire'
                        ? t('已退：#{m} 不再进 pack，#{n} 标成替代它的那一条。', {
                            n: p.bySeq,
                            m: p.staleSeq,
                          })
                        : t('这一条没动。')}
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Choice
                      label={t('合并')}
                      hint={t('把 #{n} 标成「更正了 #{m}」。#{m} 原样留着，还会照常出现在 pack 里。', {
                        n: p.bySeq,
                        m: p.staleSeq,
                      })}
                      onClick={() => void decide(threadId, i, 'merge')}
                    />
                    <Choice
                      label={t('只退旧的')}
                      hint={
                        // ⭐ T6（2026-08-23 实测）：退掉一个**短**块，给 AI 看的内容反而更多 ——
                        // 「这一块不再有效」那两行是固定开销（实测净 +92 字符），块越短越不划算。
                        // ⛔ 不写成建议（「不建议退」是替用户决定，撞 D6 那条），写成事实。
                        retireGrowsPack(session, p.staleSeq)
                          ? t(
                              '#{m} 从此不再进 pack（它还在库里，搜得到），#{n} 标成替代它的那一条。这一块很短：退掉之后 pack 反而会长一点，换上去的那行说明比它本身还长。',
                              { n: p.bySeq, m: p.staleSeq },
                            )
                          : t('#{m} 从此不再进 pack（它还在库里，搜得到），#{n} 标成替代它的那一条。', {
                              n: p.bySeq,
                              m: p.staleSeq,
                            })
                      }
                      onClick={() => void decide(threadId, i, 'retire')}
                    />
                    <Choice
                      label={t('不动')}
                      hint={t('库里一个字都不改，这一条划掉。')}
                      onClick={() => void decide(threadId, i, 'keep')}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ⭐ T6（2026-08-23 实测）：退掉这一块，给 AI 看的内容其实会**变多**吗。
//
// 退掉一块，pack 里少了它那一整条，多了一行「这一块不再有效」—— 而那一行是固定开销。
// 块比那一行还短的时候，「退掉」实际上让 pack 变长（实测〈申请帮助〉`#6` 净 +92 字符）。
// ⛔ 不给建议（「不建议退」是替用户决定），只把这件事说出来。
//
// ⚠️ 「这一块现在有多长」按**当前这份 pack** 量（`session.source` 就是发出去的那一份），
// ⛔ 不拿 `content.length` 代替 —— 批注、出处行、关系行都跟着一起消失，它们也算数。
function retireGrowsPack(session: StaleSession, staleSeq: number): boolean {
  const block = session.blocks.find((b) => b.seq === staleSeq);
  if (!block) return false;
  const entry = splitPackEntries(session.source).find((e) => e.seq === staleSeq);
  if (!entry) return false;
  return entry.raw.length <= retirementLineChars(block);
}

// ⚠️ 三个动作**并排**，⛔ 没有一个被做成主按钮 —— 哪一个对，只有用户知道，
// 而把其中一个做得更显眼就是在替他选。悬停说明写的是「会发生什么」，不是名词解释。
function Choice({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}
