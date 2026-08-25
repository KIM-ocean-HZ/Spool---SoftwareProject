//! Double-tap Ctrl capture trigger (Windows only) — the peer of `double_tap.rs`'s
//! double-tap ⌥ on macOS. Same product gesture, different OS plumbing.
//!
//! Why Raw Input, not a keyboard hook: a bare modifier key cannot be a `RegisterHotKey`
//! accelerator (that API needs a non-modifier key), so — exactly as on macOS — the only
//! way to see a modifier double-tap is to observe the key stream. The obvious way to do
//! that on Windows is `SetWindowsHookEx(WH_KEYBOARD_LL)`, and we deliberately do NOT use
//! it. A low-level keyboard hook installs a callback that sits in the path of EVERY
//! keystroke on the machine and can swallow or alter it — that is the behavioural
//! signature antivirus keylogger heuristics look for, and this build ships UNSIGNED
//! (Ocean 2026-08-15). Unsigned + a global keyboard hook is how an app gets quarantined
//! whole, not merely flagged.
//!
//! Raw Input is the low-profile alternative: `RegisterRawInputDevices` with
//! `RIDEV_INPUTSINK` asks the OS to POST us copies of keyboard input even when we are not
//! the foreground window. We never sit in the input path — we cannot intercept, cannot
//! suppress, cannot even see input destined for a more-privileged (elevated) process.
//! That is the same API games use for input, and it needs no DLL injection and no TCC-style
//! permission grant. Microsoft's own "Using Raw Input" sample registers keyboard input on a
//! message-only (`HWND_MESSAGE`) window with `RIDEV_INPUTSINK`, which is exactly this.
//!
//! Two things fall away versus the macOS module, both on purpose:
//!   • No copy-gate. On macOS the double-tap ⌥ is gated behind a recent ⌘C because Claude
//!     Desktop's quick-entry fires on the SAME gesture and we must not steal it. Windows
//!     has no such collision on double-tap Ctrl, so gating would only add a "you must Ctrl+C
//!     first or nothing happens" failure mode — and, as the earlier Windows notes warned,
//!     a Ctrl-keyed gate is awkward because Ctrl is also the copy modifier. So there is no
//!     gate: a clean double-tap of Ctrl always fires. The user's model is still "copy, then
//!     double-tap", we just don't enforce the copy.
//!   • No suppression. Raw Input cannot delete an event, and there is nothing to delete —
//!     double-tapping Ctrl alone does nothing in ordinary apps. (Known exception: JetBrains
//!     IDEs bind double-Ctrl to "Run Anything"; a JetBrains user who wants that will also
//!     get our overlay. Documented tradeoff, same class as the Claude-Desktop overlap on
//!     macOS; the user can bind a different capture chord in Settings.)
//!
//! What counts as a "tap": a Ctrl press+release with NOTHING pressed in between and no
//! other modifier involved. We decide on the release edge (unlike the macOS press-edge
//! test) precisely because that is when we know the hold was clean — so Ctrl+C, Ctrl+V,
//! Ctrl+Shift+…, a held Ctrl used as a chord, none of them count. Two clean taps whose
//! gap is within the window are a capture.
//!
//! ⚠️ Like everything Windows in this crate, not one line here has run on the development
//! machine (a Mac with one Rust target). It is compiled by CI and proved by Ocean's install
//! pass, and is written to FAIL VISIBLY — a failed registration logs the OS error and the
//! thread exits leaving the Settings-bound capture chord as the way in, rather than
//! pretending a dead gesture is a live one (HANDOFF §3.2 #1 — "查不到" and "不需要" must
//! not be the same outcome).
#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use tauri::{AppHandle, Emitter, Runtime};

use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageTime, GetMessageW, RegisterClassW,
    HWND_MESSAGE, MSG, WM_INPUT, WNDCLASSW,
};

// Two Ctrl taps within this many ms are a double-tap. Matches the macOS module's 250ms
// (double_tap.rs — read the reasoning there, it is the same gesture on the other platform).
//
// ⚠️ 2026-08-25 (WORKPLAN §2.V4, Ocean): 500 → 250, changed in lockstep with the macOS
// module. This used to say it matched the Windows system double-click default too — it no
// longer does, on purpose: ⌥/Ctrl is a key the user also presses for its normal job, so the
// window is tuned against false positives rather than against a mouse-calibrated default.
//
// ⚠️ ⛔ These two constants must not drift apart. The value was changed on Ocean's report
// from the macOS build, and this file's path never runs on the development machine — a
// one-sided edit here is invisible to every local test AND leaves this comment lying.
const DOUBLE_TAP_WINDOW_MS: i32 = 250;

