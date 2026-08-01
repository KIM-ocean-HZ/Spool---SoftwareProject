use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
#[cfg(target_os = "macos")]
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::time::Instant;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, Runtime};

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

// UI copy for the fixed tray items, pushed from JS (lib/i18n) so the menu follows the
// language setting. Defaults (used for the pre-webview menu at setup()) are Chinese —
// the product default; useTrayMenu re-pushes localized labels as soon as settings load.
#[derive(Debug, Clone, Deserialize)]
pub struct TrayLabels {
    pub current_none: String,
    pub current_prefix: String,
    pub switch_target: String,
    pub no_threads: String,
    pub open: String,
    pub new_thread: String,
    pub settings: String,
    pub quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            current_none: "当前目标：（无）".into(),
            current_prefix: "当前目标:  ".into(),
            switch_target: "切换捕捉目标".into(),
            no_threads: "（暂无脉络）".into(),
            open: "打开 Spool".into(),
            new_thread: "新建脉络".into(),
            settings: "设置".into(),
            quit: "退出 Spool".into(),
        }
    }
}

const TRAY_ID: &str = "main";
const SET_TARGET_PREFIX: &str = "set_target:";

#[tauri::command]
pub fn set_tray_targets<R: Runtime>(
    app: AppHandle<R>,
    current_label: String,
    targets: Vec<TrayTarget>,
    labels: Option<TrayLabels>,
) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("tray not found")?;
    let labels = labels.unwrap_or_default();
    let menu =
        build_tray_menu(&app, &current_label, &targets, &labels).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    current_label: &str,
    targets: &[TrayTarget],
    labels: &TrayLabels,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let label_text = if current_label.is_empty() {
        labels.current_none.clone()
    } else {
        format!("{}{current_label}", labels.current_prefix)
    };
    let current_item = MenuItemBuilder::with_id("current_label", label_text)
        .enabled(false)
        .build(app)?;

    let mut switch = SubmenuBuilder::new(app, &labels.switch_target);
    if targets.is_empty() {
        let empty = MenuItemBuilder::with_id("targets_empty", &labels.no_threads)
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

    let open = MenuItemBuilder::with_id("open", &labels.open).build(app)?;
    let new_thread = MenuItemBuilder::with_id("new_thread", &labels.new_thread).build(app)?;
    let settings = MenuItemBuilder::with_id("settings", &labels.settings).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", &labels.quit).build(app)?;

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
        // Pure state toggle (§9.2 v2.10): emit so the store flips is_capture_target, but do
        // NOT show/focus the main window — toggling the target while working elsewhere must
        // never pull Spool forward (§14.3). The hidden main window's listener still applies it.
        let _ = app.emit(
            "tray-action",
            serde_json::json!({ "kind": "set_target", "id": thread_id }),
        );
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

// §9.13 frictionless undo: the *preferred* global undo accelerator — ⌘Z (Ctrl+Z off
// macOS). Registered only while the capture toast is showing (see register_undo_shortcut)
// so it doesn't shadow every other app's Cmd+Z; for those few seconds it lets the user
// undo a mis-capture without switching back to Spool.
#[cfg(desktop)]
pub fn undo_accelerator() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL;
    Shortcut::new(Some(mods), Code::KeyZ)
}

// Fallback global undo accelerator — ⌥Z (Option+Z) — used only if ⌘Z can't be grabbed.
// ⌥ is rarely a primary modifier, so this never collides with another app's undo.
#[cfg(desktop)]
pub fn undo_fallback_accelerator() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::ALT), Code::KeyZ)
}

// =============================================================================
// Runtime-configurable shortcuts (PLAN_EN.md §19.1)
// =============================================================================
//
// The capture/search accelerators are user-configurable from the Settings panel.
// `ShortcutConfig` is Tauri managed state holding the *currently registered* pair —
// the global-shortcut handler matches presses against it (not hard-coded defaults),
// and `set_shortcuts` swaps the registration at runtime. Capture is an Option since
// 2026-07-07: ⌘⇧C is retired, double-tap ⌥ is the capture trigger, and a capture
// shortcut exists only when the user binds one in Settings (it stays the §20.9
// direct-write escape hatch while the collect panel is open).

