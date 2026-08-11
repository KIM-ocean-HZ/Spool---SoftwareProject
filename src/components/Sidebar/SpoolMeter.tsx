import { SPOOL_STEPS } from '@/lib/blocks/spoolProgress';

// 首日价值二期 §2.3 — the spool, wound.
//
// This is the first time the product's name is a thing on screen that moves: `spool` is a
// 线轴, and the library winding onto one is the whole metaphor. Drawn as inline SVG rather
// than an image for the reason every other mark here is (tokens.css owns the palette, and a
// bitmap would need a second copy for Retina), and viewed the way a real one is: two end
// flanges, an axle between them, and coils that thicken as thread goes on.
//
// ⚠️⚠️ **It is small on purpose, and that was decided twice.** A version spanning the whole
// card was built and rejected on sight — Ocean 2026-08-10: 「上一版本的线轴没有问题(这版太
// 大个了)」, and 「logo 太小了,被面板抢占了注意力」. The sidebar's own title is what should
// carry this panel's corner of the screen; the meter is a mark beside the numbers, not a
// banner over them. **Do not grow it to make a step easier to see** (see below) — that
// trade was made and refused.
//
// ⚠️ The animation is the STEP, never a resting state (§2.3). The sidebar is always on
// screen; something that moves continuously there spends the user's attention every minute
// of the day to say what a static picture already says.
//
// ⚠️ The barrel is what an EMPTY spool is, and a fresh install opens on exactly that
// (§4-3: the card no longer hides itself). Drawn any thinner it stops reading as a spool at
// all and becomes a capital H between two bars — measured by looking at it, WKWebView,
// HANDOFF §6.2-sexies.
const CENTER_Y = 18;
const AXLE_HALF = 4.5;
const FULL_HALF = 14; // stays inside the flanges (y 2…34)
const COIL_X = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];

/** How thick the wound thread is at this step, as a fraction of a full spool. Step 1 has to
 *  clear the axle — thread that renders *inside* the axle is a step the user cannot see.
 *
 *  ⚠️ With SPOOL_STEPS at 20 (Ocean 2026-08-10) one step is about half a CSS pixel here, so
 *  a SINGLE step is not meant to be legible at a glance; four or five of them are. That is
 *  the cost of keeping the meter this size, and it is the side he chose when he saw both. */
const windFraction = (level: number): number =>
  level <= 0 ? 0 : (AXLE_HALF + (level / SPOOL_STEPS) * (FULL_HALF - AXLE_HALF)) / FULL_HALF;

/** How many spools the shelf draws before it collapses to one and a × N.
 *
 *  ⚠️ This is a **fitting** number, not a taste number (Ocean 2026-08-11: 「如果线轴太多导致
 *  左侧边栏放不下,就显示 ×2,×5 来表示数量」). The shelf rides on the end of the 还差 line, and
 *  that line has to stay ONE line — so what may be drawn is whatever fits after the longest
 *  form of that phrase at the sidebar's width. It was 5, which fit when the shelf had its own
 *  place in a wrapping flow and could drop to a line of its own; it cannot now.
 *
 *  ⚠️ **If the sidebar's fixed width ever changes, re-measure this** — WKWebView, the recipe
 *  in HANDOFF §6.2-sexies. Measured at 260px against the widest line this can sit behind
 *  (English 「99 more to fill it」; 99 is the largest 还差 that can appear once a spool has
 *  been filled): four sit flush against the end of the column and five overflow it. Flush is
 *  fine — 12px of the panel's own padding and 8px of the scroller's come after it — but there
 *  is no slack left, so a longer string here means measuring again, not guessing. */
const MAX_DRAWN_SPOOLS = 4;

/** One finished spool, at the size of a piece of punctuation — the shelf of them that stands
 *  for 总线轴数 (§2.4). Same three parts as the meter above so a full one reads as the same
 *  object shrunk, not a different mark: two flanges, and thread all the way out to them. */
export function FilledSpools({ count, label }: { count: number; label: string }) {
  // Past what fits, the shelf collapses to one spool and a multiplier — the achievement is
  // still legible, and the line it sits on stays one line.
  const drawn = count <= MAX_DRAWN_SPOOLS ? count : 1;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={label}>
      {Array.from({ length: drawn }, (_, i) => (
        <svg key={i} viewBox="0 0 16 12" width={16} height={12} role="img" aria-label={label}>
          {/* wound thread, drawn as turns rather than a solid block — at this size that is
              the only thing that keeps it reading as the meter shrunk and not as a battery */}
          {[4.6, 6.6, 8.6, 10.6].map((x) => (
            <line
              key={x}
              x1={x}
              y1={1.5}
              x2={x}
              y2={10.5}
              stroke="var(--accent)"
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.85}
            />
          ))}
          <rect x={0.5} y={0} width={3} height={12} rx={1.2} fill="var(--line-strong)" />
          <rect x={12.5} y={0} width={3} height={12} rx={1.2} fill="var(--line-strong)" />
        </svg>
      ))}
      {count > MAX_DRAWN_SPOOLS && <span className="text-[13px] text-ink-2">× {count}</span>}
    </span>
  );
}

interface Props {
  /** 0 … SPOOL_STEPS, from spoolState(). */
  level: number;
  /** Wound full and nothing captured since — flash once, then leave it alone. */
  full: boolean;
  label: string;
}

export default function SpoolMeter({ level, full, label }: Props) {
  return (
    <svg
      viewBox="0 0 40 36"
      width={40}
      height={36}
      className={`flex-none rounded ${full ? 'flash' : ''}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {/* axle — what an empty spool is */}
      <rect
        x={6}
        y={CENTER_Y - AXLE_HALF}
        width={28}
        height={AXLE_HALF * 2}
        rx={1}
        fill="var(--line)"
      />
      {/* the thread. Drawn once at full thickness and squashed to the current step, because
          scaling one group is the only part of an SVG that transitions the same way in every
          engine — animating each line's y1/y2 does not. */}
      <g
        style={{
          transform: `translateY(${CENTER_Y}px) scaleY(${windFraction(level)}) translateY(${-CENTER_Y}px)`,
          transition: 'transform 450ms ease-out',
        }}
      >
        {COIL_X.map((x) => (
          <line
            key={x}
            x1={x}
            y1={CENTER_Y - FULL_HALF}
            x2={x}
            y2={CENTER_Y + FULL_HALF}
            stroke="var(--accent)"
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
      </g>
      {/* flanges last, so the thread is wound BEHIND their edges the way it is on a real one */}
      <rect x={3} y={2} width={4} height={32} rx={2} fill="var(--line-strong)" />
      <rect x={33} y={2} width={4} height={32} rx={2} fill="var(--line-strong)" />
    </svg>
  );
}
