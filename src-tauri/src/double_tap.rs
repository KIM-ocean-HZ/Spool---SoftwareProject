//! Double-tap ⌥ (Option) capture trigger (macOS only).
//!
//! A CGEventTap observes the key stream; we count clean ⌥ taps and emit
//! `capture-trigger` on a double-tap within a short window.
//!
//! Why a CGEventTap (not tauri-plugin-global-shortcut): a bare modifier key cannot be
//! registered as a RegisterEventHotKey global shortcut — that API needs a non-modifier
//! key. Observing the event stream is the only way to detect a modifier double-tap.
//!
//! Why ⌥, and why hardware timestamps: the trigger used to be a double-tap of ⌘C, but
//! ⌘C also issues Copy — in a heavy app (Word writes many rich-clipboard formats) that
//! Copy floods the system and delays our tap callback, inflating the measured interval
//! past the window so the double-tap was missed. Two fixes: (1) ⌥ on its own does
//! nothing, decoupling the trigger from Copy; (2) the interval is measured from each
//! event's CGEventGetTimestamp — stamped when the key was physically pressed — not
//! from wall-clock time at callback entry, which lags under load. The user still
//! presses ⌘C to copy, then double-taps ⌥.
//!
//! Suppression (2026-07-29): Claude Desktop's quick-entry ALSO fires on a double-tap
//! of ⌥, and being the MCP host it is always running — so every capture used to pop
//! Claude's window as well. The copy-gate (below) already decides WHICH app a given
//! double-tap belongs to; suppression makes that decision stick: the tap is created
//! as an ACTIVE tap (kCGEventTapOptionDefault) when Accessibility is granted, and
//! when Spool consumes a double-tap it deletes the 2nd press + its release from the
//! stream. Other listeners then see a single tap — no popup. A bare double-tap (no
//! recent ⌘C) is still passed through untouched, so Claude's own gesture keeps
//! working. NOTE: the core-graphics crate wrapper cannot delete events (its callback
//! maps `None` back to the original event), so the tap is created via raw
//! CGEventTapCreate with our own trampoline; returning NULL is the deletion.
//! Without Accessibility, creation of an active tap fails and we fall back to the
//! previous listen-only behavior (both apps see the gesture).
//!
//! Permissions (fixed 2026-07-07): a listen-only tap only receives OTHER processes'
//! events once the user grants Spool **Input Monitoring** (TCC). Without the grant,
//! tap creation still SUCCEEDS — macOS just silently delivers only this process's own
//! events, which is exactly "double-tap works inside Spool, dead everywhere else".
//! macOS does NOT prompt on tap creation for a listen-only tap, so install() now
//! preflights via CGPreflightListenEventAccess and fires the one-shot system prompt
//! via CGRequestListenEventAccess when missing. The frontend asks
//! `input_monitoring_granted` (lib.rs) and shows a quiet banner pointing at System
//! Settings — a fresh grant only takes effect on the next launch, the already-created
//! tap stays deaf until restart. The ACTIVE tap additionally needs **Accessibility**
//! (AXIsProcessTrusted); install() preflights and prompts for it the same way. Dev
//! note: every ad-hoc re-sign (each rebuild) invalidates a previous grant; only a
//! stable Developer ID / Spool Dev signature keeps it.
//!
//! Self-heal (PLAN_EN.md §19.4): when macOS delivers `TapDisabledByTimeout` or
//! `TapDisabledByUserInput`, we re-enable the tap in place via `CGEventTapEnable`.
//! If two consecutive disable events fire (the re-enable didn't stick), we emit a
//! `capture-disabled` event so the UI can surface a one-time notice — a user-defined
//! capture shortcut (if bound in Settings) keeps working in either case.

#![cfg(target_os = "macos")]

use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::mach_port::{CFMachPort, CFMachPortRef};
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::event::{CGEvent, CGEventFlags, EventField};
use foreign_types::ForeignType;
use std::mem::ManuallyDrop;
use std::os::raw::c_void;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

