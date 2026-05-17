// PLAN_EN.md §Phase 5 ("Settings/shortcut review"): the capture shortcut
// (⌘/Ctrl+Shift+C) is registered on the Rust side during setup (src-tauri/src/lib.rs
// → tauri_plugin_global_shortcut). For Phase 5 it stays hardcoded — the user-facing
// recorder UX lives in §9.12 / Phase 12 (Polish, Settings, Packaging).
//
// Review outcome: the path to Phase 12 is clean —
//   • tauri-plugin-global-shortcut exposes `unregister` + `register`, so swapping the
//     accelerator at runtime needs no rebuild.
//   • `capture::capture_accelerator()` is the one Rust call site; replacing it with a
//     lookup from the (future) settings store is a one-function change.
//   • A double-tap-modifier trigger is explicitly **not** added (PLAN §10.4 / §17 —
//     deferred; the shortcut staying user-configurable is the chosen solution).
//
// The label constants below are read by §11.5 / §12 settings UI to render the default.

export const DEFAULT_CAPTURE_SHORTCUT_LABEL = '⌘⇧C';
export const DEFAULT_SEARCH_SHORTCUT_LABEL = '⌘⇧F';
