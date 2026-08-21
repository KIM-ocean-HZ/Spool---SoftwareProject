import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, Copy, Loader2, X } from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import EntryCard from './EntryCard';
import {
  auditCompression,
  auditHasLosses,
  diffLines,
  estimateCost,
  FAILURE_SENTENCE,
  formatYuan,
  LEVEL_HINTS,
  LEVEL_LABELS,
  LEVEL_TARGET,
  measurementRecord,
  type CompressLevel,
} from '@/lib/ai/compress';
import { compareByEntry } from '@/lib/ai/compressBlocks';
import { useT } from '@/lib/i18n';
import type { Block } from '@/lib/db/blocks';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';

// 核对桌（WORKPLAN-2026-08-20 §9.6.2 / §9.6.5 / §9.6.6）。
//
// ⚠️ **它开在中间区域，不在右栏**，而且这是一条设计约束不是排版偏好：右栏宽度是
// `railWidth`（三百来像素），并排比对塞不下。右栏放的是动作和状态，桌子开在这儿。
//
// ⛔ **这一步只看，不写。** §6.4.1 的 `supersedes` 写入那一段仍然锁着，所以这张桌子上
//    **没有「用这一份」**，只有「复制走」。质量不认可的话，后面那半段一行都不用写。
export default function CompressBoard() {
  const t = useT();
  const session = useCompressStore((s) => s.session);
  const running = useCompressStore((s) => s.running);
  const progress = useCompressStore((s) => s.progress);
  const startError = useCompressStore((s) => s.startError);
  const run = useCompressStore((s) => s.run);
  const cancel = useCompressStore((s) => s.cancel);
  const close = useCompressStore((s) => s.close);

  const level = useSettingsStore((s) => s.apiCompressLevel);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const update = useSettingsStore((s) => s.update);

  const [copied, setCopied] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  const outcome = session?.outcome ?? null;
  const source = session?.source ?? '';

  const audit = useMemo(
    () => (outcome?.ok ? auditCompression(source, outcome.text) : null),
    [source, outcome],
  );
  // ⚠️ null = **这一份没法按块对照**（模型没照 pack 的格式写）。§9.6.5 点名要求这件事是一个
  // 看得见的结果：下面会说出来，然后退回整份文本对照 —— 不是一个被吞掉的异常。
  const byEntry = useMemo(
    () => (outcome?.ok ? compareByEntry(source, outcome.text) : null),
    [source, outcome],
  );
  const wholeDiff = useMemo(
    () => (outcome?.ok && !byEntry ? diffLines(source, outcome.text) : []),
    [source, outcome, byEntry],
  );
  const cost = useMemo(() => (outcome?.ok ? estimateCost(outcome) : null), [outcome]);

  // 四带记号要查库里那一块（⛔ 从原块取，不从压缩稿猜）。按 seq 索引，因为 pack 里印的就是它。
  const blockBySeq = useMemo(() => {
    const m = new Map<number, Block>();
    for (const b of session?.blocks ?? []) if (b.seq !== null) m.set(b.seq, b);
    return m;
  }, [session]);

  if (!session) return null;

  const structureOk =
    !byEntry || (byEntry.dropped === 0 && byEntry.invented === 0 && byEntry.duplicated.length === 0);
  const pct = audit ? Math.round((audit.charsAfter / Math.max(1, audit.charsBefore)) * 100) : null;
  const [lo, hi] = LEVEL_TARGET[session.level as CompressLevel] ?? LEVEL_TARGET.balanced;
  const missedTarget = pct !== null && pct > hi;

  const copy = async () => {
    if (!outcome?.ok) return;
    await writeText(outcome.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyRecord = async () => {
    if (!outcome?.ok || !audit) return;
    await writeText(
      measurementRecord({
        project: session.target.title,
        // 定格的那一份，不是现在设置里的那一份。
        level: session.level,
        reasoning: session.reasoning,
        outcome,
        audit,
      }),
    );
    setRecorded(true);
    setTimeout(() => setRecorded(false), 1500);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="font-serif text-lg text-ink">
            {session.target.kind === 'project'
              ? t('压缩《{name}》', { name: session.target.title })
              : t('压缩《{name}》的第 {n} 块', {
                  name: session.target.title,
                  n: session.target.seq ?? '?',
                })}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {t('一块对一块地核对。这一步不会改动你的库 —— 压缩稿只在这个界面里。')}
          </div>
        </div>
        <button
          onClick={close}
          className="flex-none rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
          aria-label={t('关闭')}
        >
          <X size={14} />
        </button>
      </header>

      {/* 档位。⚠️ 单块压缩时「只删重复」这一档基本无事可做 —— 见下面那句话。 */}
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
        {/* ⭐ 实测里最要紧的一条，放在选档位的地方 —— 因为它说的正是「这个旋钮没你想的管用」。 */}
        <span className="w-full text-muted/70">
          {t('⚠️ 实测：压多少主要取决于这个项目里有多少重复，不取决于你选哪一档。')}
        </span>
      </div>

      {/* ⚠️⚠️ §9.6.6 点名要在界面上说清的那句话：单块压缩不是「项目压缩缩小版」。 */}
      {session.target.kind === 'block' && (
        <p className="flex-none border-b border-line px-5 py-2 text-[11px] leading-relaxed text-muted">
          {level === 'conservative'
            ? t('⚠️ 「只删重复」这一档在单块上基本无事可做：压缩干的主要活是合并重复，而重复是跨块的 —— 单独压一块，它看不见别的块。要删重复，压整个项目。')
            : t('单独压一块，它只能把这一块自己的话说短，看不见别的块，也就删不掉跨块的重复。一块特别长（比如一整篇网页正文）的时候最划算。')}
        </p>
      )}

      {/* 顶部那条账。⚠️ 块数和字符数都是 Spool 自己数的，不问模型。 */}
      {audit && (
        <div
          className="flex flex-none flex-col gap-1 border-b border-line px-5 py-2 text-[11px]"
          style={auditHasLosses(audit) ? { color: 'var(--urgent)' } : undefined}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {t('原始 {a} 块 → 压缩后 {b} 块', {
                a: byEntry?.before ?? audit.entriesBefore,
                b: byEntry?.after ?? audit.entriesAfter,
              })}
            </span>
            <span className="text-muted">
              {t('{a} → {b} 字符（剩 {p}%）', {
                a: audit.charsBefore.toLocaleString(),
                b: audit.charsAfter.toLocaleString(),
                p: pct ?? 0,
              })}
            </span>
            {/* §9.6.1 ②：目标从一句空话变成一个读数。达不达标由你看着办，
                但它不再被悄悄忽略。⛔ 提示词里那个目标**没有**跟着改成实测值。 */}
            <span
              className="text-muted"
              style={missedTarget ? { color: 'var(--urgent)' } : undefined}
              title={t('这个目标是发给模型的提示词里写着的那一个，不是事后编的')}
            >
              {missedTarget
                ? t('⚠️ 这一档的目标是压到 {lo}–{hi}%，这次是 {p}% —— 没达标', { lo, hi, p: pct ?? 0 })
                : t('这一档的目标是压到 {lo}–{hi}%，这次是 {p}%', { lo, hi, p: pct ?? 0 })}
            </span>
            {outcome?.ok && (
              <span className="text-muted">{t('用了 {n} 秒', { n: Math.round(outcome.ms / 1000) })}</span>
            )}
          </div>

          {byEntry && (byEntry.dropped > 0 || byEntry.invented > 0 || byEntry.duplicated.length > 0) && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-none" />
              <div>
                {byEntry.dropped > 0 &&
                  t('有 {n} 块在压缩稿里找不到 —— 下面按块标了出来。', { n: byEntry.dropped })}
                {byEntry.invented > 0 &&
                  t('有 {n} 块是它自己编出来的编号。', { n: byEntry.invented })}
                {/* ⚠️ 实测撞见过：它把整份 pack 原样写了两遍，压完剩 194%。 */}
                {byEntry.duplicated.length > 0 &&
                  t('⚠️ 有 {n} 块在压缩稿里出现了不止一次（#{s}）—— 它把同样的内容写了两遍，这一份不能用。', {
                    n: byEntry.duplicated.length,
                    s: byEntry.duplicated.join('、#'),
                  })}
              </div>
            </div>
          )}

          {auditHasLosses(audit) ? (
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-none" />
              <div className="space-y-0.5">
                <div>{t('有本来要求一字不改保留的东西不见了 —— 下面按块标了出来：')}</div>
                {audit.missingSections.length > 0 && (
                  <div>{t('少了整节：{s}', { s: audit.missingSections.join('、') })}</div>
                )}
                {audit.missingNotes.length > 0 && (
                  <div>{t('少了 {n} 条批注', { n: audit.missingNotes.length })}</div>
                )}
                {audit.missingPersonal.length > 0 && (
                  <div>{t('少了 {n} 条你自己写的内容', { n: audit.missingPersonal.length })}</div>
                )}
                {audit.missingHighlights.length > 0 && (
                  <div>{t('少了 {n} 处你划的重点', { n: audit.missingHighlights.length })}</div>
                )}
                {/* ⚠️⚠️ 实测里最重的一条：它一旦真的开始压，就开始丢日期和数字 ——
                    而这一档的名字就叫「保留结论和数字」。所以这一行放在最前面，并且列出来。 */}
                {audit.missingNumbers.length > 0 && (
                  <div className="font-medium">
                    {t('⚠️ 有 {n} 个数字/日期在压缩稿里再也找不到了：{s}', {
                      n: audit.missingNumbers.length,
                      s: audit.missingNumbers.slice(0, 12).join('、'),
                    })}
                  </div>
                )}
                {audit.missingRelations.length > 0 && (
                  <div>
                    {t('少了 {n} 条引用/替代关系 —— 这一块引的是哪一条、替代了哪一条，没了', {
                      n: audit.missingRelations.length,
                    })}
                  </div>
                )}
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
            // ⚠️ 只有**结构也没问题**的时候才说这句。少了一整块却在旁边写「一条都没少」，
            // 比不写更糟 —— 那句话会把上面那行红字抵消掉。
            structureOk && (
              <div className="text-muted">
                {t('你的批注、你自己写的内容、你划的重点，一条都没少，也没有多。')}
              </div>
            )
          )}

          {/* 「一字不改」被破了，但内容还在 —— 单独一句，不和上面那几条丢失混在一起。
              ⛔ 别拿「编造」去喊这件事：喊一次假的，真的编造出现时用户已经学会忽略它了。 */}
          {audit.quoteRewrites > 0 && (
            <div className="text-muted">
              {t('⚠️ 有 {n} 处它把成对引号「“”」换成了直引号 —— 内容没变，但「一字不改照抄」这条已经破了。', {
                n: audit.quoteRewrites,
              })}
            </div>
          )}

          <div className="text-muted">
            {outcome?.cuts
              ? t('它说它删的是：{s}', { s: outcome.cuts.replace(/\s*\n\s*/g, ' ') })
              : t('⚠️ 它没有说自己删掉了什么。')}
          </div>

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
      {((outcome && !outcome.ok) || startError) && (
        <div className="flex-none border-b border-line px-5 py-3 text-xs" style={{ color: 'var(--urgent)' }}>
          <div>
            {startError ?? t(FAILURE_SENTENCE[outcome?.kind ?? 'http'] ?? FAILURE_SENTENCE.http)}
          </div>
          {outcome?.message && (
            <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-paper-2 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
              {outcome.message}
            </pre>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {byEntry ? (
          <div className="space-y-3">
            {byEntry.pairs.map((p) => (
              <EntryCard key={p.key} pair={p} block={blockBySeq.get(p.seq) ?? null} />
            ))}
          </div>
        ) : outcome?.ok ? (
          <>
            {/* ⚠️ 退回整份对照，**并且说出来为什么** —— 解析失败必须是一个看得见的结果。 */}
            <p className="mb-2 text-[11px]" style={{ color: 'var(--urgent)' }}>
              {t('⚠️ 这一份没法按块对照 —— 压缩稿里切不出 pack 的条目格式（模型没照 #编号 那一行写）。退回整份文本对照。')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-ink-2">
                {wholeDiff
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
              <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-ink-2">
                {wholeDiff
                  .filter((l) => l.op !== 'cut')
                  .map((l, i) => (
                    <span key={i} style={l.op === 'added' ? { background: 'var(--accent-soft)' } : undefined}>
                      {l.text}
                      {'\n'}
                    </span>
                  ))}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-relaxed text-muted">
            {running ? (
              <div className="space-y-1">
                {/* ⚠️ 这两个字数是「它还在正常干活」的唯一证据。 */}
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
              </div>
            ) : (
              t('点右下角开始。')
            )}
          </div>
        )}
      </div>

      <footer className="flex flex-none items-center justify-between gap-3 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
        {/* ⛔ 这句话必须在。这一步不写库，用户不该以为点了什么就生效了。 */}
        <span className="text-muted">{t('这一步不会改动你的库 —— 压缩稿只在这个界面里。')}</span>
        <div className="flex items-center gap-2">
          {outcome?.ok && (
            <button
              onClick={() => void copyRecord()}
              title={t('把这一次的 token 数、缓存命中、耗时、估算金额拷走')}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors ${
                recorded
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
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
                copied
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line-strong bg-paper text-ink hover:border-accent hover:text-accent'
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? t('已复制') : t('复制压缩稿')}</span>
            </button>
          )}
          <button
            onClick={() => (running ? void cancel() : void run())}
            autoFocus
            className="flex items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent"
          >
            {running && <Loader2 size={12} className="animate-spin" />}
            <span>{running ? t('停下（{n}s）', { n: elapsed }) : outcome ? t('再压一次') : t('开始压缩')}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