// =============================================================================
// §9.13 click-outside-to-dismiss
// =============================================================================
//
// While the capture toast is showing, capture.rs arms this watch with the toast's frame
// (global logical points). The same CGEventTap that detects ⌥ also observes left mouse
// downs; a click that lands OUTSIDE the armed frame dismisses the toast so the user can
// keep working. A click inside (the toast's own buttons / picker) is left alone. The
// watch is disarmed the moment the toast hides, so normal clicks are never intercepted.

const OVERLAY_LABEL: &str = "overlay";

// (x, y, w, h) of the toast in global logical points; None when no toast is up.
static OVERLAY_FRAME: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);

pub fn arm_overlay_dismiss(x: f64, y: f64, w: f64, h: f64) {
    *OVERLAY_FRAME.lock().unwrap() = Some((x, y, w, h));
}

pub fn update_overlay_dismiss_height(h: f64) {
    if let Some(frame) = OVERLAY_FRAME.lock().unwrap().as_mut() {
        frame.3 = h;
    }
}

pub fn disarm_overlay_dismiss() {
    *OVERLAY_FRAME.lock().unwrap() = None;
}

// True only when armed AND the point is outside the toast frame.
fn click_outside_overlay(px: f64, py: f64) -> bool {
    match *OVERLAY_FRAME.lock().unwrap() {
        Some((x, y, w, h)) => px < x || px > x + w || py < y || py > y + h,
        None => false,
    }
}

// Hardware key codes for the left/right ⌥ (Option) keys — layout-independent.
const KEYCODE_OPT_LEFT: i64 = 58;
const KEYCODE_OPT_RIGHT: i64 = 61;

// kVK_ANSI_C / kVK_ANSI_X — positional virtual key codes for the copy/cut chords.
// Positional, so a non-QWERTY layout that relocates the letter C is not covered —
// acceptable: the product's mental model is literally "⌘C 然后双击 ⌥" (§10.2).
const KEYCODE_C: i64 = 8;
const KEYCODE_X: i64 = 7;

// Copy-gate (2026-07-08): Claude Desktop's quick-entry popup ALSO triggers on a
// double-tap of ⌥, so a bare double-tap is ambiguous on machines running both. The
// capture mental model is "copy, then remember" (§10.2) — so Spool only treats a
// double-tap as capture when a ⌘C/⌘X was seen within this window; otherwise the
// double-tap is ignored and whatever else listens for it (Claude's popup) has the
// gesture to itself. Trade-off, documented: a copy made via a context menu (no
// keystroke) does not arm the gate — press ⌘C and double-tap again.
const COPY_GATE_WINDOW_MS: u64 = 10_000;

// CGEventGetTimestamp (ns) of the last observed ⌘C/⌘X keydown; 0 = never.
static LAST_COPY_CHORD_NS: AtomicU64 = AtomicU64::new(0);

// Whether the copy-gate is enforced. Only true when Input Monitoring was granted at
// install time: without the grant the tap cannot see keyDown AT ALL (verified — even
// own-process synthetic ⌘C never arrives), so the gate could never arm and in-app
// double-tap capture would silently die. Ungranted also means no global events, so
// the Claude-popup conflict the gate exists for cannot happen — bypassing is safe.
static COPY_GATE_ACTIVE: AtomicBool = AtomicBool::new(false);

// Two ⌥ taps within this window count as a double-tap. Matches the macOS system
// double-click default; reliable at this tight value because the interval is measured
// from hardware timestamps, not from (latency-prone) callback delivery time.
const DOUBLE_TAP_WINDOW_MS: u64 = 500;

// v2.8 §20 Track B: long-press ⌥ opens the collect-mode staging toast. Threshold is
// long enough that a fast double-tap (≤500ms each press window) can't coincidentally
// trigger collect — the user has to deliberately hold the key. Made a named constant
// per the prompt so the kill criterion in §20.8 reads as one tunable.
const LONG_PRESS_THRESHOLD_MS: u64 = 600;