// Raw Input constants. Defined locally rather than imported so the module depends on the
// windows-sys FUNCTIONS and STRUCTS only, not on the exact path of every flag constant —
// these values are ABI-stable Win32 numbers (winuser.h), the same discipline double_tap.rs
// uses for its CG tap constants.
const RIDEV_INPUTSINK: u32 = 0x0000_0100; // deliver input even when not foreground
const RID_INPUT: u32 = 0x1000_0003; // GetRawInputData: give me the event data
const RIM_TYPEKEYBOARD: u32 = 1; // RAWINPUTHEADER.dwType for a keyboard event
const RI_KEY_BREAK: u16 = 0x01; // RAWKEYBOARD.Flags bit: this is a key-up
const HID_USAGE_PAGE_GENERIC: u16 = 0x01;
const HID_USAGE_GENERIC_KEYBOARD: u16 = 0x06;

// Virtual-key codes (winuser.h), also defined locally for the same reason. Raw Input reports
// the generic VK_CONTROL for either Ctrl; the L/R specifics are accepted too in case a
// layout/driver reports them, so "either Ctrl key" is honoured the way "either ⌥" is on macOS.
const VK_CONTROL: u16 = 0x11;
const VK_LCONTROL: u16 = 0xA2;
const VK_RCONTROL: u16 = 0xA3;
const VK_SHIFT: u16 = 0x10;
const VK_LSHIFT: u16 = 0xA0;
const VK_RSHIFT: u16 = 0xA1;
const VK_MENU: u16 = 0x12; // Alt
const VK_LMENU: u16 = 0xA4;
const VK_RMENU: u16 = 0xA5;
const VK_LWIN: u16 = 0x5B;
const VK_RWIN: u16 = 0x5C;

fn is_ctrl(vk: u16) -> bool {
    vk == VK_CONTROL || vk == VK_LCONTROL || vk == VK_RCONTROL
}
fn is_shift(vk: u16) -> bool {
    vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT
}
fn is_alt(vk: u16) -> bool {
    vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU
}
fn is_win(vk: u16) -> bool {
    vk == VK_LWIN || vk == VK_RWIN
}

// The whole double-tap decision, kept as plain fields on the single message-loop thread —
// no atomics or statics, because DispatchMessage runs the handling inline on that one thread
// (this is the payoff of reading Raw Input in the loop instead of an extern "C" WndProc).
struct TapState {
    // GetMessageTime of the last clean Ctrl tap; paired with `have_first` because a real
    // message time can legitimately be 0.
    last_tap_ms: i32,
    have_first: bool,
    // Whether Ctrl is currently held — dedupes key-repeat makes into one press.
    ctrl_down: bool,
    // Set if a non-Ctrl key went down while Ctrl was held: this Ctrl is a chord, not a tap.
    other_key_since_ctrl_down: bool,
    // Set if another modifier was already held when Ctrl went down (⇧+Ctrl, Alt+Ctrl …).
    combo_at_press: bool,
    shift_down: bool,
    alt_down: bool,
    win_down: bool,
}

impl TapState {
    fn new() -> Self {
        TapState {
            last_tap_ms: 0,
            have_first: false,
            ctrl_down: false,
            other_key_since_ctrl_down: false,
            combo_at_press: false,
            shift_down: false,
            alt_down: false,
            win_down: false,
        }
    }

    // Feed one keyboard event. Returns true exactly when this event completes a clean
    // double-tap of Ctrl (i.e. the caller should fire the capture trigger).
    fn on_key(&mut self, vk: u16, is_break: bool) -> bool {
        if is_ctrl(vk) {
            if !is_break {
                // Press. Ignore auto-repeat (Ctrl already down).
                if !self.ctrl_down {
                    self.ctrl_down = true;
                    self.other_key_since_ctrl_down = false;
                    self.combo_at_press = self.shift_down || self.alt_down || self.win_down;
                }
                return false;
            }
            // Release.
            if !self.ctrl_down {
                return false;
            }
            self.ctrl_down = false;
            let clean = !self.other_key_since_ctrl_down && !self.combo_at_press;
            if !clean {
                // A chord released — cannot pair with a later tap.
                self.have_first = false;
                return false;
            }
            let now = unsafe { GetMessageTime() };
            if self.have_first {
                // wrapping_sub handles the ~49-day GetMessageTime rollover; a negative or
                // over-window gap just restarts the pairing with this tap as the new first.
                let gap = now.wrapping_sub(self.last_tap_ms);
                if (0..=DOUBLE_TAP_WINDOW_MS).contains(&gap) {
                    // Reset so a third quick tap doesn't chain off this one's timestamp.
                    self.have_first = false;
                    return true;
                }
                self.last_tap_ms = now;
            } else {
                self.last_tap_ms = now;
                self.have_first = true;
            }
            return false;
        }

        // A non-Ctrl key.
        if !is_break {
            if self.ctrl_down {
                self.other_key_since_ctrl_down = true;
            }
            // Any real keypress between the two Ctrl taps means this was not a bare
            // double-tap — drop a pending first tap.
            self.have_first = false;
        }
        // Track the other modifiers so `combo_at_press` can be judged on the next Ctrl press.
        if is_shift(vk) {
            self.shift_down = !is_break;
        } else if is_alt(vk) {
            self.alt_down = !is_break;
        } else if is_win(vk) {
            self.win_down = !is_break;
        }
        false
    }
}

