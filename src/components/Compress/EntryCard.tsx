import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { BAND_HINT, BAND_LABEL, bandOf } from '@/lib/blocks/band';
import { diffChunks, diffLines, type DiffChunk } from '@/lib/ai/compress';
import {
  entryHasLosses,
  entryPercent,
  missingNumberLines,
  type EntryPair,
} from '@/lib/ai/compressBlocks';
import type { Block } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';

// 一对。左边原块，右边压缩稿，两边都是**渲染后**的样子（§9.6.5）。
//
// ⚠️ 这里最要紧的三件事，每一件都对着 Ocean 那句反馈的一半：
//
//   1. **配不上要明说。** 右边空了不是留白，是一句「这一块在压缩稿里找不到」——
//      ⛔ 静默跳过是这个界面最不能干的事。左边空了同理：它编了一个原文没有的编号。
//   2. **记号从原块取。** 💭 / 📖 / 🧩 / 🔄 查的是库里那一块的 `source`，不是压缩稿的头行。
//      压缩稿是被审查的一方，让它自报家门没有意义。
//   3. **正文用渲染后的样子**，和在项目里读到的一致。纯文本对比是在让用户读渲染器的中间产物。
//      ⭐ 2026-08-22 Ocean：「我还是想直接在原文上去划线，直接在压缩稿显示新加的内容，
//      压掉 XX 句 · 它自己写了 XX 句的对比去掉」。所以划线和底色**就长在这两栏正文上**：
//      左栏原文里压掉的那几段划掉，右栏压缩稿里新写的那几段上底色。
//      ⛔ 底下那个「压掉 X 句 · 它自己写了 Y 句」的折叠没了 —— 同一件事说两遍，
//      而且它把改动挪到了离正文最远的地方，正是「看不懂删了什么」的来源。

