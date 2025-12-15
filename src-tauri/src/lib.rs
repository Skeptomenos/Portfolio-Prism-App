//! Portfolio Prism - Tauri Application
//!
//! This is the main Rust library for the Tauri shell.
//! It handles:
//! - IPC commands from React frontend
//! - Python sidecar process management
//! - Event emission to frontend

mod commands;
mod python_engine;

use commands::{get_dashboard_data, get_engine_health, sync_portfolio};
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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create Python engine manager
            let engine = Arc::new(PythonEngine::new());

            // Store engine in app state
            app.manage(engine.clone());

            let app_handle = app.handle().clone();

            // Get the app data directory for storing user data
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let data_dir_str = data_dir.to_string_lossy().to_string();

            // Emit initial engine status
            let _ = app_handle.emit(
                "engine-status",
                serde_json::json!({
                    "status": "connecting",
                    "progress": 0,
                    "message": "Starting Python engine..."
                }),
            );

            // Clone engine for the async task
            let engine_clone = engine.clone();
            let app_handle_clone = app_handle.clone();

            tauri::async_runtime::spawn(async move {
                // Try to spawn the headless sidecar first, fall back to prism
                let sidecar_name = "prism-headless";

                let sidecar_result = app_handle_clone
                    .shell()
                    .sidecar(sidecar_name)
                    .expect("Failed to create sidecar command")
                    .env("PRISM_DATA_DIR", &data_dir_str)
                    .spawn();

                match sidecar_result {
                    Ok((mut rx, child)) => {
                        // Store child for writing to stdin
                        engine_clone.set_child(child).await;

                        // Process stdout events
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    let line_str = String::from_utf8_lossy(&line);
                                    let line_trimmed = line_str.trim();

                                    if line_trimmed.is_empty() {
                                        continue;
                                    }

                                    // Parse the message
                                    if let Some(msg) = PythonEngine::parse_stdout(line_trimmed) {
                                        match msg {
                                            StdoutMessage::Ready(signal) => {
                                                println!(
                                                    "Python engine ready: version={}",
                                                    signal.version
                                                );
                                                engine_clone
                                                    .set_connected(signal.version.clone())
                                                    .await;

                                                // Emit connected status
                                                let _ = app_handle_clone.emit(
                                                    "engine-status",
                                                    serde_json::json!({
                                                        "status": "idle",
                                                        "progress": 100,
                                                        "message": format!("Engine v{} connected", signal.version)
                                                    }),
                                                );
                                            }
                                            StdoutMessage::Response(response) => {
                                                engine_clone.handle_response(response).await;
                                            }
                                        }
                                    } else {
                                        // Log unparseable output
                                        println!("Python stdout: {}", line_trimmed);
                                    }
                                }
                                CommandEvent::Stderr(line) => {
                                    let line_str = String::from_utf8_lossy(&line);
                                    eprintln!("Python stderr: {}", line_str.trim());
                                }
                                CommandEvent::Error(err) => {
                                    eprintln!("Python error: {}", err);
                                    engine_clone.set_disconnected().await;
                                    let _ = app_handle_clone.emit(
                                        "engine-status",
                                        serde_json::json!({
                                            "status": "error",
                                            "progress": 0,
                                            "message": format!("Engine error: {}", err)
                                        }),
                                    );
                                }
                                CommandEvent::Terminated(payload) => {
                                    eprintln!("Python terminated: {:?}", payload);
                                    engine_clone.set_disconnected().await;
                                    let _ = app_handle_clone.emit(
                                        "engine-status",
                                        serde_json::json!({
                                            "status": "disconnected",
                                            "progress": 0,
                                            "message": "Engine terminated"
                                        }),
                                    );
                                }
                                _ => {}
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to spawn {} sidecar: {}", sidecar_name, e);
                        // Emit error status but continue - commands will use mock data
                        let _ = app_handle_clone.emit(
                            "engine-status",
                            serde_json::json!({
                                "status": "error",
                                "progress": 0,
                                "message": format!("Python engine failed to start: {}. Using mock data.", e)
                            }),
                        );
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