// v2.10 §20.9: a clean isolated ⌥ tap (no 2nd tap, not held into a long-press) toggles the
// collect panel's collapse — but only while the panel is open. Kept well under the full
// double-tap window so the collapse feels responsive; real capture double-taps land far
// faster than this, so the first tap of one almost never mis-fires a collapse.
const SINGLE_TAP_SETTLE_MS: u64 = 300;

const NANOS_PER_MS: u64 = 1_000_000;

// CGEventGetTimestamp value (nanoseconds) of the last observed clean ⌥ press. Atomic
// so the tap callback — dispatched on its own run-loop thread — reads/writes lock-free.
// 0 means "no first tap yet"; a real CGEvent timestamp is never 0.
static LAST_OPT_PRESS_NS: AtomicU64 = AtomicU64::new(0);

// v2.8 Track B long-press state. PRESS_ID monotonically increments on every clean ⌥
// press; OPT_IS_DOWN tracks the live press/release edge. A long-press timer thread
// spawned on press captures the current PRESS_ID and, after LONG_PRESS_THRESHOLD_MS,
// fires collect-trigger ONLY if (a) OPT_IS_DOWN is still true and (b) PRESS_ID hasn't
// moved (the user hasn't pressed-released-repressed in the meantime). This guarantees
// a stray double-tap can't accidentally also trip the long-press.
static OPT_PRESS_ID: AtomicU64 = AtomicU64::new(0);
static OPT_IS_DOWN: AtomicBool = AtomicBool::new(false);

// v2.10 §20.9: press_id of the press that last fired a double-tap capture. That press's
// single-tap timer reads this to know it was the 2nd of a pair (not a lone tap) and skip
// the collapse-toggle.
static LAST_DOUBLE_TAP_PRESS_ID: AtomicU64 = AtomicU64::new(0);

// Suppression state (2026-07-29). SUPPRESS_ACTIVE: the tap was created as an active
// (Default) tap, so deleting events is possible. SWALLOW_NEXT_OPT_RELEASE: the 2nd
// press of a consumed double-tap was just deleted; delete its matching release too,
// so the outside world sees a consistent single press-release pair (the first tap).
static SUPPRESS_ACTIVE: AtomicBool = AtomicBool::new(false);
static SWALLOW_NEXT_OPT_RELEASE: AtomicBool = AtomicBool::new(false);

// CFMachPortRef of the installed tap, stashed so the callback can re-enable in place
// after macOS disables it (§19.4). Null until run_tap() finishes setup. Storing a
// raw pointer is fine: the CFMachPort is held by the runloop source for the life of
// the dedicated tap thread (which never exits), so the pointer never dangles.
static TAP_PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

// True once we've notified the UI that the tap is permanently disabled — re-entry
// guard so a flapping tap doesn't toast on every disable callback.
static NOTIFIED_DISABLED: AtomicBool = AtomicBool::new(false);

// The tap callback is a plain extern "C" fn (raw CGEventTapCreate, see module doc),
// so app-event emission goes through boxed closures installed once by install().
struct Emitters {
    capture_trigger: Box<dyn Fn() + Send + Sync>,
    capture_disabled: Box<dyn Fn(&'static str) + Send + Sync>,
    overlay_dismiss: Box<dyn Fn() + Send + Sync>,
    collect_trigger: Box<dyn Fn() + Send + Sync>,
    collect_collapse: Box<dyn Fn() + Send + Sync>,
}
static EMITTERS: OnceLock<Emitters> = OnceLock::new();

// Raw CGEventType values we handle (the crate enum can't represent the two disable
// sentinels without overflowing its mask builder — see the mask note in run_tap).
const ET_LEFT_MOUSE_DOWN: u32 = 1;
const ET_KEY_DOWN: u32 = 10;
const ET_FLAGS_CHANGED: u32 = 12;
const ET_TAP_DISABLED_TIMEOUT: u32 = 0xFFFF_FFFE;
const ET_TAP_DISABLED_USER_INPUT: u32 = 0xFFFF_FFFF;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    // When the event physically occurred, in NANOSECONDS. Despite the "absolute time"
    // wording in some docs, this is plain nanoseconds — NOT mach ticks. Do NOT apply a
    // mach_timebase_info scaling: on Apple Silicon that inflates every gap ~41x (125/3)
    // and no double-tap ever lands inside the window.
    fn CGEventGetTimestamp(event: *const c_void) -> u64;

