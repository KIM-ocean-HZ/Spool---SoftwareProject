// =============================================================================
// The capture overlay's own process (2026-08-01, DESIGN_CAPTURE_HELPER_PROCESS)
// =============================================================================
//
// The capture toast used to be a second window of the main app. That cost the main
// window its place in the window stack: macOS layers windows per APPLICATION, so the
// instant the toast took the foreground (note-first) — or the user merely clicked it —
// every visible Spool window rode up over what they were reading. The only public way
// to hold the main window down was to park it below normal level, which is not "stay
// where you are" but "sink under everything", and it is what Ocean measured on
// 2026-08-01.
//
// Activation is per PROCESS, not per bundle (measured: three TextEdit processes, only
// the activated one moved). So the toast lives in a second process of this same binary,
// `spool --overlay`, and activating it leaves the main window exactly where it was.
//
// Shape (all of it approved in DESIGN_CAPTURE_HELPER_PROCESS §6):
//   - Same binary, second process — like `spool --mcp`. No extra bundle to sign/notarize.
//   - Started at launch and resident. Forking on the capture keypress would put a
//     webview cold start on the hot path and blow the <200ms keypress→toast budget.
//   - 🚨 It NEVER opens SQLite. `getDb()` runs migrateSchema + seedDefaults — two
//     processes doing that is the 2026-05-29 wipe's precondition rebuilt. The overlay's
//     five DB calls are proxied back to the main window over this channel, the SQL
//     plugin is not registered here, and capabilities/overlay.json no longer grants any
//     sql: permission, so a stray Database.load() fails loudly instead of quietly
//     becoming a second writer.
//   - It needs no TCC grant of its own: the main process, which already holds
//     Accessibility, activates it by pid via ax_set_frontmost.
//
// Wire protocol: one JSON object per line, main→helper on the helper's stdin,
// helper→main on its stdout — the same shape `--mcp` uses. stderr stays a plain log on
// both sides, so keep logging with eprintln! and never println! in helper code: a stray
// stdout line would be read as a message (the parser skips what it can't understand,
// but silently losing a real message is not a trade worth making).

use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

// Argv switch that turns this binary into the overlay process (main.rs branches on it
// before the Tauri builder, exactly like --mcp).
pub const HELPER_ARG: &str = "--overlay";

// Window label. Unchanged from when the overlay was a window of the main app, so
// capabilities/overlay.json still applies to it.
pub const WINDOW_LABEL: &str = "overlay";

// Event names shared with the frontend — keep in step with src/lib/capture/overlayProtocol.ts.
const ACTION_EVENT: &str = "overlay:action";
const DB_REQUEST_EVENT: &str = "overlay:db-request";
const LANGUAGE_EVENT: &str = "overlay:language";

// =============================================================================
// Main-process side: spawn, supervise, talk to the helper
// =============================================================================

struct Helper {
    stdin: ChildStdin,
    pid: u32,
}

static HELPER: Mutex<Option<Helper>> = Mutex::new(None);

// A helper that dies again this soon after starting is failing, not crashing.
const HELPER_MIN_LIFETIME: Duration = Duration::from_secs(5);
const MAX_FAST_FAILURES: u32 = 3;
const RESPAWN_DELAY: Duration = Duration::from_millis(500);

// pid of the live helper, for ax_set_frontmost. None while it is down.
pub fn helper_pid() -> Option<i32> {
    HELPER.lock().unwrap().as_ref().map(|h| h.pid as i32)
}

// Send one message to the helper. False means the helper is down — every caller treats
// that as "no toast this time", never as a reason to lose the capture: the block is
// already committed by the main window before the toast is ever asked for.
pub fn send(msg: &serde_json::Value) -> bool {
    let mut guard = HELPER.lock().unwrap();
    let Some(helper) = guard.as_mut() else {
        return false;
    };
    let line = format!("{msg}\n");
    if helper.stdin.write_all(line.as_bytes()).is_err() || helper.stdin.flush().is_err() {
        // Broken pipe: the helper is gone but its stdout EOF may not have been noticed
        // yet. Drop the handle now so nothing else writes into a dead pipe; the
        // supervisor thread restarts it.
        *guard = None;
        return false;
    }
    true
}

