# Code Review: src-tauri/src/commands.rs

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Focus Areas**: IPC command validation, file path handling  
**Result**: PASSED (3 Medium, 2 Low, 2 Info)

---

## Summary

This file defines Tauri commands that form the IPC boundary between the React frontend and the Python sidecar engine. The architecture is well-designed with appropriate security controls at the Tauri layer. Findings are primarily around input validation and defensive coding patterns.

---

## [MEDIUM] Missing File Path Validation in upload_holdings

> File path parameter is passed directly to Python without validation

**File**: `src-tauri/src/commands.rs:726-755`  
**Category**: Security  
**Severity**: Medium  

### Description

The `upload_holdings` command accepts a `file_path: String` parameter from the frontend and passes it directly to the Python engine without any path validation in Rust. While the Python side does validate file extensions via `DataCleaner.smart_load()`, there's no path traversal protection or validation that the path is within an allowed directory.

A malicious actor with access to the frontend context could potentially:
1. Read arbitrary files by providing paths like `/etc/passwd` (though this would fail on extension check)
2. Access files outside the app's data directory

### Current Code

```rust
#[tauri::command]
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<serde_json::Value, String> {
    // ... no path validation ...
    let payload = json!({
        "filePath": file_path,
        "etfIsin": etf_isin
    });
    // Passed directly to Python
}
```

### Suggested Fix

```rust
use std::path::PathBuf;

#[tauri::command]
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,
    engine: State<'_, Arc<PythonEngine>>,
    app_handle: AppHandle,
) -> Result<serde_json::Value, String> {
    // Validate file path
    let path = PathBuf::from(&file_path);
    
    // 1. Ensure path exists
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    // 2. Validate extension
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    
    match ext.as_deref() {
        Some("csv") | Some("xlsx") | Some("xls") | Some("json") => {}
        _ => return Err("Unsupported file type. Use CSV, XLSX, or JSON.".to_string()),
    }
    
    // 3. Canonicalize to prevent path traversal
    let canonical = path.canonicalize()
        .map_err(|e| format!("Invalid file path: {}", e))?;
    
    // 4. Optional: Restrict to user's home or downloads directory
    // let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    // if !canonical.starts_with(&home) {
    //     return Err("File must be in user's home directory".to_string());
    // }
    
    let payload = json!({
        "filePath": canonical.to_string_lossy(),
        "etfIsin": etf_isin
    });
    // ...
}
```

### Verification

1. Test with path traversal attempts (`../../etc/passwd`)
2. Test with non-existent files
3. Test with unsupported file extensions
4. Confirm legitimate file uploads still work

---

## [MEDIUM] Missing ISIN Format Validation

> ETF ISIN parameter passed without format validation

**File**: `src-tauri/src/commands.rs:728-729`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `etf_isin` parameter in `upload_holdings` is not validated at the Rust layer. ISINs have a well-defined format (2 letter country code + 9 alphanumeric + 1 check digit). While Python validation may exist downstream, validating at the IPC boundary provides defense in depth and faster feedback.

### Current Code

```rust
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,  // No validation
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<serde_json::Value, String> {
```

### Suggested Fix

```rust
/// Validate ISIN format (2 letter + 9 alphanumeric + 1 check digit = 12 chars)
fn validate_isin(isin: &str) -> Result<(), String> {
    if isin.len() != 12 {
        return Err(format!("ISIN must be 12 characters, got {}", isin.len()));
    }
    
    let chars: Vec<char> = isin.chars().collect();
    
    // First 2 must be letters (country code)
    if !chars[0].is_ascii_uppercase() || !chars[1].is_ascii_uppercase() {
        return Err("ISIN must start with 2-letter country code".to_string());
    }
    
    // Remaining must be alphanumeric
    if !chars[2..].iter().all(|c| c.is_ascii_alphanumeric()) {
        return Err("ISIN must be alphanumeric".to_string());
    }
    
    Ok(())
}

#[tauri::command]
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<serde_json::Value, String> {
    validate_isin(&etf_isin)?;
    // ...
}
```

### Verification

1. Test with invalid ISIN formats
2. Test with valid ISINs (e.g., `IE00B4L5Y983`)

---

## [MEDIUM] Sensitive Credentials Passed via IPC Without Masking in Logs

> Phone and PIN passed in plain text through IPC

**File**: `src-tauri/src/commands.rs:520-561`  
**Category**: Security  
**Severity**: Medium  

### Description

The `tr_login` command passes phone number and PIN directly to the Python engine via JSON IPC. While this is necessary for the login flow, there's a risk that these credentials could appear in logs (especially if debug logging is enabled) or crash reports.

The Rust code uses `eprintln!` for error logging, which could potentially log the payload structure during debugging.

### Current Code

```rust
#[tauri::command]
pub async fn tr_login(
    phone: String,
    pin: String,
    remember: bool,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<AuthResponse, String> {
    // ...
    let payload = json!({
        "phone": phone,
        "pin": pin,  // PIN in plain JSON
        "remember": remember
    });

    match engine.send_command("tr_login", payload).await {
        // ...
        Err(e) => Err(format!("Failed to login: {}", e)),  // Error may include context
    }
}
```

### Suggested Fix

Consider adding scrubbing utilities or ensuring sensitive payloads are never logged:

