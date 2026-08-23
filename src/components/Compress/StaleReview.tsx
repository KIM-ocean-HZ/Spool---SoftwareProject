import { AlertTriangle, Loader2, ScanSearch } from 'lucide-react';
import { splitPackEntries } from '@/lib/ai/compressBlocks';
import type { StaleDropped } from '@/lib/ai/compress';
import { useT } from '@/lib/i18n';
import { retirementLineChars } from '@/lib/pack/assemble';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { StaleSession } from '@/stores/compressStore';

// E3 · 「查旧块」（COMPRESS-UX-R2-2026-08-22 §7 / WORKPLAN §2.E3）。
//
// ⭐ **2026-08-23：它自己一个页签了**（Ocean 真手指验收第 3 条「把两个功能拆出来」）。
// 原来它挤在「整理」页签的最上面，和压缩核对面抢高度 —— 而两件事本来就没关系：
// 一件是把话说短，一件是找出被后面的块取代的旧块。
//
// ⛔⛔ **这个面上不许出现「作废」两个字。** 这不是措辞洁癖，是实测结论：
// 60 次里 39 条提议，**35 条是「同一件事、旧块还剩很多」** —— 问「要不要作废」，
// 用户点头就会让一个**内容仍然有效**的块退出以后每一份 pack，而他不会发现。
//
// ⭐⭐ **2026-08-23（Ocean 第 9 条）：三个动作改用他自己的话。**
// 他的原话：「只退旧的的中文表述根本看不懂是什么意思。用户不是技术人员，他们只知道
// 新的 block 把旧的 block 取代了，或者是合并了，或者什么都没动。」
// 所以三个按钮就叫 **合并 / 新的取代旧的 / 什么都不动** —— ⛔ 别再往回改成动词短语，
// 「只退旧的」那种说法里的「退」，在这个界面上从来没有被解释过。
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
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-2.5 text-[11px]">
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
          {running ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
          {session ? t('再查一遍') : t('查一遍')}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {/* ⭐ T2（2026-08-23）：库里已经有这条关系、于是没拿出来问的，也要说出来。
            「一条都没找到」和「找到的那几条你已经处理过了」是两件事。 */}
        {session && session.already > 0 && (
          <div className="mb-2 text-[11px] text-muted">
            {t('另有 {n} 条你已经处理过了 —— 库里记着，这里不再问一遍。', {
              n: session.already,
            })}
          </div>
        )}

        {session && session.proposals.length > 0 && (
          <ul className="space-y-2">
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
                        ? t('已合并：两块都留着，#{n} 上记了一句「它更正了 #{m}」。', {
                            n: p.bySeq,
                            m: p.staleSeq,
                          })
                        : done === 'retire'
                          ? t('已换：以后打包只带 #{n}，#{m} 不再放进去。', {
                              n: p.bySeq,
                              m: p.staleSeq,
                            })
                          : t('这一条没动。')}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Choice
                        label={t('合并')}
                        hint={t('两块都留着，只在 #{n} 上记一句「它更正了 #{m}」。打包的时候两块还是都在，不会因此变短。', {
                          n: p.bySeq,
                          m: p.staleSeq,
                        })}
                        onClick={() => void decide(threadId, i, 'merge')}
                      />
                      <Choice
                        label={t('新的取代旧的')}
                        hint={
                          // ⭐ T6（2026-08-23 实测）：退掉一个**短**块，给 AI 看的内容反而更多 ——
                          // 「这一块不再有效」那两行是固定开销（实测净 +92 字符），块越短越不划算。
                          // ⛔ 不写成建议（「不建议退」是替用户决定，撞 D6 那条），写成事实。
                          // ⚠️ 措辞是 Ocean 第 9 条改的：⛔ 不许再出现「退」和「pack」两个词。
                          retireGrowsPack(session, p.staleSeq)
                            ? t(
                                '以后打包只带 #{n}，#{m} 不再放进去（它没被删，还在项目里，也搜得到）。⚠️ #{m} 很短：拿掉它之后打包出来反而会多几个字 —— 顶上去的那句「这一块已经被取代」比它本身还长。',
                                { n: p.bySeq, m: p.staleSeq },
                              )
                            : t('以后打包只带 #{n}，#{m} 不再放进去（它没被删，还在项目里，也搜得到）。', {
                                n: p.bySeq,
                                m: p.staleSeq,
                              })
                        }
                        onClick={() => void decide(threadId, i, 'retire')}
                      />
                      <Choice
                        label={t('什么都不动')}
                        hint={t('这两块保持原样，库里一个字都不改，这一条从单子上划掉。')}
                        onClick={() => void decide(threadId, i, 'keep')}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* ⭐⭐ 2026-08-23（Ocean 第 8 条）：**没过闸的那几条也要给他看。**
            他的原话：「这个回复看不懂，且提示不给我看，意思是我的项目有问题，但是 spool
            不告诉我，不允许这样的情况发生。」
            ⛔ 原来这里只有一句「另有 N 条被丢掉了 —— 它给的引文在块里对不上，Spool 不拿它
            给你看」，而且底下只有一个数，连内容都没带回来。现在整条带回来了。
            ⚠️ 两件事必须同时说清，⛔ 少一件都会被读成上面那句：
              ① **不是他的项目有问题**，是 AI 自己说错了；
              ② 这几条**没有按钮**，因为 Spool 核不实的东西不能拿去改他的库。 */}
        {session && session.dropped.length > 0 && (
          <div className="mt-3 rounded-md border border-line bg-paper-2/40 px-3 py-2 text-[11px]">
            <div className="flex items-start gap-1.5 text-ink-2">
              <AlertTriangle size={12} className="mt-0.5 flex-none" />
              <div>
                {t('AI 还说了 {n} 条，但它引的原话在你的块里对不上，所以 Spool 没敢照着做。这是 AI 记错了，不是你的项目有问题。下面是它的原话，你自己看一眼：', {
                  n: session.dropped.length,
                })}
              </div>
            </div>
            <ul className="mt-1.5 space-y-1.5 pl-5 text-muted">
              {session.dropped.map((d, i) => (
                <li key={i}>
                  <div>{droppedSentence(t, d)}</div>
                  {d.why && <div className="text-muted/70">{t('它给的理由：{s}', { s: d.why })}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** 这一条为什么没过闸，用大白话说一遍。⚠️ 按 Rust 那侧给的 `reason` 挑话，
 *  ⛔ 不在这儿另判一遍 —— 界面上放行的和闸放行的必须是同一批。 */
function droppedSentence(
  t: (key: string, vars?: Record<string, string | number>) => string,
  d: StaleDropped,
): string {
  switch (d.reason) {
    case 'no_seq':
      return t('它没说清是哪两块。');
    case 'no_block':
      return t('它说的是第 {m} 块和第 {n} 块，而这个项目里没有这个编号。', {
        m: d.staleSeq ?? '?',
        n: d.bySeq ?? '?',
      });
    case 'same_block':
      return t('它说第 {n} 块取代了它自己。', { n: d.bySeq ?? '?' });
    case 'quote_stale':
      return t('它说第 {n} 块里有这么一句：「{s}」—— 那一块里没有这句话。', {
        n: d.staleSeq ?? '?',
        s: d.quoteStale,
      });
    case 'quote_new':
      return t('它说第 {n} 块里有这么一句：「{s}」—— 那一块里没有这句话。', {
        n: d.bySeq ?? '?',
        s: d.quoteNew,
      });
  }
}

// ⭐ T6（2026-08-23 实测）：换掉这一块，给 AI 看的内容其实会**变多**吗。
//
// 拿掉一块，打包出来少了它那一整条，多了一行「这一块已经被取代」—— 而那一行是固定开销。
// 块比那一行还短的时候，「换掉」实际上让打包出来的内容变长（实测〈申请帮助〉`#6` 净 +92 字符）。
// ⛔ 不给建议（「不建议换」是替用户决定），只把这件事说出来。
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
