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
// Sizes in em so the one component serves both the block header (12px) and the citation
// line (11px) without either call site passing a size.
export default function SeqBadge({ seq, className = '' }: { seq: number; className?: string }) {
  return (
    <span
      className={`inline-flex h-[1.5em] min-w-[1.5em] shrink-0 items-center justify-center rounded-full border border-current px-[0.32em] font-mono text-[0.9em] leading-none tabular-nums ${className}`}
    >
      {seq}
    </span>
  );
}
