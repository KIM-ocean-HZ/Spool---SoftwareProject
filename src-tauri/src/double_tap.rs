//! Double-tap ⌥ (Option) capture trigger (macOS only).
//!
//! A CGEventTap in `kCGEventTapOptionListenOnly` mode observes the key stream without
//! consuming events, so ⌥ keeps working normally; we merely *count* clean ⌥ taps and
//! emit `capture-trigger` on a double-tap within a short window.
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
//! Permissions (fixed 2026-07-07): a listen-only tap only receives OTHER processes'
//! events once the user grants Spool **Input Monitoring** (TCC). Without the grant,
//! tap creation still SUCCEEDS — macOS just silently delivers only this process's own
//! events, which is exactly "double-tap works inside Spool, dead everywhere else".
//! macOS does NOT prompt on tap creation for a listen-only tap, so install() now
//! preflights via CGPreflightListenEventAccess and fires the one-shot system prompt
//! via CGRequestListenEventAccess when missing. The frontend asks
//! `input_monitoring_granted` (lib.rs) and shows a quiet banner pointing at System
//! Settings — a fresh grant only takes effect on the next launch, the already-created
//! tap stays deaf until restart. Dev note: every ad-hoc re-sign (each rebuild)
//! invalidates a previous grant; only a stable Developer ID signature keeps it.
//!
//! Self-heal (PLAN_EN.md §19.4): when macOS delivers `TapDisabledByTimeout` or
//! `TapDisabledByUserInput`, we re-enable the tap in place via `CGEventTapEnable`.
//! If two consecutive disable events fire (the re-enable didn't stick), we emit a
//! `capture-disabled` event so the UI can surface a one-time notice — a user-defined
//! capture shortcut (if bound in Settings) keeps working in either case.

#![cfg(target_os = "macos")]

use core_foundation::base::TCFType;
use core_foundation::mach_port::CFMachPortRef;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions,
    CGEventTapPlacement, CGEventTapProxy, CGEventType, EventField,
};
use foreign_types::ForeignType;
use std::os::raw::c_void;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
use std::sync::Mutex;
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

// CFMachPortRef of the installed tap, stashed so the callback can re-enable in place
// after macOS disables it (§19.4). Null until run_tap() finishes setup. Storing a
// raw pointer is fine: the CFMachPort is held by the runloop source for the life of
// the dedicated tap thread (which never exits), so the pointer never dangles.
static TAP_PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

// True once we've notified the UI that the tap is permanently disabled — re-entry
// guard so a flapping tap doesn't toast on every disable callback.
static NOTIFIED_DISABLED: AtomicBool = AtomicBool::new(false);

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
}

// Current Input Monitoring grant — polled by the frontend via the
// `input_monitoring_granted` command (lib.rs) to drive the onboarding banner.
pub fn input_monitoring_granted() -> bool {
    unsafe { CGPreflightListenEventAccess() }
}

pub fn install<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || run_tap(app));
}

