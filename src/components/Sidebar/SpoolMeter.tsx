import { SPOOL_STEPS } from '@/lib/blocks/spoolProgress';

// 首日价值二期 §2.3 — the spool, wound.
//
// This is the first time the product's name is a thing on screen that moves: `spool` is a
// 线轴, and the library winding onto one is the whole metaphor. Inline SVG rather than an
// image for the reason every other mark here is (tokens.css owns the palette, and a bitmap
// would need a second copy for Retina).
//
// ⚠️ **Two turns of Ocean's feedback are baked into this shape. Both cost the obvious
// version, so don't refactor back toward it.**
//
// 1. **A step is one whole turn of thread, not a thicker bundle.** The first build grew the
//    wound bundle's radius, which reads well at 8 steps and is invisible at 20 (2026-08-10:
//    「线轴的状态增加,变成 20 个」) — nineteen thickenings inside eleven pixels is half a pixel
//    each. Turns are countable: every 5 captures a new one lands on the barrel.
// 2. **It spans the whole card.** It used to be a 40px square with the numbers beside it,
//    and his verdict on that card was 「右边全空,不平衡」. A reel is the one element here that
//    is naturally wide, so it takes the full width and the numbers sit under it in two
//    columns. Twenty turns also need the room — at 40px they would be 2px apart.
//
// ⚠️ The animation is the STEP, never a resting state. The sidebar is always on screen;
// something that moves continuously there spends the user's attention every minute of the
// day to say what a static picture already says.
const VIEW_W = 220;
const VIEW_H = 44;
const CENTER_Y = 22;
const BARREL_HALF = 5;
const COIL_HALF = 15; // stays inside the flanges (y 2…42)
const COIL_X0 = 14.5;
const COIL_PITCH = 10;

interface Props {
  /** 0 … SPOOL_STEPS, from spoolState(). One turn of thread per step. */
  level: number;
  /** Wound full and nothing captured since — flash once, then leave it alone. */
  full: boolean;
  label: string;
}

export default function SpoolMeter({ level, full, label }: Props) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`block w-full ${full ? 'flash' : ''}`}
      style={{ height: 'auto', borderRadius: 4 }}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {/* the barrel — what an empty spool is, and what a fresh install opens on (§4-3) */}
      <rect
        x={9}
        y={CENTER_Y - BARREL_HALF}
        width={VIEW_W - 18}
        height={BARREL_HALF * 2}
        rx={2}
        fill="var(--line)"
      />
      {/* Every turn is drawn, wound or not, and squashed to nothing until it is earned.
          Scaling one element is the only part of an SVG that transitions the same way in
          every engine — so a new turn grows out of the barrel instead of blinking in. */}
      {Array.from({ length: SPOOL_STEPS }, (_, i) => (
        <line
          key={i}
          x1={COIL_X0 + i * COIL_PITCH}
          y1={CENTER_Y - COIL_HALF}
          x2={COIL_X0 + i * COIL_PITCH}
          y2={CENTER_Y + COIL_HALF}
          stroke="var(--accent)"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.85}
          style={{
            transform: `translateY(${CENTER_Y}px) scaleY(${i < level ? 1 : 0}) translateY(${-CENTER_Y}px)`,
            transition: 'transform 400ms ease-out',
          }}
        />
      ))}
      {/* flanges last, so the thread is wound BEHIND their edges the way it is on a real one */}
      <rect x={1} y={2} width={8} height={VIEW_H - 4} rx={3} fill="var(--line-strong)" />
      <rect
        x={VIEW_W - 9}
        y={2}
        width={8}
        height={VIEW_H - 4}
        rx={3}
        fill="var(--line-strong)"
      />
    </svg>
  );
}
