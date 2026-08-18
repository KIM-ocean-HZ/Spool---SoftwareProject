import { useEffect, useRef, useState } from 'react';
import { useIsValentine } from '@/hooks/useTheme';

// 情人节限定版 §3 (2026-08-19, Ocean) — 「点击左上角的 spool logo（只有英文），logo 会震动一下，
// 然后变成 Gwen」.
//
// The wordmark, extracted from Sidebar/index.tsx so the easter egg has somewhere to live. The
// markup below is character-for-character what that header carried before, including the sizes
// and the gap under it — those were argued for once already (Ocean 2026-08-10: 「logo 太小了,被
// 面板抢占了注意力,增大一点,面板和 logo 增加距离」) and this change is not an occasion to revisit
// them.
//
// ⚠️⚠️ **In 经典 this renders a plain <h1> with no button, no handler and no state.** Not a
// disabled button, not a button whose onClick returns early: the released build's wordmark is
// not interactive, and a <button> around it would change its focus order, its hit target and
// what a screen reader announces even if clicking did nothing. 经典 has to stay exactly what
// shipped (Ocean: 「不能影响已经发布的版本」).
//
// ⚠️ **Only the English word swaps.** 「只有英文」 — 思簿 is beside it and stays put in both
// states, so the mark reads as this person's copy of Spool rather than as a different product.
//
// ⚠️ The swap is NOT persisted, and that is a choice rather than an omission. It costs a
// settings key and a write to settings.json to remember, and the egg is worth more found twice
// than remembered once — a relaunch putting `Spool` back is what leaves it there to be
// discovered again.
const WORDMARK = 'Spool';
const GWEN = 'Gwen';

/** Kept in step with the `wordmark-shake` keyframes in styles/global.css.
 *
 *  ⚠️ These two numbers are the same on purpose: Ocean's order of events is 「震动一下，然后变成
 *  Gwen」 — shake FIRST, then the name changes. Swapping the text mid-animation would read as a
 *  glitch rather than as the mark answering. If the keyframe duration changes, change this. */
const SHAKE_MS = 380;

export default function Wordmark() {
  const valentine = useIsValentine();
  const [gwen, setGwen] = useState(false);
  const [shaking, setShaking] = useState(false);
  // Cleared on unmount so a collapse of the sidebar mid-shake cannot land a setState on an
  // unmounted component, and re-armed per click so an impatient double click restarts the
  // shiver instead of queuing two swaps.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const label = (
    <>
      {gwen ? GWEN : WORDMARK}
      <span className="ml-2 font-serif text-lg italic text-muted">思簿</span>
    </>
  );

  if (!valentine) {
    return (
      <h1 className="min-w-0 font-serif text-3xl tracking-tight text-ink">{label}</h1>
    );
  }

  const onClick = (): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setShaking(true);
    timerRef.current = setTimeout(() => {
      setShaking(false);
      setGwen((v) => !v);
      timerRef.current = null;
    }, SHAKE_MS);
  };

  return (
    /* ⚠️ A <button> and not an onClick on the <h1>: this is the one thing in the sidebar header
       that can be activated, so it has to be reachable by keyboard and announce itself. The
       heading stays a heading — the button is inside it — because the top of the rail is still
       the product's name in the document's outline, not a control.
       ⚠️ `bg-transparent p-0 text-left` undoes the button defaults Tailwind preflight leaves in
       place; without them the wordmark shifts by a pixel or two between the two themes, which
       is exactly the sort of drift the extracted-markup note above is guarding. */
    <h1 className="min-w-0 font-serif text-3xl tracking-tight text-ink">
      <button
        type="button"
        onClick={onClick}
        aria-label={gwen ? GWEN : WORDMARK}
        className={`cursor-pointer border-0 bg-transparent p-0 text-left font-serif text-3xl tracking-tight text-ink outline-none ${
          shaking ? 'wordmark-shake' : ''
        }`}
      >
        {label}
      </button>
    </h1>
  );
}

export { SHAKE_MS, WORDMARK, GWEN };
