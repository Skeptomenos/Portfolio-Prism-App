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
    get_dashboard_data, get_engine_health, get_overlap_analysis, get_pipeline_report, get_positions,
    get_true_holdings, run_pipeline, sync_portfolio, tr_check_saved_session, tr_get_auth_status,
    tr_login, tr_logout, tr_submit_2fa, upload_holdings,
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
                        if let Some(message) = PythonEngine::parse_stdout(&line) {
                            match message {
                                StdoutMessage::Ready(signal) => {
                                    println!("  \x1b[32m✓\x1b[0m Python Engine Ready (v{}, PID: {})", signal.version, signal.pid);
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
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        // Filter out repetitive noise
                        if trimmed.contains("possibly delisted") || trimmed.contains("No historical data found") {
                            continue;
                        }
                        
                        if trimmed.contains("DEBUG") || trimmed.contains("DEBUG:") {
                            continue;
                        }

                        if trimmed.contains("[TR Daemon]") && !trimmed.contains("ERROR") && !trimmed.contains("WARNING") {
                            continue;
                        }

                        if trimmed.contains("[TR Bridge]") && !trimmed.contains("ERROR") {
                            continue;
                        }

                        // Beautiful Log Formatting
                        let (level_prefix, msg) = if trimmed.starts_with("[INFO]") {
                            ("\x1b[34mINFO \x1b[0m", &trimmed[6..])
                        } else if trimmed.starts_with("[WARNING]") {
                            ("\x1b[33mWARN \x1b[0m", &trimmed[9..])
                        } else if trimmed.starts_with("[ERROR]") {
                            ("\x1b[31mERROR\x1b[0m", &trimmed[7..])
                        } else if trimmed.contains("Traceback") || trimmed.contains("Error:") {
                            ("\x1b[31mFATAL\x1b[0m", trimmed)
                        } else {
                            ("\x1b[90mLOG  \x1b[0m", trimmed)
                        };

                        println!("  \x1b[90mPRISM\x1b[0m ↳ {} {}", level_prefix, msg.trim());
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
            get_pipeline_report,
            get_true_holdings,
            get_overlap_analysis,
            upload_holdings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
