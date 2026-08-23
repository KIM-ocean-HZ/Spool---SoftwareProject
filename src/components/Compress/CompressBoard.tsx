import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Moon } from 'lucide-react';
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
import { useBlocksStore } from '@/stores/blocksStore';
import { useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';

// 「压缩」页签（WORKPLAN-2026-08-20 §9.6.2 / §9.6.5 / §9.6.6）。
//
// ⚠️ **它开在中间区域，不在右栏**，而且这是一条设计约束不是排版偏好：右栏宽度是
// `railWidth`（三百来像素），并排比对塞不下。
//
// ⭐⭐ **2026-08-23（Ocean 真手指验收第 4 条）：整个压缩入口搬进来了。**
// 他的原话：「右侧边栏的压缩按钮不要了，压缩直接到面板去使用（overnight 的勾选也放里面）。」
// 所以这一页现在自己负责三件原来分散在右栏的事：
//   ① **自己开桌子** —— 进这一页就把这个项目的 pack 组好，不再等谁去点一个按钮；
//   ② **睡前排队**（勾选 / 几点跑 / 现在就跑 / 队列清单）；
//   ③ 夜里压好的那一份在这儿认领。
// ⚠️ ②③ 只在**还没有压缩稿**的时候露面 —— 有稿子的时候这一屏全部让给核对，
// ⛔ 这一块每长高一行，能核对的地方就矮一行（上一轮挨骂的原话：「核对区域太窄」）。
export default function CompressBoard({ threadId }: { threadId: string }) {
  const t = useT();
  const thread = useThreadsStore(selectThreadById(threadId));
  const session = useCompressStore((s) => s.sessions[threadId] ?? null);
  // ⚠️ 只有**正在跑的那个项目、而且跑的是压缩**才显示进度条。
  // ⛔ 2026-08-23（Ocean）：少问后半句的后果是他撞到的那一条 —— 点「过期检测」，
  // 这一页跟着转圈、跟着显示「正在写压缩稿…」、按钮变成「停下」，而它什么都没在跑。
  const running = useCompressStore(
    (s) => s.running && s.runningThreadId === threadId && s.runningKind === 'compress',
  );
  const busy = useCompressStore((s) => s.running || s.batchRunning);
  const progress = useCompressStore((s) => s.progress);
  const startError = useCompressStore((s) => s.startErrors[threadId] ?? null);
  const runIt = useCompressStore((s) => s.run);
  const cancel = useCompressStore((s) => s.cancel);
  const clearSession = useCompressStore((s) => s.clearSession);
  const openProject = useCompressStore((s) => s.openProject);
  const refreshSession = useCompressStore((s) => s.refreshSession);
  const openResult = useCompressStore((s) => s.openResult);
  const results = useCompressStore((s) => s.results);
  const useDraft = useCompressStore((s) => s.useDraft);
  const addBackRaw = useCompressStore((s) => s.addBack);
  const addBack = (only?: readonly string[]) => addBackRaw(threadId, only);

  const level = useSettingsStore((s) => s.apiCompressLevel);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const keepOriginal = useSettingsStore((s) => s.compressKeepOriginal);
  const update = useSettingsStore((s) => s.update);
  // ⭐ 这个项目的块变了（比如刚把几块还原成压缩前的原文），这一份就要重组一遍 ——
  // ⚠️ 看得见的是「N 块已经压过了」那句话，真正危险的是它底下那份**会被发出去的 pack**。
  const liveBlocks = useBlocksStore((s) => s.byThread[threadId]);

  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // ⭐ 进这一页就自己开桌子。⛔ 已经有一份的时候不许重开 —— 那会把用户正在核对的稿子擦掉。
  useEffect(() => {
    if (!thread || session || startError) return;
    void openProject(thread);
  }, [thread, session, startError, openProject]);

  useEffect(() => {
    void refreshSession(threadId);
  }, [threadId, liveBlocks, refreshSession]);

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

  // ⭐ 还没开出桌子。⚠️ 上面那个 effect 正在组 pack（读一次库，通常一眨眼）——
  // ⛔ 但组失败的时候不能永远停在「正在读…」上，所以这里把错误和一个再试摆出来。
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-relaxed text-muted">
        {startError ? (
          <div className="space-y-2">
            <div style={{ color: 'var(--urgent)' }}>{startError}</div>
            <button
              type="button"
              onClick={() => thread && void openProject(thread)}
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {t('再试一次')}
            </button>
          </div>
        ) : (
          t('正在读这个项目…')
        )}
      </div>
    );
  }

  // 模型自己交代的那几条，一条一行。⚠️ null = **它没说**，不是「什么都没删」——
  // 所以它没说的时候这一整块不出现，⛔ 不印一句「它没有说自己删掉了什么」占一行。
  const cutLines = (outcome?.cuts ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const structureOk =
    !byEntry || (byEntry.dropped === 0 && byEntry.invented === 0 && byEntry.duplicated.length === 0);
  const pct = audit ? Math.round((audit.charsAfter / Math.max(1, audit.charsBefore)) * 100) : null;

  // ⛔ 2026-08-22（Ocean 第 6 条）：这里原来还算出一句结论，印在顶上 ——
  // 「⚠️ 这一份别用 —— 它改写了 1 条批注的信息」。**那一句撤掉了**，两个理由，他都说了：
  //   ① 它和下面那几行警告**说的是同一件事**，读两遍；
  //   ② 「用不用用户自己决定，Spool 不给建议」。
  // ⚠️ 留下来的只是一个**布尔**：有没有损失。它只决定右边那一栏红不红，不再写成一句话。
  // ⛔ 别顺手把那句话加回来 —— 「这一份可以复制走」同样是建议，同样不该出现。
  const hasLoss =
    !!audit &&
    (auditHasLosses(audit) ||
      (byEntry !== null &&
        (byEntry.dropped > 0 || byEntry.invented > 0 || byEntry.duplicated.length > 0)) ||
      // R5：放回失败也算损失 —— 它和「丢了一条批注」对用户来说是同一件事。
      (session.shield !== null &&
        (session.shield.orphaned > 0 || session.shield.lostSpans.length > 0)));

  // 夜里那一批里属于这个项目的那一份（下标）。-1 = 没有。
  // ⚠️ 它只画在「还没有压缩稿」那一支里：认领之后 `outcome` 就有了，那一支自己不再渲染。
  const nightly = results.findIndex((r) => r.target.threadId === threadId);

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
        {/* ⛔ 2026-08-23：这里原来还跟一句「定时压、排队一起压…都在右边栏『压缩』那一格」。
            **那一格已经没有这些东西了**（Ocean 第 4 条把它们搬进了这一页），
            ⚠️ 留着就是一句指向空处的话 —— 比不说更糟。 */}
        <div className="min-w-0 text-[11px] text-muted">
          {session.target.kind === 'project'
            ? t('一块对一块地核对。你按「用这一份」之前，库里一个字都不动。')
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

          ⭐ 2026-08-22（Ocean 第 6 条）**这一块整个重排过**，起因是他的原话：
          「核对区域太窄，空间全被压缩的总结报告占用了，报告写简略一点」。
          原来是**竖着一行叠一行**（结论 / 四个数 / 每一类警告各一行 / 模型自述一整段），
          十来行顶在最上面，底下真正要核对的两栏正文只剩半屏。

          现在是**左右两栏、一行**：左边四个数，右边警告。⛔ 加新东西之前先想清楚它是哪一种，
          ⛔ 而且别再往这儿叠新的一行 —— 这块每长高一行，能核对的地方就矮一行。 */}
      {audit && (
        <div className="flex flex-none items-start gap-6 border-b border-line px-5 py-2 text-[11px]">
          {/* 左：一个数一格（Ocean 2026-08-22 第二轮第 6 条）。⛔ 不写成句子。
              ⛔ D0 仍然管着这里：字符数、token、缓存命中都是内部量纲，一个都不许回来。 */}
          <div className="flex flex-none flex-wrap gap-x-5 gap-y-1">
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

          {/* 右：警告。⚠️ 红色跟着**有没有损失**走，不跟着一句结论走 —— 那句结论撤了。 */}
          <div
            className="min-w-0 flex-1 space-y-0.5"
            style={hasLoss ? { color: 'var(--urgent)' } : undefined}
          >
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

            {/* ⛔⛔ R5：摘下来的批注/高亮**没能原样放回去**。这一句必须在，而且必须显眼 ——
                「不发给 AI」这条改动把五类警告变成结构上不可能发生，代价是多了一个新的
                失败点（放回去这一步）。静默吞掉它，就是把同一件事换个地方重演一遍。 */}
            {session.shield &&
              (session.shield.orphaned > 0 || session.shield.lostSpans.length > 0) && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 flex-none" />
                  <div>
                    {session.shield.orphaned > 0 &&
                      t('有 {n} 条批注/关系行没能放回去 —— 它们原来那一块在压缩稿里找不到了。', {
                        n: session.shield.orphaned,
                      })}
                    {session.shield.lostSpans.length > 0 &&
                      t('有 {n} 处你划的重点没能放回去 —— 它所在那句话被改写了。', {
                        n: session.shield.lostSpans.length,
                      })}
                  </div>
                </div>
              )}

            {/* 下面这几句是**附注**，不是警告 —— 一律不带颜色，能短则短。 */}
            {/* D-c：重压过就必须说 —— 不然「这一次花了多少」那个数会莫名其妙翻倍。 */}
            {session.retry && (
              <div className="text-muted">
                {session.retry.secondOk
                  ? t('第一次不合格，自动重压了一次；这是第二次的，钱是两次加起来的。')
                  : t('第一次不合格，重压那次没跑成；这还是第一次的，钱是两次加起来的。')}
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
            {/* 「一字不改」被破了，但内容还在 —— ⛔ 别拿「编造」去喊这件事：喊一次假的，
                真的编造出现时用户已经学会忽略它了。 */}
            {audit.quoteRewrites > 0 && (
              <div className="text-muted">
                {t('有 {n} 处成对引号被换成了直引号 —— 内容没变，「一字不改」这条破了。', {
                  n: audit.quoteRewrites,
                })}
              </div>
            )}
            {/* ⚠️ 认不出价目的时候上面那格是「—」，这里才补一句为什么 —— ⛔ 不编一个价。 */}
            {outcome?.ok && !cost && (
              <div className="text-muted">{t('认不出这个模型的价目，算不出这次花了多少钱。')}</div>
            )}

            {/* ⭐ 模型自述**默认折起来**（Ocean:「报告在写简略一点」）。
                ⚠️ 它是被审查的一方对自己的交代，四带模型里最不该占地方的一种 ——
                真正算数的是左右两栏正文上的记号。⛔ 但不许删：它偶尔说出别处看不出的合并理由。 */}
            {cutLines.length > 0 && (
              <details className="text-muted">
                <summary className="cursor-pointer select-none">
                  {t('它说它删的是（{n} 条）', { n: cutLines.length })}
                </summary>
                <div className="mt-0.5 space-y-0.5 pl-3">
                  {cutLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
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
          // ⚠️ `min-h-full` 不是 `h-full`：睡前排队那一段撑起来之后内容会比这一屏高，
          // 而 `h-full` + 居中会把顶上那几行推到滚不到的地方（父层滚不进负方向）。
          <div className="flex min-h-full items-center justify-center px-6 py-4 text-center text-[12px] leading-relaxed text-muted">
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
                {/* ⭐ 夜里那一批压好的、属于这个项目的那一份，在这儿认领。
                    ⚠️ 右栏那个按钮撤掉之后，这是它唯一还够得着的入口。 */}
                {nightly >= 0 && (
                  <div className="pb-1">
                    <button
                      type="button"
                      onClick={() => openResult(nightly)}
                      className="rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-[12px] text-accent transition-colors hover:opacity-80"
                    >
                      {t('这个项目有一份压好的，等你核对 —— 打开')}
                    </button>
                  </div>
                )}
                <div>{t('点右下角开始。')}</div>
                {/* ⭐ R5：这句话说的是一件**结构上的事**，不是一句承诺 —— 那几行根本不进请求
                    （`shield.ts`）。⚠️ 值得让用户看见：他上一轮的原话是「禁止批注被 AI 修改」。 */}
                <div>
                  {t('你的批注、你划的重点、引用关系不会发给 AI —— 压完由 Spool 原样放回。')}
                </div>
                {/* ⭐ D-a（2026-08-22）：**压之前**先在本地数一遍这个项目有多少重复。
                    实测四轮最要紧的一条是「压多少取决于这个项目里有多少重复，不取决于你选哪一档」——
                    那句话原来只是界面上的一行提示，等于把一个没解决的问题丢给用户：
                    他没法在花钱之前知道自己这个项目有没有重复。这一行就是那句提示的解药。
                    ⛔ 数不出来就什么都不说（`probe` 是 null）—— 不编一个数。 */}
                {/* ⭐ R1 §1e（Ocean：「压过一次下次就不会再被压缩，只能被检测语义是否废除」）：
                    pack 里少了几块，而用户没做过任何选择 —— ⛔ 不说就是静默。 */}
                {session.skippedCompressed > 0 && (
                  <div>
                    {session.blocks.length === 0
                      ? t('这个项目里每一块都压过了，没有新的可压。')
                      : t('这个项目里 {n} 块已经压过了，这一次跳过它们 —— 压过一次就不再花第二笔钱。', {
                          n: session.skippedCompressed,
                        })}
                  </div>
                )}
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
                {/* ⑥ 睡前排队（§9.6.4）。⭐ 2026-08-23 从右栏搬进来（Ocean 第 4 条）。
                    ⚠️ 只在**还没有压缩稿**的时候出现 —— 核对的时候这一屏全部让给正文。 */}
                {session.target.kind === 'project' && <NightlyQueue threadId={threadId} />}
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
        {/* ⭐ R1（2026-08-22）：这里原来写的是「这里没有『用这一份』…库里一个字都不动」。
            那条锁**他明说解了**（R2 §1）。留下来的是它的两半：
            数字硬闸门照旧（⛔ 解锁之后也不放宽），以及「关掉留原文 = 改不回去」这句话
            —— ⚠️ 它必须写在**按下按钮的那一刻**看得见的地方，不能只写在设置里。 */}
        <span className="text-muted">
          {t('丢了数字或日期的压缩稿不许进库，以后开了写入这条也不放宽。')}
          {audit && !numbersGateOpen(audit) && (
            <> {t('这一份现在就卡在这条上 —— 先用上面那个「加回去」。')}</>
          )}
          {' '}
          {/* ⭐ 2026-08-23（Ocean 第 5 条：「未压缩的 pack 默认保存，不留原文的开关放到
              设置里面」）：备份**默认开着**，开关在设置里，这里只报现在是哪一种。
              ⚠️ 关掉那一句必须留在**按下按钮的那一刻**看得见的地方 —— 没人会为了压一次
              上下文先去翻一遍设置，而这一条关系到他的字还看不看得到。 */}
          {keepOriginal
            ? t('压缩前的原文会留在每一块上：随时打开来看，也随时换得回去。')
            : t('⚠️ 你在设置里关掉了「备份压缩前的原文」—— 这一次换过去，原来的字就没有了。')}
        </span>
        <div className="flex items-center gap-2">
          {/* ⭐ R1 · 「用这一份」。⛔ 三道闸都在 store 里（数字硬闸门 / 结构没坏 / 真的变了）——
              ⛔ 别在这儿放行，界面上的判断会被绕过。这里只负责**不假装它能点**：
              闸门关着的时候按钮是灰的，而理由就印在左边那句话里。 */}
          {result !== null && session.target.kind === 'project' && (
            <button
              onClick={() => void useDraft(threadId)}
              disabled={!audit || !numbersGateOpen(audit) || busy}
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
            >
              {t('用这一份')}
            </button>
          )}
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

// ⑥ 睡前排队（§9.6.4）。⭐ 2026-08-23 从右栏整块搬进来（Ocean 第 4 条：
// 「overnight 的勾选也放里面」）。
//
// ⭐ **授权发生在花钱之前，核对仍然在你手上** —— 这不是无人值守，是排队。
// ⛔ 没有 launchd、没有后台常驻：应用开着的时候到点跑，到点没开、下次启动补跑。
//
// ⛔ D10（Ocean:「价格预估准确度没有保证……不然就不显示」）：⚠️ 这张单子上**只报字数**，
//    一个「约 ¥X」都不许回来 —— 钱的大头在输出上，而输出多长在发出去之前不可知。
function NightlyQueue({ threadId }: { threadId: string }) {
  const t = useT();
  const queue = useSettingsStore((s) => s.compressQueue);
  const nightlyAt = useSettingsStore((s) => s.compressNightlyAt);
  const update = useSettingsStore((s) => s.update);
  const sizes = useCompressStore((s) => s.sizes);
  const measureQueue = useCompressStore((s) => s.measureQueue);
  const runQueue = useCompressStore((s) => s.runQueue);
  const batchRunning = useCompressStore((s) => s.batchRunning);
  const running = useCompressStore((s) => s.running);
  const threadsByWorkspace = useThreadsStore((s) => s.threadsByWorkspace);

  // 排进队之后量一次大小 —— 纯本地，不出网、不花钱。
  useEffect(() => {
    void measureQueue();
  }, [queue, measureQueue]);

  const titles = new Map<string, string>();
  for (const list of Object.values(threadsByWorkspace)) {
    for (const th of list) titles.set(th.id, th.title);
  }
  // 合计只把**量出来的**那几行加进去 —— ⛔ 少量出一个就不显示合计，不拿半份数字当全份。
  const measured = queue.map((id) => sizes[id]).filter((n): n is number => n !== undefined);
  const totalChars =
    measured.length === queue.length && queue.length > 0
      ? measured.reduce((sum, c) => sum + c, 0)
      : null;

  const queued = queue.includes(threadId);
  const toggle = () =>
    void update({
      compressQueue: queued ? queue.filter((id) => id !== threadId) : [...queue, threadId],
    });

  return (
    <div className="mx-auto mt-3 max-w-sm space-y-1 border-t border-line pt-3 text-left">
      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink">
        <input
          type="checkbox"
          checked={queued}
          onChange={toggle}
          className="h-3 w-3 flex-none accent-current"
        />
        <Moon size={11} className="flex-none" />
        {nightlyAt
          ? t('今晚 {at} 和别的项目一起压（现在排着 {n} 个）', { at: nightlyAt, n: queue.length })
          : t('排进「一起压」（现在排着 {n} 个）', { n: queue.length })}
      </label>

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

      {queue.length > 0 && (
        <ul className="space-y-0.5 text-[12px] text-muted">
          {queue.map((id) => (
            <li key={id} className="flex items-baseline gap-1.5">
              <span className="min-w-0 flex-1 truncate">{titles.get(id) ?? id}</span>
              <span className="flex-none">
                {sizes[id] === undefined
                  ? t('量一下…')
                  : t('{k} 千字', { k: Math.round(sizes[id]! / 100) / 10 })}
              </span>
            </li>
          ))}
          <li className="flex items-baseline gap-1.5 border-t border-line pt-0.5">
            <span className="min-w-0 flex-1 truncate">{t('合计')}</span>
            <span className="flex-none">
              {totalChars === null ? '—' : t('{k} 千字', { k: Math.round(totalChars / 100) / 10 })}
            </span>
          </li>
        </ul>
      )}

      {batchRunning && (
        <p className="text-[12px] leading-relaxed text-muted">
          {t('正在按队列一个一个压…压完的会在各自项目的「压缩」页签上等你核对。')}
        </p>
      )}
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