#[cfg(desktop)]
pub struct ShortcutConfig {
    pub capture: std::sync::Mutex<Option<tauri_plugin_global_shortcut::Shortcut>>,
    pub search: std::sync::Mutex<tauri_plugin_global_shortcut::Shortcut>,
    // §9.13: the undo accelerator currently registered (Some while the capture toast is
    // visible), or None when no toast is up. Time-boxed registration keeps ⌘Z usable in
    // every other app outside the toast window.
    pub undo: std::sync::Mutex<Option<tauri_plugin_global_shortcut::Shortcut>>,
}

// Register the global undo shortcut while the capture toast is visible. Tries ⌘Z first
// (the user's stated preference); if the OS refuses it, falls back to ⌥Z. Idempotent —
// a second capture while one toast is already up is a no-op.
#[cfg(desktop)]
pub fn register_undo_shortcut<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let Some(cfg) = app.try_state::<ShortcutConfig>() else {
        return;
    };
    let mut slot = cfg.undo.lock().unwrap();
    if slot.is_some() {
        return;
    }
    let gs = app.global_shortcut();
    let primary = undo_accelerator();
    let chosen = if gs.register(primary).is_ok() {
        Some(primary)
    } else {
        let fallback = undo_fallback_accelerator();
        if gs.register(fallback).is_ok() {
            eprintln!("[undo] ⌘Z unavailable — registered ⌥Z fallback for global undo");
            Some(fallback)
        } else {
            eprintln!("[undo] failed to register any global undo shortcut");
            None
        }
    };
    *slot = chosen;
}