    // Re-enables an event tap macOS has disabled. The first argument is the same
    // CFMachPortRef returned by CGEventTapCreate. Idempotent — calling on an already-
    // enabled tap is a no-op.
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);

    // Input Monitoring TCC state (macOS 10.15+). Preflight reads the current grant
    // without prompting; Request shows the system prompt (once — later calls are
    // no-ops until the user changes the setting) and returns the resulting state.
    // Not exposed by core-graphics 0.23, so declared against the framework we
    // already link. C `bool` maps to Rust `bool`.
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;

    // Raw tap creation — used instead of core-graphics' CGEventTap wrapper because
    // the wrapper's trampoline cannot return NULL (it maps `None` back to the
    // original event), and returning NULL from the callback is precisely how an
    // active tap deletes an event.
    fn CGEventTapCreate(
        tap: u32,      // kCGSessionEventTap = 1
        place: u32,    // kCGHeadInsertEventTap = 0
        options: u32,  // kCGEventTapOptionDefault = 0 / ListenOnly = 1
        mask: u64,
        callback: unsafe extern "C" fn(*const c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
}

const K_CG_SESSION_EVENT_TAP: u32 = 1;
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
const K_CG_EVENT_TAP_OPTION_DEFAULT: u32 = 0;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    // Accessibility TCC state — gates ACTIVE event taps (the ones that may modify or
    // delete events). Listen-only taps are gated by Input Monitoring instead.
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: core_foundation::dictionary::CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

// Current Input Monitoring grant — polled by the frontend via the
// `input_monitoring_granted` command (lib.rs) to drive the onboarding banner.
pub fn input_monitoring_granted() -> bool {
    unsafe { CGPreflightListenEventAccess() }
}

// Current Accessibility grant — the suppression tap (active mode) needs it.
pub fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

fn request_accessibility_with_prompt() -> bool {
    unsafe {
        let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt);
        let opts = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), CFBoolean::true_value().as_CFType())]);
        AXIsProcessTrustedWithOptions(opts.as_concrete_TypeRef())
    }
}

pub fn install<R: Runtime>(app: AppHandle<R>) {
    // Emitters for the extern "C" callback and its timer threads. install() runs once.
    let a1 = app.clone();
    let a2 = app.clone();
    let a3 = app.clone();
    let a4 = app.clone();
    let a5 = app.clone();
    let _ = EMITTERS.set(Emitters {
        capture_trigger: Box::new(move || {
            let _ = a1.emit("capture-trigger", ());
        }),
        capture_disabled: Box::new(move |reason| {
            let _ = a2.emit("capture-disabled", reason);
        }),
        overlay_dismiss: Box::new(move || {
            let _ = a3.emit_to(OVERLAY_LABEL, "overlay:dismiss", ());
        }),
        collect_trigger: Box::new(move || {
            let _ = a4.emit("collect-trigger", ());
        }),
        collect_collapse: Box::new(move || {
            let _ = a5.emit_to("collect", "collect:toggle-collapse", ());
        }),
    });
    thread::spawn(run_tap);
}

// The raw trampoline: returning the event pointer passes it through; returning NULL
// deletes it (active taps only — for a listen-only tap the return value is ignored).
unsafe extern "C" fn tap_trampoline(
    _proxy: *const c_void,
    etype: u32,
    event: *mut c_void,
    _user_info: *mut c_void,
) -> *mut c_void {
    if on_event(etype, event) {
        event
    } else {
        std::ptr::null_mut()
    }
}

