// While a Chinese/Japanese IME composition is active, Enter confirms a candidate and
// Esc cancels the composition — neither keystroke is meant for the app, so commit /
// cancel / navigate handlers must ignore it or a pinyin user loses half-typed text
// (the v2.10 「IME Enter mis-commit」 bug class). `isComposing` is the standard signal;
// keyCode 229 is the legacy fallback some IMEs still emit on the trailing keydown.
// React handlers pass `e.nativeEvent`; window/document listeners pass the event itself.
export const isImeComposing = (e: { isComposing: boolean; keyCode: number }): boolean =>
  e.isComposing || e.keyCode === 229;