export default function EntryCard({
  pair,
  block,
  restoredLines,
  onAddBack,
}: {
  pair: EntryPair;
  /** 库里那一块。null = pack 里有这一条但块没传进来（单块压缩时只有一块）。 */
  block: Block | null;
  /** 用户按「加回去」补回来的那几行。⭐ 右栏要把它们和「它新写的」分开标。 */
  restoredLines: readonly string[];
  onAddBack: (numbers: readonly string[]) => void;
}) {
  const t = useT();
  const band = block ? bandOf(block) : null;
  const pct = entryPercent(pair);
  const head = pair.before ?? pair.after!;

  // ⚠️ 比的是 body 不是 raw：栏里渲染的就是 body，头行（`#N [时间 · from 来源]`）另外印在
  // 上面那一行。拿 raw 比，头行的差异会变成正文里的第一段划线，指的却是屏幕上没有的东西。
  const marks = useMemo(() => {
    if (!pair.before || !pair.after) return { before: null, after: null };
    const d = diffLines(pair.before.body, pair.after.body);
    return {
      before: diffChunks(d, 'before', pair.before.body),
      after: diffChunks(d, 'after', pair.after.body, restoredLines),
    };
  }, [pair, restoredLines]);

  // ⭐ 丢掉的数字**住在原文的哪一行**（Ocean:「根本看不到丢掉的数字是哪一块的……
  // 需要指到文字内容上去」）。⚠️ 和「加回去」用的是同一条判断，屏幕上给你看的那一行，
  // 就是点下去会被插回压缩稿的那一行。
  const lostLines = useMemo(
    () =>
      pair.before && pair.after && pair.audit.missingNumbers.length > 0
        ? missingNumberLines(pair.before, pair.after, pair.audit.missingNumbers)
        : [],
    [pair],
  );

  const losses = entryHasLosses(pair.audit);

  return (
    <article className="rounded-md border border-line bg-paper">
      {/* 头一行：四带记号 + #N + 时间 + 来源 + 这一块压完剩多少。 */}
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-[11px]">
        {/* D6：只留名字，不印记号 —— pack 里那份记号没动，那是给收件 AI 读的记法。 */}
        {band && (
          <span title={t(BAND_HINT[band])} className="flex-none text-muted">
            {t(BAND_LABEL[band])}
          </span>
        )}
        <span className="flex-none font-mono text-muted">#{pair.seq}</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          {head.time}
          {head.source ? ` · ${head.source}` : ''}
        </span>
        {/* ⛔ D0：字符数是内部量纲。这一块短了多少，说一句就够。 */}
        {pct !== null ? (
          <span className="flex-none text-muted">
            {pct > 100
              ? t('反而长了 {d}%', { d: pct - 100 })
              : pct === 100
                ? t('没变短')
                : t('短了 {d}%', { d: 100 - pct })}
          </span>
        ) : (
          <span className="flex-none font-medium" style={{ color: 'var(--urgent)' }}>
            {pair.before
              ? t('这一块在压缩稿里找不到')
              : t('原文里没有这一块 —— 它自己编了一个编号')}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="min-w-0 px-3 py-2">
          <div className="mb-1 text-[11px] text-muted">
            {t('原文')}
            {marks.before?.some((c) => c.op === 'cut' || c.runs) && (
              <span className="ml-1.5">{t('（划掉的字没进压缩稿）')}</span>
            )}
          </div>
          {pair.before ? (
            <Body chunks={marks.before} text={pair.before.body} side="before" />
          ) : (
            <p className="text-[12px] text-muted">{t('（原文里没有这一块）')}</p>
          )}
        </div>
        <div className="min-w-0 px-3 py-2">
          <div className="mb-1 text-[11px] text-muted">
            {t('压缩稿')}
            {marks.after?.some((c) => c.op === 'added' || c.runs) && (
              <span className="ml-1.5">{t('（有底色的字是它新写的）')}</span>
            )}
          </div>
          {pair.after ? (
            <Body chunks={marks.after} text={pair.after.body} side="after" />
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--urgent)' }}>
              {t('它把这一块整个删掉了，或者合并进了别的块。左边那些话现在没有出处 —— 自己确认一遍。')}
            </p>
          )}
        </div>
      </div>

      {/* 按块核对。整份报「少了 2 条批注」看不出是谁少的，按块之后能直接指到这一块。 */}
      {losses && (
        <div
          className="flex items-start gap-1.5 border-t border-line px-3 py-2 text-[11px]"
          style={{ color: 'var(--urgent)' }}
        >
          <AlertTriangle size={12} className="mt-0.5 flex-none" />
          <div className="space-y-0.5">
            {/* D4-b（2026-08-22）：改写现在是**第三类**，由 `pairRewrites` 真的配上对，
                不再是「既少了又多了」这种猜。实测里最常见的形态：
                「现有成绩需按 Fall 2027 开学日复核」被改成「需按开学日复核」，日期没了。
                ⛔ 它照样算损失 —— 改的是不再把同一件事报成两条罪。 */}
            {pair.audit.rewrittenNotes.map((r) => (
              <div key={r.before} className="space-y-0.5">
                <div className="font-medium">{t('它把一条批注改写了：')}</div>
                <div>{t('改之前：{s}', { s: r.before })}</div>
                <div>{t('改之后：{s}', { s: r.after })}</div>
              </div>
            ))}
            {pair.audit.missingNotes.map((s) => (
              <div key={s}>{t('少了一条批注：{s}', { s })}</div>
            ))}
            {pair.audit.missingHighlights.map((s) => (
              <div key={s}>{t('少了你划的重点：{s}', { s })}</div>
            ))}
            {/* ⭐ 指到文字上，不报编号。每一行后面就是它自己的「加回去」——
                点哪一行补哪一行，补完那一行会在右栏当场显出来（标着「你加回去的」）。 */}
            {lostLines.length > 0 && (
              <div className="space-y-1">
                <div className="font-medium">
                  {t('这几句话里的数字/日期，压缩稿里没有了：')}
                </div>
                {lostLines.map((x) => (
                  <div key={x.line} className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">「{x.line}」</span>
                    <button
                      type="button"
                      onClick={() => onAddBack(x.numbers)}
                      className="flex-none rounded border border-current px-1.5 py-0.5 font-normal hover:bg-paper-2"
                    >
                      {t('加回去')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* 连线掉了 = 这一块引的是哪一条、替代了哪一条，没了。实测撞见过整份 14 条只剩 2 条。 */}
            {pair.audit.missingRelations.map((s) => (
              <div key={s}>{t('少了一条引用/替代关系：{s}', { s })}</div>
            ))}
            {/* ⚠️ 「编」比「丢」更坏：一行编出来的批注穿的是你自己的权威。 */}
            {pair.audit.fabricatedNotes.map((s) => (
              <div key={s} className="font-medium">
                {t('它写了一条你没写过的批注：{s}', { s })}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// 一栏正文。`chunks` 有就按段铺记号，null 就原样渲染 —— ⛔ null 不是「没有改动」，
// 是「这一侧铺不回去」（见 `diffChunks`），那时候宁可不标，也不能显示一份缺了行的正文。
//
// ⚠️ **被改写的那一行不走 markdown 渲染，走纯文字 + 按字标记。**
// 这是一次有意的取舍：那一行要回答的问题是「哪几个字没了 / 哪几个字是新的」，
// 而渲染器会把 `**` `==` 这些吃掉，字和字就对不上了。没改的行照旧渲染。
function Body({
  chunks,
  text,
  side,
}: {
  chunks: DiffChunk[] | null;
  text: string;
  side: 'before' | 'after';
}) {
  const t = useT();
  const cls = 'text-[13px] leading-relaxed text-ink-2';
  if (!chunks) {
    return (
      <div className={cls}>
        <MarkdownContent content={text} />
      </div>
    );
  }
  return (
    <div className={cls}>
      {chunks.map((c, i) => {
        const gap = c.gap ? 'mt-[0.9em] ' : '';
        // ① 用户自己补回来的那一行 —— ⛔ 和「它新写的」分开说，责任不能安错人。
        if (c.restored) {
          return (
            <div
              key={i}
              className={`${gap}-mx-1 rounded-[3px] border-l-2 border-accent px-1 py-0.5`}
            >
              <div className="whitespace-pre-wrap break-words">{c.text}</div>
              <div className="mt-0.5 text-[10.5px] text-accent">{t('你加回去的')}</div>
            </div>
          );
        }
        // ② 被改写的那一行：按字标。
        if (c.runs) {
          return (
            <div key={i} className={`${gap}whitespace-pre-wrap break-words`}>
              {c.runs
                .filter((r) => r.op === 'same' || r.op === (side === 'before' ? 'cut' : 'added'))
                .map((r, j) =>
                  r.op === 'same' ? (
                    <span key={j}>{r.text}</span>
                  ) : r.op === 'cut' ? (
                    <span key={j} className="line-through" style={{ color: 'var(--urgent)' }}>
                      {r.text}
                    </span>
                  ) : (
                    <span key={j} style={{ background: 'var(--accent-soft)' }}>
                      {r.text}
                    </span>
                  ),
                )}
            </div>
          );
        }
        // ③ 整段没了 / 整段是新的。
        return (
          <div
            key={i}
            className={[
              c.gap ? 'mt-[0.9em]' : '',
              c.op === 'cut' ? 'line-through opacity-55' : '',
              c.op === 'added' ? '-mx-1 rounded-[3px] px-1' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              c.op === 'cut'
                ? { color: 'var(--urgent)' }
                : c.op === 'added'
                  ? { background: 'var(--accent-soft)' }
                  : undefined
            }
          >
            <MarkdownContent content={c.text} />
          </div>
        );
      })}
    </div>
  );
}
