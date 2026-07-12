import { useEffect, useState } from 'react';
import { getBlockById } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { headAnchor } from '@/lib/pack/assemble';
import { formatBlockTime } from '@/lib/utils/time';

interface Props {
  refBlockId: string;
}

// §20.13 v2.4 P2-3 (2026-07-12): the feed counterpart of the pack's "↩ cites:" line.
// MCP writers declare which block a finding builds on via ref_block_id; until now that
// link was invisible in the GUI. Presentation only (§2.5 quiet): one muted line, no
// button, no navigation. A dangling citation (citee row hard-deleted — the same
// condition both pack renderers use; a citee in a soft-deleted thread still resolves)
// degrades to a hint instead of disappearing. Resolution is lazy and per citing block,
// so the ordinary feed — where no block carries a citation — never pays a DB
// round-trip; the pack path keeps its own dialog-gated batch resolve.
export default function CitationLine({ refBlockId }: Props) {
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
          ? { state: 'found', anchor: headAnchor(b.content), createdAt: b.createdAt }
          : { state: 'missing' },
      );
    });
    return () => {
      stale = true;
    };
  }, [refBlockId]);

  if (cited.state === 'loading') return null;
  return (
    <div className="mt-1.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
      <span aria-hidden="true">↩</span>
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