```rust
// In production, ensure DEBUG logging is off for commands.rs
// Consider structured logging with explicit field exclusion

#[tauri::command]
pub async fn tr_login(
    phone: String,
    pin: String,
    remember: bool,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<AuthResponse, String> {
    if !engine.is_connected().await {
        return Err("Python engine not connected".to_string());
    }

    // Note: phone and pin are intentionally not logged here
    let payload = json!({
        "phone": phone,
        "pin": pin,
        "remember": remember
    });

    match engine.send_command("tr_login", payload).await {
        Ok(response) => {
            // ... handle response
        }
        Err(e) => {
            // Generic error without payload details
            Err("Login failed. Please check your credentials.".to_string())
        }
    }
}
```

### Verification

1. Enable debug logging and verify credentials never appear
2. Check crash reports don't include sensitive data

---

## [LOW] Fallback to Mock Data Without Indication

> Commands silently return mock data when engine disconnected

**File**: `src-tauri/src/commands.rs:265-303`  
**Category**: Correctness  
**Severity**: Low  

### Description

Several commands (`get_engine_health`, `get_dashboard_data`) silently fall back to mock data when the Python engine is not connected or returns an error. While this provides graceful degradation during development, in production it could mislead users into thinking they're seeing real portfolio data.

### Current Code

```rust
#[tauri::command]
pub async fn get_dashboard_data(
    portfolio_id: u32,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<DashboardData, String> {
    if engine.is_connected().await {
        // ... try real data ...
    }
    // Fallback to mock data (no indication it's mock)
    Ok(mock_dashboard_data())
}
```

### Suggested Fix

Add an `isMock` or `dataSource` field to response types:

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    // ... existing fields ...
    #[serde(default)]
    pub data_source: String,  // "live" | "mock" | "cached"
}

fn mock_dashboard_data() -> DashboardData {
    DashboardData {
        // ... mock values ...
        data_source: "mock".to_string(),
    }
}
```

### Verification

1. Frontend should display indicator when data is mock
2. Test with engine connected/disconnected

---

## [LOW] Redundant Pattern in Response Parsing

> Copy-paste pattern repeated across many commands

**File**: `src-tauri/src/commands.rs:226-842`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Nearly every command follows the same pattern for parsing responses from the Python engine. This boilerplate is repeated 15+ times, increasing maintenance burden and risk of inconsistent error handling.

### Current Code (repeated pattern)

```rust
match engine.send_command("command_name", payload).await {
    Ok(response) => {
        if response.status == "success" {
            if let Some(data) = response.data {
                let result: Result<T, _> = serde_json::from_value(data);
                match result {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        eprintln!("Failed to parse ...: {}", e);
                        Err("Failed to parse ...".to_string())
                    }
                }
            } else {
                Err("No data in response".to_string())
            }
        } else {
            Err(response.error.map(|e| e.message).unwrap_or_else(|| "...".to_string()))
        }
    }
    Err(e) => Err(format!("Failed to ...: {}", e)),
}
```

### Suggested Fix

Extract a helper function or macro:

```rust
impl PythonEngine {
    pub async fn send_command_typed<T: serde::de::DeserializeOwned>(
        &self,
        command: &str,
        payload: Value,
    ) -> Result<T, String> {
        let response = self.send_command(command, payload).await?;
        
        if response.status != "success" {
            return Err(response.error
                .map(|e| e.message)
                .unwrap_or_else(|| format!("{} failed", command)));
        }
        
        let data = response.data.ok_or("No data in response")?;
        serde_json::from_value(data)
            .map_err(|e| format!("Failed to parse {} response: {}", command, e))
    }
}

// Usage becomes:
#[tauri::command]
pub async fn tr_get_auth_status(
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<AuthStatus, String> {
    if !engine.is_connected().await {
        return Ok(AuthStatus { /* defaults */ });
    }
    engine.send_command_typed("tr_get_auth_status", json!({})).await
}
```

### Verification

1. Refactor one command and verify behavior matches
2. Ensure error messages remain helpful

---

## [INFO] Consider Adding Rate Limiting for Auth Commands

> Auth commands have no rate limiting at IPC layer

**File**: `src-tauri/src/commands.rs:520-598`  
**Category**: Security  
**Severity**: Info  

### Description

While Trade Republic's API likely has its own rate limiting, the Tauri IPC layer has no protection against rapid-fire login attempts from a compromised frontend. Consider adding basic rate limiting for auth-related commands.

### Verification

Check if Python-side or API-side rate limiting is sufficient.

---

## [INFO] Tauri Capabilities Appear Appropriately Scoped

> Default capabilities include shell permissions for sidecar

**File**: `src-tauri/capabilities/default.json`  
**Category**: Security  
**Severity**: Info  

### Description

The capabilities file grants shell permissions necessary for sidecar operation:
- `shell:allow-spawn` - Needed to spawn Python sidecar
- `shell:allow-execute` - Needed for sidecar execution  
- `shell:allow-kill` - Needed for cleanup
- `shell:allow-stdin-write` - Needed for IPC

These are appropriate for the sidecar pattern and scoped to the main window only. No unnecessary permissions observed.

---

## Positive Observations

1. **Strong Type Safety**: All response types use serde with proper camelCase renaming for frontend compatibility.

2. **Graceful Degradation**: Commands handle disconnected engine state gracefully.

3. **Command ID Correlation**: The IPC protocol uses unique command IDs, preventing response spoofing.

4. **30-Second Timeout**: Appropriate timeout prevents indefinite hangs.

5. **State Injection**: Commands receive `State<Arc<PythonEngine>>` via Tauri's DI, not raw access.

6. **No Hardcoded Secrets**: No credentials or API keys in the codebase.

---

## Summary Table

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 3 | Should fix |
| Low | 2 | Nice to have |
| Info | 2 | No action |