fn run_tap<R: Runtime>(app: AppHandle<R>) {
    // Without the Input Monitoring grant the ListenOnly tap below is still created
    // without error but only ever sees Spool's own events (see module doc). Preflight
    // and fire the one-shot system prompt when missing; install the tap either way so
    // double-tap keeps working inside Spool immediately, and a fresh grant takes
    // effect on the next launch.
    if !unsafe { CGPreflightListenEventAccess() } {
        eprintln!("[double-tap] Input Monitoring NOT granted — showing system prompt");
        let granted = unsafe { CGRequestListenEventAccess() };
        eprintln!("[double-tap] Input Monitoring request returned granted={granted}");
    }

    // Callback runs on the run-loop thread. Captures `app` (Clone + Send + Sync);
    // LAST_OPT_PRESS_NS is the only shared mutable state — atomic, no locks.
    let app_for_cb = app.clone();
    let callback = move |_proxy: CGEventTapProxy,
                         ev_type: CGEventType,
                         event: &CGEvent|
          -> Option<CGEvent> {
        match ev_type {
            CGEventType::LeftMouseDown => {
                // §9.13: dismiss the capture toast when the user clicks anywhere outside
                // it (resuming work). Disarmed = the watch returns false, so this is a
                // cheap no-op for every normal click when no toast is up.
                let loc = event.location();
                if click_outside_overlay(loc.x, loc.y) {
                    let _ = app.emit_to(OVERLAY_LABEL, "overlay:dismiss", ());
                }
            }
            CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                let reason = match ev_type {
                    CGEventType::TapDisabledByTimeout => "timeout",
                    _ => "user input",
                };
                eprintln!("[double-tap] tap disabled ({reason}); attempting self-heal");
                // Pull the tap's mach port we stashed at install-time and ask macOS to
                // re-enable. If the port pointer is null, install hasn't completed yet —
                // ignore (we'll never get a disable event before install anyway).
                let port = TAP_PORT.load(Ordering::Acquire) as CFMachPortRef;
                if !port.is_null() {
                    unsafe { CGEventTapEnable(port, true) };
                }
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
                    let _ = app_for_cb.emit("capture-disabled", reason);
                }
            }
            CGEventType::FlagsChanged => {
                // Any clean event passing through means the tap is healthy again —
                // clear the latched disable flag so a future disable can re-arm the
                // self-heal notification path.
                NOTIFIED_DISABLED.store(false, Ordering::Relaxed);
                // FlagsChanged carries the key code of the modifier that changed.
                let keycode =
                    event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                if keycode != KEYCODE_OPT_LEFT && keycode != KEYCODE_OPT_RIGHT {
                    return None;
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
                    return None;
                }

                // Require ⌥ alone — a ⌥ press while ⌘/⇧/⌃ is held belongs to a combo
                // (⌥⌘C, ⌥⇧4, …), not a deliberate tap.
                if flags.contains(CGEventFlags::CGEventFlagCommand)
                    || flags.contains(CGEventFlags::CGEventFlagShift)
                    || flags.contains(CGEventFlags::CGEventFlagControl)
                {
                    return None;
                }

                // Mark the press as live and stamp a fresh press_id so an older
                // long-press timer (still sleeping from a previous press) can detect
                // it has been superseded and bail.
                OPT_IS_DOWN.store(true, Ordering::Relaxed);
                let press_id = OPT_PRESS_ID.fetch_add(1, Ordering::Relaxed) + 1;

                let now = unsafe { CGEventGetTimestamp(event.as_ptr() as *const c_void) };
                let prev = LAST_OPT_PRESS_NS.swap(now, Ordering::Relaxed);
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
                        eprintln!("[double-tap] TRIGGER gap={gap}ms");
                        let _ = app.emit("capture-trigger", ());
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
                let app_for_timer = app.clone();
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
                    let _ = app_for_timer.emit("collect-trigger", ());
                });

                // v2.10 §20.9: single-tap detector. After the double-tap window settles,
                // toggle the collect panel's collapse iff this was a clean lone tap — and
                // only while the panel is open. Conditions: no later press (press_id
                // unchanged), the key was released (a tap, not a hold heading for the
                // long-press), and this press wasn't the 2nd of a double-tap (which already
                // fired capture). Emitted straight to the collect window.
                let app_for_single = app.clone();
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
                    // "collect" = COLLECT_LABEL in collect.rs.
                    let _ = app_for_single.emit_to("collect", "collect:toggle-collapse", ());
                });
            }
            _ => {}
        }
        // ListenOnly mode: the return value is ignored by macOS, the event always
        // passes through to the next tap unchanged.
        None
    };

    let tap = match CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        // FlagsChanged (⌥ double-tap / long-press) + LeftMouseDown (§9.13 click-outside
        // dismiss). Per Apple docs, TapDisabledByTimeout and TapDisabledByUserInput are
        // delivered to every tap regardless of the mask — and including them PANICS at
        // startup because their numeric values (0xFFFFFFFE / 0xFFFFFFFF) overflow
        // core-graphics 0.23.2's `1 << ev as u64` mask builder. The callback still
        // handles them when they arrive automatically.
        vec![CGEventType::FlagsChanged, CGEventType::LeftMouseDown],
        callback,
    ) {
        Ok(t) => t,
        Err(_) => {
            eprintln!(
                "[double-tap] CGEventTap creation FAILED — grant Spool both \
                 Accessibility AND Input Monitoring in System Settings → Privacy & \
                 Security, then restart Spool."
            );
            return;
        }
    };

    let source = match tap.mach_port.create_runloop_source(0) {
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
    tap.enable();
    // Stash the raw CFMachPortRef so the callback can re-enable the tap in place when
    // macOS disables it. Safe because the runloop source above retains the mach port
    // for as long as this thread (which never exits) keeps the runloop alive.
    TAP_PORT.store(
        tap.mach_port.as_concrete_TypeRef() as *mut c_void,
        Ordering::Release,
    );
    eprintln!(
        "[double-tap] installed — double-tap ⌥ (within {DOUBLE_TAP_WINDOW_MS}ms) to capture; \
         long-press ⌥ (hold {LONG_PRESS_THRESHOLD_MS}ms) for collect-mode (v2.8 §20 Track B)"
    );
    // CFRunLoop::run_current() blocks this thread forever — exactly what we want
    // for a long-lived event-tap listener. The thread is dedicated to this loop.
    CFRunLoop::run_current();
}
