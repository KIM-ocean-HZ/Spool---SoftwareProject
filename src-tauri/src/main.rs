#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // §20.12: `spool --mcp` speaks MCP over stdio INSTEAD of starting the GUI. Branch
    // before the Tauri builder so the single-instance plugin never fires (it would hand
    // off to a running GUI and exit) and no window/tray/DB-plugin setup happens.
    if std::env::args().any(|a| a == "--mcp") {
        spool_lib::mcp::run();
        return;
    }
    // 2026-08-01 (DESIGN_CAPTURE_HELPER_PROCESS): `spool --overlay` is the capture
    // toast's own process, started and supervised by the main one. Same reason to branch
    // this early — it must not touch single-instance, the tray, the DB or any shortcut.
    if std::env::args().any(|a| a == spool_lib::overlay::HELPER_ARG) {
        spool_lib::run_overlay();
        return;
    }
    spool_lib::run()
}
