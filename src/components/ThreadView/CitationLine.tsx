import { useEffect, useState } from 'react';
import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { getBlockById, type RefKind } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { blockLabel } from '@/lib/pack/assemble';
import { formatBlockTime } from '@/lib/utils/time';

interface Props {
  refBlockId: string;
  /** v13 (DESIGN_CONTEXT_HYGIENE §3.1): what the citation MEANS. Null reads as 'cites'. */
  refKind?: RefKind | null;
}

// §20.13 v2.4 P2-3 (2026-07-12): the feed counterpart of the pack's "↩ cites:" line.
// MCP writers declare which block a finding builds on via ref_block_id; until now that
// link was invisible in the GUI. Presentation only (§2.5 quiet): one muted line, no
// button, no navigation. A dangling citation (citee row hard-deleted — the same
// condition both pack renderers use; a citee in a soft-deleted thread still resolves)
// degrades to a hint instead of disappearing. Resolution is lazy and per citing block,
// so the ordinary feed — where no block carries a citation — never pays a DB
// round-trip; the pack path keeps its own dialog-gated batch resolve.
export default function CitationLine({ refBlockId, refKind }: Props) {
  const t = useT();
  const [cited, setCited] = useState<
    | { state: 'loading' }
    | { state: 'missing' }
    | { state: 'found'; anchor: string; createdAt: number; seq: number | null }
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
              anchor: blockLabel(b.content, b.annotation, annotationIsAi(b.annotationBy, b.source)),
              createdAt: b.createdAt,
              seq: b.seq,
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
  return (
    <div className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
      <span aria-hidden="true">↩</span>
      {verb && <span className="shrink-0">{verb}</span>}
      {cited.state === 'found' ? (
        <span className="min-w-0 truncate">
          {/* DESIGN_MCP_WRITE_ROLE §9.5-3: the number was the one thing missing. Ocean hit
              this line in the real library and could not tell WHICH block it pointed at —
              the preview truncates, and #4 is how Spool, the pack, and every MCP client
              already name a block. Null seq (pre-v9 rows) simply has no number to show. */}
          {cited.seq != null && <span className="font-mono">#{cited.seq}</span>}{' '}
          <time className="font-mono">{formatBlockTime(cited.createdAt)}</time>{' '}
          {cited.anchor}
        </span>
      ) : (
        <span className="italic">{t('引用的块已删除')}</span>
      )}
    </div>
  );
}
