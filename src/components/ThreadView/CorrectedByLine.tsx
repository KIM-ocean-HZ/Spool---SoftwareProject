import { useT } from '@/lib/i18n';
import type { Correction } from '@/lib/pack/assemble';
import { useSearchStore } from '@/stores/searchStore';
import SeqBadge from './SeqBadge';

// v13 gave the pack a line under a corrected block («⚠️ one point in this block was
// corrected later — see #N»); the feed never got one. Ocean read the result on 2026-08-10,
// from the correcting side: 「无法展开，展开也不知道到底是哪里被修改了」— and from the corrected
// block there was nothing at all to see, in a library where `corrects` had just been used
// for the first time.
//
// So this is the pack's line, in the feed, plus the one thing the pack cannot do: it goes
// there. Same store pair the citation line and search use, so a correction living in
// another project still lands.
//
// ⚠️ Presentation only in the other direction: it never retires, hides or dims the block it
// sits under. `corrects` says ONE point is wrong (§3.1.1) — the rest of a 1,900-character
// block still stands, and treating the whole thing as suspect is the mistake `supersedes`
// exists for and that only the user may make.
export default function CorrectedByLine({ corrections }: { corrections: Correction[] }) {
  const t = useT();
  const highlight = useSearchStore((s) => s.highlight);
  if (corrections.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-ui text-[11px] text-muted">
      {/* ⛔ 2026-08-25（Ocean）：这里以前有一个 ⚠️。去掉了 —— 这一行本来就是灰的小字，
          一个警告表情把它读成了「出事了」，而它说的只是「后面有人更正过这一处」。 */}
      <span className="shrink-0">{t('其中一处已被更正：')}</span>
      {corrections.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Same project by construction: the feed only ever hands this component
            // corrections found among the blocks it is already showing, exactly as the
            // pack only speaks for what it holds.
            highlight(c.id);
          }}
          title={t('点一下跳到那一块')}
          className="inline-flex items-baseline text-muted transition-colors hover:text-accent"
        >
          <SeqBadge seq={c.seq} />
        </button>
      ))}
    </div>
  );
}
