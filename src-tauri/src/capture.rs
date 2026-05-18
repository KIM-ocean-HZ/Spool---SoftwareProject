use serde::{Deserialize, Serialize};
use std::sync::mpsc;
#[cfg(target_os = "macos")]
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::time::Instant;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, Runtime,
};

// Short-lived cache for the frontmost-app query. Each rapid double-tap capture would
// otherwise spawn its own osascript subprocess — across 5+ captures/sec the kernel
// schedules them aggressively, which lengthens CGEventTap callback latency on our
// run-loop thread and breaks the double-tap window detection. 2s is tight enough that
// a user who switches apps gets a fresh value within the next-capture window.
#[cfg(target_os = "macos")]
const FRONTMOST_CACHE_MS: u128 = 2000;

// Foreground-app attribution, split into two fields so one query can serve both uses
// without conflict:
//   - `app`    : the plain app name, fed to `tell application "X" to activate` for
//                focus-restore — must stay a valid app name.
//   - `source` : the provenance label stored on the block. For Safari / Chromium
//                browsers this is the active tab's title; for everything else (and
//                whenever the tab title can't be read) it falls back to the app name.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundApp {
    pub app: String,
    pub source: String,
}

#[cfg(target_os = "macos")]
struct FrontmostCache {
    value: Option<ForegroundApp>,
    at: Instant,
}

#[cfg(target_os = "macos")]
static FRONTMOST_CACHE: Mutex<Option<FrontmostCache>> = Mutex::new(None);

