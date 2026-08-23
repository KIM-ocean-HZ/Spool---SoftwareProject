import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, ScanSearch } from 'lucide-react';
import { splitPackEntries } from '@/lib/ai/compressBlocks';
import { estimateCost, formatYuan, FAILURE_SENTENCE, type StaleDropped } from '@/lib/ai/compress';
import { useT } from '@/lib/i18n';
import { retirementLineChars } from '@/lib/pack/assemble';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { StaleSession } from '@/stores/compressStore';

// E3 · 「过期检测」（COMPRESS-UX-R2-2026-08-22 §7 / WORKPLAN §2.E3）。
//
// ⭐ **2026-08-23：它自己一个页签了**（Ocean「把两个功能拆出来」）。
// 原来它挤在「整理」页签的最上面，和压缩核对面抢高度 —— 而两件事本来就没关系：
// 一件是把话说短，一件是找出被后面的块取代的旧块。
//
// ⭐⭐ **同一天第二轮，他又指了三件，全在这个文件里**：
//   ① 「点击查旧块会把运行信息写在压缩里面，显示『压缩（在跑）』」
//      → 两件事共用一把「在跑」的锁，而界面只问了「在不在跑」。修在 store 的 `runningKind`。
//   ② 「如果查出来没问题也不会显示，只有一片空白」
//      → 查完什么都没找到**是一个结果，不是没有结果**。⛔ 一片空白等于让用户自己猜跑没跑。
//   ③ 「压缩和查旧块的 UI 排列应该是一致的」
//      → 这一页改成和 `CompressBoard` 同一个骨架：**顶上一句说明 · 中间一格结果 ·
//        右下角一个动作按钮**。⛔ 别再把动作按钮塞回顶部那一行。
//
// ⛔⛔ **这个面上不许出现「作废」两个字。** 这不是措辞洁癖，是实测结论：
// 60 次里 39 条提议，**35 条是「同一件事、旧块还剩很多」** —— 问「要不要作废」，
// 用户点头就会让一个**内容仍然有效**的块退出以后每一份 pack，而他不会发现。
//
// ⭐ 三个动作用的是 Ocean 自己的话（「新的 block 把旧的取代了 / 合并了 / 什么都没动」）：
// **合并 / 新的取代旧的 / 什么都不动**。⛔ 别改回「只退旧的」——「退」在这个界面上
// 从来没有被解释过。
//
// ⛔ **不做 confidence 过滤**（§2.E3 写死的）：实测最离谱那条自标 `high`。
export default function StaleReview({ threadId }: { threadId: string }) {
  const t = useT();
  const session = useCompressStore((s) => s.stale[threadId] ?? null);
  // ⚠️ **要同时问「哪个项目」和「哪一件事」。** 只问前者，压缩一跑这一页就跟着转圈；
  // 只问后者，别的项目在跑的时候这一页也会转。
  const running = useCompressStore(
    (s) => s.running && s.runningThreadId === threadId && s.runningKind === 'stale',
  );
  const busy = useCompressStore((s) => s.running || s.batchRunning);
  const error = useCompressStore((s) => s.staleErrors[threadId] ?? null);
  const scan = useCompressStore((s) => s.runStaleScan);
  const cancel = useCompressStore((s) => s.cancel);
  const decide = useCompressStore((s) => s.decideStale);
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);

  // 和压缩那一页一样的秒表 —— 「它还在干活」需要一个看得见的证据。
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  if (!enabled) return null;

  const left = session
    ? session.proposals.filter((_, i) => session.decided[i] === undefined).length
    : 0;
  const cost = session?.outcome?.ok ? estimateCost(session.outcome) : null;
  // 「跑完了，什么都没找到」—— ⚠️ 这是一个结果，要占中间那一格，⛔ 不是一片空白。
  const cleanRun =
    !!session && session.proposals.length === 0 && session.dropped.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ① 顶上一句说明 —— 和压缩那一页同一个位置、同一个字号。 */}
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-2">
        <div className="min-w-0 text-[11px] text-muted">
          {t('查这个项目里有没有旧块已经被后面的块整条取代了。你不点那三个按钮，库里一个字都不动。')}
        </div>
      </header>

      {/* ② 跑完之后那一行数 —— 和压缩那一页的四个格子同一个样式、同一个位置。
          ⛔ D0 仍然管着这里：token、缓存命中一个都不许回来；「花费」是接口回报的**真实**
          用量算的，不是估算（估算那一条被红线禁掉的是「跑之前预测多少钱」）。 */}
      {session?.outcome?.ok && (
        <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-5 py-2 text-[11px]">
          <Stat label={t('找到')} value={t('{n} 条', { n: session.proposals.length })} />
          {session.proposals.length > 0 && (
            <Stat label={t('还没决定')} value={t('{n} 条', { n: left })} />
          )}
          <Stat label={t('用时')} value={`${Math.round(session.outcome.ms / 1000)}s`} />
          <Stat
            label={t('花费')}
            value={cost ? `${cost.cacheUnknown ? '≤ ' : ''}${formatYuan(cost.yuan)}` : '—'}
          />
        </div>
      )}

      {/* 失败：⛔ 和压缩那一页一样，每一类各说各的话，绝不塌成「失败了」。
          ⚠️ 这一段以前根本不存在 —— 查一遍失败之后屏幕上什么都不会变，
          而错误被写进了**压缩那一页**的错误位。 */}
      {(error || (session?.outcome && !session.outcome.ok)) && (
        <div className="flex-none border-b border-line px-5 py-3 text-xs" style={{ color: 'var(--urgent)' }}>
          <div>
            {error ??
              t(FAILURE_SENTENCE[session?.outcome?.kind ?? 'http'] ?? FAILURE_SENTENCE.http)}
          </div>
          {session?.outcome?.message && (
            <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-paper-2 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
              {session.outcome.message}
            </pre>
          )}
        </div>
      )}

      {/* ③ 中间那一格。⚠️ 三种状态都得**说话**：还没查 / 正在查 / 查完了没找到。 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {session && session.proposals.length > 0 ? (
          <>
            {/* ⭐ T2：库里已经有这条关系、于是没拿出来问的，也要说出来。 */}
            {session.already > 0 && (
              <div className="mb-2 text-[11px] text-muted">
                {t('另有 {n} 条你已经处理过了 —— 库里记着，这里不再问一遍。', { n: session.already })}
              </div>
            )}
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

                    {/* ⭐ 指到句子上，不报编号 —— 和压缩那一面同一条规矩。
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
                            // 「这一块不再有效」那两行是固定开销（实测净 +92 字符）。
                            // ⛔ 不写成建议（「不建议换」是替用户决定），写成事实。
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

            {/* ⭐⭐ 没过闸的那几条也要给他看（Ocean:「不允许」Spool 知道而不告诉他）。 */}
            <DroppedNote session={session} />
          </>
        ) : (
          <div className="flex min-h-full items-center justify-center px-6 py-4 text-center text-[12px] leading-relaxed text-muted">
            {running ? (
              <div className="space-y-1">
                <div className="text-ink-2">{t('正在查…')}</div>
                <div>{t('已经等了 {n} 秒（最长等 {max} 秒）', { n: elapsed, max: timeoutSecs })}</div>
              </div>
            ) : cleanRun ? (
              // ⭐ Ocean 第 2 条：**查完没找到是一个结果**，它得占住这一格，⛔ 不是一片空白。
              <div className="space-y-1">
                <div className="text-ink-2">{t('查完了，这个项目里没有旧块被后面的块整条取代。')}</div>
                {session!.already > 0 && (
                  <div>
                    {t('另有 {n} 条你已经处理过了 —— 库里记着，这里不再问一遍。', {
                      n: session!.already,
                    })}
                  </div>
                )}
                <div>{t('库里一个字都没动。')}</div>
              </div>
            ) : session ? (
              // 提议全被闸挡下了：一条都没剩，但**确实有东西可说**。
              <div className="space-y-2">
                <div className="text-ink-2">{t('查完了，没有能拿给你的结果。')}</div>
                <DroppedNote session={session} />
              </div>
            ) : (
              <div className="space-y-1">
                <div>{t('点右下角开始。')}</div>
                <div>{t('它会把这个项目的上下文发给 AI 看一遍，问「有没有哪一块已经被后面的块整条取代了」。这一步要花钱。')}</div>
                <div>{t('AI 说的每一条都要能在你的块里逐字对上，对不上的 Spool 不拿它去改库。')}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ④ 右下角一个动作按钮 —— 和压缩那一页同一个位置。 */}
      <footer className="flex flex-none items-center justify-between gap-3 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
        <span className="text-muted">
          {t('这一页只连线，不改任何一块的正文。')}
        </span>
        {/* ⛔ 2026-08-23（Ocean:「过期检测跑起来无法取消」）：这一页原来**没有停下**。
            ⚠️ 它和压缩共用同一条 sidecar 的路，`cancel()` 本来就管得住它 ——
            少的只是这个按钮。⭐ 一个按钮两种身份，和压缩那一页逐字一样的写法。 */}
        <button
          type="button"
          disabled={busy && !running}
          onClick={() => (running ? void cancel() : void scan(threadId))}
          className="flex items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
          <span>
            {running ? t('停下（{n}s）', { n: elapsed }) : session ? t('再查一遍') : t('查一遍')}
          </span>
        </button>
      </footer>
    </div>
  );
}

/** ⭐⭐ 2026-08-23（Ocean）：**没过闸的那几条也要摆出来。**
 *
 *  他的原话：「这个回复看不懂，且提示不给我看，意思是我的项目有问题，但是 spool
 *  不告诉我，**不允许这样的情况发生**。」
 *
 *  ⚠️ 两件事必须同时说清，⛔ 少一件都会被读成上面那句：
 *    ① **不是他的项目有问题**，是 AI 自己说错了；
 *    ② 这几条**没有按钮**，因为 Spool 核不实的东西不能拿去改他的库。 */
function DroppedNote({ session }: { session: StaleSession }) {
  const t = useT();
  if (session.dropped.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-line bg-paper-2/40 px-3 py-2 text-left text-[11px]">
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

// 一个数一格 —— ⚠️ 和压缩那一页的 `Stat` 同一个样子，⛔ 两边别长歪。
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wide text-muted/70">{label}</div>
      <div className="font-mono text-[13px]">{value}</div>
    </div>
  );
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
