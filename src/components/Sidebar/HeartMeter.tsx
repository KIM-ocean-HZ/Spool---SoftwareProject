import { HEART_STEPS } from '@/lib/blocks/spoolProgress';
import { HEART_PATH, HEART_ROSE } from '@/lib/valentine/heart';

// 情人节限定版 §2 (2026-08-19, Ocean) — 「左边栏的线轴图案改成粉色爱心图案慢慢变大，同样绘制多帧
// （25）（缠满的记录也变成小爱心）」.
//
// This is SpoolMeter's opposite number: same slot, same size, same job (how much is on the
// current spool), different mark. It is a separate file rather than a branch inside SpoolMeter
// because the two share no geometry at all — the spool is an object that gains thread, the heart
// is an object that grows — and the one thing they do share, their SIZE, is a constraint imposed
// from outside by the sidebar, not something either drawing owns.
//
// ⚠️⚠️ **Everything SpoolMeter's header says about the size still binds here.** It was decided
// twice: a version spanning the whole card was built and rejected on sight (Ocean 2026-08-10:
// 「上一版本的线轴没有问题(这版太大个了)」, 「logo 太小了,被面板抢占了注意力」). The 40×36 box below
// is the same box the spool occupies, so the panel keeps the layout he approved and the two
// themes cannot disagree about where the two lines of text beside it begin.
// **Do not grow it to make a frame easier to see.** That trade was made and refused.
//
// ⚠️ The heart GROWS rather than filling up, which is what Ocean asked for (「慢慢变大」) and is
// also the only version of this that works at 25 frames. Thickening a wound coil 25 ways put one
// step at half a CSS pixel (SpoolMeter's own note); scaling a mark from a fifth of its size to
// full puts one step at about 4% of it, which is a state you can actually see.
//
// ⚠️ The animation is the STEP, never a resting state — the sidebar is on screen all day, and a
// heart that pulses continuously there spends the user's attention every minute to say what a
// still picture already says. Same rule the spool follows (首日价值二期 §2.3).

/** The box, shared with SpoolMeter so the panel's layout is theme-independent. */
const VIEW_W = 40;
const VIEW_H = 36;
const CENTER_X = 20;
const CENTER_Y = 18;

/** Half-height of a full heart, in viewBox units. 16 puts it at y 2…34 and x 4…36 — the same
 *  footprint the spool's flanges occupy (y 2…34, x 3…37), which is what keeps the two marks the
 *  same visual weight in the same slot. */
const FULL_SCALE = 16;

/** The smallest heart drawn, as a fraction of a full one.
 *
 *  ⚠️ This is the heart's version of 「the bare axle is what an EMPTY spool IS」. A fresh install
 *  opens on exactly this frame (§4-3: the card does not hide itself), so frame 0 has to be a
 *  recognisable heart and not a dot — 0.2 of 16 is a 6.4px mark, which still reads as a heart.
 *  Drawn much smaller the lobes close up and it becomes a blob. */
const MIN_FRACTION = 0.2;

/** How big the heart is at this frame, as a fraction of full.
 *
 *  ⚠️ Linear in `level`, deliberately, even though a heart's AREA then grows as the square. The
 *  quantity being reported is 「how far along this spool am I」, and the user reads that off the
 *  mark's extent rather than its area — an area-linear ramp makes the first ten frames nearly
 *  identical, which is the disease this widget exists to treat. */
export const heartFraction = (level: number): number => {
  const clamped = Math.min(Math.max(level, 0), HEART_STEPS);
  return MIN_FRACTION + (clamped / HEART_STEPS) * (1 - MIN_FRACTION);
};

/** How many hearts the shelf draws before it collapses to one and a × N.
 *
 *  ⚠️ Same **fitting** number as FilledSpools', for the same reason and with the same warning:
 *  the shelf rides on the end of the 还差 line and that line has to stay ONE line, so what may be
 *  drawn is whatever fits after the longest form of that phrase at the sidebar's fixed width. A
 *  heart is drawn in the same 16×12 box a small spool was, with the same 1px gap, so four still
 *  fit exactly where four fit before. If the sidebar's width ever changes, re-measure — the
 *  recipe is in HANDOFF §6.2-sexies. Do not guess. */