// Release the global undo shortcut once the toast is gone, so ⌘Z returns to the
// foreground app. No-op if nothing was registered.
#[cfg(desktop)]
pub fn unregister_undo_shortcut<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let Some(cfg) = app.try_state::<ShortcutConfig>() else {
        return;
    };
    let mut slot = cfg.undo.lock().unwrap();
    if let Some(acc) = slot.take() {
        let _ = app.global_shortcut().unregister(acc);
    }
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
// rejected accelerator never leaves the user without a working shortcut. The frontend
// persists the value only after this returns Ok. `capture` is optional — None means
// "no capture shortcut bound" (the default since 2026-07-07; double-tap ⌥ captures).
#[tauri::command]
pub fn set_shortcuts<R: Runtime>(
    app: AppHandle<R>,
    capture: Option<String>,
    search: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let new_capture = capture.as_deref().map(parse_shortcut).transpose()?;
        let new_search = parse_shortcut(&search)?;
        if new_capture == Some(new_search) {
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
        if let Some(acc) = old_capture {
            let _ = gs.unregister(acc);
        }
        let _ = gs.unregister(old_search);
        let restore = |gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>| {
            if let Some(acc) = old_capture {
                let _ = gs.register(acc);
            }
            let _ = gs.register(old_search);
        };
        if let Some(acc) = new_capture {
            if let Err(e) = gs.register(acc) {
                restore(gs);
                return Err(format!("无法注册捕捉快捷键：{e}"));
            }
        }
        if let Err(e) = gs.register(new_search) {
            if let Some(acc) = new_capture {
                let _ = gs.unregister(acc);
            }
            restore(gs);
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
// A borderless, transparent, always-on-top window that hosts the CaptureToast over the
// user's *source* screen (PLAN_EN.md §Phase 5 / §9.4). Since 2026-08-01 that window
// lives in a SECOND PROCESS (`spool --overlay`, see overlay.rs) rather than being a
// window of this app — activation is per process, so the toast can take the foreground
// without dragging the main window up the stack with it. It is started at launch and
// stays resident, so the user never pays webview creation on the hot path (§16: <200ms
// keypress → toast).
//
// What stays here: geometry (this process arms the click-outside watch against the same
// frame), the focus stash, and the toast-scoped undo shortcut. This file talks to the
// overlay process through overlay::send / the on_overlay_* handlers below.
//
// macOS focus note: since note-first (2026-07-31) the capture toast deliberately DOES
// take the foreground, and gives it back on every dismiss path — see the "Note-first
// activation" section below for how, and why it is not set_focus(). The notice and undo
// overlays are untouched by that: they have nothing to type into, so they still appear
// without disturbing the user's foreground app.

pub(crate) const OVERLAY_WIDTH: u32 = 340;
pub(crate) const OVERLAY_HEIGHT_COLLAPSED: u32 = 100;
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

// Find the monitor containing the system cursor — that's "the screen the user is
// looking at." Falls back to the primary monitor when cursor coords are unavailable
// (e.g. headless CI) or none of the available monitors contains the cursor.
// pub(crate) so the collect-panel window (collect.rs, §20.9) can anchor itself to the
// same "active screen" the capture overlay uses.
pub(crate) fn active_monitor<R: Runtime>(app: &AppHandle<R>) -> Option<Monitor> {
    // We need *some* window of this process to query cursor_position through; the main
    // window works even while hidden, which is the common capture case.
    let probe = app.get_webview_window("main")?;
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
//
// Computed here rather than in the overlay process because this process is the one that
// arms the click-outside dismiss watch (§9.13), and both must describe the same frame.
// The origin is in global logical points.
fn overlay_origin<R: Runtime>(app: &AppHandle<R>) -> Result<(f64, f64), String> {
    let monitor = active_monitor(app).ok_or_else(|| "no monitor available".to_string())?;
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let m_left = mpos.x as f64 / scale;
    let m_top = mpos.y as f64 / scale;
    let m_width = msize.width as f64 / scale;
    let target_x = m_left + m_width - OVERLAY_WIDTH as f64 - OVERLAY_SCREEN_MARGIN as f64;
    let target_y = m_top + OVERLAY_SCREEN_MARGIN as f64;
    Ok((target_x, target_y))
}

// Ask the overlay process to show `content` at the freshly-computed top-right anchor.
// Err means the overlay process is down — the caller decides what that costs; for a
// capture it costs the toast, never the block (already committed by the time we get here).
fn send_overlay_show<R: Runtime>(
    app: &AppHandle<R>,
    kind: &str,
    payload: serde_json::Value,
) -> Result<(f64, f64), String> {
    let (x, y) = overlay_origin(app)?;
    let sent = crate::overlay::send(&serde_json::json!({
        "t": kind,
        "x": x,
        "y": y,
        "w": OVERLAY_WIDTH,
        "h": OVERLAY_HEIGHT_COLLAPSED,
        "payload": payload,
    }));
    if sent {
        Ok((x, y))
    } else {
        Err("capture overlay process is not running".to_string())
    }
}

// Note-first (2026-07-31, DESIGN_CAPTURE_NOTE_FIRST): the toast now opens with its
// note box focused, so the overlay TAKES keyboard focus on show and gives it back on
// hide. This is the app we hand focus back to — stashed by show_capture_overlay,
// consumed by hide_capture_overlay (every dismiss path funnels through it).
//
// Two stashes for the two routes below: the pid one is used whenever Accessibility is
// granted (see the AX section), the name one is the fallback for when it isn't. Exactly
// one of them is ever set for a given capture.
static RESTORE_FOCUS_APP: Mutex<Option<String>> = Mutex::new(None);
#[cfg(target_os = "macos")]
static RESTORE_FOCUS_PID: Mutex<Option<i32>> = Mutex::new(None);

// Cache-only read of the frontmost app — never spawns osascript, so it is free on the
// capture hot path. useCapture starts get_foreground_app() at the top of every capture
// but only waits FRONTMOST_HOT_PATH_MS (80ms) for it before shipping the payload, and
// an osascript round trip rarely beats that; the answer lands in FRONTMOST_CACHE a few
// hundred ms later, still well inside the 2s window. Without this fallback
// `prev_source_app` is null on most captures, the stash below stays empty, and nothing
// ever hands the keyboard back to the app the user was working in.
#[cfg(target_os = "macos")]
fn frontmost_from_cache() -> Option<String> {
    let cache = FRONTMOST_CACHE.lock().ok()?;
    let entry = cache.as_ref()?;
    if Instant::now().duration_since(entry.at).as_millis() >= FRONTMOST_CACHE_MS {
        return None;
    }
    entry.value.as_ref().map(|v| v.app.clone())
}

// A click outside the toast dismisses it, but that click also picked a new frontmost
// app — the user's own choice. Drop the stash so hide_capture_overlay doesn't pull them
// back to where they were before the capture.
#[cfg(target_os = "macos")]
pub(crate) fn forget_restore_focus() {
    *RESTORE_FOCUS_APP.lock().unwrap() = None;
    *RESTORE_FOCUS_PID.lock().unwrap() = None;
}

// True between sending a capture toast and hearing it is on screen, when that toast is
// one we mean to hand the foreground to. Notices and undo cards never set it.
#[cfg(target_os = "macos")]
static ACTIVATE_ON_SHOWN: AtomicBool = AtomicBool::new(false);

// =============================================================================
// Note-first activation (2026-08-01, DESIGN_CAPTURE_NOTE_FIRST §3.6)
// =============================================================================
//
// Typing straight into the note box requires Spool to be the ACTIVE app. macOS delivers
// keystrokes only to the active app, so a key window inside a background app receives
// nothing — proved by the reverted NSPanel experiment, which got `isKeyWindow=true` and
// still no keyboard. Ocean confirmed the other half by hand on 2026-08-01: when Spool
// already owns the foreground the note box takes the cursor and typing works; the only
// broken case is capturing from another app.
//
// The AppKit route to activation is closed. `activateIgnoringOtherApps:` from a
// background app is neither honoured nor refused — it is DEFERRED, and cashed in the
// next time Spool has a key-eligible window, which is the "main window flashes to the
// front on dismiss" bug measured in §3.5. Calling it earlier does not change that; the
// request itself is what misbehaves, so we never make it.
//
// The accessibility route is open, and costs no new grant: the suppressing event tap
// (double_tap.rs) already requires Accessibility. Setting `AXFrontmost` on an
// application element is exactly what `System Events`' `set frontmost of process` does,
// it applies immediately rather than being queued, and it works on any pid — so the
// same call serves both directions: take the foreground on show, give it back on hide.
// Restoring by pid also drops the two hazards of the name route (an app whose
// LaunchServices name differs from what we observed, and `tell application "Spool"`
// launching a second instance against the live database).
//
// Without the Accessibility grant nothing here fires and capture behaves exactly as it
// did before: no activation, and focus restored by app name through osascript.

#[cfg(target_os = "macos")]
type AXUIElementRef = *const std::ffi::c_void;

// The AX attribute names are CFSTR() macros in the SDK headers, not exported symbols —
// hence the string literals rather than `extern static` declarations.
#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: core_foundation::string::CFStringRef,
        value: *mut core_foundation::base::CFTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: AXUIElementRef,
        attribute: core_foundation::string::CFStringRef,
        value: core_foundation::base::CFTypeRef,
    ) -> i32;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> i32;
}

#[cfg(target_os = "macos")]
const AX_ERROR_SUCCESS: i32 = 0;

// pid of the app the user is currently working in, read straight from the accessibility
// server — synchronous, no subprocess, so it is free on the capture hot path (unlike
// get_foreground_app's osascript, which the frontend can only afford to wait 80ms for).
#[cfg(target_os = "macos")]
fn ax_focused_app_pid() -> Option<i32> {
    use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
    use core_foundation::string::CFString;
    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return None;
        }
        let attr = CFString::from_static_string("AXFocusedApplication");
        let mut value: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(system, attr.as_concrete_TypeRef(), &mut value);
        CFRelease(system as CFTypeRef);
        if err != AX_ERROR_SUCCESS || value.is_null() {
            return None;
        }
        let mut pid: i32 = 0;
        let err = AXUIElementGetPid(value as AXUIElementRef, &mut pid);
        CFRelease(value);
        if err != AX_ERROR_SUCCESS || pid <= 0 {
            None
        } else {
            Some(pid)
        }
    }
}

