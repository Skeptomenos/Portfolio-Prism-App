//! Portfolio Prism - Tauri Application
//!
//! This is the main Rust library for the Tauri shell.
//! It handles:
//! - IPC commands from React frontend
//! - Python sidecar process management
//! - Event emission to frontend
//! - Single instance enforcement via lock file

mod commands;
mod python_engine;

use commands::{
    get_dashboard_data, get_engine_health, get_hive_contribution, get_overlap_analysis,
    get_pipeline_report, get_positions, get_true_holdings, run_pipeline, set_hive_contribution,
    sync_portfolio, tr_check_saved_session, tr_get_auth_status, tr_login, tr_logout, tr_submit_2fa,
    upload_holdings,
};
use python_engine::{PythonEngine, StdoutMessage};
use std::fs::{File, OpenOptions};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use fs2::FileExt;

// Legacy greet command (can be removed later)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Holds the lock file handle to prevent multiple instances.
/// Must be kept alive for the duration of the application.
static LOCK_FILE: std::sync::OnceLock<File> = std::sync::OnceLock::new();

fn acquire_instance_lock(data_dir: &std::path::Path) -> Result<File, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    
    let lock_path = data_dir.join(".instance.lock");
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .map_err(|e| format!("Failed to open lock file: {}", e))?;
    
    file.try_lock_exclusive()
        .map_err(|_| "Another instance of Portfolio Prism is already running.".to_string())?;
    
    Ok(file)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            
            match acquire_instance_lock(&data_dir) {
                Ok(lock_file) => {
                    let _ = LOCK_FILE.set(lock_file);
                }
                Err(msg) => {
                    eprintln!("Instance lock failed: {}", msg);
                    #[cfg(target_os = "macos")]
                    {
                        use std::process::Command;
                        let _ = Command::new("osascript")
                            .args(["-e", &format!(
                                "display dialog \"{}\" buttons {{\"OK\"}} default button \"OK\" with icon stop with title \"Portfolio Prism\"",
                                msg
                            )])
                            .output();
                    }
                    std::process::exit(1);
                }
            }

            let engine = Arc::new(PythonEngine::new());

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

                        if trimmed.contains("PRISM") && trimmed.contains("↳") {
                            println!("{}", trimmed);
                            continue;
                        }

                        if trimmed.contains("possibly delisted") || trimmed.contains("No historical data found") {
                            continue;
                        }
                        
                        if trimmed.starts_with("DEBUG") || trimmed.contains("] DEBUG") || trimmed.contains("DEBUG:") {
                            continue;
                        }

                        let level_prefix = if trimmed.contains("Traceback") || trimmed.contains("Error:") {
                            "\x1b[31mFATAL\x1b[0m"
                        } else {
                            "\x1b[90mLOG  \x1b[0m"
                        };

                        println!("  \x1b[90mPRISM\x1b[0m ↳ {} {}", level_prefix, trimmed);
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
            upload_holdings,
            set_hive_contribution,
            get_hive_contribution
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