// Returns true to keep the event, false to delete it. All logic lives here so the
// trampoline stays trivial.
fn on_event(etype: u32, event_ptr: *mut c_void) -> bool {
    let emitters = match EMITTERS.get() {
        Some(e) => e,
        None => return true,
    };

    match etype {
        ET_TAP_DISABLED_TIMEOUT | ET_TAP_DISABLED_USER_INPUT => {
            let reason = if etype == ET_TAP_DISABLED_TIMEOUT { "timeout" } else { "user input" };
            eprintln!("[double-tap] tap disabled ({reason}); attempting self-heal");
            // Pull the tap's mach port we stashed at install-time and ask macOS to
            // re-enable. If the port pointer is null, install hasn't completed yet —
            // ignore (we'll never get a disable event before install anyway).
            let port = TAP_PORT.load(Ordering::Acquire) as CFMachPortRef;
            if !port.is_null() {
                unsafe { CGEventTapEnable(port, true) };
            }
            SWALLOW_NEXT_OPT_RELEASE.store(false, Ordering::Relaxed);
            // If we're still disabled next time the callback fires for a disable
            // event, notify the UI once. CFRunLoop continues to dispatch the
            // single-shot disable events even when the tap is off.
            if NOTIFIED_DISABLED
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                // First-disable path: try the re-enable above and reset the
                // double-tap counter so a stray ⌥ press from before doesn't pair
                // with the next one. We DON'T toast yet — the re-enable usually
                // works and a transient timeout shouldn't bother the user.
                LAST_OPT_PRESS_NS.store(0, Ordering::Relaxed);
            } else {
                // Second consecutive disable event with no clean press in between
                // means the self-heal didn't stick. Surface a single notice — a
                // user-defined capture shortcut (if bound) keeps working.
                (emitters.capture_disabled)(reason);
            }
            true
        }
        ET_LEFT_MOUSE_DOWN => {
            // §9.13: dismiss the capture toast when the user clicks anywhere outside
            // it (resuming work). Disarmed = the watch returns false, so this is a
            // cheap no-op for every normal click when no toast is up.
            let event = ManuallyDrop::new(unsafe { CGEvent::from_ptr(event_ptr as *mut _) });
            let loc = event.location();
            if click_outside_overlay(loc.x, loc.y) {
                (emitters.overlay_dismiss)();
            }
            true
        }
        ET_KEY_DOWN => {
            // Copy-gate bookkeeping: remember when a ⌘C/⌘X chord was last pressed.
            // Repeats (key held) refresh the stamp harmlessly.
            let event = ManuallyDrop::new(unsafe { CGEvent::from_ptr(event_ptr as *mut _) });
            let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
            if (keycode == KEYCODE_C || keycode == KEYCODE_X)
                && event.get_flags().contains(CGEventFlags::CGEventFlagCommand)
            {
                let now = unsafe { CGEventGetTimestamp(event_ptr as *const c_void) };
                LAST_COPY_CHORD_NS.store(now, Ordering::Relaxed);
            }
            true
        }
        ET_FLAGS_CHANGED => {
            // Any clean event passing through means the tap is healthy again —
            // clear the latched disable flag so a future disable can re-arm the
            // self-heal notification path.
            NOTIFIED_DISABLED.store(false, Ordering::Relaxed);
            let event = ManuallyDrop::new(unsafe { CGEvent::from_ptr(event_ptr as *mut _) });
            // FlagsChanged carries the key code of the modifier that changed.
            let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
            if keycode != KEYCODE_OPT_LEFT && keycode != KEYCODE_OPT_RIGHT {
                return true;
            }
            let flags = event.get_flags();
            // The ⌥ bit set in the post-change flags means this is the *press*
            // edge; cleared means *release*. Both edges matter now — release
            // bails the long-press timer (v2.8 Track B).
            let is_press = flags.contains(CGEventFlags::CGEventFlagAlternate);

            if !is_press {
                // Release edge — mark the press session as ended so the in-flight
                // long-press timer (if any) bails on wakeup. Does NOT update
                // LAST_OPT_PRESS_NS (only presses count for double-tap pairing).
                OPT_IS_DOWN.store(false, Ordering::Relaxed);
                // Suppression: this is the release of a deleted 2nd press — delete
                // it too, so the outside world's press/release pairing stays
                // consistent (it saw exactly one full tap).
                if SWALLOW_NEXT_OPT_RELEASE.swap(false, Ordering::AcqRel)
                    && SUPPRESS_ACTIVE.load(Ordering::Relaxed)
                {
                    eprintln!("[double-tap] suppressed ⌥ release (2nd of consumed pair)");
                    return false;
                }
                return true;
            }

            // A fresh press means any pending release-swallow is stale — drop it.
            SWALLOW_NEXT_OPT_RELEASE.store(false, Ordering::Relaxed);

            // Require ⌥ alone — a ⌥ press while ⌘/⇧/⌃ is held belongs to a combo
            // (⌥⌘C, ⌥⇧4, …), not a deliberate tap.
            if flags.contains(CGEventFlags::CGEventFlagCommand)
                || flags.contains(CGEventFlags::CGEventFlagShift)
                || flags.contains(CGEventFlags::CGEventFlagControl)
            {
                return true;
            }

            // Mark the press as live and stamp a fresh press_id so an older
            // long-press timer (still sleeping from a previous press) can detect
            // it has been superseded and bail.
            OPT_IS_DOWN.store(true, Ordering::Relaxed);
            let press_id = OPT_PRESS_ID.fetch_add(1, Ordering::Relaxed) + 1;

            let now = unsafe { CGEventGetTimestamp(event_ptr as *const c_void) };
            let prev = LAST_OPT_PRESS_NS.swap(now, Ordering::Relaxed);
            // Whether to delete THIS event from the stream (2nd press of a pair
            // that Spool consumed). Decided below; the timers still spawn either
            // way so long-press / single-tap behavior is unchanged.
            let mut keep = true;
            // Log every clean ⌥ tap (with the measured gap) so a flaky double-tap
            // can be triaged from stderr.
            if prev == 0 {
                eprintln!(
                    "[double-tap] ⌥ 1st-of-pair (waiting ≤{DOUBLE_TAP_WINDOW_MS}ms for 2nd)"
                );
            } else {
                // CGEventGetTimestamp is nanoseconds — straight /1e6 to ms.
                let gap = now.saturating_sub(prev) / NANOS_PER_MS;
                if gap <= DOUBLE_TAP_WINDOW_MS {
                    // Copy-gate (see COPY_GATE_WINDOW_MS): only a double-tap that
                    // follows a recent ⌘C/⌘X is a capture; a bare one is left to
                    // Claude Desktop's identical quick-entry gesture. The gesture
                    // mechanics (reset + press-id marking) run in both branches so
                    // long-press / single-tap behavior is unchanged either way.
                    let copied = LAST_COPY_CHORD_NS.load(Ordering::Relaxed);
                    let copy_gap_ms = now.saturating_sub(copied) / NANOS_PER_MS;
                    if !COPY_GATE_ACTIVE.load(Ordering::Relaxed)
                        || (copied != 0 && copy_gap_ms <= COPY_GATE_WINDOW_MS)
                    {
                        eprintln!(
                            "[double-tap] TRIGGER gap={gap}ms (⌘C {copy_gap_ms}ms ago)"
                        );
                        (emitters.capture_trigger)();
                        // Suppression: Spool consumed this double-tap — delete the
                        // 2nd press (and, via the flag, its release) so Claude
                        // Desktop's identical gesture never completes.
                        if SUPPRESS_ACTIVE.load(Ordering::Relaxed) {
                            SWALLOW_NEXT_OPT_RELEASE.store(true, Ordering::Release);
                            keep = false;
                            eprintln!("[double-tap] suppressed ⌥ press (2nd of consumed pair)");
                        }
                    } else {
                        eprintln!(
                            "[double-tap] double-tap IGNORED — no ⌘C/⌘X within \
                             {COPY_GATE_WINDOW_MS}ms (copy-gate)"
                        );
                    }
                    // Reset so a third tap doesn't immediately re-trigger off the
                    // second tap's timestamp.
                    LAST_OPT_PRESS_NS.store(0, Ordering::Relaxed);
                    // Mark this press as a double-tap consumer so its single-tap timer
                    // (spawned below) won't also fire a collapse-toggle.
                    LAST_DOUBLE_TAP_PRESS_ID.store(press_id, Ordering::Relaxed);
                } else {
                    eprintln!(
                        "[double-tap] ⌥ too-slow gap={gap}ms > {DOUBLE_TAP_WINDOW_MS}ms — count restarts"
                    );
                }
            }

            // v2.8 Track B: spawn a one-shot long-press detector. It sleeps the
            // threshold, then fires collect-trigger iff (a) this same press is
            // still down AND (b) no newer press has started in the meantime. The
            // thread is short-lived (~600ms) and self-cleans. We do this AFTER
            // the double-tap logic above so a fast second tap still trips capture
            // first — and that fast second tap also increments OPT_PRESS_ID, so
            // the first press's long-press timer will bail.
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(LONG_PRESS_THRESHOLD_MS));
                if !OPT_IS_DOWN.load(Ordering::Relaxed) {
                    return;
                }
                if OPT_PRESS_ID.load(Ordering::Relaxed) != press_id {
                    return; // superseded by a newer press
                }
                // Reset double-tap pairing so this long-pressed ⌥ can't also pair
                // with a future tap for an unintended capture-trigger.
                LAST_OPT_PRESS_NS.store(0, Ordering::Relaxed);
                eprintln!("[long-press] TRIGGER after {LONG_PRESS_THRESHOLD_MS}ms hold");
                if let Some(e) = EMITTERS.get() {
                    (e.collect_trigger)();
                }
            });

            // v2.10 §20.9: single-tap detector. After the double-tap window settles,
            // toggle the collect panel's collapse iff this was a clean lone tap — and
            // only while the panel is open. Conditions: no later press (press_id
            // unchanged), the key was released (a tap, not a hold heading for the
            // long-press), and this press wasn't the 2nd of a double-tap (which already
            // fired capture). Emitted straight to the collect window.
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(SINGLE_TAP_SETTLE_MS));
                if !crate::collect::collect_panel_open() {
                    return;
                }
                if OPT_PRESS_ID.load(Ordering::Relaxed) != press_id {
                    return;
                }
                if OPT_IS_DOWN.load(Ordering::Relaxed) {
                    return;
                }
                if LAST_DOUBLE_TAP_PRESS_ID.load(Ordering::Relaxed) == press_id {
                    return;
                }
                eprintln!("[single-tap] ⌥ clean tap — toggle collect collapse");
                if let Some(e) = EMITTERS.get() {
                    (e.collect_collapse)();
                }
            });

            keep
        }
        _ => true,
    }
}