// Foreground-app attribution. The AppleScript carries a built-in `with timeout` so a
// stuck System Events bridge can't freeze capture, and the outer thread+channel adds a
// hard wall-clock cap so even an unkillable osascript can't block beyond the budget.
// Caller (JS) also has its own 800ms race, but defense in depth keeps the §16 hot-path
// SLO ("<200ms keypress → toast") realistic even when this returns slowly.
#[tauri::command]
pub fn get_foreground_app() -> Option<ForegroundApp> {
    #[cfg(target_os = "macos")]
    {
        let now = Instant::now();
        // Cache hit: avoid spawning a fresh osascript subprocess. Critical for
        // rapid-fire captures — see FRONTMOST_CACHE_MS comment for why this matters
        // for double-tap CGEventTap reliability.
        if let Ok(cache) = FRONTMOST_CACHE.lock() {
            if let Some(c) = cache.as_ref() {
                if now.duration_since(c.at).as_millis() < FRONTMOST_CACHE_MS {
                    return c.value.clone();
                }
            }
        }
        // Cache miss: query osascript (with the existing thread+timeout guard so
        // a stuck osascript can't freeze the calling IPC thread). The budget allows
        // for two sequential osascript calls — frontmost process, then browser tab.
        let (tx, rx) = mpsc::channel::<Option<ForegroundApp>>();
        thread::spawn(move || {
            let _ = tx.send(macos_frontmost_via_osascript());
        });
        let result = rx.recv_timeout(Duration::from_millis(2200)).ok().flatten();
        // Update cache even on None — a known-broken osascript shouldn't be re-tried
        // every capture; let it cool down for FRONTMOST_CACHE_MS.
        if let Ok(mut cache) = FRONTMOST_CACHE.lock() {
            *cache = Some(FrontmostCache {
                value: result.clone(),
                at: now,
            });
        }
        result
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn macos_frontmost_via_osascript() -> Option<ForegroundApp> {
    let app = macos_frontmost_process_name()?;
    // Browser tab title when available, else the app name. A failed/absent tab read
    // (no window, Automation permission not yet granted, unsupported app) just falls
    // back — capture still gets a usable source.
    let source = browser_tab_title(&app).unwrap_or_else(|| app.clone());
    Some(ForegroundApp { app, source })
}

#[cfg(target_os = "macos")]
fn macos_frontmost_process_name() -> Option<String> {
    use std::process::Command;
    let output = Command::new("osascript")
        .args([
            "-e",
            "with timeout of 1 seconds",
            "-e",
            "tell application \"System Events\" to get name of first process whose frontmost is true",
            "-e",
            "end timeout",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8(output.stdout).ok()?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// Read the active tab's title for a supported browser. Returns None for any other app,
// when the browser has no open window, or when macOS Automation permission hasn't been
// granted for that browser yet (first read triggers the system prompt). The browser
// name reaching `tell application` is always one of the hard-coded match arms — never
// raw osascript output — so there is no command-injection surface.
#[cfg(target_os = "macos")]
fn browser_tab_title(app: &str) -> Option<String> {
    use std::process::Command;
    let script: String = match app {
        "Safari" => {
            "tell application \"Safari\" to get name of current tab of front window".to_string()
        }
        "Google Chrome" | "Microsoft Edge" | "Brave Browser" | "Arc" => {
            format!("tell application \"{app}\" to get title of active tab of front window")
        }
        _ => return None,
    };
    let output = Command::new("osascript")
        .args(["-e", "with timeout of 1 seconds", "-e", &script, "-e", "end timeout"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let title = String::from_utf8(output.stdout).ok()?;
    let trimmed = title.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[derive(Debug, Deserialize)]
pub struct TrayTarget {
    pub id: String,
    pub label: String,
    pub is_current: bool,
}

const TRAY_ID: &str = "main";
const SET_TARGET_PREFIX: &str = "set_target:";

#[tauri::command]
pub fn set_tray_targets<R: Runtime>(
    app: AppHandle<R>,
    current_label: String,
    targets: Vec<TrayTarget>,
) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("tray not found")?;
    let menu = build_tray_menu(&app, &current_label, &targets).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    current_label: &str,
    targets: &[TrayTarget],
) -> tauri::Result<tauri::menu::Menu<R>> {
    let label_text = if current_label.is_empty() {
        "当前目标：（无）".to_string()
    } else {
        format!("当前目标:  {current_label}")
    };
    let current_item = MenuItemBuilder::with_id("current_label", label_text)
        .enabled(false)
        .build(app)?;

    let mut switch = SubmenuBuilder::new(app, "切换捕捉目标");
    if targets.is_empty() {
        let empty = MenuItemBuilder::with_id("targets_empty", "（暂无脉络）")
            .enabled(false)
            .build(app)?;
        switch = switch.item(&empty);
    } else {
        for t in targets {
            let marker = if t.is_current { "● " } else { "    " };
            let label = format!("{marker}{}", t.label);
            let id = format!("{SET_TARGET_PREFIX}{}", t.id);
            let item = MenuItemBuilder::with_id(id, label).build(app)?;
            switch = switch.item(&item);
        }
    }
    let switch_sub = switch.build()?;

    let open = MenuItemBuilder::with_id("open", "打开 Spool").build(app)?;
    let new_thread = MenuItemBuilder::with_id("new_thread", "新建脉络").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "设置").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出 Spool").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&current_item)
        .separator()
        .item(&switch_sub)
        .separator()
        .items(&[&open, &new_thread, &settings])
        .separator()
        .item(&quit)
        .build()?;
    Ok(menu)
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(thread_id) = id.strip_prefix(SET_TARGET_PREFIX) {
        let _ = app.emit(
            "tray-action",
            serde_json::json!({ "kind": "set_target", "id": thread_id }),
        );
        show_main_window(app);
        return;
    }
    match id {
        "open" => show_main_window(app),
        "new_thread" => {
            show_main_window(app);
            let _ = app.emit("tray-action", serde_json::json!({ "kind": "new_thread" }));
        }
        "settings" => {
            show_main_window(app);
            let _ = app.emit("tray-action", serde_json::json!({ "kind": "settings" }));
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(desktop)]
pub fn capture_accelerator() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL | Modifiers::SHIFT;
    Shortcut::new(Some(mods), Code::KeyC)
}

// Global full-text-search shortcut (PLAN_EN.md §9.10 / Phase 7): ⌘⇧F on macOS,
// Ctrl+⇧F elsewhere. Registered and re-registered alongside the capture shortcut;
// pressing it surfaces the main window and emits `search-trigger` so the in-window
// search overlay opens even when Spool was hidden.
#[cfg(desktop)]
pub fn search_accelerator() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL | Modifiers::SHIFT;
    Shortcut::new(Some(mods), Code::KeyF)
}

// =============================================================================
// Runtime-configurable shortcuts (PLAN_EN.md §19.1)
// =============================================================================
//
// The capture/search accelerators are user-configurable from the Settings panel.
// `ShortcutConfig` is Tauri managed state holding the *currently registered* pair —
// the global-shortcut handler matches presses against it (not the hard-coded
// `*_accelerator()` defaults), and `set_shortcuts` swaps the registration at runtime.

#[cfg(desktop)]
pub struct ShortcutConfig {
    pub capture: std::sync::Mutex<tauri_plugin_global_shortcut::Shortcut>,
    pub search: std::sync::Mutex<tauri_plugin_global_shortcut::Shortcut>,
}

// Parse an accelerator in the frontend's grammar (see src/lib/capture/shortcut.ts):
// `+`-joined lowercase modifier tokens then a W3C KeyboardEvent.code, e.g.
// "meta+shift+KeyC". Kept deliberately small — we control both ends of this string.
#[cfg(desktop)]
fn parse_shortcut(spec: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for tok in spec.split('+').map(str::trim).filter(|t| !t.is_empty()) {
        match tok.to_ascii_lowercase().as_str() {
            "meta" | "super" | "cmd" | "command" => mods |= Modifiers::SUPER,
            "control" | "ctrl" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            _ => {
                if code.is_some() {
                    return Err(format!("shortcut has more than one key: {spec}"));
                }
                // Code::from_str is case-sensitive — pass the original-case token.
                code = Some(Code::from_str(tok).map_err(|_| format!("unknown key: {tok}"))?);
            }
        }
    }
    let code = code.ok_or_else(|| format!("shortcut has no key: {spec}"))?;
    if mods.is_empty() {
        return Err(format!("shortcut needs a modifier: {spec}"));
    }
    Ok(Shortcut::new(Some(mods), code))
}

// Re-register the global capture/search shortcuts at runtime (§19.1). Unregisters the
// current pair and installs the new one; on any failure the old pair is restored, so a
// rejected accelerator never leaves the user without a working capture shortcut. The
// frontend persists the value only after this returns Ok.
#[tauri::command]
pub fn set_shortcuts<R: Runtime>(
    app: AppHandle<R>,
    capture: String,
    search: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let new_capture = parse_shortcut(&capture)?;
        let new_search = parse_shortcut(&search)?;
        if new_capture == new_search {
            return Err("两个快捷键不能相同".into());
        }
        let cfg = app.state::<ShortcutConfig>();
        let old_capture = *cfg.capture.lock().unwrap();
        let old_search = *cfg.search.lock().unwrap();
        if new_capture == old_capture && new_search == old_search {
            return Ok(());
        }
        let gs = app.global_shortcut();
        // Drop both, then install both — handles the case where only one changed and
        // the case where the two were swapped, without a transient double-registration.
        let _ = gs.unregister(old_capture);
        let _ = gs.unregister(old_search);
        if let Err(e) = gs.register(new_capture) {
            let _ = gs.register(old_capture);
            let _ = gs.register(old_search);
            return Err(format!("无法注册捕捉快捷键：{e}"));
        }
        if let Err(e) = gs.register(new_search) {
            let _ = gs.unregister(new_capture);
            let _ = gs.register(old_capture);
            let _ = gs.register(old_search);
            return Err(format!("无法注册搜索快捷键：{e}"));
        }
        *cfg.capture.lock().unwrap() = new_capture;
        *cfg.search.lock().unwrap() = new_search;
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, capture, search);
        Err("global shortcuts are desktop-only".into())
    }
}

// Test that macOS Automation permission is granted for a given browser (§19.7).
// Runs a benign read against the app via System Events — first call from a given
// browser triggers the standard permission prompt, subsequent calls reflect the
// current grant state. The browser name is matched against a hard-coded allowlist
// before reaching `tell application`, so there is no command-injection surface.
#[tauri::command]
pub fn probe_browser_automation(name: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Allowlist mirrors browser_tab_title's match arms — only browsers Spool can
        // actually read source from need a test surface.
        let script = match name.as_str() {
            "Safari" => "tell application \"Safari\" to get name of front window",
            "Google Chrome" | "Microsoft Edge" | "Brave Browser" | "Arc" => {
                // Unsupported safely — we only need to *trigger* the permission prompt;
                // chromium browsers all accept the same `title of active tab` form.
                return run_browser_probe(&name);
            }
            _ => return Err("不支持的浏览器".into()),
        };
        let output = Command::new("osascript")
            .args(["-e", "with timeout of 2 seconds", "-e", script, "-e", "end timeout"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        Err("仅 macOS 需要授权".into())
    }
}

#[cfg(target_os = "macos")]
fn run_browser_probe(app: &str) -> Result<(), String> {
    use std::process::Command;
    let script = format!("tell application \"{app}\" to get title of active tab of front window");
    let output = Command::new("osascript")
        .args(["-e", "with timeout of 2 seconds", "-e", &script, "-e", "end timeout"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// Classify a dropped filesystem path as `file` or `folder` so the frontend can pick
// the right attachment kind and the right icon. Used by the drag-drop bridge in
// LogView (Phase 6). Returns `file` when the path doesn't exist — the caller will
// still persist it (paths can legitimately point to artifacts the user just moved)
// and openTarget will report the missing-target message at click time.
#[tauri::command]
pub fn path_is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

#[derive(Debug, Clone, Serialize)]
pub struct WebviewPoint {
    pub x: f64,
    pub y: f64,
}

// Cursor position relative to the main window's content area, in CSS (logical)
// pixels — the coordinate space document.elementFromPoint expects.
//
// The drag-drop bridge (Phase 6) uses this instead of onDragDropEvent's own
// `position`: that position's reference frame (whole window vs. content area; physical
// vs. logical) varies across Tauri/wry versions and is offset by the native title bar,
// which left block hit-testing landing above the real cursor. cursor_position() and
// inner_position() are both unambiguous — global desktop space, physical px — so this
// subtraction is exact regardless of decorations or display scaling.
#[tauri::command]
pub fn cursor_in_main_webview<R: Runtime>(app: AppHandle<R>) -> Option<WebviewPoint> {
    let win = app.get_webview_window("main")?;
    let cursor = win.cursor_position().ok()?;
    let origin = win.inner_position().ok()?;
    let scale = win.scale_factor().ok()?;
    if scale <= 0.0 {
        return None;
    }
    Some(WebviewPoint {
        x: (cursor.x - origin.x as f64) / scale,
        y: (cursor.y - origin.y as f64) / scale,
    })
}

// Open an attachment target (file / folder / URL) with the OS default application.
//
// We shell out instead of pulling in tauri-plugin-opener: PLAN_EN.md §4's dependency
// list does not include it, and §18.3 forbids adding dependencies without sign-off.
// The target is passed as a single argument (never through a shell), so there is no
// command-injection surface.
#[tauri::command]
pub fn open_target(target: String) -> Result<(), String> {
    let is_url = target.starts_with("http://") || target.starts_with("https://");
    // A missing file/folder must toast, not crash (§15). URLs have no filesystem
    // existence to check, so they go straight to the opener.
    if !is_url && !std::path::Path::new(&target).exists() {
        return Err("文件不存在或已被移动".into());
    }
    open_with_default_app(&target).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn open_with_default_app(target: &str) -> std::io::Result<()> {
    std::process::Command::new("open").arg(target).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
fn open_with_default_app(target: &str) -> std::io::Result<()> {
    std::process::Command::new("explorer").arg(target).spawn().map(|_| ())
}

#[cfg(target_os = "linux")]
fn open_with_default_app(target: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open").arg(target).spawn().map(|_| ())
}

// =============================================================================
// Capture Overlay (Phase 5)
// =============================================================================
//
// A borderless, transparent, always-on-top, non-activating second window that hosts
// the CaptureToast over the user's *source* screen (PLAN_EN.md §Phase 5 / §9.4). The
// window is declared in tauri.conf.json (label "overlay") and lives invisibly for the
// life of the app — we only show/hide/reposition it on capture, so the user never
// pays the cost of webview creation on the hot path (§16: <200ms keypress → toast).
//
// macOS focus-stealing note: `focus: false` in the window config combined with
// never calling set_focus() on the overlay is enough in practice — the window
// appears without becoming key, and the user's foreground app keeps the keyboard.
// True NSPanel-style guarantees (canBecomeKeyWindow override) require native
// Cocoa code and are deferred unless QA proves it necessary.

const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_WIDTH: u32 = 340;
const OVERLAY_HEIGHT_COLLAPSED: u32 = 100;
// Margin from screen edges, in logical pixels. Matches the visual padding the
// user expects from a system notification.
const OVERLAY_SCREEN_MARGIN: i32 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayCapturePayload {
    pub block_id: String,
    pub thread_id: String,
    pub workspace_id: String,
    pub workspace_title: String,
    pub thread_title: String,
    pub preview: String,
    pub full_content: String,
    pub source: Option<String>,
    // Best-effort: the frontmost app at the moment of capture, queried by useCapture
    // before invoking show. Rust uses it to re-activate that app *after* show() so the
    // user's keyboard focus returns to where they were working — fixes the
    // "next ⌘C goes to Spool instead of the browser" bug on macOS where show() of a
    // background app's window steals app-level activation even with focus:false.
    pub prev_source_app: Option<String>,
}

// macOS app names are short, human-readable strings (e.g. "Google Chrome", "Visual
// Studio Code"). Reject anything containing characters that could escape our osascript
// string literal — we'd never send those values legitimately, but defense in depth.
#[cfg(target_os = "macos")]
fn is_safe_app_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('"')
        && !name.contains('\\')
        && !name.contains('\n')
        && !name.contains('\r')
}

// Re-activate a previously-frontmost app via osascript. The spawned thread waits on
// .status() rather than .spawn() so the osascript child process is reaped — leaving
// zombies via .spawn() accumulates over time (hundreds of captures) and can starve
// per-user resources, which matches the "fails after a while of testing" symptom.
// The thread itself is short-lived (~50-200ms while osascript runs) and self-cleans.
#[cfg(target_os = "macos")]
fn reactivate_app_async(name: String) {
    std::thread::spawn(move || {
        if !is_safe_app_name(&name) {
            return;
        }
        let script = format!("tell application \"{}\" to activate", name);
        let _ = std::process::Command::new("osascript")
            .args(["-e", &script])
            .status();
    });
}

// Find the monitor containing the system cursor — that's "the screen the user is
// looking at." Falls back to the primary monitor when cursor coords are unavailable
// (e.g. headless CI) or none of the available monitors contains the cursor.
fn active_monitor<R: Runtime>(app: &AppHandle<R>) -> Option<Monitor> {
    // We need *some* window to query cursor_position; the overlay itself works fine
    // even if hidden. Prefer overlay, then main.
    let probe = app
        .get_webview_window(OVERLAY_LABEL)
        .or_else(|| app.get_webview_window("main"))?;
    let cursor = probe.cursor_position().ok();
    let monitors = app.available_monitors().ok()?;
    if let Some(c) = cursor {
        let x = c.x as i32;
        let y = c.y as i32;
        for m in &monitors {
            let pos: PhysicalPosition<i32> = m.position().clone();
            let size = m.size();
            if x >= pos.x
                && x < pos.x + size.width as i32
                && y >= pos.y
                && y < pos.y + size.height as i32
            {
                return Some(m.clone());
            }
        }
    }
    app.primary_monitor().ok().flatten().or_else(|| monitors.into_iter().next())
}

// Anchor the overlay at the top-right of the active monitor — bottom-right is
// hidden by the macOS dock, top-right matches the system notification convention.
// Since we anchor the *top* edge, window height doesn't enter the math (resizing
// for the picker grows the window downward instead of upward).
fn position_overlay_top_right<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let win = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;
    let monitor = active_monitor(app).ok_or_else(|| "no monitor available".to_string())?;
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let m_left = mpos.x as f64 / scale;
    let m_top = mpos.y as f64 / scale;
    let m_width = msize.width as f64 / scale;
    let target_x = m_left + m_width - OVERLAY_WIDTH as f64 - OVERLAY_SCREEN_MARGIN as f64;
    let target_y = m_top + OVERLAY_SCREEN_MARGIN as f64;
    win.set_position(LogicalPosition::new(target_x, target_y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Show the overlay over the user's active screen with a fresh capture payload.
// Sequencing: reset size → reposition → emit data → show. The window's React
// listener swaps the toast state in <16ms, so by the time show() repaints the user
// sees the new content with no flash of the prior capture.
#[tauri::command]
pub fn show_capture_overlay<R: Runtime>(
    app: AppHandle<R>,
    payload: OverlayCapturePayload,
) -> Result<(), String> {
    let win = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;
    // Reset to collapsed size in case the previous capture left the picker expanded.
    win.set_size(LogicalSize::new(
        OVERLAY_WIDTH as f64,
        OVERLAY_HEIGHT_COLLAPSED as f64,
    ))
    .map_err(|e| e.to_string())?;
    position_overlay_top_right(&app)?;
    // Stash the source app *before* show — show() activates Spool as a side effect, so
    // querying after would always return "Spool".
    #[cfg(target_os = "macos")]
    let prev_app = payload.prev_source_app.clone();
    app.emit_to(OVERLAY_LABEL, "overlay:show", payload)
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    // Re-activate the user's source app so their next ⌘C goes there, not to Spool.
    #[cfg(target_os = "macos")]
    if let Some(name) = prev_app {
        reactivate_app_async(name);
    }
    Ok(())
}

#[tauri::command]
pub fn hide_capture_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Resize the overlay window's height (e.g. expand for the Redirect dropdown). Since
// the window is top-anchored, growing the height just extends downward — the
// position stays put. Width is fixed; the toast layout assumes OVERLAY_WIDTH.
#[tauri::command]
pub fn resize_capture_overlay<R: Runtime>(app: AppHandle<R>, height: u32) -> Result<(), String> {
    let win = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_size(LogicalSize::new(OVERLAY_WIDTH as f64, height as f64))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Relay a freshly-resolved source label (from the main window's osascript backfill)
// into the overlay so the toast can update its attribution line in real time.
#[tauri::command]
pub fn update_overlay_source<R: Runtime>(
    app: AppHandle<R>,
    block_id: String,
    source: String,
) -> Result<(), String> {
    app.emit_to(
        OVERLAY_LABEL,
        "overlay:source-update",
        serde_json::json!({ "blockId": block_id, "source": source }),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Show a failure notice in the overlay (clipboard empty / no capture target / generic
// error). Routing failure feedback through the overlay — not the main window — is what
// makes ⌘⇧C reliable even when the main window is hidden, which is the dominant
// "capture-while-working-in-another-app" case.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayNoticePayload {
    pub kind: String, // "empty" | "no-target" | "error"
    pub msg: Option<String>,
}

#[tauri::command]
pub fn show_capture_notice<R: Runtime>(
    app: AppHandle<R>,
    payload: OverlayNoticePayload,
) -> Result<(), String> {
    let win = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_size(LogicalSize::new(
        OVERLAY_WIDTH as f64,
        OVERLAY_HEIGHT_COLLAPSED as f64,
    ))
    .map_err(|e| e.to_string())?;
    position_overlay_top_right(&app)?;
    app.emit_to(OVERLAY_LABEL, "overlay:notice", payload)
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    Ok(())
}
