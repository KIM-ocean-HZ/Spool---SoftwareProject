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
//! Permissions: the user must grant Spool both **Accessibility** AND **Input
//! Monitoring** in System Settings → Privacy & Security. On first run macOS prompts
//! for Input Monitoring once the tap is created; if denied, tap creation returns Err
//! and we fall back to the still-registered ⌘⇧C shortcut (see lib.rs).
//!
//! Self-heal (PLAN_EN.md §19.4): when macOS delivers `TapDisabledByTimeout` or
//! `TapDisabledByUserInput`, we re-enable the tap in place via `CGEventTapEnable`.
//! If two consecutive disable events fire (the re-enable didn't stick), we emit a
//! `capture-disabled` event so the UI can surface a one-time notice — the ⌘⇧C
//! fallback keeps working in either case.

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
use std::thread;
use tauri::{AppHandle, Emitter, Runtime};

// Hardware key codes for the left/right ⌥ (Option) keys — layout-independent.
const KEYCODE_OPT_LEFT: i64 = 58;
const KEYCODE_OPT_RIGHT: i64 = 61;

// Two ⌥ taps within this window count as a double-tap. Matches the macOS system
// double-click default; reliable at this tight value because the interval is measured
// from hardware timestamps, not from (latency-prone) callback delivery time.
const DOUBLE_TAP_WINDOW_MS: u64 = 500;

const NANOS_PER_MS: u64 = 1_000_000;

// CGEventGetTimestamp value (nanoseconds) of the last observed clean ⌥ press. Atomic
// so the tap callback — dispatched on its own run-loop thread — reads/writes lock-free.
// 0 means "no first tap yet"; a real CGEvent timestamp is never 0.
static LAST_OPT_PRESS_NS: AtomicU64 = AtomicU64::new(0);

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
}

pub fn install<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || run_tap(app));
}

fn run_tap<R: Runtime>(app: AppHandle<R>) {
    // Callback runs on the run-loop thread. Captures `app` (Clone + Send + Sync);
    // LAST_OPT_PRESS_NS is the only shared mutable state — atomic, no locks.
    let app_for_cb = app.clone();
    let callback = move |_proxy: CGEventTapProxy,
                         ev_type: CGEventType,
                         event: &CGEvent|
          -> Option<CGEvent> {
        match ev_type {
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
                    // means the self-heal didn't stick. Surface a single notice and
                    // keep ⌘⇧C as the working fallback.
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
                // edge; the release edge clears it and is ignored.
                if !flags.contains(CGEventFlags::CGEventFlagAlternate) {
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
                    } else {
                        eprintln!(
                            "[double-tap] ⌥ too-slow gap={gap}ms > {DOUBLE_TAP_WINDOW_MS}ms — count restarts"
                        );
                    }
                }
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
        // ONLY FlagsChanged here. Per Apple docs, TapDisabledByTimeout and
        // TapDisabledByUserInput are delivered to every tap regardless of the mask —
        // and including them PANICS at startup because their numeric values
        // (0xFFFFFFFE / 0xFFFFFFFF) overflow core-graphics 0.23.2's `1 << ev as u64`
        // mask builder. The callback still handles them when they arrive automatically.
        vec![CGEventType::FlagsChanged],
        callback,
    ) {
        Ok(t) => t,
        Err(_) => {
            eprintln!(
                "[double-tap] CGEventTap creation FAILED — grant Spool both \
                 Accessibility AND Input Monitoring in System Settings → Privacy & \
                 Security. ⌘⇧C still works as the fallback shortcut."
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
        "[double-tap] installed — double-tap ⌥ (within {DOUBLE_TAP_WINDOW_MS}ms) to capture"
    );
    // CFRunLoop::run_current() blocks this thread forever — exactly what we want
    // for a long-lived event-tap listener. The thread is dedicated to this loop.
    CFRunLoop::run_current();
}
