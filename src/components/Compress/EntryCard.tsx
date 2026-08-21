import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { BAND_HINT, BAND_LABEL, BAND_MARK, bandOf } from '@/lib/blocks/band';
import { diffLines } from '@/lib/ai/compress';
import { entryHasLosses, entryPercent, type EntryPair } from '@/lib/ai/compressBlocks';
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
//      但 Ocean 说过「删除内容划线的可视化我认可」，所以那一半没有丢：它收进了下面
//      「改了哪几句」那个折叠里，**按这一块**，不再是整份五万字的行对行。

export default function EntryCard({
  pair,
  block,
}: {
  pair: EntryPair;
  /** 库里那一块。null = pack 里有这一条但块没传进来（单块压缩时只有一块）。 */
  block: Block | null;
}) {
  const t = useT();
  const [changesOpen, setChangesOpen] = useState(false);

  const band = block ? bandOf(block) : null;
  const pct = entryPercent(pair);
  const head = pair.before ?? pair.after!;

  const diff = useMemo(
    () =>
      pair.before && pair.after ? diffLines(pair.before.raw, pair.after.raw) : [],
    [pair],
  );
  const cut = diff.filter((l) => l.op === 'cut' && l.text.trim().length > 0);
  const added = diff.filter((l) => l.op === 'added' && l.text.trim().length > 0);

  const losses = entryHasLosses(pair.audit);

  return (
    <article className="rounded-md border border-line bg-paper">
      {/* 头一行：四带记号 + #N + 时间 + 来源 + 这一块压完剩多少。 */}
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-[11px]">
        {band && (
          <span title={t(BAND_HINT[band])} className="flex-none">
            {BAND_MARK[band]} <span className="text-muted">{t(BAND_LABEL[band])}</span>
          </span>
        )}
        <span className="flex-none font-mono text-muted">#{pair.seq}</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          {head.time}
          {head.source ? ` · ${head.source}` : ''}
        </span>
        {pct !== null ? (
          <span className="flex-none text-muted">
            {t('{a} → {b} 字符（剩 {p}%）', {
              a: pair.before!.raw.length.toLocaleString(),
              b: pair.after!.raw.length.toLocaleString(),
              p: pct,
            })}
          </span>
        ) : (
          <span className="flex-none font-medium" style={{ color: 'var(--urgent)' }}>
            {pair.before
              ? t('⚠️ 这一块在压缩稿里找不到')
              : t('⚠️ 原文里没有这一块 —— 它自己编了一个编号')}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="min-w-0 px-3 py-2">
          <div className="mb-1 text-[11px] text-muted">{t('原文')}</div>
          {pair.before ? (
            <div className="text-[13px] leading-relaxed text-ink-2">
              <MarkdownContent content={pair.before.body} />
            </div>
          ) : (
            <p className="text-[12px] text-muted">{t('（原文里没有这一块）')}</p>
          )}
        </div>
        <div className="min-w-0 px-3 py-2">
          <div className="mb-1 text-[11px] text-muted">{t('压缩稿')}</div>
          {pair.after ? (
            <div className="text-[13px] leading-relaxed text-ink-2">
              <MarkdownContent content={pair.after.body} />
            </div>
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
            {/* 同一块里既少了批注又多了批注 = 它把批注**改写**了。实测里最常见的形态：
                「现有成绩需按 Fall 2027 开学日复核」被改成「需按开学日复核」，日期没了。
                两条都报是对的，但先说一句人话，省得用户以为是两件事。 */}
            {pair.audit.missingNotes.length > 0 && pair.audit.fabricatedNotes.length > 0 && (
              <div className="font-medium">{t('它把这一块的批注改写了 —— 下面是改之前和改之后：')}</div>
            )}
            {pair.audit.missingNotes.map((s) => (
              <div key={s}>{t('少了一条批注：{s}', { s })}</div>
            ))}
            {pair.audit.missingHighlights.map((s) => (
              <div key={s}>{t('少了你划的重点：{s}', { s })}</div>
            ))}
            {pair.audit.missingNumbers.length > 0 && (
              <div className="font-medium">
                {t('⚠️ 这一块里有 {n} 个数字/日期没了：{s}', {
                  n: pair.audit.missingNumbers.length,
                  s: pair.audit.missingNumbers.slice(0, 10).join('、'),
                })}
              </div>
            )}
            {/* 连线掉了 = 这一块引的是哪一条、替代了哪一条，没了。实测撞见过整份 14 条只剩 2 条。 */}
            {pair.audit.missingRelations.map((s) => (
              <div key={s}>{t('少了一条引用/替代关系：{s}', { s })}</div>
            ))}
            {/* ⚠️ 「编」比「丢」更坏：一行编出来的批注穿的是你自己的权威。 */}
            {pair.audit.fabricatedNotes.map((s) => (
              <div key={s} className="font-medium">
                {t('⚠️ 它写了一条你没写过的批注：{s}', { s })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 「删除内容划线」那一半 —— 收在这里，按这一块，不再是整份的行对行。 */}
      {(cut.length > 0 || added.length > 0) && (
        <div className="border-t border-line px-3 py-1.5">
          <button
            type="button"
            onClick={() => setChangesOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
          >
            {changesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {t('压掉 {a} 句 · 它自己写了 {b} 句', { a: cut.length, b: added.length })}
          </button>
          {changesOpen && (
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.55]">
              {cut.map((l, i) => (
                <span key={`c${i}`} className="line-through opacity-50" style={{ color: 'var(--urgent)' }}>
                  {l.text}
                  {'\n'}
                </span>
              ))}
              {added.map((l, i) => (
                <span key={`a${i}`} style={{ background: 'var(--accent-soft)' }}>
                  {l.text}
                  {'\n'}
                </span>
              ))}
            </pre>
          )}
        </div>
      )}
    </article>
  );
}