const MAX_DRAWN_HEARTS = 4;

/** One finished spool as a small heart, at the size of a piece of punctuation — the shelf that
 *  stands for 总线轴数 (§2.4). Ocean 2026-08-19: 「缠满的记录也变成小爱心」.
 *
 *  Same outline as the meter above, filled solid: at this size a full one has to read as the same
 *  object shrunk, and the meter's frame-0 outline would read as an empty one. */
export function FilledHearts({ count, label }: { count: number; label: string }) {
  // Past what fits, the shelf collapses to one heart and a multiplier — the achievement stays
  // legible and the line it sits on stays one line.
  const drawn = count <= MAX_DRAWN_HEARTS ? count : 1;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={label}>
      {Array.from({ length: drawn }, (_, i) => (
        <svg key={i} viewBox="0 0 16 12" width={16} height={12} role="img" aria-label={label}>
          {/* 5.8 → an 11.6 × 11.6 mark centred in the 16 × 12 box (y 0.2…11.8). The `transform`
              ATTRIBUTE, not a CSS transform: nothing here animates, and the attribute has no
              transform-origin ambiguity to reason about. */}
          <g transform="translate(8 6) scale(5.8)">
            <path d={HEART_PATH} fill={HEART_ROSE} opacity={0.9} />
          </g>
        </svg>
      ))}
      {count > MAX_DRAWN_HEARTS && <span className="text-[13px] text-ink-2">× {count}</span>}
    </span>
  );
}

interface Props {
  /** 0 … HEART_STEPS, from spoolState(captures, HEART_STEPS). */
  level: number;
  /** Wound full and nothing captured since — beat once, then leave it alone. */
  full: boolean;
  label: string;
}

export default function HeartMeter({ level, full, label }: Props) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={VIEW_W}
      height={VIEW_H}
      className={`flex-none ${full ? 'heart-beat' : ''}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {/* The frame: a full-size heart in outline, which is what an EMPTY one is. Drawn at every
          frame and not only at zero — it is the 还差 half of the same fact, and without it a small
          heart is just a small heart with nothing to be small against.
          ⚠️ --line-strong, the same token the spool's flanges use, so both themes put the same
          weight of 「container」 behind the same readout. */}
      <g transform={`translate(${CENTER_X} ${CENTER_Y}) scale(${FULL_SCALE})`}>
        <path
          d={HEART_PATH}
          fill="none"
          stroke="var(--line-strong)"
          /* Divided by the scale so the stroke lands at ~1.2 CSS px however the group is scaled —
             an un-divided width would be multiplied by 16 and swallow the mark. */
          strokeWidth={1.2 / FULL_SCALE}
          strokeLinejoin="round"
        />
      </g>
      {/* The heart itself. Scaled as ONE group rather than by animating the path's coordinates,
          for exactly the reason SpoolMeter squashes its thread as one group: `transform` on a
          single <g> is the only part of an SVG that transitions identically in every engine, and
          this has to look the same in WKWebView and WebView2.
          ⚠️⚠️ `transformOrigin: '0 0'` is REQUIRED, not defensive. A CSS `transform` on an SVG
          element resolves its origin against the view box, and the CSS initial value is
          `50% 50%` — which here is (20, 18), so without this the scale would happen about the
          middle of the box and the translate would then move it again. The shipped SpoolMeter
          gets away without it only because its translate/scale/translate triple happens to be
          origin-independent in the engines we ship on; a bare translate+scale is not. */}
      <g
        style={{
          transform: `translate(${CENTER_X}px, ${CENTER_Y}px) scale(${
            FULL_SCALE * heartFraction(level)
          })`,
          transformOrigin: '0 0',
          transition: 'transform 450ms ease-out',
        }}
      >
        <path d={HEART_PATH} fill={HEART_ROSE} opacity={0.9} />
      </g>
    </svg>
  );
}

export { MIN_FRACTION };
