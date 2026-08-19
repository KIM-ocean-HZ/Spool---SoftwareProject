import { ContentRuns } from '@/lib/blocks/contentRuns';
import type { Block } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { formatBlockTime } from '@/lib/utils/time';
import SeqBadge from './SeqBadge';

interface Props {
  /** The correcting block — the one carrying refKind 'corrects' and the quote. */
  correction: Block;
  /** Undo entry point. Absent on read-only surfaces. */
  onRemove?: () => void;
}

// 2026-08-19 (Ocean) — the correction, shown where it belongs: attached under the block
// it corrects, connected by a dashed rule, opened by clicking the marked sentence itself.
//
// What this replaces: two lines of pointer («↩ 更正了其中一处：#N» on the newer block,
// «⚠️ 其中一处已被更正：#N» on the older one), both of which navigated somewhere else.
// Ocean:「点击跳转这种混乱的展示」— a correction is a statement ABOUT the sentence above it,
// and the way to show subordination is to put it under that sentence, not to send the reader
// to another block and let them work out the relation from a number.
//
// ⚠️ The correcting block is still a block: same row, same seq, same place in the pack, still
// append-only. Only the FEED folds it, and only when it has a quote that still occurs in its
// target — a correction the reader cannot reach from the marked text keeps its own card in the
// timeline (BlockFeed.foldedCorrectionIds). Nothing here deletes or rewrites the original.
//
// ⚠️ AI and user corrections are told apart on purpose (Ocean:「AI和人工做区分」). An AI's
// carries its client label and its number, because it is content someone else wrote into the
// user's library and the pack will read it back under that label. The user's own carries
// neither: it is simply theirs, and the warm rule says so without a badge.
export default function CorrectionNote({ correction, onRemove }: Props) {
  const t = useT();
  // The one distinction that matters here. `source` is the client label MCP stamps
  // ('Codex · MCP'); a block written in this window has none.
  const byAi = !!correction.source?.trim();

  return (
    <div
      className={`mt-1.5 border-l border-dashed pl-2.5 ${
        byAi ? 'border-[var(--notice-warm-edge)]' : 'border-accent/45'
      }`}
    >
      <div className="mb-0.5 flex items-baseline gap-1.5 font-ui text-[11px] text-muted">
        <span className="shrink-0">{t('更正')}</span>
        {byAi ? (
          <>
            {correction.seq != null && <SeqBadge seq={correction.seq} />}
            <span className="min-w-0 truncate text-ink-2">{correction.source}</span>
          </>
        ) : (
          <span className="shrink-0 text-accent">{t('你写的')}</span>
        )}
        <time className="shrink-0 font-mono tabular-nums opacity-70">
          {formatBlockTime(correction.createdAt)}
        </time>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            // ⚠️ 「解除」, not 「删除」: this takes the relation off, and the block itself stays
            // in the library. Clearing it here leaves nothing to point the quote at, so the
            // store clears the quote in the same write.
            title={t('解除这条更正关系（那一块本身留着）')}
            className="ml-auto shrink-0 transition-colors hover:text-accent"
          >
            {t('解除')}
          </button>
        )}
      </div>
      <div className="font-ui text-[13px] leading-[1.55] text-ink-2">
        <ContentRuns content={correction.content} />
      </div>
      {correction.annotation?.trim() && (
        <div className="mt-1 font-ui text-[12px] leading-[1.5] text-muted">
          <ContentRuns content={correction.annotation} />
        </div>
      )}
    </div>
  );
}