pub fn install<R: Runtime>(app: AppHandle<R>) {
    // Its own thread: the Raw Input message pump below blocks on GetMessage forever, exactly
    // like the macOS module's dedicated CFRunLoop thread.
    std::thread::spawn(move || run(app));
}

fn run<R: Runtime>(app: AppHandle<R>) {
    let hwnd = match create_message_window() {
        Some(h) => h,
        None => return, // create_message_window already logged the OS error
    };

    // Register for background keyboard raw input targeted at our message-only window.
    let rid = RAWINPUTDEVICE {
        usUsagePage: HID_USAGE_PAGE_GENERIC,
        usUsage: HID_USAGE_GENERIC_KEYBOARD,
        dwFlags: RIDEV_INPUTSINK,
        hwndTarget: hwnd,
    };
    let ok = unsafe { RegisterRawInputDevices(&rid, 1, size_of::<RAWINPUTDEVICE>() as u32) };
    if ok == 0 {
        let err = unsafe { GetLastError() };
        eprintln!(
            "[double-tap-win] RegisterRawInputDevices failed (GetLastError {err}); \
             double-tap Ctrl is off — the Settings capture shortcut still works"
        );
        return;
    }
    eprintln!("[double-tap-win] Raw Input registered — double-tap Ctrl armed");

    let mut state = TapState::new();
    let mut msg: MSG = unsafe { zeroed() };
    loop {
        // hWnd null → all messages for this thread, which includes the WM_INPUT posted to our
        // window. Blocks until one arrives.
        let r = unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) };
        if r == 0 || r == -1 {
            // 0 = WM_QUIT, -1 = error. Either way the pump is done.
            break;
        }
        if msg.message == WM_INPUT {
            if let Some((vk, is_break)) = read_keyboard_event(msg.lParam as HRAWINPUT) {
                // 状态照喂(否则重新打开时手上是半截状态),只是不发出去。这边的 Raw Input 是
                // INPUTSINK,本来就只看不删,所以「暂停」在 Windows 上是纯粹的不触发。
                if state.on_key(vk, is_break) && !crate::capture::capture_disabled() {
                    eprintln!("[double-tap-win] TRIGGER (clean double-tap Ctrl)");
                    let _ = app.emit("capture-trigger", ());
                }
            }
        }
        // Let the default proc do its WM_INPUT cleanup (and handle anything else).
        unsafe { DispatchMessageW(&msg) };
    }
}

// Decode a WM_INPUT into (virtual key, is_break) for a keyboard event; None for anything
// that is not a keyboard event or that fails to read.
fn read_keyboard_event(hrawinput: HRAWINPUT) -> Option<(u16, bool)> {
    let mut raw: RAWINPUT = unsafe { zeroed() };
    let mut size = size_of::<RAWINPUT>() as u32;
    let res = unsafe {
        GetRawInputData(
            hrawinput,
            RID_INPUT,
            &mut raw as *mut RAWINPUT as *mut c_void,
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        )
    };
    // (u32)-1 signals an error; a keyboard record is fixed-size so a short read cannot happen
    // silently — either the whole record arrived or we treat it as nothing.
    if res == u32::MAX || raw.header.dwType != RIM_TYPEKEYBOARD {
        return None;
    }
    // SAFETY: dwType == RIM_TYPEKEYBOARD guarantees the keyboard arm of the union is active.
    let kb = unsafe { raw.data.keyboard };
    // VKey 0xFF is a Windows escape for fake/overrun keys — never a real Ctrl, so ignore it.
    if kb.VKey == 0xFF {
        return None;
    }
    Some((kb.VKey, kb.Flags & RI_KEY_BREAK != 0))
}

// A message-only window whose sole job is to be the RIDEV_INPUTSINK target. Its window proc
// is DefWindowProcW — we read Raw Input in the message loop, so the proc only needs to do
// default cleanup.
fn create_message_window() -> Option<HRAWINPUT> {
    // Wide, NUL-terminated class name.
    let class_name: Vec<u16> = "SpoolDoubleTapCtrl\0".encode_utf16().collect();
    let hinstance = unsafe { GetModuleHandleW(std::ptr::null()) };

    let mut wc: WNDCLASSW = unsafe { zeroed() };
    wc.lpfnWndProc = Some(DefWindowProcW);
    wc.hInstance = hinstance;
    wc.lpszClassName = class_name.as_ptr();
    // RegisterClassW returns 0 on failure; "already registered" also returns 0 with a
    // specific error, but install() runs once so that case does not arise here.
    let atom = unsafe { RegisterClassW(&wc) };
    if atom == 0 {
        let err = unsafe { GetLastError() };
        eprintln!("[double-tap-win] RegisterClassW failed (GetLastError {err})");
        return None;
    }

    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null(),
        )
    };
    if hwnd.is_null() {
        let err = unsafe { GetLastError() };
        eprintln!("[double-tap-win] CreateWindowExW(HWND_MESSAGE) failed (GetLastError {err})");
        return None;
    }
    Some(hwnd)
}
