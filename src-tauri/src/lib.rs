mod capture;
#[cfg(target_os = "macos")]
mod double_tap;
pub mod mcp;
pub mod overlay;

use tauri::Manager;

// §20.12: the Settings panel shows a copy-paste MCP client config pointing at THIS
// binary — resolved at runtime so dev builds and the installed .app both show a path
// that actually works.
#[tauri::command]
fn mcp_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

// §20.12 one-click MCP client hookup (2026-07-07) — see mcp.rs for the fs/JSON logic.
// Status probe for the Settings badge; write happens only on the user's button press.
#[tauri::command]
fn mcp_client_status(client: String) -> Result<String, String> {
    mcp::client_status(&client)
}

#[tauri::command]
fn configure_mcp_client(client: String) -> Result<String, String> {
    mcp::configure_client(&client)
}

// Double-tap ⌥ needs the Input Monitoring TCC grant (see double_tap.rs module doc):
// a listen-only tap without it only sees Spool's own events. The main window asks
// this at startup / on focus to drive the quiet onboarding banner.
#[tauri::command]
fn input_monitoring_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::input_monitoring_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// The suppression tap (double_tap.rs, 2026-07-29) needs the Accessibility grant to
// delete a consumed double-tap from the event stream — without it the gesture is
// shared and Claude Desktop's quick-entry pops alongside every capture.
#[tauri::command]
fn accessibility_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::accessibility_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// DESIGN_FIRST_RUN 拍板点 3 (2026-08-02): startup no longer fires the two TCC prompts,
// so this is the moment they happen — the user pressed "turn on capture". Returns the
// Input Monitoring grant; false is the normal answer (macOS shows its dialog and the
// user finishes in System Settings), which is why the banner keeps a settings route.
#[tauri::command]
fn request_capture_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::request_capture_access()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// Decision ③ (2026-07-31): clients that are not installed stay listed in gray, with a
// pointer to where to get them. Fixed key→URL table — no user input reaches `open`.
// URLs checked alive 2026-07-31; they are external facts, re-verify before editing.
#[tauri::command]
fn open_mcp_client_page(client: String) -> Result<(), String> {
    let url = match client.as_str() {
        "claude" => "https://claude.ai/download",
        "claude-code" => "https://claude.com/claude-code",
        "cursor" => "https://cursor.com",
        "vscode" => "https://code.visualstudio.com",
        "windsurf" => "https://windsurf.com",
        "codex" => "https://developers.openai.com/codex",
        other => return Err(format!("unknown MCP client: {other}")),
    };
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("macOS only".into())
    }
}

// §2.1 route A (2026-07-31): a fresh Input Monitoring grant never becomes visible to
// the already-running process — probe evidence: same signed binary, a new process
// preflights granted=1 while the pre-grant process polls 0 for 90+ minutes. So the
// tap can only come alive through a full relaunch; this gives the banner a one-click
// way to do it instead of narrating "tray icon → Quit → reopen".
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

// Opens System Settings directly at Privacy & Security → Input Monitoring, for the
// banner's "open settings" button. Fixed URL, no user input — no injection surface.
#[tauri::command]
fn open_input_monitoring_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("macOS only".into())
    }
}

// Single call site for `generate_context!`, which embeds the whole frontend bundle —
// invoking the macro once per entry point would embed it twice.
fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