fn run_tap() {
    // Without the Input Monitoring grant the tap below only ever sees Spool's own
    // events (see module doc). Preflight and fire the one-shot system prompt when
    // missing; install the tap either way so double-tap keeps working inside Spool
    // immediately, and a fresh grant takes effect on the next launch.
    let mut granted = unsafe { CGPreflightListenEventAccess() };
    if !granted {
        eprintln!("[double-tap] Input Monitoring NOT granted — showing system prompt");
        granted = unsafe { CGRequestListenEventAccess() };
        eprintln!("[double-tap] Input Monitoring request returned granted={granted}");
    }
    COPY_GATE_ACTIVE.store(granted, Ordering::Relaxed);

    // Accessibility gates the ACTIVE (suppressing) tap. Preflight; prompt once when
    // missing. Like Input Monitoring, a fresh grant takes effect on the next launch.
    let mut ax = unsafe { AXIsProcessTrusted() };
    if !ax {
        eprintln!("[double-tap] Accessibility NOT granted — showing system prompt (needed to keep the double-tap exclusive to Spool)");
        ax = request_accessibility_with_prompt();
        eprintln!("[double-tap] Accessibility request returned trusted={ax}");
    }

    // FlagsChanged (⌥ double-tap / long-press) + LeftMouseDown (§9.13 click-outside
    // dismiss) + KeyDown (⌘C/⌘X copy-gate, 2026-07-08 — only when Input Monitoring
    // is granted: an unprivileged tap never receives keyDown, and asking for it
    // provoked a TapDisabledByUserInput in testing). The two TapDisabled sentinels
    // are delivered to every tap regardless of the mask (their values don't fit a
    // 1<<n mask anyway) — the callback handles them when they arrive.
    let mut mask: u64 = (1 << ET_FLAGS_CHANGED) | (1 << ET_LEFT_MOUSE_DOWN);
    if granted {
        mask |= 1 << ET_KEY_DOWN;
    }

    // Active tap first (event deletion possible → double-tap exclusivity); fall back
    // to listen-only (previous behavior: both Spool and Claude see the gesture).
    let mut port: CFMachPortRef = std::ptr::null_mut();
    if ax {
        port = unsafe {
            CGEventTapCreate(
                K_CG_SESSION_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_DEFAULT,
                mask,
                tap_trampoline,
                std::ptr::null_mut(),
            )
        };
    }
    let active = !port.is_null();
    if !active {
        port = unsafe {
            CGEventTapCreate(
                K_CG_SESSION_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                mask,
                tap_trampoline,
                std::ptr::null_mut(),
            )
        };
    }
    if port.is_null() {
        eprintln!(
            "[double-tap] CGEventTap creation FAILED — grant Spool both \
             Accessibility AND Input Monitoring in System Settings → Privacy & \
             Security, then restart Spool."
        );
        return;
    }
    SUPPRESS_ACTIVE.store(active, Ordering::Relaxed);

    // wrap_under_create_rule takes over the +1 from CGEventTapCreate; the runloop
    // source retains the port for the life of this (never-exiting) thread.
    let mach_port = unsafe { CFMachPort::wrap_under_create_rule(port) };
    let source = match mach_port.create_runloop_source(0) {
        Ok(s) => s,
        Err(_) => {
            eprintln!("[double-tap] failed to create run loop source");
            return;
        }
    };

    let current = CFRunLoop::get_current();
    unsafe {
        current.add_source(&source, kCFRunLoopCommonModes);
    }
    unsafe { CGEventTapEnable(port, true) };
    // Stash the raw CFMachPortRef so the callback can re-enable the tap in place when
    // macOS disables it. Safe because the runloop source above retains the mach port
    // for as long as this thread (which never exits) keeps the runloop alive.
    TAP_PORT.store(port as *mut c_void, Ordering::Release);
    eprintln!(
        "[double-tap] installed ({}) — double-tap ⌥ (within {DOUBLE_TAP_WINDOW_MS}ms) to capture; \
         long-press ⌥ (hold {LONG_PRESS_THRESHOLD_MS}ms) for collect-mode (v2.8 §20 Track B)",
        if active { "active: consumed double-taps are exclusive to Spool" } else { "listen-only: no Accessibility, gesture stays shared" }
    );
    // CFRunLoop::run_current() blocks this thread forever — exactly what we want
    // for a long-lived event-tap listener. The thread is dedicated to this loop.
    CFRunLoop::run_current();
}