// Make `pid` the active app. Returns false when the accessibility server refuses (no
// grant, or the target has no AX presence) — every caller treats that as "leave focus
// where it is", never as an error worth surfacing.
#[cfg(target_os = "macos")]
fn ax_set_frontmost(pid: i32) -> bool {
    use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::string::CFString;
    unsafe {
        let element = AXUIElementCreateApplication(pid);
        if element.is_null() {
            return false;
        }
        let attr = CFString::from_static_string("AXFrontmost");
        let yes = CFBoolean::true_value();
        let err =
            AXUIElementSetAttributeValue(element, attr.as_concrete_TypeRef(), yes.as_CFTypeRef());
        CFRelease(element as CFTypeRef);
        err == AX_ERROR_SUCCESS
    }
}

// The app to take the foreground from and hand it back to, or None when there is
// nothing to do: Accessibility isn't granted (fall back to the name route), or Spool is
// already the active app (Ocean's 2026-08-01 test: that case already works untouched).
// The overlay process counts as Spool for this — a re-capture while a toast is still up
// finds IT frontmost, and "restoring" focus to the toast would strand the user there.
#[cfg(target_os = "macos")]
fn ax_source_app_pid() -> Option<i32> {
    if !crate::double_tap::accessibility_granted() {
        return None;
    }
    let pid = ax_focused_app_pid()?;
    if pid == std::process::id() as i32 || Some(pid) == crate::overlay::helper_pid() {
        None
    } else {
        Some(pid)
    }
}

