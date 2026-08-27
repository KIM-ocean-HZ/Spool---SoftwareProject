import { msForMinutes } from '@/lib/breakReminder';
import { useT } from '@/lib/i18n';
import { useBreakStore } from '@/stores/breakStore';
import { useSettingsStore } from '@/stores/settingsStore';

// 休息提醒 (2026-08-19 second pass, Ocean) — 「在『你捕捉了 xxx 条,还差 xxx 条缠满』的面板里显示连续
// 工作的时常,做一个倒计时时钟小组件」.
//
// This is the panel's second face. SpoolCard draws one or the other and usePanelFace decides
// which; everything about WHEN it appears is over there.
//
// ⚠️⚠️ **It occupies exactly the slots the stats face does** — the same 40×36 mark box and the
// same two lines of text beside it. That is not tidiness, it is the constraint Ocean set twice
// on this panel and once on the marks inside it: 「保证线轴左边只有两行字」 (2026-08-11) and the
// rejected oversized meter before it (「太大个了」). A face that were any taller would make the
// sidebar's whole lower half jump every time the panel rotated — and the rotation is supposed
// to be something the user never catches happening at all.
//
// ⚠️ **It is drawn as a CLOCK, not as a progress ring** (Ocean 2026-08-19, on seeing the first
// version installed: 「边栏时钟做的更精细一点，过于简陋了」). The first draft was a bare arc, which
// at this size is indistinguishable from a loading spinner. What makes it read as a clock is the
// dial: twelve ticks with the quarters longer, a hand, and the arc as the part already spent.
// The three of them together cost about twenty lines of SVG and no layout at all.
//
// ⚠️ The arc FILLS as the sitting goes on, the same direction the spool winds and the heart
// grows. The lock's ring drains, because that one is counting a rest down; this one is counting
// work up, and the two must not read as the same picture running two ways.

/** Same box as SpoolMeter / HeartMeter, for the reason in the header. */
const VIEW_W = 40;
const VIEW_H = 36;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

/** The dial's outer edge — the track, and the arc that rides on it. */
const R_RING = 14;
const CIRCUMFERENCE = 2 * Math.PI * R_RING;

/** Tick geometry, inside the ring: they read as the face's own markings rather than as a second
 *  ring. Quarters reach further in, which is what stops twelve identical marks from turning into
 *  a dotted circle at 28 CSS px. */
const TICK_OUTER = 11.3;
const TICK_INNER = 9.9;
const TICK_INNER_QUARTER = 9.0;

/** The hand stops short of the ticks — a hand that touched them would look like a thirteenth. */
const R_HAND = 8.2;

/** Twelve o'clock is -90°; angles run clockwise from there, like a clock. */
const angleAt = (fraction: number): number => -Math.PI / 2 + fraction * 2 * Math.PI;
const pointAt = (fraction: number, r: number): [number, number] => {
  const a = angleAt(fraction);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const quarter = i % 3 === 0;
  const [x1, y1] = pointAt(i / 12, quarter ? TICK_INNER_QUARTER : TICK_INNER);
  const [x2, y2] = pointAt(i / 12, TICK_OUTER);
  return { x1, y1, x2, y2, quarter };
});

export default function BreakClock() {
  const t = useT();
  const activeMs = useBreakStore((s) => s.activeMs);
  // ⭐ 2026-08-27（Ocean:「专注时间要一直累积」）——**上面那行字换成总数了**。
  // 表盘（弧和指针）画的仍然是**这一坐**：它是倒计时，走到头就该回到零。
  // 上面那行字画的是**总数**：休息清不掉它，所以倒计时结束之后它还在，还在往上加。
  // ⚠️ 写「已专注」⛔ 不写「今天已专注」：这个数是本次开机以来的，不落盘
  // （breakStore 顶上那段说了为什么），下午三点重开一次 Spool，「今天」当场就是假的。
  const totalMs = useBreakStore((s) => s.totalMs);
  const workMinutes = useSettingsStore((s) => s.breakWorkMinutes);

  const workMs = msForMinutes(workMinutes);
  const fraction = Math.min(Math.max(activeMs / workMs, 0), 1);
  // Floor going up, ceil coming down — so 「已专注 N」 never claims a minute that has not
  // finished, and 「还有 N 分钟」 never promises one that has already gone.
  const workedMin = Math.floor(totalMs / 60_000);
  const leftMin = Math.max(0, Math.ceil((workMs - activeMs) / 60_000));

  const label = t('已专注 {n} 分钟', { n: workedMin });
  const [handX, handY] = pointAt(fraction, R_HAND);

  return (
    <>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width={VIEW_W}
        height={VIEW_H}
        className="flex-none"
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        {/* The empty track, in the same --line-strong the spool's flanges and the heart's outline
            use — one weight of 「container」 behind every readout this panel draws. */}
        <circle cx={CX} cy={CY} r={R_RING} fill="none" stroke="var(--line-strong)" strokeWidth={1.25} />
        {/* The dial. --line (not --line-strong) so the markings sit UNDER the reading rather than
            competing with it; the quarters carry the orientation on their own. */}
        <g stroke="var(--line)" strokeLinecap="round">
          {TICKS.map((tk, i) => (
            <line
              key={i}
              x1={tk.x1}
              y1={tk.y1}
              x2={tk.x2}
              y2={tk.y2}
              strokeWidth={tk.quarter ? 1.1 : 0.7}
              opacity={tk.quarter ? 1 : 0.75}
            />
          ))}
        </g>
        {/* How much of this sitting is already spent. */}
        <circle
          cx={CX}
          cy={CY}
          r={R_RING}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.25}
          strokeLinecap="round"
          /* From 12 o'clock, clockwise. `transform` as an ATTRIBUTE with an explicit centre —
             a CSS transform would resolve its origin against the view box and need a second
             property to say so (HeartMeter's ⚠️⚠️ note). */
          transform={`rotate(-90 ${CX} ${CY})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 450ms ease-out' }}
        />
        {/* The hand, and the pin it turns on. ⚠️ Drawn from the centre to a computed point rather
            than as a rotated <line>, so it cannot disagree with the arc about where 「now」 is —
            both read the same `fraction`. */}
        <line
          x1={CX}
          y1={CY}
          x2={handX}
          y2={handY}
          stroke="var(--accent)"
          strokeWidth={1.3}
          strokeLinecap="round"
          style={{ transition: 'all 450ms ease-out' }}
        />
        <circle cx={CX} cy={CY} r={1.5} fill="var(--accent)" />
      </svg>
      {/* Two lines, same classes as SpoolCard's `Fact` — see its docblock for why they are
          `whitespace-nowrap` and all one tone. Written out here rather than imported so the two
          files do not import each other. */}
      <div className="flex min-w-0 flex-1 flex-col gap-y-0.5 leading-snug">
        <span className="whitespace-nowrap text-[13px] text-ink-2">{label}</span>
        <span className="whitespace-nowrap text-[13px] text-ink-2">
          {t('{n} 分钟后歇一会儿', { n: leftMin })}
        </span>
      </div>
    </>
  );
}
