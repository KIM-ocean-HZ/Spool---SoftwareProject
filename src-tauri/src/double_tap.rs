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
//! Failure modes documented at point of use; no auto-recovery for tap-disabled events
//! in v1 (rare in normal use; a Spool restart re-installs the tap).

#![cfg(target_os = "macos")]

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions,
    CGEventTapPlacement, CGEventTapProxy, CGEventType, EventField,
};
use foreign_types::ForeignType;
use std::os::raw::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
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

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    // When the event physically occurred, in NANOSECONDS. Despite the "absolute time"
    // wording in some docs, this is plain nanoseconds — NOT mach ticks. Do NOT apply a
    // mach_timebase_info scaling: on Apple Silicon that inflates every gap ~41x (125/3)
    // and no double-tap ever lands inside the window.
    fn CGEventGetTimestamp(event: *const c_void) -> u64;
}

pub fn install<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || run_tap(app));
}

fn run_tap<R: Runtime>(app: AppHandle<R>) {
    // Callback runs on the run-loop thread. Captures `app` (Clone + Send + Sync);
    // LAST_OPT_PRESS_NS is the only shared mutable state — atomic, no locks.
    let callback = move |_proxy: CGEventTapProxy,
                         ev_type: CGEventType,
                         event: &CGEvent|
          -> Option<CGEvent> {
        match ev_type {
            CGEventType::TapDisabledByTimeout => {
                eprintln!(
                    "[double-tap] WARNING: macOS disabled the event tap (timeout). \
                     ⌘⇧C still works; restart Spool to re-enable double-tap."
                );
            }
            CGEventType::TapDisabledByUserInput => {
                eprintln!(
                    "[double-tap] WARNING: event tap disabled by user input. \
                     ⌘⇧C still works; restart Spool to re-enable double-tap."
                );
            }
            CGEventType::FlagsChanged => {
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
    eprintln!(
        "[double-tap] installed — double-tap ⌥ (within {DOUBLE_TAP_WINDOW_MS}ms) to capture"
    );
    // CFRunLoop::run_current() blocks this thread forever — exactly what we want
    // for a long-lived event-tap listener. The thread is dedicated to this loop.
    CFRunLoop::run_current();
}