// Start the helper and keep it alive for the life of the app. Called once from setup().
pub fn spawn_helper<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || supervise(app));
}

fn supervise<R: Runtime>(app: AppHandle<R>) {
    let mut fast_failures = 0u32;
    loop {
        let started = Instant::now();
        if let Err(e) = run_once(&app) {
            eprintln!("[overlay] helper could not start: {e}");
        }
        *HELPER.lock().unwrap() = None;
        if started.elapsed() < HELPER_MIN_LIFETIME {
            fast_failures += 1;
        } else {
            fast_failures = 0;
        }
        if fast_failures >= MAX_FAST_FAILURES {
            eprintln!(
                "[overlay] helper failed {MAX_FAST_FAILURES}x in a row — giving up. \
                 Captures still save to the library; they just won't show a toast."
            );
            return;
        }
        std::thread::sleep(RESPAWN_DELAY);
    }
}

// Spawn one helper and pump its stdout until EOF (i.e. until it exits).
fn run_once<R: Runtime>(app: &AppHandle<R>) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    // stderr is inherited on purpose: helper logs land in the same place as ours, which
    // is what makes `open --stderr err.log -a Spool` a complete picture.
    let mut child = Command::new(exe)
        .arg(HELPER_ARG)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    let stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let pid = child.id();
    *HELPER.lock().unwrap() = Some(Helper { stdin, pid });
    eprintln!("[overlay] helper started (pid {pid})");

    for line in BufReader::new(stdout).lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[overlay] helper stdout read failed: {e}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(msg) => on_message(app, &msg),
            // Not a message — most likely a framework warning that reached stdout.
            Err(_) => eprintln!("[overlay] helper stdout (unparsed): {trimmed}"),
        }
    }
    let status = child.wait();
    eprintln!("[overlay] helper exited: {status:?}");
    Ok(())
}

fn on_message<R: Runtime>(app: &AppHandle<R>, msg: &serde_json::Value) {
    match msg.get("t").and_then(serde_json::Value::as_str).unwrap_or("") {
        // The toast is on screen — safe to hand it the foreground now (macOS), or to hear
        // whether it managed to take it itself (Windows; a missing field reads as "no").
        "shown" => crate::capture::on_overlay_shown(
            app,
            msg.get("focused").and_then(serde_json::Value::as_bool).unwrap_or(false),
        ),
        // Every dismiss path (Enter / Esc / ✕ / click-outside / the 8s dwell) funnels
        // here so focus restoration happens BEFORE the window is ordered out.
        "hide" => crate::capture::on_overlay_hide(app),
        "resize" => {
            if let Some(h) = msg.get("height").and_then(serde_json::Value::as_f64) {
                crate::capture::on_overlay_resize(h);
            }
        }
        "disarm" => crate::capture::on_overlay_disarm(),
        "action" => {
            let payload = msg.get("payload").cloned().unwrap_or(serde_json::Value::Null);
            let _ = app.emit_to("main", ACTION_EVENT, payload);
        }
        // §3.3: the overlay's DB work, executed by the main window's single connection.
        "db" => {
            let _ = app.emit_to("main", DB_REQUEST_EVENT, msg.clone());
        }
        other => eprintln!("[overlay] unknown message from helper: {other}"),
    }
}

// The main window's answer to a proxied DB call, on its way back to the overlay.
#[tauri::command]
pub fn overlay_db_reply(
    id: u64,
    ok: bool,
    result: Option<serde_json::Value>,
    error: Option<String>,
) {
    send(&serde_json::json!({
        "t": "db-reply",
        "id": id,
        "ok": ok,
        "result": result,
        "error": error,
    }));
}

// =============================================================================
// Helper-process side: `spool --overlay`
// =============================================================================

// Everything below runs in the SECOND process. It owns exactly one window and no
// database, tray, shortcut or permission of its own.

// Set while this process is in the NSApp-hidden state (see the "hide-now" handler).
#[cfg(target_os = "macos")]
static APP_HIDDEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "macos")]
use std::sync::atomic::Ordering;

