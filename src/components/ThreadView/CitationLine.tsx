import { useEffect, useState } from 'react';
import { plainText } from '@/lib/blocks/contentRuns';
import { getBlockById, type RefKind } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { formatBlockTime } from '@/lib/utils/time';
import { useSearchStore } from '@/stores/searchStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import SeqBadge from './SeqBadge';

interface Props {
  refBlockId: string;
  /** v13 (DESIGN_CONTEXT_HYGIENE §3.1): what the citation MEANS. Null reads as 'cites'. */
  refKind?: RefKind | null;
  /** S4②：**引用方**所在的项目。被引的块不在这个项目里，就要把项目名显出来。 */
  fromThreadId: string;
}

// §20.13 v2.4 P2-3 (2026-07-12): the feed counterpart of the pack's "↩ cites:" line.
// MCP writers declare which block a finding builds on via ref_block_id; until now that
// link was invisible in the GUI. A dangling citation (citee row hard-deleted — the same
// condition both pack renderers use; a citee in a soft-deleted thread still resolves)
// degrades to a hint instead of disappearing. Resolution is lazy and per citing block,
// so the ordinary feed — where no block carries a citation — never pays a DB
// round-trip; the pack path keeps its own dialog-gated batch resolve.
//
// ⚠️ 2026-08-10 (Ocean, after §7 sentence 5 ran on ChatGPT): this line used to be
// presentation only — 「no button, no navigation」, §2.5 quiet. 「点击更正源无法跳转」 retires
// that. The reason the original decision was wrong: `cites` is a footnote you may ignore,
// but `corrects` is a claim ABOUT another block you now have to go and read. A pointer you
// cannot follow is the one case where quiet costs more than it buys.
//
// Three things Ocean read as one blob (`#1 8/7 16:50 # 申请人定位… **目标。**`) are now three:
// a ring (SeqBadge), a clock, and the body — separated by · and by colour, with the body's
// markdown markers dropped (plainText).
export default function CitationLine({ refBlockId, refKind, fromThreadId }: Props) {
  const t = useT();
  const select = useThreadsStore((s) => s.select);
  const highlight = useSearchStore((s) => s.highlight);
  const [cited, setCited] = useState<
    | { state: 'loading' }
    | { state: 'missing' }
    | {
        state: 'found';
        anchor: string;
        /** ⭐ Q1：这一句是**引用方**写的理由（`ref_note`），不是被引块的说明。
         *  界面上要分得出来 —— 一个说「我为什么指过去」，一个说「那一块是什么」。 */
        anchorIsWhy: boolean;
        createdAt: number;
        seq: number | null;
        threadId: string;
      }
  >({ state: 'loading' });

  useEffect(() => {
    let stale = false;
    void getBlockById(refBlockId).then((b) => {
      if (stale) return;
      setCited(
        b
          ? {
              state: 'found',
              // ⭐⭐ 2026-08-25（Ocean）——「被引用的 block 正文文字再也不显示（这个文字没有
              // 用，显示不全，且可以直接点过去看）」。
              //
              // 他说的是真库 Flux `#16` 引用 `#9`：`#9` 是一封原文邮件，这一行截出来的
              // 「Dear Hanze, I have great news for you — …」既不是它说了什么，也不是为什么
              // 引它。⇒ 正文**整条不再出现在这里**。
              //
              // 换上的是**一句关于那一块的话**，按这个次序：
              //   ① `gist` —— AI 写的「这一块整体是什么」（v26 §2.S8，`add_block` 就能给）;
              //   ② 批注 —— 有人（AI 或用户）写过的那一句。
              //   ③ 都没有 → **什么都不显示**，只剩编号和时间,点过去看。
              //   （⓪ 见下面那一段 —— v28 之后 `refNote` 排在这三级之上。）
              // ⚠️ ⛔ 这里不再走 `blockLabel`：那个梯子的最后一级正是「退回正文前 40 字」，
              // 而那一级就是他要去掉的东西。pack 那边照旧（`assemble.ts` 没动）。
              // ⚠️ 批注不再按「谁写的」过滤（v14 §9.3 拍板乙的那道闸）—— 08-25 Ocean 明确
              // 反过来了：「AI 的批注 UI 应该和用户批注一样」。它在这儿也是一句关于那一块的话。
              // ⭐⭐ Q1（WORKPLAN §2.Q1，Ocean 2026-08-25 拍板乙）—— 梯子最上面加了一级：
              //   ⓪ `refNote` —— **这一头为什么指过去**（v28，AI 写引用时必须给）。
              // 他要的原本就是这一句：「我需要 AI 给出引用的理由」。08-25 夜里只做到了
              // 后半句（下面那两级说的都是「被引的那一块是什么」），前半句当时**没有地方存**。
              // ⚠️ 它排在最前，因为它是**这一行存在的理由**；`gist` / 批注是退路，
              // 老引用（v28 之前那些，`refNote` 全是 null）照旧从 ① 开始。
              anchor: plainText(
                (b.refNote?.trim() || b.gist?.trim() || b.annotation?.trim()) ?? '',
              ),
              anchorIsWhy: !!b.refNote?.trim(),
              createdAt: b.createdAt,
              seq: b.seq,
              threadId: b.threadId,
            }
          : { state: 'missing' },
      );
    });
    return () => {
      stale = true;
    };
  }, [refBlockId]);

  // ⭐ S4②（2026-08-24，Ocean）—— **被引的块在别的项目时，把项目名显出来。**
  // pack 里早就有这一句（`REF_BLOCK_FROM = ' — in project: '`，`templates.ts:50`），
  // **只在跨项目时才加**，当初记的理由是「不加的话这条引用读起来像证据就在这份 pack 里」。
  // 界面上一直没有：`threadId` 取出来了，但只用来跳转，从不显示。
  // ⇒ ⚠️ **AI 读到的比用户看到的多一句话。** Ocean 的原话：「我点过去才知道这个 block 12
  // 是申请帮助项目的，而不是这个项目的」。**pack 那条理由一字不改地适用于界面。**
  //
  // ⚠️ `selectThreadById` 返回的是 store 里那个对象本身（稳定引用），⛔ 不是新建的数组 ——
  // 这一条是 2026-08-05 那次 React #185 打死主窗留下的纪律。
  const citedThread = useThreadsStore(
    selectThreadById(cited.state === 'found' ? cited.threadId : null),
  );

  if (cited.state === 'loading') return null;
  // v13: the verb, not just the arrow. "Builds on" and "replaces" are opposite claims, and
  // the feed showed them identically until now.
  //
  // ⭐ S4①（2026-08-24，Ocean）—— **`cites` 也要有动词。** 在这之前 `cites`（`ref_kind` 为
  // NULL）是唯一没有动词的一种：只剩一个 `↩` 和一个编号。真库 seq 21 就是这样，而**紧挨着
  // 它下面**是一张写着「更正」的卡（那是 seq 23 在更正 seq 21，方向相反）。
  // ⇒ **一个没标方向的出向箭头压着一个标了方向的入向关系，方向自然读不出来。**
  // Ocean 的原话：「他应该是修正了（也有可能是被修正了）」。
  // ⚠️ 用「引用了」而不是别的词：这一屏上「引用」已经是这件事的名字了（下面那句
  // 「引用的块已删除」用的就是它），⛔ 别再发明第二个。
  const verb =
    refKind === 'supersedes'
      ? t('整条取代了')
      : refKind === 'corrects'
        ? t('更正了其中一处：')
        : t('引用了');

  if (cited.state === 'missing') {
    // ⚠️ 这一行不带 `cites` 的动词：后面那句「引用的块已删除」里已经有「引用」两个字了，
    // 两个连着念是「引用了 引用的块已删除」。`supersedes` / `corrects` 照旧带 ——
    // 那两种的方向本身就是要说的话。
    const missingVerb = refKind === 'supersedes' || refKind === 'corrects' ? verb : null;
    return (
      <div className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
        <span aria-hidden="true">↩</span>
        {missingVerb && <span className="shrink-0">{missingVerb}</span>}
        <span className="italic">{t('引用的块已删除')}</span>
      </div>
    );
  }

  // ⚠️ 项目名查不到的时候仍然说一句「在别的项目里」—— 用户要知道的第一件事是
  // 「不在这个项目」，⛔ 那一句不许因为查不到名字就整个消失。
  const elsewhere =
    cited.threadId === fromThreadId ? null : (citedThread?.title?.trim() || null);

  // The cited block may live in another project — select() first, exactly like a search
  // result does (SearchOverlay.navigate), so the jump works across the whole library and
  // not only inside the thread that happens to be open.
  const jump = () => {
    select(cited.threadId);
    highlight(refBlockId);
  };

  return (
    <div className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
      <span aria-hidden="true">↩</span>
      {verb && <span className="shrink-0">{verb}</span>}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          jump();
        }}
        title={t('点一下跳到那一块')}
        className="flex min-w-0 items-baseline gap-1.5 text-left transition-colors hover:text-accent"
      >
        {/* DESIGN_MCP_WRITE_ROLE §9.5-3: the number was the one thing missing. Ocean hit
            this line in the real library and could not tell WHICH block it pointed at —
            the preview truncates, and #4 is how Spool, the pack, and every MCP client
            already name a block. Null seq (pre-v9 rows) simply has no number to show. */}
        {cited.seq != null && <SeqBadge seq={cited.seq} />}
        <time className="shrink-0 font-mono tabular-nums opacity-70">
          {formatBlockTime(cited.createdAt)}
        </time>
        {cited.anchor && (
          <>
            <span aria-hidden="true" className="shrink-0 opacity-40">
              ·
            </span>
            {/* ⚠️ Q1：这两句话主语不一样，⛔ 不能画成一个样子 ——
                `refNote` 是**引用方**说「我为什么指过去」，`gist` / 批注是**被引块**说
                「我是什么」。同一个位置、同一个字号，读的人会把 AI 写的理由当成那一块的原话。
                所以带理由的那一句前面加一个「因为」记号，`title` 也说清是谁写的。 */}
            <span
              className="min-w-0 truncate text-ink-2"
              title={cited.anchorIsWhy ? t('AI 写的：为什么引这一块') : undefined}
            >
              {cited.anchorIsWhy && (
                <span aria-hidden="true" className="mr-1 opacity-50">
                  ∵
                </span>
              )}
              {cited.anchor}
            </span>
          </>
        )}
        {cited.threadId !== fromThreadId && (
          <>
            <span aria-hidden="true" className="shrink-0 opacity-40">
              ·
            </span>
            <span className="max-w-[45%] shrink-0 truncate text-muted">
              {elsewhere ? t('在〈{title}〉', { title: elsewhere }) : t('在别的项目里')}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
