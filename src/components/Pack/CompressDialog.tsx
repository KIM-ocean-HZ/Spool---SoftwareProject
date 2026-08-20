import { AlertTriangle, Check, ClipboardList, Copy, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { listen } from '@tauri-apps/api/event';
import {
  auditCompression,
  auditHasLosses,
  cancelCompress,
  compressPack,
  diffLines,
  estimateCost,
  formatYuan,
  FAILURE_SENTENCE,
  LEVEL_HINTS,
  LEVEL_LABELS,
  loadApiKey,
  measurementRecord,
  PROGRESS_EVENT,
  type CompressProgress,
  type CompressLevel,
  type CompressOutcome,
} from '@/lib/ai/compress';
import { useT } from '@/lib/i18n';
import { createBackdropClose } from '@/lib/utils/backdropClose';
import { useSettingsStore } from '@/stores/settingsStore';

// 并排核对（WORKPLAN-2026-08-20 §6.4.1 / §9 第 4 步）。
//
// ⛔ **这一步只看，不写。** §9 第 4 步说得很死：先不接 `supersedes` 写入,先确认压缩质量
//    Ocean 认可,再开写入那一段。所以这个对话框里**没有「用这一份」按钮**——有的只是
//    「复制压缩稿」。质量不认可的话,§6.4.1 后半段一行都不用写。
//
// 三件事是这个界面的全部理由,每一件都对应 §6.2 的一条设计约束:
//
//   ① 压缩必须说出自己压掉了什么（约束 3）。顶部那条账是 **Spool 自己数的**,不是问模型要的
//      ——让被审查的一方报告自己的成绩单没有意义。模型自己那句话另外显示,标明是它说的。
//   ② 不该删的东西如果被删了,要**指名道姓**列出来。让人在五万字里肉眼比对等于没有核对,
//      所以 `auditCompression` 先把 note: 行、==高亮==、用户自己写的条目、整节标题各数一遍。
//   ③ 失败必须可见（约束 4）。超时/余额不足/限流各有各的说法,绝不退回未压缩版而不吭声。
export default function CompressDialog({
  packText,
  project,
  onClose,
}: {
  packText: string;
  /** 项目名,只用在实测记录里 —— 一次账单必须知道压的是哪个项目才有对照价值。 */
  project: string;
  onClose: () => void;
}) {
  const t = useT();
  const baseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const model = useSettingsStore((s) => s.apiModel);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const level = useSettingsStore((s) => s.apiCompressLevel);
  const reasoning = useSettingsStore((s) => s.apiReasoning);
  const update = useSettingsStore((s) => s.update);

  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<CompressOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const [recorded, setRecorded] = useState(false);
  // 2026-08-20 Ocean：「deepseek 在压缩时根本不会给反馈，用户不知道有没有连接成功」。
  // 不流式的一次调用可以一分钟不吭声，而一个转圈说不出「连上了没有」。
  // 所以显示两样：子进程报回来的**阶段**，和一个**秒表**（连着说清最长等多久）。
  const [progress, setProgress] = useState<CompressProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // 秒表。只在跑的时候走。
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const un = listen<CompressProgress>(PROGRESS_EVENT, (e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);

  const run = async () => {
    setRunning(true);
    setOutcome(null);
    setProgress({ stage: 'starting' });
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const apiKey = await loadApiKey();
      const res = await compressPack({
        packText,
        level,
        baseUrl,
        apiKey,
        model,
        reasoning,
        timeoutSecs,
      });
      setOutcome(res);
    } catch (e) {
      // invoke 自己抛（比如那道「已经在跑了」的闸）。也要说出来，不能静默。
      setOutcome({
        ok: false,
        text: '',
        cuts: null,
        kind: 'internal',
        message: e instanceof Error ? e.message : String(e),
        status: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: null,
        reasoningTokens: null,
        ms: 0,
        model: null,
      });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const audit = useMemo(
    () => (outcome?.ok ? auditCompression(packText, outcome.text) : null),
    [packText, outcome],
  );
  const diff = useMemo(
    () => (outcome?.ok ? diffLines(packText, outcome.text) : []),
    [packText, outcome],
  );
  const cost = useMemo(() => (outcome?.ok ? estimateCost(outcome) : null), [outcome]);

  const backdrop = useMemo(() => createBackdropClose(onClose), [onClose]);

  const copy = async () => {
    if (!outcome?.ok) return;
    await writeText(outcome.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // §9 第 5 步。⚠️ 数字必须**当场**拿走：这个窗口一关就没了,而事后回忆出来的数字
  // 正是这个项目最不许写进案例账本的那种东西。
  const copyRecord = async () => {
    if (!outcome?.ok || !audit) return;
    await writeText(measurementRecord({ project, level, outcome, audit }));
    setRecorded(true);
    setTimeout(() => setRecorded(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-8" {...backdrop}>
      <div
        className="flex h-[86vh] w-[min(1180px,94vw)] flex-col rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-serif text-lg text-ink">{t('压缩这份上下文')}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {t('左边是原文，右边是压缩稿。核对完自己复制走 —— 这一步不会改动你的库。')}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label={t('关闭')}>
            <X size={14} />
          </button>
        </header>

        {/* 档位。§6.4.1：显式档位比在提示词里写「请少删一点」可靠 —— 后者是求模型自觉，
            前者是给它一个能被核对的目标。 */}
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <span className="text-muted">{t('压多狠?')}</span>
          {(Object.keys(LEVEL_LABELS) as CompressLevel[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={running}
              onClick={() => void update({ apiCompressLevel: k })}
              title={t(LEVEL_HINTS[k])}
              className={`rounded-md border px-2 py-0.5 transition-colors disabled:opacity-50 ${
                level === k
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {t(LEVEL_LABELS[k])}
            </button>
          ))}
          <span className="text-muted/70">{t(LEVEL_HINTS[level])}</span>
        </div>

        {/* 顶部那条账。⚠️ 块数是 Spool 自己数的。 */}
        {audit && (
          <div
            className="flex flex-none flex-col gap-1 border-b border-line px-5 py-2 text-[11px]"
            style={auditHasLosses(audit) ? { color: 'var(--urgent)' } : undefined}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {t('原始 {a} 块 → 压缩后 {b} 块', { a: audit.entriesBefore, b: audit.entriesAfter })}
              </span>
              <span className="text-muted">
                {t('{a} → {b} 字符（剩 {p}%）', {
                  a: audit.charsBefore.toLocaleString(),
                  b: audit.charsAfter.toLocaleString(),
                  p: Math.round((audit.charsAfter / Math.max(1, audit.charsBefore)) * 100),
                })}
              </span>
              {outcome?.ok && (
                <span className="text-muted">
                  {t('用了 {n} 秒', { n: Math.round(outcome.ms / 1000) })}
                </span>
              )}
            </div>

            {/* ⚠️ 这几行是这个界面存在的主要理由：提示词要求「一字不改保留」的东西，
                如果真的少了，必须在这里被点名，而不是等用户自己在五万字里发现。 */}
            {auditHasLosses(audit) ? (
              <div className="flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 flex-none" />
                <div className="space-y-0.5">
                  <div>{t('有本来要求一字不改保留的东西不见了 —— 下面按行标了出来：')}</div>
                  {audit.missingSections.length > 0 && (
                    <div>{t('少了整节：{s}', { s: audit.missingSections.join('、') })}</div>
                  )}
                  {audit.missingNotes.length > 0 && (
                    <div>{t('少了 {n} 条你自己的批注', { n: audit.missingNotes.length })}</div>
                  )}
                  {audit.missingPersonal.length > 0 && (
                    <div>{t('少了 {n} 条你自己写的内容', { n: audit.missingPersonal.length })}</div>
                  )}
                  {audit.missingHighlights.length > 0 && (
                    <div>{t('少了 {n} 处你划的重点', { n: audit.missingHighlights.length })}</div>
                  )}
                  {/* ⚠️ 「编」比「丢」更坏：一行编出来的批注穿的是你自己的权威。 */}
                  {audit.fabricatedNotes.length > 0 && (
                    <div className="font-medium">
                      {t('⚠️ 它凭空写了 {n} 条你没写过的批注：{s}', {
                        n: audit.fabricatedNotes.length,
                        s: audit.fabricatedNotes.join('、'),
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted">
                {t('你的批注、你自己写的内容、你划的重点，一条都没少，也没有多。')}
              </div>
            )}

            {/* 模型自己那句话，和上面 Spool 数出来的分开显示 —— 一个是测量，一个是它的说法。 */}
            <div className="text-muted">
              {outcome?.cuts
                ? t('它说它删的是：{s}', { s: outcome.cuts.replace(/\s*\n\s*/g, ' ') })
                : t('⚠️ 它没有说自己删掉了什么。')}
            </div>

            {/* 钱。§9 第 5 步要拿这个去和 §6.2 的估算对账。 */}
            {outcome?.ok && (
              <div className="text-muted">
                {t('这一次：输入 {i} token，输出 {o} token', {
                  i: outcome.inputTokens.toLocaleString(),
                  o: outcome.outputTokens.toLocaleString(),
                })}
                {outcome.cachedInputTokens !== null
                  ? t('，其中 {c} 命中了缓存', { c: outcome.cachedInputTokens.toLocaleString() })
                  : t('，这家接口没有报缓存命中')}
                {cost
                  ? t('。按官方价目算大约 {y}{u}', {
                      y: formatYuan(cost.yuan),
                      u: cost.cacheUnknown ? t('（按全部未命中算，这是上限）') : '',
                    })
                  : t('。认不出这个模型的价目，所以不报价。')}
              </div>
            )}
          </div>
        )}

        {/* 失败：§6.2 约束 4。每一类各说各的话，绝不塌成「失败了」。 */}
        {outcome && !outcome.ok && (
          <div className="flex-none border-b border-line px-5 py-3 text-xs" style={{ color: 'var(--urgent)' }}>
            <div>{t(FAILURE_SENTENCE[outcome.kind ?? 'http'] ?? FAILURE_SENTENCE.http)}</div>
            {outcome.message && (
              <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-paper-2 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
                {outcome.message}
              </pre>
            )}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-line">
          {/* 左：原文，压掉的行标出来。 */}
          <div className="min-h-0 overflow-y-auto px-4 py-3">
            <div className="mb-1.5 text-[11px] text-muted">{t('原文（划掉的是被压掉的）')}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-ink-2">
              {diff.length === 0
                ? packText
                : diff
                    .filter((l) => l.op !== 'added')
                    .map((l, i) => (
                      <span
                        key={i}
                        className={l.op === 'cut' ? 'line-through opacity-45' : undefined}
                        style={l.op === 'cut' ? { color: 'var(--urgent)' } : undefined}
                      >
                        {l.text}
                        {'\n'}
                      </span>
                    ))}
            </pre>
          </div>

          {/* 右：压缩稿。模型自己新写的行也标出来 —— 第 4 条禁止它添加原文没有的信息。 */}
          <div className="min-h-0 overflow-y-auto px-4 py-3">
            <div className="mb-1.5 text-[11px] text-muted">
              {outcome?.ok ? t('压缩稿（标出来的是它自己写的句子）') : t('压缩稿')}
            </div>
            {outcome?.ok ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-ink-2">
                {diff
                  .filter((l) => l.op !== 'cut')
                  .map((l, i) => (
                    <span
                      key={i}
                      // ⚠️ 内联而不是用 `bg-accent-soft`:那个类名在 tailwind.config.js 的
                      // colors 里根本没有(仓库里另外 5 处也在用它,同样不生效——见下面 PS)。
                      // 这里的高亮是功能的一部分:它标的是「模型自己写的句子」,而第 4 条规则
                      // 禁止它添加原文没有的信息。看不见等于这条检查没做。
                      style={l.op === 'added' ? { background: 'var(--accent-soft)' } : undefined}
                    >
                      {l.text}
                      {'\n'}
                    </span>
                  ))}
              </pre>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-[11px] leading-relaxed text-muted">
                {running ? (
                  <div className="space-y-1">
                    {/* ⚠️ 这两个字数是「它还在正常干活」的唯一证据。之前那次 180 秒超时，
                        界面上分不出「在写」和「卡死」，就是因为没有它们。 */}
                    <div className="text-ink-2">
                      {progress?.stage === 'writing'
                        ? t('正在写压缩稿…已经写了 {n} 字', { n: (progress.written ?? 0).toLocaleString() })
                        : progress?.stage === 'thinking'
                          ? t('模型在思考…已经想了 {n} 字，还没开始写', {
                              n: (progress.thinking ?? 0).toLocaleString(),
                            })
                          : progress?.stage === 'sending'
                            ? t('请求已经发出去了，正在等它开口…')
                            : t('正在启动联网的那个小程序…')}
                    </div>
                    <div>{t('已经等了 {n} 秒（最长等 {max} 秒）', { n: elapsed, max: timeoutSecs })}</div>
                    <div className="text-muted/70">
                      {progress?.stage === 'thinking'
                        ? t('⚠️ 这一档模型会先想完再动笔。上面那个数字一直在涨，就说明它没卡住。')
                        : t('上面那个字数一直在涨，就说明它在正常干活。')}
                    </div>
                  </div>
                ) : (
                  t('点右下角开始。')
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-none items-center justify-between gap-3 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          {/* ⛔ 这句话必须在。这一步不写库,用户不该以为点了什么就生效了。 */}
          <span className="text-muted">{t('这一步不会改动你的库 —— 压缩稿只在这个窗口里。')}</span>
          <div className="flex items-center gap-2">
            {outcome?.ok && (
              <button
                onClick={() => void copyRecord()}
                title={t('把这一次的 token 数、缓存命中、耗时、估算金额拷走')}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors ${
                  recorded ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {recorded ? <Check size={12} /> : <ClipboardList size={12} />}
                <span>{recorded ? t('已复制') : t('复制这次的数据')}</span>
              </button>
            )}
            {outcome?.ok && (
              <button
                onClick={() => void copy()}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors ${
                  copied ? 'border-accent bg-accent/10 text-accent' : 'border-line-strong bg-paper text-ink hover:border-accent hover:text-accent'
                }`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? t('已复制') : t('复制压缩稿')}</span>
              </button>
            )}
            <button
              onClick={() => (running ? void cancelCompress() : void run())}
              autoFocus
              className="flex items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {running && <Loader2 size={12} className="animate-spin" />}
              <span>
                {running ? t('停下（{n}s）', { n: elapsed }) : outcome ? t('再压一次') : t('开始压缩')}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