pub fn run_helper(mut ctx: tauri::Context<tauri::Wry>) {
    // The config declares only the main window, which this process must not create.
    ctx.config_mut().app.windows.clear();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            hide_capture_overlay,
            resize_capture_overlay,
            disarm_capture_dismiss,
            overlay_db_request,
        ])
        .setup(|app| {
            // No Dock icon and no menu bar — the user must not see a second Spool in the
            // Dock. Accessory apps can still be activated and still receive keystrokes,
            // which is the whole point of note-first.
            #[cfg(target_os = "macos")]
            if let Err(e) = app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory) {
                eprintln!("[overlay] set_activation_policy failed: {e}");
            }

            tauri::WebviewWindowBuilder::new(
                app,
                WINDOW_LABEL,
                tauri::WebviewUrl::App("overlay.html".into()),
            )
            .title("Spool Capture Overlay")
            .inner_size(
                crate::capture::OVERLAY_WIDTH as f64,
                crate::capture::OVERLAY_HEIGHT_COLLAPSED as f64,
            )
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .shadow(false)
            .accept_first_mouse(true)
            .build()?;

            // The overlay's UI emits `overlay:action` exactly as it did when it was a
            // window of the main app; relaying it here is what keeps that code unchanged.
            app.listen(ACTION_EVENT, |event| {
                let payload = serde_json::from_str::<serde_json::Value>(event.payload())
                    .unwrap_or(serde_json::Value::Null);
                out(&serde_json::json!({ "t": "action", "payload": payload }));
            });

            let handle = app.handle().clone();
            std::thread::spawn(move || read_main_process(handle));
            Ok(())
        })
        .run(ctx)
        .expect("error while running the capture overlay process");
}

// One line of JSON to the main process.
fn out(msg: &serde_json::Value) {
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{msg}");
    let _ = stdout.flush();
}

// Pump the main process's messages until stdin hits EOF. EOF means the parent is gone
// (its end of the pipe closed with it), which is our cue to exit rather than linger as
// an orphan holding a floating window.
fn read_main_process(app: AppHandle) {
    for line in BufReader::new(std::io::stdin()).lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(msg) => on_main_message(&app, &msg),
            Err(e) => eprintln!("[overlay] undecodable message from main: {e}"),
        }
    }
    eprintln!("[overlay] main process is gone — exiting");
    std::process::exit(0);
}

