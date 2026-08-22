import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react';
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
  measurementRecord,
  numbersGateOpen,
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
export default function CompressBoard({ threadId }: { threadId: string }) {
  const t = useT();
  const session = useCompressStore((s) => s.sessions[threadId] ?? null);
  // ⚠️ 只有**正在跑的那个项目**该显示进度条 —— 别的项目的整理页不该跟着转圈。
  const running = useCompressStore((s) => s.running && s.runningThreadId === threadId);
  const busy = useCompressStore((s) => s.running || s.batchRunning);
  const progress = useCompressStore((s) => s.progress);
  const startError = useCompressStore((s) => s.startErrors[threadId] ?? null);
  const runIt = useCompressStore((s) => s.run);
  const cancel = useCompressStore((s) => s.cancel);
  const clearSession = useCompressStore((s) => s.clearSession);
  const addBackRaw = useCompressStore((s) => s.addBack);
  const addBack = (only?: readonly string[]) => addBackRaw(threadId, only);

  const level = useSettingsStore((s) => s.apiCompressLevel);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const update = useSettingsStore((s) => s.update);

  const [copied, setCopied] = useState(false);
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
  // ⭐ D7：屏幕上核对的、复制走的，是**补过之后**那一份（补过的话）。
  // ⚠️ 只有它变 —— 下面报账那一行照旧读 `outcome`：补一行字是纯本地动作，不花钱。
  const result = outcome?.ok ? (session?.patched ?? outcome.text) : null;

  const audit = useMemo(
    () => (result !== null ? auditCompression(source, result) : null),
    [source, result],
  );
  // ⚠️ null = **这一份没法按块对照**（模型没照 pack 的格式写）。§9.6.5 点名要求这件事是一个
  // 看得见的结果：下面会说出来，然后退回整份文本对照 —— 不是一个被吞掉的异常。
  const byEntry = useMemo(
    () => (result !== null ? compareByEntry(source, result) : null),
    [source, result],
  );
  const wholeDiff = useMemo(
    () => (result !== null && !byEntry ? diffLines(source, result) : []),
    [source, result, byEntry],
  );
  const cost = useMemo(() => (outcome?.ok ? estimateCost(outcome) : null), [outcome]);

  // ⛔ 2026-08-22（D0，新红线「用户不能看到一个测试环境的 Spool」）：token 数、缓存命中、
  // 估算金额是**我做实测要的数**，不是用户要的数 —— 屏幕上那一行和底部那个「复制这次的
  // 数据」按钮都撤了。⭐ 但这些数还得取得到，所以它落到这条不在正常路径上的线上：
  // devtools 的 Console。要往 `Deepseek-API-compress-test.md` 追一条，就在那儿拷。
  useEffect(() => {
    if (!outcome?.ok || !audit || !session) return;
    // ⛔ 补过的那一份不进台账：台账记的是**模型交出来的成绩**，补回去的行是我们自己加的。
    if (session.patched) return;
    console.info(
      measurementRecord({
        project: session.target.title,
        // 定格的那一份，不是现在设置里的那一份。
        level: session.level,
        reasoning: session.reasoning,
        outcome,
        audit,
      }),
    );
  }, [outcome, audit, session]);

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

  // ⭐ D4-a（2026-08-22，Ocean 原话「写了一大堆文字，但是根本看不懂想表达什么……摩擦极大」）：
  // 先回答唯一那个问题 ——「这一份能不能用？」下面那一堆行从此是**证据**，不是结论。
  // ⛔ 挑最重的那一条说，不要把六条并列 —— 并列就是又一堵墙。
  // 顺序就是严重程度：整份废掉的排前面，少一处小东西的排后面。
  const blocker = ((): string | null => {
    if (!audit) return null;
    if (byEntry && byEntry.duplicated.length > 0) return t('它把同样的内容写了两遍');
    if (audit.missingNumbers.length > 0)
      return t('丢了 {n} 个数字或日期', { n: audit.missingNumbers.length });
    if (byEntry && byEntry.dropped > 0) return t('有 {n} 块整块不见了', { n: byEntry.dropped });
    if (audit.fabricatedNotes.length > 0)
      return t('它写了 {n} 条你没写过的批注', { n: audit.fabricatedNotes.length });
    if (audit.rewrittenNotes.length > 0)
      return t('它改写了 {n} 条批注', { n: audit.rewrittenNotes.length });
    if (audit.missingSections.length > 0) return t('少了整节');
    if (audit.missingPersonal.length > 0)
      return t('少了 {n} 条你自己写的内容', { n: audit.missingPersonal.length });
    if (audit.missingNotes.length > 0) return t('少了 {n} 条批注', { n: audit.missingNotes.length });
    if (audit.missingHighlights.length > 0)
      return t('少了 {n} 处你划的重点', { n: audit.missingHighlights.length });
    if (audit.missingRelations.length > 0)
      return t('少了 {n} 条引用或替代关系', { n: audit.missingRelations.length });
    if (byEntry && byEntry.invented > 0)
      return t('它编了 {n} 个原文里没有的编号', { n: byEntry.invented });
    return null;
  })();

  const copy = async () => {
    if (result === null) return;
    await writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* R4：这里原来是「压缩《项目名》」+ 一个 X。两样都撤了 ——
          项目名就印在上面那个项目标题上，而**出口是页签**（切回「内容」），不是关掉一个窗口。
          ⛔ 那个 X 正是 Ocean 撞到的死路：「点击退出压缩工作区就无法回去」。 */}
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-2">
        <div className="min-w-0 text-[11px] text-muted">
          {session.target.kind === 'project'
            ? t('一块对一块地核对。库里一个字都不动。')
            : t('只压这一块（第 {n} 块）。库里一个字都不动。', { n: session.target.seq ?? '?' })}
        </div>
        {session.outcome && !running && (
          <button
            onClick={() => clearSession(threadId)}
            className="flex-none rounded px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          >
            {t('不要这一份')}
          </button>
        )}
      </header>

      {/* 档位。⚠️ 单块压缩时「只删重复」这一档基本无事可做 —— 见下面那句话。 */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
        <span className="text-muted">{t('压缩强度')}</span>
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
        {/* ⛔ D5（2026-08-22，Ocean 原话「这个提示自相矛盾，又说不取决于你选哪一档，又给出
            选择按键」）：这里原来还单挂一行「⚠️ 实测：压多少主要取决于这个项目里有多少重复，
            不取决于你选哪一档」。那句话是对的，但它和它上面那三个按钮直接打架 —— 等于把一个
            没解决的问题丢给用户。现在它并回档位说明里（「看这个项目里有多少重复」），
            ⭐ 真正的解药是 D-a：压之前先本地算一遍这个项目有多少重复，接近 0 就直说别花这个钱。 */}
        <span className="text-muted/70">{t(LEVEL_HINTS[level])}</span>
      </div>

      {/* ⚠️⚠️ §9.6.6 点名要在界面上说清的那句话：单块压缩不是「项目压缩缩小版」。 */}
      {session.target.kind === 'block' && (
        <p className="flex-none border-b border-line px-5 py-2 text-[11px] leading-relaxed text-muted">
          {level === 'conservative'
            ? t('「只删重复」这一档在单块上基本无事可做：压缩干的主要活是合并重复，而重复是跨块的 —— 单独压一块，它看不见别的块。要删重复，压整个项目。')
            : t('单独压一块，它只能把这一块自己的话说短，看不见别的块，也就删不掉跨块的重复。一块特别长（比如一整篇网页正文）的时候最划算。')}
        </p>
      )}

      {/* 顶部那条账。⚠️ 块数和字符数都是 Spool 自己数的，不问模型。
          结构（D4-a）：**第一行是结论，其余全是证据。** 加新东西之前先想清楚它是哪一种。 */}
      {/* 红不红跟着结论走。⚠️ 原来这里读的是 auditHasLosses —— 它只管「一字不改」那条线，
          于是「有 3 块整块不见了」这种结构性的坏结果，整条账反而是正常颜色的。 */}
      {audit && (
        <div
          className="flex flex-none flex-col gap-1 border-b border-line px-5 py-2 text-[11px]"
          style={blocker ? { color: 'var(--urgent)' } : undefined}
        >
          {/* 结论。⚠️ D5-b：整块屏幕上只有这里能出现 ⚠️，而且只在「这一份别用」的时候 ——
              一屏七八个 ⚠️ 之后，⚠️ 就不再是警告，是背景噪声。 */}
          <div className="text-[13px] font-medium">
            {blocker
              ? t('⚠️ 这一份别用 —— {why}', { why: blocker })
              : pct !== null && pct >= 100
                ? t('这一份没压出什么来 —— 一个字都没短。')
                : t('这一份可以复制走 —— 比原来短了 {d}%。', { d: 100 - (pct ?? 100) })}
          </div>

          {/* 四个数排成一行（Ocean 2026-08-22 第二轮第 6 条：「这些信息可以简略的直接显示
              数字，不需要写成文字，像表格一样清晰列出来」）。⛔ 一个数一格，不写成句子。
              ⛔ D0 仍然管着这里：字符数、token、缓存命中都是内部量纲，一个都不许回来。 */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 pt-0.5">
            <Stat label={t('块数')} value={`${byEntry?.before ?? audit.entriesBefore} → ${byEntry?.after ?? audit.entriesAfter}`} />
            <Stat
              label={t('长度')}
              value={pct === null ? '—' : pct >= 100 ? `+${pct - 100}%` : `−${100 - pct}%`}
            />
            {outcome?.ok && <Stat label={t('用时')} value={`${Math.round(outcome.ms / 1000)}s`} />}
            {outcome?.ok && (
              <Stat
                label={t('花费')}
                // ⚠️ 缓存命中没报的时候只知道上限，所以是「≤」，不是一个确数。
                value={cost ? `${cost.cacheUnknown ? '≤ ' : ''}${formatYuan(cost.yuan)}` : '—'}
              />
            )}
          </div>

          {/* D-c：重压过就必须说 —— 不然「这一次花了多少」那个数会莫名其妙翻倍。 */}
          {session.retry && (
            <div className="text-muted">
              {session.retry.secondOk
                ? t('第一次压出来的不合格，自动重压了一次。这一份是第二次的，钱是两次加起来的。')
                : t('第一次压出来的不合格，自动重压了一次，但第二次没跑成。这一份还是第一次的，钱是两次加起来的。')}
            </div>
          )}

          {/* ⚠️ 补过就必须说：稿子里从此有几行不是模型写的，而是从原文抄回来的原话。 */}
          {session.addedBack.length > 0 && (
            <div className="text-muted">
              {t('你从原文加回去了 {n} 处数字/日期 —— 那几行是你原文里的原话。', {
                n: session.addedBack.length,
              })}
            </div>
          )}

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
                  t('有 {n} 块在压缩稿里出现了不止一次（#{s}）—— 它把同样的内容写了两遍。', {
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
                {/* D4-b：改写单列一类。⛔ 别把它并回上面那一行去 ——
                    「丢了」和「改写了」要做的事不一样：丢了要找回来，改写了要对一眼改成了什么。 */}
                {audit.rewrittenNotes.length > 0 && (
                  <div>
                    {t('有 {n} 条批注被改写了 —— 下面按块列出了改之前和改之后。', {
                      n: audit.rewrittenNotes.length,
                    })}
                  </div>
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
                    {/* ⭐ 具体是哪几句话丢了数字，**按块指在下面的卡片上**（Ocean 第 3 条：
                        「根本看不到丢掉的数字是哪一块的……需要指到文字内容上去」）。
                        这里只留一句结论和一个「全部加回去」。 */}
                    {t('有 {n} 个数字/日期没了 —— 下面按块指出了是哪几句话。', {
                      n: audit.missingNumbers.length,
                    })}
                    <button
                      type="button"
                      onClick={() => addBack()}
                      className="ml-2 rounded border border-current px-1.5 py-0.5 font-normal hover:bg-paper-2"
                    >
                      {t('全部加回去')}
                    </button>
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
                    {t('它凭空写了 {n} 条你没写过的批注：{s}', {
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
              {t('有 {n} 处它把成对引号「“”」换成了直引号 —— 内容没变，但「一字不改照抄」这条已经破了。', {
                n: audit.quoteRewrites,
              })}
            </div>
          )}

          {/* ⚠️ 原来这里把换行全 `replace` 成空格，于是模型分条写的说明堆成一坨看不清
              （Ocean 第 6 条）。现在一条一行。 */}
          <div className="text-muted">
            {outcome?.cuts ? (
              <>
                <div>{t('它说它删的是：')}</div>
                <div className="mt-0.5 space-y-0.5 pl-3">
                  {outcome.cuts
                    .split('\n')
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0)
                    .map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                </div>
              </>
            ) : (
              t('它没有说自己删掉了什么。')
            )}
          </div>

          {/* ⚠️ 认不出价目的时候上面那格是「—」，这里才补一句为什么 —— ⛔ 不编一个价。
              这个钱不是估算：拿接口回报的真实用量乘官方价目算出来的。 */}
          {outcome?.ok && !cost && (
            <div className="text-muted">{t('认不出这个模型的价目，算不出这次花了多少钱。')}</div>
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
              <EntryCard
                key={p.key}
                pair={p}
                block={blockBySeq.get(p.seq) ?? null}
                restoredLines={session.restoredLines}
                onAddBack={(numbers) => addBack(numbers)}
              />
            ))}
          </div>
        ) : outcome?.ok ? (
          <>
            {/* ⚠️ 退回整份对照，**并且说出来为什么** —— 解析失败必须是一个看得见的结果。 */}
            <p className="mb-2 text-[11px]" style={{ color: 'var(--urgent)' }}>
              {t('这一份没法按块对照 —— 压缩稿里切不出 pack 的条目格式（模型没照 #编号 那一行写）。退回整份文本对照。')}
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
              <div className="space-y-1">
                <div>{t('点右下角开始。')}</div>
                {/* ⭐ D-a（2026-08-22）：**压之前**先在本地数一遍这个项目有多少重复。
                    实测四轮最要紧的一条是「压多少取决于这个项目里有多少重复，不取决于你选哪一档」——
                    那句话原来只是界面上的一行提示，等于把一个没解决的问题丢给用户：
                    他没法在花钱之前知道自己这个项目有没有重复。这一行就是那句提示的解药。
                    ⛔ 数不出来就什么都不说（`probe` 是 null）—— 不编一个数。 */}
                {session.probe &&
                  (session.probe.groups === 0 ? (
                    <div>
                      {t('这个项目里没找到重复的内容。压缩干的主要活是合并重复 —— 这一次大概压不短多少，钱可以省下来。')}
                    </div>
                  ) : (
                    <div>
                      {t('这个项目里有 {n} 组内容重复，{b} 块可以并掉 —— 压缩合并的就是这些。', {
                        n: session.probe.groups,
                        b: session.probe.extraBlocks,
                      })}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex flex-none items-center justify-between gap-3 border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
        {/* ⛔ 这句话必须在。这一步不写库，用户不该以为点了什么就生效了。
            ⭐ D9（2026-08-22，Ocean 原话「接受压缩的入口我都没有看见」）：那个入口确实没有，
            **而且是故意的**（§9.9 的封锁理由没变）。但界面从来没说过这件事 —— 用户看到的是
            一个好像少做了一半的功能，而不是「这里被有意封着，理由是 X」。
            ⛔ 一个沉默的缺口正是这个项目最怕的东西，所以理由写在这儿，写全。
            ⚠️ 解锁的前提是 D7（丢了的数字一键加回去）+ D-b（数字硬闸门），两件都没做。 */}
        <span className="text-muted">
          {t('这里没有「用这一份」：这一步只给你复制走，库里一个字都不动。')}
          {' '}
          {t('丢了数字或日期的压缩稿不许进库，以后开了写入这条也不放宽。')}
          {audit && !numbersGateOpen(audit) && (
            <> {t('这一份现在就卡在这条上 —— 先用上面那个「从原文加回去」。')}</>
          )}
        </span>
        <div className="flex items-center gap-2">
          {result !== null && (
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
            onClick={() => (running ? void cancel() : void runIt(threadId))}
            disabled={!running && busy}
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

// 一个数一格（Ocean 第 6 条）。⛔ 标题小、数大，不写成句子。
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wide text-muted/70">{label}</div>
      <div className="font-mono text-[13px]">{value}</div>
    </div>
  );
}
