// The block's own number, drawn as a circle.
//
// Ocean 2026-08-10, reading a `corrects` citation in the real library: 「# 看起来太凌乱」—
// `#1 8/7 16:50` put two runs of monospace digits side by side with only a space between
// them, and the eye could not tell where the number ended and the clock began. The ring
// does that separation with a shape instead of a character, so the digits stop competing.
//
// ⚠️ Drawn in CSS, not ①②③. The circled-number code points stop at 50 and their font
// coverage past ⑳ is patchy, while a library's seq keeps counting — a badge that silently
// degrades to a box at #51 is worse than the `#` it replaced.
//
// ⚠️ The number itself is unchanged, and that matters: an AI over MCP still says 「#12」,
// and the pack still writes `#12`. The circle is a GUI skin over the same integer — which
// is why the block header keeps its tooltip spelling the mapping out.
//
// ⚠️ 2026-08-10, Ocean on the first version: 「数字标记里面的数字没有居中」+「圆圈的大小需要和边上
// 的时间和文字一致」. Both came from the same mistake — sizing this in em.
//
// The em version was h-[1.5em]/text-[0.9em], and em compounds: at the citation line's 11px
// row that is a 9.9px digit in a 14.85px circle. Neither lands on a pixel, so the leftover
// space the flex centering has to split (and the glyph raster inside it) rounds to whichever
// side the row happens to sit on — measured at 2× DPR the digit came out 1.5px high, and it
// moved when the row moved. Whole pixels make it deterministic; what is left is glyph
// overshoot (a round-topped 2 rises past the cap line), which is type design, not layout.
//
// The same compounding is why it towered over its own row: a 14.85px ring beside 11px text
// whose letters are only 7.8px tall. 13px is picked against the text rather than against the
// font-size — it bottoms out level with the descenders and clears the caps by ~2px, so the
// ring reads as one more thing on the line instead of a bubble sitting on top of it.
//
// ⚠️ So this is one fixed size for both call sites (10px header row, 11px citation line),
// NOT a size that tracks the row. A size prop would bring the fractions back; if a third
// call site ever needs a different one, give it its own whole-pixel value here.
export default function SeqBadge({ seq, className = '' }: { seq: number; className?: string }) {
  return (
    <span
      className={`inline-flex h-[13px] min-w-[13px] shrink-0 items-center justify-center rounded-full border border-current px-[3px] font-mono text-[9px] leading-none tabular-nums ${className}`}
    >
      {seq}
    </span>
  );
}
