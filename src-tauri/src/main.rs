#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // §20.12: `spool --mcp` speaks MCP over stdio INSTEAD of starting the GUI. Branch
    // before the Tauri builder so the single-instance plugin never fires (it would hand
    // off to a running GUI and exit) and no window/tray/DB-plugin setup happens.
    if std::env::args().any(|a| a == "--mcp") {
        spool_lib::mcp::run();
        return;
    }
    spool_lib::run()
}
