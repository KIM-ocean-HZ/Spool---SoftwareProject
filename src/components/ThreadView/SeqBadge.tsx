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
//
// ⚠️⚠️ 2026-08-10, Ocean on the whole-pixel version: 「数字有点偏上，没有对准圆心」. Still true, and
// the first round had been measured in the wrong browser. Chrome reported 0.5px; **WebKit —
// which is the engine this app actually runs in — puts it 1.5px high**, because it does not
// place the baseline in the line box where the font metrics say it should. Centering here is
// therefore an engine property, not a geometry one, and the only honest way to set it is to
// measure the engine that ships.
//
// pt-[1.5px] is that measurement. Flex centering splits the remaining space, so a padding of
// p moves the digit down by p/2 — 1.5px cancels the 1.5px WebKit lifts it by. What is left is
// half a pixel and cannot be removed: the digit's ink is 13 device pixels tall inside a 26
// device pixel ring, and 13 does not divide in two. The remainder is parked BELOW centre on
// purpose — that is the direction Ocean does not complain about, and the one the eye forgives.
//
// ⚠️ Consequences worth knowing before touching this: (1) in Chrome the badge now sits half a
// pixel low, which is the correct trade because Chrome is not what users run; (2) a WebKit
// update could move the baseline again — re-measure, do not guess, the instrument is in
// HANDOFF §6.2-sexies; (3) changing the font size changes the parity and therefore the whole
// answer, so the pad and the size have to be re-measured together.
export default function SeqBadge({ seq, className = '' }: { seq: number; className?: string }) {
  return (
    <span
      className={`inline-flex h-[13px] min-w-[13px] shrink-0 items-center justify-center rounded-full border border-current px-[3px] pt-[1.5px] font-mono text-[9px] leading-none tabular-nums ${className}`}
    >
      {seq}
    </span>
  );
}