// Show the overlay over the user's active screen with a fresh capture payload.
// Sequencing in the overlay process: size → position → push data → show. Its React
// listener swaps the toast state in <16ms, so by the time show() repaints the user
// sees the new content with no flash of the prior capture.
#[tauri::command]
pub fn show_capture_overlay<R: Runtime>(
    app: AppHandle<R>,
    payload: OverlayCapturePayload,
) -> Result<(), String> {
    // Stash the source app *before* the toast appears: once it has the foreground, the
    // query would only ever answer "Spool". Never stash "Spool" itself — activating it
    // by name makes LaunchServices launch a SECOND instance against the same SQLite file
    // (the 2026-05-29 incident pattern), and there is nothing to restore anyway.
    #[cfg(target_os = "macos")]
    {
        let source_pid = ax_source_app_pid();
        // Name route (no Accessibility grant): restore-only, no activation. Skipped
        // entirely when we have a pid, so the two stashes never both hold a value.
        let stash = if source_pid.is_some() {
            None
        } else {
            payload
                .prev_source_app
                .clone()
                .or_else(frontmost_from_cache)
                .filter(|name| !name.eq_ignore_ascii_case("spool"))
        };
        *RESTORE_FOCUS_PID.lock().unwrap() = source_pid;
        *RESTORE_FOCUS_APP.lock().unwrap() = stash;
        // Note-first: keystrokes reach a window only while its app is active, so
        // capturing from another app means activating the overlay process. That waits
        // for its "shown" reply — activating an app whose window isn't up yet would
        // leave the note box unfocused (see on_overlay_shown).
        ACTIVATE_ON_SHOWN.store(source_pid.is_some(), Ordering::SeqCst);
    }
    let payload = serde_json::to_value(payload).map_err(|e| e.to_string())?;
    let (origin_x, origin_y) = send_overlay_show(&app, "show", payload)?;
    // §9.13: arm the click-outside dismiss watch over the toast's frame, and grab the
    // global undo shortcut for the toast's lifetime. The ResizeObserver in the overlay
    // refines the height moments later via resize_capture_overlay.
    #[cfg(target_os = "macos")]
    crate::double_tap::arm_overlay_dismiss(
        origin_x,
        origin_y,
        OVERLAY_WIDTH as f64,
        OVERLAY_HEIGHT_COLLAPSED as f64,
    );
    #[cfg(not(target_os = "macos"))]
    let _ = (origin_x, origin_y); // click-outside dismiss is macOS-only (CGEventTap)
    register_undo_shortcut(&app);
    Ok(())
}

// The overlay process reports its window is on screen. Hand it the foreground if this
// was a capture toast raised from another app — see the "Note-first activation" section.
// Activating the OVERLAY's pid (not ours) is what leaves the main window untouched.
pub fn on_overlay_shown() {
    #[cfg(target_os = "macos")]
    {
        if !ACTIVATE_ON_SHOWN.swap(false, Ordering::SeqCst) {
            return;
        }
        let Some(pid) = crate::overlay::helper_pid() else {
            return;
        };
        if !ax_set_frontmost(pid) {
            // Focus stays with the source app: the toast is still fully usable by
            // clicking into the note box, which is a legitimate activation the OS
            // always honours.
            eprintln!("[capture] AXFrontmost refused — note box needs a click to type into");
        }
    }
}