fn on_main_message(app: &AppHandle, msg: &serde_json::Value) {
    let kind = msg.get("t").and_then(serde_json::Value::as_str).unwrap_or("");
    match kind {
        // Sizing/positioning is decided by the main process (it also arms the
        // click-outside watch against that exact frame), so this just applies it.
        "show" | "notice" | "undo" => {
            let Some(win) = app.get_webview_window(WINDOW_LABEL) else {
                return;
            };
            let num = |k: &str| msg.get(k).and_then(serde_json::Value::as_f64).unwrap_or(0.0);
            let _ = win.set_size(tauri::LogicalSize::new(num("w"), num("h")));
            let _ = win.set_position(tauri::LogicalPosition::new(num("x"), num("y")));
            // A hidden app's windows stay off screen however they are ordered, so undo
            // the step-down from the previous dismiss before showing anything.
            #[cfg(target_os = "macos")]
            if APP_HIDDEN.swap(false, Ordering::SeqCst) {
                let _ = app.show();
            }
            // The overlay runs its own i18n with no settings store of its own (see
            // §3.3 — a second writer to settings.json is the same class of hazard as a
            // second writer to the database), so the language rides in with each show.
            if let Some(lang) = ui_language(app) {
                let _ = app.emit_to(WINDOW_LABEL, LANGUAGE_EVENT, lang);
            }
            let event = match kind {
                "show" => "overlay:show",
                "notice" => "overlay:notice",
                _ => "overlay:undo",
            };
            let payload = msg.get("payload").cloned().unwrap_or(serde_json::Value::Null);
            let _ = app.emit_to(WINDOW_LABEL, event, payload);
            let _ = win.show();
            if kind == "show" {
                // Only the capture toast takes the foreground; a notice and an undo card
                // have nothing to type into, so they must not disturb the user's app.
                //
                // Windows: the main process has already spent its hotkey-earned right on
                // this process (win32.rs), so `set_focus` is allowed here and nowhere else.
                // What goes back is what the OS says afterwards, not what the call returned:
                // if the grant had already lapsed the window comes up unfocused, and the
                // main process needs to know that to claim the undo key globally instead.
                #[cfg(target_os = "windows")]
                let focused = if msg.get("focus").and_then(serde_json::Value::as_bool)
                    == Some(true)
                {
                    let _ = win.set_focus();
                    crate::win32::holds_foreground()
                } else {
                    false
                };
                #[cfg(not(target_os = "windows"))]
                let focused = false;
                out(&serde_json::json!({ "t": "shown", "focused": focused }));
            }
        }
        // The main process has already handed the foreground back — safe to order out.
        "hide-now" => {
            // …except on Windows, where handing it back is THIS process's job: Windows only
            // honours SetForegroundWindow from the process that currently holds it, and
            // that is this one whenever the toast took the keyboard. Before the hide, so the
            // user's app is already in front when the toast disappears rather than the OS
            // picking the next window itself.
            #[cfg(target_os = "windows")]
            if let Some(hwnd) = msg.get("restore").and_then(serde_json::Value::as_i64) {
                crate::win32::focus_window(hwnd as isize);
            }
            if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
                let _ = win.hide();
            }
            // `release`: nobody took the foreground back, so we may still be holding it
            // with no window left to type into. NSApp hide: steps down AND hands the
            // foreground to the next app in order — the one the user clicked away from.
            #[cfg(target_os = "macos")]
            if msg.get("release").and_then(serde_json::Value::as_bool) == Some(true)
                && app.hide().is_ok()
            {
                APP_HIDDEN.store(true, Ordering::SeqCst);
            }
        }
        "dismiss" => {
            let _ = app.emit_to(WINDOW_LABEL, "overlay:dismiss", ());
        }
        "source-update" => {
            let payload = msg.get("payload").cloned().unwrap_or(serde_json::Value::Null);
            let _ = app.emit_to(WINDOW_LABEL, "overlay:source-update", payload);
        }
        "db-reply" => {
            let _ = app.emit_to(WINDOW_LABEL, "overlay:db-reply", msg.clone());
        }
        other => eprintln!("[overlay] unknown message from main: {other}"),
    }
}

// The UI language the user picked, read straight from settings.json (the same file
// tauri-plugin-store writes in the main process) — read-only, never written here.
// None when they never picked one, which leaves the overlay on its system-locale default.
fn ui_language(app: &AppHandle) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    let raw = std::fs::read_to_string(dir.join("settings.json")).ok()?;
    let v = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    v.get("language")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

// --- Commands the overlay UI invokes. Names match what it invoked when it was a window
// --- of the main app, so the frontend's call sites are unchanged.

#[tauri::command]
fn hide_capture_overlay() {
    // Not a local hide: the main process owns focus restoration and has to run it
    // BEFORE the window is ordered out, so it sends "hide-now" back when it's ready.
    out(&serde_json::json!({ "t": "hide" }));
}

#[tauri::command]
fn resize_capture_overlay(app: AppHandle, height: u32) {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.set_size(tauri::LogicalSize::new(
            crate::capture::OVERLAY_WIDTH as f64,
            height as f64,
        ));
    }
    // Keep the main process's click-outside frame in sync with the real height.
    out(&serde_json::json!({ "t": "resize", "height": height }));
}

#[tauri::command]
fn disarm_capture_dismiss() {
    out(&serde_json::json!({ "t": "disarm" }));
}

// §3.3: the overlay never touches SQLite. Each DB call becomes a request the main
// window executes on its one connection; the answer comes back as "db-reply".
#[tauri::command]
fn overlay_db_request(id: u64, op: String, args: serde_json::Value) {
    out(&serde_json::json!({ "t": "db", "id": id, "op": op, "args": args }));
}
