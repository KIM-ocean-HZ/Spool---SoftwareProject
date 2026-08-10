import { useEffect, useState } from 'react';
import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { plainText } from '@/lib/blocks/contentRuns';
import { getBlockById, type RefKind } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { blockLabel } from '@/lib/pack/assemble';
import { formatBlockTime } from '@/lib/utils/time';
import { useSearchStore } from '@/stores/searchStore';
import { useThreadsStore } from '@/stores/threadsStore';
import SeqBadge from './SeqBadge';

interface Props {
  refBlockId: string;
  /** v13 (DESIGN_CONTEXT_HYGIENE §3.1): what the citation MEANS. Null reads as 'cites'. */
  refKind?: RefKind | null;
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
export default function CitationLine({ refBlockId, refKind }: Props) {
  const t = useT();
  const select = useThreadsStore((s) => s.select);
  const highlight = useSearchStore((s) => s.highlight);
  const [cited, setCited] = useState<
    | { state: 'loading' }
    | { state: 'missing' }
    | { state: 'found'; anchor: string; createdAt: number; seq: number | null; threadId: string }
  >({ state: 'loading' });

  useEffect(() => {
    let stale = false;
    void getBlockById(refBlockId).then((b) => {
      if (stale) return;
      setCited(
        b
          ? {
              state: 'found',
              // Same label ladder the pack's ↩ cites: line uses — one truncation semantic
              // across pack and GUI (DESIGN_CONTEXT_HYGIENE §3.2).
              // v14 (§9.3 拍板乙): an AI-written note may not name the block here either.
              // DESIGN_MCP_WRITE_ROLE §9.5 caught this line doing exactly that in the real
              // library — GPT's own sentence was naming #4 under #10 and #11.
              // ⚠️ The ladder runs on the STRIPPED text, so the 40-character budget buys 40
              // characters of the user's words rather than of `#` and `**`. The rule itself
              // (40 chars, note wins only when the body does not fit whole) is untouched.
              anchor: blockLabel(
                plainText(b.content),
                b.annotation ? plainText(b.annotation) : b.annotation,
                annotationIsAi(b.annotationBy, b.source),
              ),
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

  if (cited.state === 'loading') return null;
  // v13: the verb, not just the arrow. "Builds on" and "replaces" are opposite claims, and
  // the feed showed them identically until now.
  const verb =
    refKind === 'supersedes'
      ? t('取代了')
      : refKind === 'corrects'
        ? t('更正了其中一处：')
        : null;

  if (cited.state === 'missing') {
    return (
      <div className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
        <span aria-hidden="true">↩</span>
        {verb && <span className="shrink-0">{verb}</span>}
        <span className="italic">{t('引用的块已删除')}</span>
      </div>
    );
  }

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
        <span aria-hidden="true" className="shrink-0 opacity-40">
          ·
        </span>
        <span className="min-w-0 truncate text-ink-2">{cited.anchor}</span>
      </button>
    </div>
  );
}
