//! Portfolio Prism - Tauri Application
//!
//! This is the main Rust library for the Tauri shell.
//! It handles:
//! - IPC commands from React frontend
//! - Python sidecar process management
//! - Event emission to frontend

mod commands;

use commands::{get_engine_health, get_dashboard_data, sync_portfolio};

// Legacy greet command (can be removed later)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri_plugin_shell::ShellExt;
            use tauri_plugin_shell::process::CommandEvent;
            use tauri::{Manager, Emitter};

            let app_handle = app.handle().clone();
            
            // Get the app data directory for storing user data
            let data_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let data_dir_str = data_dir.to_string_lossy().to_string();
            
            // Emit initial engine status
            let _ = app_handle.emit("engine-status", serde_json::json!({
                "status": "connecting",
                "progress": 0,
                "message": "Starting Python engine..."
            }));
            
            tauri::async_runtime::spawn(async move {
                // Use sidecar - this resolves to binaries/prism-<platform>
                let sidecar_result = app_handle.shell().sidecar("prism")
                    .expect("Failed to create sidecar command")
                    .env("PRISM_DATA_DIR", &data_dir_str)
                    .spawn();

                match sidecar_result {
                    Ok((mut rx, _child)) => {
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Stdout(line) = event {
                                let line_str = String::from_utf8_lossy(&line);
                                println!("Python: {}", line_str);
                                
                                if line_str.contains("port") {
                                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line_str) {
                                        let _ = app_handle.emit("python-ready", json);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to spawn prism sidecar: {}", e);
                        // Emit error status but continue - we can still serve mock data
                        let _ = app_handle.emit("engine-status", serde_json::json!({
                            "status": "error",
                            "progress": 0,
                            "message": format!("Python engine failed to start: {}", e)
                        }));
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_engine_health,
            get_dashboard_data,
            sync_portfolio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
