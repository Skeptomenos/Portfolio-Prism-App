//! Portfolio Prism - Tauri Application
//!
//! This is the main Rust library for the Tauri shell.
//! It handles:
//! - IPC commands from React frontend
//! - Python sidecar process management
//! - Event emission to frontend

mod commands;
mod python_engine;

use commands::{
    get_dashboard_data, get_engine_health, get_pipeline_report, get_positions, run_pipeline,
    sync_portfolio, tr_check_saved_session, tr_get_auth_status, tr_login, tr_logout, tr_submit_2fa,
};
use python_engine::{PythonEngine, StdoutMessage};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// Legacy greet command (can be removed later)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create Python engine manager
            let engine = Arc::new(PythonEngine::new());

            // Spawn the sidecar
            // Note: "prism" matches the externalBin name in tauri.conf.json
            // We use prism-headless for the React UI (Phase 5 architecture)
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let data_dir_str = data_dir.to_string_lossy().to_string();

            let (mut rx, child) = app
                .shell()
                .sidecar("prism-headless")
                .expect("failed to create sidecar")
                .env("PRISM_DATA_DIR", &data_dir_str)
                .spawn()
                .expect("failed to spawn sidecar");

            // Set the child process for stdin writing
            let engine_clone = engine.clone();
            tauri::async_runtime::spawn(async move {
                engine_clone.set_child(child).await;
            });

            // Start reading stdout from the sidecar
            let engine_clone = engine.clone();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line_bytes) = event {
                        let line = String::from_utf8_lossy(&line_bytes);
                        // log::debug!("Python stdout: {}", line);

                        if let Some(message) = PythonEngine::parse_stdout(&line) {
                            match message {
                                StdoutMessage::Ready(signal) => {
                                    log::info!(
                                        "Python engine started: PID {}, Version {}",
                                        signal.pid,
                                        signal.version
                                    );
                                    engine_clone.set_connected(signal.version).await;
                                    let _ = app_handle.emit("engine-ready", ());
                                }
                                StdoutMessage::Response(response) => {
                                    engine_clone.handle_response(response).await;
                                }
                            }
                        }
                    } else if let CommandEvent::Stderr(line_bytes) = event {
                        let line = String::from_utf8_lossy(&line_bytes);
                        log::error!("Python stderr: {}", line);
                    }
                }
            });

            // Make the engine available to commands via state
            app.manage(engine);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_engine_health,
            get_dashboard_data,
            get_positions,
            sync_portfolio,
            tr_get_auth_status,
            tr_check_saved_session,
            tr_login,
            tr_submit_2fa,
            tr_logout,
            run_pipeline,
            get_pipeline_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