// Every dismiss path in the overlay (Enter / Esc / ✕ / click-outside / the 8s dwell)
// ends up here. Focus goes back BEFORE the toast is ordered out: hiding the frontmost
// app's only window first would let macOS pick the next app itself.
pub fn on_overlay_hide<R: Runtime>(app: &AppHandle<R>) {
    // §9.13: tear down the toast-scoped undo machinery, so ⌘Z returns to the foreground
    // app and a stray click no longer dismisses a now-hidden toast.
    #[cfg(target_os = "macos")]
    crate::double_tap::disarm_overlay_dismiss();
    unregister_undo_shortcut(app);
    // Note-first: give the keyboard back to where the user was working. The stash is
    // empty when the user was already in Spool (nothing to restore) and when a
    // click-outside dismissal cleared it — that click moved focus to an app the USER
    // chose, and yanking them to the stashed one would fight them.
    #[cfg(target_os = "macos")]
    {
        // A toast dismissed before it was ever shown must not activate anything.
        ACTIVATE_ON_SHOWN.store(false, Ordering::SeqCst);
        // Accessibility route: hand the foreground back by pid. Synchronous, so the
        // source app is active again before we ask for the hide.
        if let Some(pid) = RESTORE_FOCUS_PID.lock().unwrap().take() {
            ax_set_frontmost(pid);
            hide_overlay_now(false);
            return;
        }
        let stashed = RESTORE_FOCUS_APP.lock().unwrap().take();
        if let Some(name) = stashed.filter(|n| is_safe_app_name(n)) {
            // Off-thread so this returns at once; React has already unmounted the toast
            // and the window is transparent, so the ~100ms it stays up is invisible.
            // .status() (not .spawn()) so the osascript child is reaped.
            std::thread::spawn(move || {
                let script = format!("tell application \"{}\" to activate", name);
                let _ = std::process::Command::new("osascript")
                    .args(["-e", &script])
                    .status();
                hide_overlay_now(false);
            });
            return;
        }
        // Neither route knows where the user came from (both grants refused). If they
        // clicked the toast, the overlay process is the ACTIVE app — and hiding its only
        // window would leave the foreground held by an app with nothing to type into,
        // measured 2026-08-01. Ask it to step down so macOS hands the foreground to the
        // next app in order, which is the one they clicked away from.
        hide_overlay_now(true);
    }
    #[cfg(not(target_os = "macos"))]
    hide_overlay_now(false);
}

// `release_foreground` asks the overlay process to stop being the active app, not just
// to order its window out — see the last branch of on_overlay_hide.
fn hide_overlay_now(release_foreground: bool) {
    crate::overlay::send(&serde_json::json!({
        "t": "hide-now",
        "release": release_foreground,
    }));
}

// §9.13: show the undo/redo confirmation in the overlay so it floats over the user's
// current window (not just the hidden main app). Mirrors show_capture_overlay's geometry
// and re-arms the click-outside dismiss watch; the undo shortcut stays registered so the
// user can keep pressing ⌘Z to chain-undo without switching back to Spool. The payload is
// forwarded verbatim to the overlay (OverlayUndoPayload).
#[tauri::command]
pub fn show_undo_overlay<R: Runtime>(
    app: AppHandle<R>,
    payload: serde_json::Value,
) -> Result<(), String> {
    let (origin_x, origin_y) = send_overlay_show(&app, "undo", payload)?;
    #[cfg(target_os = "macos")]
    crate::double_tap::arm_overlay_dismiss(
        origin_x,
        origin_y,
        OVERLAY_WIDTH as f64,
        OVERLAY_HEIGHT_COLLAPSED as f64,
    );
    #[cfg(not(target_os = "macos"))]
    let _ = (origin_x, origin_y);
    register_undo_shortcut(&app);
    Ok(())
}

// The user started dragging the capture toast: its on-screen frame is about to change,
// so the §9.13 armed frame would go stale and a click on the relocated toast would read
// as "outside" and wrongly dismiss it. A deliberately-repositioned toast keeps itself up
// — ✕ / Esc / the auto-dismiss timer still close it. No-op when nothing is armed.
pub fn on_overlay_disarm() {
    #[cfg(target_os = "macos")]
    crate::double_tap::disarm_overlay_dismiss();
}

// The overlay resized itself to its real rendered height (e.g. the Redirect dropdown
// opened). Since the window is top-anchored, growing the height extends downward and the
// origin stays put — only the dismiss frame's height needs to follow. No-op when not armed.
pub fn on_overlay_resize(height: f64) {
    #[cfg(target_os = "macos")]
    crate::double_tap::update_overlay_dismiss_height(height);
    #[cfg(not(target_os = "macos"))]
    let _ = height;
}

// Relay a freshly-resolved source label (from the main window's osascript backfill)
// into the overlay so the toast can update its attribution line in real time.
#[tauri::command]
pub fn update_overlay_source(block_id: String, source: String) -> Result<(), String> {
    crate::overlay::send(&serde_json::json!({
        "t": "source-update",
        "payload": { "blockId": block_id, "source": source },
    }));
    Ok(())
}

// Show a failure notice in the overlay (clipboard empty / no capture target / generic
// error). Routing failure feedback through the overlay — not the main window — is what
// makes capture reliable even when the main window is hidden, which is the dominant
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
    let payload = serde_json::to_value(payload).map_err(|e| e.to_string())?;
    send_overlay_show(&app, "notice", payload)?;
    Ok(())
}
