# Rust & Tauri Standards

> **Read this when:** Writing or reviewing Rust code in `src-tauri/`.
> **Also read:** `global.md` for language-agnostic rules.

---

## 1. Code Style & Formatting

### 1.1 Tooling
- **Formatter:** `rustfmt` — Run `cargo fmt` before committing
- **Linter:** `clippy` — Run `cargo clippy` and fix all warnings
- **Edition:** Rust 2021

### 1.2 Naming Conventions
- **Functions/Variables:** `snake_case`
- **Types/Traits:** `PascalCase`
- **Constants:** `SCREAMING_SNAKE_CASE`
- **Modules:** `snake_case` (file names match module names)

### 1.3 Error Handling
```rust
// GOOD: Use Result with context
fn spawn_sidecar() -> Result<Child, SidecarError> {
    Command::new("python")
        .spawn()
        .map_err(|e| SidecarError::SpawnFailed(e.to_string()))
}

// BAD: Unwrap in production code
let child = Command::new("python").spawn().unwrap(); // Never do this
```

- Use `thiserror` for custom error types
- Use `anyhow` for application-level error propagation
- Reserve `.unwrap()` for tests only

---

## 2. Tauri-Specific Patterns

### 2.1 Plugin Configuration
```rust
// In lib.rs — use the builder pattern
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::init())
    .invoke_handler(tauri::generate_handler![...])
    .run(tauri::generate_context!())
    .expect("error running tauri application");
```

### 2.2 Sidecar Communication
```rust
// Listen to stdout for JSON messages from Python
use serde::Deserialize;

#[derive(Deserialize)]
struct SidecarReady {
    event: String,
    port: u16,
}

// Parse lines from stdout
if let Ok(msg) = serde_json::from_str::<SidecarReady>(&line) {
    if msg.event == "server_started" {
        // Navigate webview to localhost:port
    }
}
```

### 2.3 Dead Man's Switch
```rust
// Keep stdin open; Python monitors for EOF
// When Tauri exits, stdin closes, Python self-terminates
let mut child = Command::new("python")
    .stdin(Stdio::piped())  // Keep pipe open
    .stdout(Stdio::piped())
    .spawn()?;
```

### 2.4 Environment Variables
```rust
// Pass data directory to Python via env var
use tauri::api::path::app_data_dir;

let data_dir = app_data_dir(&config)
    .expect("Failed to get app data dir");

Command::new("python")
    .env("PRISM_DATA_DIR", data_dir)
    .spawn()?;
```

---

## 3. Async Patterns

### 3.1 Tauri Commands
```rust
// Async commands are preferred for I/O
#[tauri::command]
async fn fetch_data() -> Result<String, String> {
    // Async I/O here
    Ok("data".to_string())
}

// Sync commands for pure computation only
#[tauri::command]
fn calculate(x: i32) -> i32 {
    x * 2
}
```

### 3.2 Blocking Operations
```rust
// Never block the main thread
// Use spawn_blocking for CPU-intensive work
tokio::task::spawn_blocking(|| {
    // Heavy computation here
}).await
```

---

## 4. Security

### 4.1 Capabilities (CSP)
- Define minimal capabilities in `src-tauri/capabilities/default.json`
- Only allow necessary permissions (shell, updater)
- Do not enable `fs:all` or `shell:all` — use scoped permissions

### 4.2 No Secrets in Code
```rust
// BAD: Hardcoded secret
const API_KEY: &str = "sk-12345...";

// GOOD: Read from env at runtime
let api_key = std::env::var("API_KEY")
    .expect("API_KEY not set");
```

### 4.3 Input Validation
- Validate all data received from frontend via `#[tauri::command]`
- Use `serde` with strict typing — no `serde_json::Value` unless necessary

---

## 5. Testing

### 5.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sidecar_message() {
        let json = r#"{"event": "server_started", "port": 8080}"#;
        let msg: SidecarReady = serde_json::from_str(json).unwrap();
        assert_eq!(msg.port, 8080);
    }
}
```

### 5.2 Integration Tests
- Test sidecar spawn/shutdown in `tests/` directory
- Use `#[tokio::test]` for async tests

---

## 6. Dependencies

### 6.1 Approved Crates
| Crate | Purpose |
|-------|---------|
| `serde` / `serde_json` | Serialization |
| `thiserror` | Custom error types |
| `anyhow` | Error propagation |
| `tokio` | Async runtime (via Tauri) |
| `tauri-plugin-shell` | Sidecar management |
| `tauri-plugin-updater` | Auto-updates |

### 6.2 Forbidden Patterns
| Pattern | Reason |
|---------|--------|
| `unsafe` blocks | Security risk — avoid unless absolutely necessary |
| `.unwrap()` in prod | Use `?` or `.expect()` with context |
| Global mutable state | Use Tauri's `State` manager instead |
| Blocking in async | Deadlock risk — use `spawn_blocking` |

---

## 7. File Organization

```
src-tauri/
├── src/
│   ├── main.rs       # Entry point (minimal)
│   ├── lib.rs        # Tauri setup, plugins, commands
│   ├── sidecar.rs    # Python process management (future)
│   └── commands/     # Tauri command modules (future)
├── capabilities/
│   └── default.json  # Permission definitions
├── Cargo.toml        # Dependencies
└── tauri.conf.json   # Tauri configuration
```
