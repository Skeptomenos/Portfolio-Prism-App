// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
            
            tauri::async_runtime::spawn(async move {
                // Use sidecar - this resolves to binaries/prism-<platform>
                let (mut rx, _child) = app_handle.shell().sidecar("prism")
                    .expect("Failed to create sidecar command")
                    .env("PRISM_DATA_DIR", &data_dir_str)
                    .spawn()
                    .expect("Failed to spawn prism sidecar");

                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        let line_str = String::from_utf8_lossy(&line);
                        println!("Python: {}", line_str);
                        
                        if line_str.contains("port") {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line_str) {
                                app_handle.emit("python-ready", json).unwrap();
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
