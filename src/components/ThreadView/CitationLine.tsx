import { useEffect, useState } from 'react';
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
    | { state: 'found'; anchor: string; createdAt: number }
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
              anchor: blockLabel(b.content, b.annotation),
              createdAt: b.createdAt,
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
          <time className="font-mono">{formatBlockTime(cited.createdAt)}</time>{' '}
          {cited.anchor}
        </span>
      ) : (
        <span className="italic">{t('引用的块已删除')}</span>
      )}
    </div>
  );
}