// `spool --overlay`: the capture toast's own process (overlay.rs).
pub fn run_overlay() {
    overlay::run_helper(context());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance MUST be the first plugin: when a second Spool process is launched
    // (a stray `open -a Spool` / `tell application "Spool"`, an old bundle, a double-
    // click), it hands off to the already-running instance and exits BEFORE opening
    // sqlite:spool.db. That makes it impossible for two processes to contend for the DB —
    // the root of the "database is locked" + data-wipe incident (2026-05-29). The
    // callback just surfaces the existing window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            capture::show_main_window(app);
        }));
    }

    builder = builder
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            capture::get_foreground_app,
            capture::set_tray_targets,
            capture::open_target,
            capture::path_is_dir,
            capture::cursor_in_main_webview,
            capture::show_capture_overlay,
            capture::show_undo_overlay,
            capture::update_overlay_source,
            capture::show_capture_notice,
            capture::set_shortcuts,
            capture::probe_browser_automation,
            overlay::overlay_db_reply,
            mcp_exe_path,
            mcp_client_status,
            configure_mcp_client,
            open_mcp_client_page,
            input_monitoring_granted,
            accessibility_granted,
            request_capture_access,
            open_input_monitoring_settings,
            restart_app,
        ]);

    #[cfg(desktop)]
    {
        use tauri::Emitter;
        use tauri_plugin_global_shortcut::ShortcutState;

        // Launch at login (§9.12). Desktop-only; the LaunchAgent backend on macOS.
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ));

        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Match against the *currently registered* accelerators (§19.1),
                    // which the user can re-bind at runtime — not the hard-coded
                    // defaults. try_state can only be None before setup() runs, which
                    // is before any shortcut is registered, so a press can't reach here.
                    let Some(cfg) = app.try_state::<capture::ShortcutConfig>() else {
                        return;
                    };
                    let capture_acc = *cfg.capture.lock().unwrap();
                    let search_acc = *cfg.search.lock().unwrap();
                    let undo_acc = *cfg.undo.lock().unwrap();
                    if Some(*shortcut) == undo_acc {
                        // §9.13 frictionless undo: registered only while the capture toast
                        // is up, so a press here means "undo the capture I just made" —
                        // works from any app without switching back to Spool.
                        if event.state() == ShortcutState::Pressed {
                            let _ = app.emit("undo-trigger", ());
                        }
                    } else if Some(*shortcut) == capture_acc {
                        // Log every state change (Pressed AND Released) so a missing
                        // capture can be triaged: if stderr shows neither, macOS dropped
                        // the keypress before us; if it shows Pressed but JS doesn't see
                        // [capture] trigger, the emit/listener path is the suspect.
                        eprintln!("[shortcut] capture state={:?}", event.state());
                        if event.state() == ShortcutState::Pressed {
                            // Payload `true` marks this as the user-bound capture shortcut
                            // (no default since 2026-07-07), distinguishing it from the
                            // double-tap ⌥ path (null payload) in the frontend's logs.
                            let _ = app.emit("capture-trigger", true);
                        }
                    } else if shortcut == &search_acc {
                        eprintln!("[shortcut] search state={:?}", event.state());
                        if event.state() == ShortcutState::Pressed {
                            // ⌘⇧F is system-global, so the main window may be hidden —
                            // surface it before the overlay (which lives inside it) opens.
                            capture::show_main_window(app);
                            let _ = app.emit("search-trigger", ());
                        }
                    }
                })
                .build(),
        );
    }

    builder
        .on_window_event(|window, event| {
            // Closing the main window hides it — the app stays resident in the tray so the
            // global shortcut keeps working.
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    // macOS sometimes silently invalidates registered global shortcuts after
                    // sleep/wake or Spaces switches — the OS keeps the registration record
                    // but never fires the handler. Re-checking on every main-window focus is
                    // cheap insurance: if the registration is still live, is_registered short-
                    // circuits and we do nothing; if it's been lost we re-establish.
                    #[cfg(desktop)]
                    tauri::WindowEvent::Focused(true) => {
                        use tauri_plugin_global_shortcut::GlobalShortcutExt;
                        let app = window.app_handle();
                        let gs = app.global_shortcut();
                        if let Some(cfg) = app.try_state::<capture::ShortcutConfig>() {
                            for acc in [
                                *cfg.capture.lock().unwrap(),
                                Some(*cfg.search.lock().unwrap()),
                            ]
                            .into_iter()
                            .flatten()
                            {
                                if !gs.is_registered(acc) {
                                    if let Err(e) = gs.register(acc) {
                                        eprintln!(
                                            "[shortcut] re-register on focus failed: {e}"
                                        );
                                    } else {
                                        eprintln!("[shortcut] re-registered on focus");
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .setup(|app| {
            // Ensure the AppLocalDataDir exists *before* the SQL plugin tries to open
            // `sqlite:spool.db` against it. Some Tauri 2 plugin-sql versions don't
            // auto-create the parent dir on first launch and the frontend hangs forever
            // on `Database.load(...)`.
            if let Ok(dir) = app.path().app_local_data_dir() {
                let _ = std::fs::create_dir_all(&dir);
            }

            #[cfg(desktop)]
            {
                use tauri::tray::TrayIconBuilder;
                use tauri_plugin_global_shortcut::GlobalShortcutExt;

                let initial_menu =
                    capture::build_tray_menu(app.handle(), "", &[], &Default::default())?;
                // 2026-07-13 (new logo): the app icon is now an opaque rounded square,
                // whose alpha mask templates into a solid blob — the menu bar gets its
                // own black-on-transparent thread mark (derived from the logo's small
                // tier) instead of the window icon. Shipped as raw RGBA (tray.rgba,
                // regenerate from tray.png) so no png-decode feature is pulled in.
                let icon = tauri::image::Image::new(
                    include_bytes!("../icons/tray.rgba"),
                    44,
                    44,
                );
                TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .icon_as_template(true)
                    .tooltip("Spool · 思簿")
                    .menu(&initial_menu)
                    .on_menu_event(|app, event| {
                        capture::handle_menu_event(app, event.id.as_ref());
                    })
                    .build(app)?;

                // Live shortcut config (§19.1): search starts at its platform default;
                // capture has NO default binding since 2026-07-07 (⌘⇧C retired —
                // double-tap ⌥ is the trigger; a user-bound shortcut from Settings is
                // re-applied via `set_shortcuts` once the frontend loads settings).
                // Registering search here means it works from the first launch
                // instant, before the webview is even ready.
                app.manage(capture::ShortcutConfig {
                    capture: std::sync::Mutex::new(None),
                    search: std::sync::Mutex::new(capture::search_accelerator()),
                    // §9.13: registered on demand while the capture toast is visible.
                    undo: std::sync::Mutex::new(None),
                });
                if let Err(e) = app
                    .global_shortcut()
                    .register(capture::search_accelerator())
                {
                    eprintln!("failed to register search shortcut: {e}");
                }
            }

            // macOS only: install the double-tap ⌥ listener on its own thread (it
            // runs CFRunLoopRun() which blocks). Missing Input Monitoring permission
            // is preflighted/prompted inside (see double_tap.rs module doc); the UI
            // shows an onboarding banner until the grant lands.
            #[cfg(target_os = "macos")]
            double_tap::install(app.handle().clone());

            // The capture toast's own process (overlay.rs). Started here, not on the
            // first capture: a webview cold start on the hot path would blow the
            // <200ms keypress → toast budget.
            #[cfg(desktop)]
            overlay::spawn_helper(app.handle().clone());

            Ok(())
        })
        .run(context())
        .expect("error while running tauri application");
}
