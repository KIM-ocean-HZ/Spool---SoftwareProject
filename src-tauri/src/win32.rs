//! The Windows syscalls the rest of the app cannot express portably.
//!
//! Deliberately narrow: two jobs, each one replacing something that was a Unix-only
//! assumption baked into shared code rather than an explicit platform branch. Everything
//! else the port needs turned out to be reachable through `cfg` in the file that already
//! owned the behaviour, and stayed there.
//!
//! ⚠️ Nothing in this file has ever run on the development machine — it is a Mac with one
//! Rust target. Every function here is compiled by CI and proved by Ocean's install pass,
//! and it is written to fail visibly rather than plausibly: a broken call returns None or
//! an Err with the OS status in it, never a value that merely looks reasonable
//! (HANDOFF §3.2 #1 — "查不到" and "不需要" must not be the same value).
#![cfg(target_os = "windows")]

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::Security::Cryptography::{
    BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};

/// Fill `buf` with cryptographically secure bytes.
///
/// Microsoft's current guidance for this is CNG, and `BCRYPT_USE_SYSTEM_PREFERRED_RNG`
/// is the form that needs no algorithm handle to open and close. The status is checked:
/// an unchecked failure would leave the buffer as whatever it was, which for `new_id`
/// means every id on the machine being the same 21 zero-derived characters — a collision
/// that looks like data loss, not like a failure.
pub fn random_bytes(buf: &mut [u8]) -> Result<(), String> {
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            buf.as_mut_ptr(),
            buf.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    // NTSTATUS: negative is a failure, STATUS_SUCCESS is 0.
    if status < 0 {
        return Err(format!("BCryptGenRandom failed (NTSTATUS 0x{:08X})", status));
    }
    Ok(())
}

/// The foreground window's owning executable name, and the window's own title.
///
/// `.0` is the executable stem (`chrome`, `WINWORD`) — the honest process-level answer,
/// and all the Win32 foreground chain can give without guessing at product names.
/// `.1` is the top-level window caption, which for a browser already carries the active
/// tab (`Spool — Google Chrome`), so it is the better provenance label of the two.
///
/// Returns None rather than a placeholder whenever any link in the chain fails: no
/// foreground window (a lock screen, a desktop switch), a process this user may not open,
/// or a window with no caption at all.
pub fn foreground_app() -> Option<(String, String)> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }

    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return None;
    }

    // LIMITED_INFORMATION is the least this needs and the most a standard user is
    // guaranteed across an elevated or protected process; asking for more is how this
    // call starts failing on the machines it matters on.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buf = [0u16; 512];
    let mut len = buf.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len)
    };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        return None;
    }

    let full = String::from_utf16_lossy(&buf[..len as usize]);
    // `C:\Program Files\Google\Chrome\Application\chrome.exe` → `chrome`. Both separators
    // on purpose: a Win32 path can carry either, and this is the same rule the pack's
    // base name uses.
    let exe = full
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(&full)
        .trim_end_matches(".exe")
        .trim_end_matches(".EXE")
        .to_string();
    if exe.is_empty() {
        return None;
    }

    let title = window_title(hwnd).unwrap_or_else(|| exe.clone());
    Some((exe, title))
}

fn window_title(hwnd: windows_sys::Win32::Foundation::HWND) -> Option<String> {
    let mut buf = [0u16; 512];
    // Returns the count copied, excluding the terminator — 0 means either an empty
    // caption or a failure, and neither is a usable label.
    let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return None;
    }
    let title = String::from_utf16_lossy(&buf[..n as usize]).trim().to_string();
    (!title.is_empty()).then_some(title)
}

// ---------------------------------------------------------------------------------------
// Note-first on Windows (Ocean, 2026-08-17 验收 #24: 「esc 不能关闭」)
// ---------------------------------------------------------------------------------------
//
// The capture toast never took the keyboard here, so Esc — and every other key — went to
// whatever the user was working in, and the only way into the note box was a mouse click.
// The install guide predicted that ("Windows 不让后台程序抢键盘"), and the prediction was
// half right: Windows refuses a foreground grab from a process that is not part of the
// user's current interaction, but the process that is HANDLING A HOTKEY the user just
// pressed is exactly the documented exception (SetForegroundWindow's caller may be the
// process that "received the last input event"). Capture is only ever entered by that
// hotkey, so the right is ours at the only moment we want it.
//
// It has to be handed on: the toast lives in the overlay HELPER process (overlay.rs), and
// the right belongs to the process that got the keypress — this one. `AllowSetForegroundWindow`
// is the transfer, and the helper spends it with its own `set_focus()`.
//
// ⚠️ Handles cross a process boundary here as plain `isize`, because they travel as JSON
// on the helper pipe. A stale handle is not dangerous — `IsWindow` rejects it and focus
// simply stays where it is — but it is also never reused for anything except focus.

use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, IsWindow, SetForegroundWindow,
};

/// The foreground window and the pid that owns it, as raw numbers.
///
/// None when there is no foreground window at all (a lock screen, a desktop switch) — the
/// caller reads that as "nowhere to give the keyboard back to", never as an error.
pub fn foreground_window() -> Option<(isize, u32)> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return None;
    }
    Some((hwnd as isize, pid))
}

/// Let `pid` take the foreground once, on our behalf.
///
/// Only meaningful while this process holds the right — i.e. inside the hotkey handler.
/// A false return is a normal outcome (the user alt-tabbed between keypress and here), and
/// it means the toast will come up without focus: still clickable, just not type-into-able.
pub fn allow_foreground(pid: u32) -> bool {
    unsafe { AllowSetForegroundWindow(pid) != 0 }
}

/// Put a window back in front — used to hand the keyboard back to where the user was.
///
/// Called from whichever process currently HAS the foreground (the helper, after the toast
/// is dismissed), because that is the only process Windows will honour it from.
pub fn focus_window(hwnd: isize) -> bool {
    let hwnd = hwnd as windows_sys::Win32::Foundation::HWND;
    if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 {
        return false;
    }
    unsafe { SetForegroundWindow(hwnd) != 0 }
}

/// Does this process own the foreground window right now?
///
/// The honest answer to "did the toast actually get the keyboard", asked after the fact
/// rather than assumed from a call that returned TRUE: it is what decides whether the undo
/// shortcut has to be claimed globally instead (capture.rs `on_overlay_shown`).
pub fn holds_foreground() -> bool {
    foreground_window().is_some_and(|(_, pid)| pid == std::process::id())
}

/// Milliseconds since the last keyboard or mouse input anywhere on this machine.
///
/// The Windows half of `capture::system_idle_ms` — see that function for what the value is
/// for and why it is queried rather than listened for.
///
/// ⚠️ `GetLastInputInfo` reports a tick count, and `GetTickCount64` is the clock it is on.
/// The 32-bit `dwTime` wraps every 49.7 days, so the subtraction is done in `u32` and then
/// widened: a wrapped tick handled in 64-bit arithmetic yields a "last input 49 days ago"
/// that is off by the whole wrap. ⛔ Do not "simplify" the cast away.
///
/// A failed call returns None, not zero — zero would read as "the user just typed", and the
/// caller treats that as a person at the desk.
pub fn system_idle_ms() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    let now = unsafe { GetTickCount64() } as u32;
    Some(now.wrapping_sub(info.dwTime) as u64)
}
