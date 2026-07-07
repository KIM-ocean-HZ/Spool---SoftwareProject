mod capture;
mod collect;
#[cfg(target_os = "macos")]
mod double_tap;
pub mod mcp;

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
            capture::hide_capture_overlay,
            capture::show_undo_overlay,
            capture::resize_capture_overlay,
            capture::update_overlay_source,
            capture::show_capture_notice,
            capture::disarm_capture_dismiss,
            capture::set_shortcuts,
            capture::probe_browser_automation,
            collect::open_collect_panel,
            collect::close_collect_panel,
            collect::resize_collect_panel,
            collect::reposition_collect_panel,
            collect::append_collect_item,
            mcp_exe_path,
            input_monitoring_granted,
            open_input_monitoring_settings,
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
                            // (no default since 2026-07-07) so the frontend can keep it a
                            // direct-write escape hatch even while the §20.9 collect panel
                            // is open (double-tap ⌥ sends a null payload and stages).
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
                let icon = app
                    .default_window_icon()
                    .cloned()
                    .ok_or("missing default window icon")?;
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
