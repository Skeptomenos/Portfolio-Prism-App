//! Tauri Commands for IPC Bridge
//!
//! These commands are invoked from the React frontend via `invoke()`.
//! Commands communicate with the Python engine via stdin/stdout IPC.
//! Falls back to mock data if Python engine is not connected.

use crate::python_engine::PythonEngine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

// =============================================================================
// Response Types (match TypeScript types in src/types/index.ts)
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineHealth {
    pub version: String,
    pub memory_usage_mb: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub db_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub isin: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticker: Option<String>,
    pub value: f64,
    pub weight: f64,
    pub pnl: f64,
    pub pnl_percentage: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_class: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Allocations {
    pub sector: std::collections::HashMap<String, f64>,
    pub region: std::collections::HashMap<String, f64>,
    #[serde(default)]
    pub asset_class: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub total_value: f64,
    pub total_gain: f64,
    pub gain_percentage: f64,
    pub allocations: Allocations,
    pub top_holdings: Vec<Holding>,
    pub last_updated: Option<String>,
    #[serde(default)]
    pub is_empty: bool,
    #[serde(default)]
    pub position_count: u32,
}

// Note: SyncResult was replaced by PortfolioSyncResult

// =============================================================================
// Trade Republic Auth Types
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub auth_state: String,
    pub has_stored_credentials: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCheck {
    pub has_session: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub auth_state: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub countdown: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoutResponse {
    pub auth_state: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSyncResult {
    pub synced_positions: u32,
    pub new_positions: u32,
    pub updated_positions: u32,
    pub total_value: f64,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub status: String,
    pub progress: u8,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub isin: String,
    pub name: String,
    #[serde(default)]
    pub ticker: String,
    pub instrument_type: String,
    pub quantity: f64,
    pub avg_buy_price: f64,
    pub current_price: f64,
    pub current_value: f64,
    pub total_cost: f64,
    pub pnl_eur: f64,
    pub pnl_percent: f64,
    pub weight: f64,
    pub currency: String,
    #[serde(default)]
    pub notes: String,
    pub last_updated: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionsResponse {
    pub positions: Vec<Position>,
    pub total_value: f64,
    pub total_cost: f64,
    pub total_pnl: f64,
    pub total_pnl_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_time: Option<String>,
}

// =============================================================================
// Mock Data (fallback when Python engine not connected)
// =============================================================================

fn mock_dashboard_data() -> DashboardData {
    let mut sector = std::collections::HashMap::new();
    sector.insert("Technology".to_string(), 0.35);
    sector.insert("Healthcare".to_string(), 0.18);
    sector.insert("Financials".to_string(), 0.15);
    sector.insert("Consumer Discretionary".to_string(), 0.12);
    sector.insert("Industrials".to_string(), 0.10);
    sector.insert("Other".to_string(), 0.10);

    let mut region = std::collections::HashMap::new();
    region.insert("North America".to_string(), 0.62);
    region.insert("Europe".to_string(), 0.22);
    region.insert("Asia Pacific".to_string(), 0.12);
    region.insert("Emerging Markets".to_string(), 0.04);

    let top_holdings = vec![
        Holding {
            isin: "US0378331005".to_string(),
            name: "Apple Inc.".to_string(),
            ticker: Some("AAPL".to_string()),
            value: 8420.0,
            weight: 0.068,
            pnl: 842.0,
            pnl_percentage: 11.1,
            quantity: Some(50.0),
            asset_class: Some("Equity".to_string()),
        },
        Holding {
            isin: "US5949181045".to_string(),
            name: "Microsoft Corp.".to_string(),
            ticker: Some("MSFT".to_string()),
            value: 7150.0,
            weight: 0.057,
            pnl: 650.0,
            pnl_percentage: 10.0,
            quantity: Some(18.0),
            asset_class: Some("Equity".to_string()),
        },
    ];

    DashboardData {
        total_value: 124592.0,
        total_gain: 12459.0,
        gain_percentage: 11.1,
        allocations: Allocations {
            sector,
            region,
            asset_class: std::collections::HashMap::new(),
        },
        top_holdings,
        last_updated: Some(chrono::Utc::now().to_rfc3339()),
        is_empty: false,
        position_count: 15,
    }
}

// =============================================================================
// Commands
// =============================================================================

/// Get engine health status
#[tauri::command]
pub async fn get_engine_health(
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<EngineHealth, String> {
    // Try to get real data from Python engine
    if engine.is_connected().await {
        match engine.send_command("get_health", json!({})).await {
            Ok(response) => {
                if response.status == "success" {
                    if let Some(data) = response.data {
                        // Parse the response data
                        let health = EngineHealth {
                            version: data["version"].as_str().unwrap_or("0.0.0").to_string(),
                            memory_usage_mb: data["memoryUsageMb"].as_f64().unwrap_or(0.0),
                            uptime_seconds: data["uptimeSeconds"].as_f64(),
                            db_path: data["dbPath"].as_str().map(|s| s.to_string()),
                        };
                        return Ok(health);
                    }
                }
                // Log error but fall through to mock
                eprintln!("Engine health error: {:?}", response.error);
            }
            Err(e) => {
                eprintln!("Failed to get engine health: {}", e);
            }
        }
    }

    // Fallback to mock data
    Ok(EngineHealth {
        version: engine
            .get_version()
            .await
            .unwrap_or_else(|| "0.1.0 (mock)".to_string()),
        memory_usage_mb: 0.0,
        uptime_seconds: None,
        db_path: None,
    })
}

/// Get dashboard data for a portfolio
#[tauri::command]
pub async fn get_dashboard_data(
    portfolio_id: u32,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<DashboardData, String> {
    // Try to get real data from Python engine
    if engine.is_connected().await {
        match engine
            .send_command("get_dashboard_data", json!({"portfolioId": portfolio_id}))
            .await
        {
            Ok(response) => {
                if response.status == "success" {
                    if let Some(data) = response.data {
                        // Parse the response data
                        let dashboard: Result<DashboardData, _> = serde_json::from_value(data);
                        match dashboard {
                            Ok(d) => return Ok(d),
                            Err(e) => {
                                eprintln!("Failed to parse dashboard data: {}", e);
                            }
                        }
                    }
                }
                // Log error but fall through to mock
                eprintln!("Dashboard data error: {:?}", response.error);
            }
            Err(e) => {
                eprintln!("Failed to get dashboard data: {}", e);
            }
        }
    }

    // Fallback to mock data
    Ok(mock_dashboard_data())
}

/// Get all positions for a portfolio (full data for the table)
#[tauri::command]
pub async fn get_positions(
    portfolio_id: u32,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<PositionsResponse, String> {
    if !engine.is_connected().await {
        // Return empty response if engine not connected
        return Ok(PositionsResponse {
            positions: vec![],
            total_value: 0.0,
            total_cost: 0.0,
            total_pnl: 0.0,
            total_pnl_percent: 0.0,
            last_sync_time: None,
        });
    }

    match engine
        .send_command("get_positions", json!({"portfolioId": portfolio_id}))
        .await
    {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let positions_response: Result<PositionsResponse, _> =
                        serde_json::from_value(data);
                    match positions_response {
                        Ok(p) => return Ok(p),
                        Err(e) => {
                            eprintln!("Failed to parse positions data: {}", e);
                            return Err(format!("Failed to parse positions: {}", e));
                        }
                    }
                }
            }
            if let Some(err) = response.error {
                return Err(err.message);
            }
            Err("Unknown error getting positions".to_string())
        }
        Err(e) => Err(format!("Failed to get positions: {}", e)),
    }
}

/// Trigger portfolio sync with real Trade Republic data
#[tauri::command]
pub async fn sync_portfolio(
    app_handle: AppHandle,
    portfolio_id: u32,
    force: bool,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<PortfolioSyncResult, String> {
    if !engine.is_connected().await {
        return Err("Python engine not connected".to_string());
    }

    let payload = json!({
        "portfolioId": portfolio_id,
        "force": force
    });

    // Clone app_handle for the async block
    let _handle = app_handle.clone();

    // TODO: Implement event listening from Python engine
    // For now, progress events are handled via direct responses
    // engine.listen_events("sync_progress", move |event_data| {
    //     if let (Some(progress), Some(message)) = (
    //         event_data.get("progress").and_then(|v| v.as_u64()),
    //         event_data.get("message").and_then(|v| v.as_str()),
    //     ) {
    //         let payload = SyncProgress {
    //             status: "syncing".to_string(),
    //             progress: progress as u8,
    //             message: message.to_string(),
    //         };
    //         let _ = handle.emit("sync-progress", payload);
    //     }
    // }).await;

    match engine.send_command("sync_portfolio", payload).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let sync_result: Result<PortfolioSyncResult, _> = serde_json::from_value(data);
                    match sync_result {
                        Ok(result) => {
                            // Emit final completion event
                            let payload = SyncProgress {
                                status: "complete".to_string(),
                                progress: 100,
                                message: "Sync complete!".to_string(),
                            };
                            let _ = app_handle.emit("sync-progress", payload);

                            // Emit portfolio-updated event
                            #[derive(Clone, Serialize)]
                            #[serde(rename_all = "camelCase")]
                            struct PortfolioUpdated {
                                timestamp: String,
                                portfolio_id: u32,
                            }

                            let _ = app_handle.emit(
                                "portfolio-updated",
                                PortfolioUpdated {
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    portfolio_id,
                                },
                            );

                            Ok(result)
                        }
                        Err(e) => {
                            eprintln!("Failed to parse sync result: {}", e);
                            Err("Failed to parse sync result".to_string())
                        }
                    }
                } else {
                    Err("No data in sync response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Sync failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to sync portfolio: {}", e)),
    }
}

/// Get current Trade Republic authentication status
#[tauri::command]
pub async fn tr_get_auth_status(
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<AuthStatus, String> {
    if !engine.is_connected().await {
        return Ok(AuthStatus {
            auth_state: "idle".to_string(),
            has_stored_credentials: false,
            last_error: Some("Python engine not connected".to_string()),
        });
    }

    match engine.send_command("tr_get_auth_status", json!({})).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let auth_status: Result<AuthStatus, _> = serde_json::from_value(data);
                    match auth_status {
                        Ok(status) => Ok(status),
                        Err(e) => {
                            eprintln!("Failed to parse auth status: {}", e);
                            Err("Failed to parse auth status".to_string())
                        }
                    }
                } else {
                    Err("No data in auth status response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Auth status check failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to get auth status: {}", e)),
    }
}

/// Check for saved Trade Republic session
#[tauri::command]
pub async fn tr_check_saved_session(
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<SessionCheck, String> {
    if !engine.is_connected().await {
        return Ok(SessionCheck {
            has_session: false,
            phone_number: None,
            prompt: "login_required".to_string(),
        });
    }

    match engine
        .send_command("tr_check_saved_session", json!({}))
        .await
    {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let session_check: Result<SessionCheck, _> = serde_json::from_value(data);
                    match session_check {
                        Ok(check) => Ok(check),
                        Err(e) => {
                            eprintln!("Failed to parse session check: {}", e);
                            Err("Failed to parse session check".to_string())
                        }
                    }
                } else {
                    Err("No data in session check response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Session check failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to check session: {}", e)),
    }
}

/// Start Trade Republic login process
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

    let payload = json!({
        "phone": phone,
        "pin": pin,
        "remember": remember
    });

    match engine.send_command("tr_login", payload).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let auth_response: Result<AuthResponse, _> = serde_json::from_value(data);
                    match auth_response {
                        Ok(resp) => Ok(resp),
                        Err(e) => {
                            eprintln!("Failed to parse auth response: {}", e);
                            Err("Failed to parse auth response".to_string())
                        }
                    }
                } else {
                    Err("No data in auth response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Login failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to login: {}", e)),
    }
}

/// Submit 2FA code for Trade Republic
#[tauri::command]
pub async fn tr_submit_2fa(
    code: String,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<AuthResponse, String> {
    if !engine.is_connected().await {
        return Err("Python engine not connected".to_string());
    }

    let payload = json!({ "code": code });

    match engine.send_command("tr_submit_2fa", payload).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let auth_response: Result<AuthResponse, _> = serde_json::from_value(data);
                    match auth_response {
                        Ok(resp) => Ok(resp),
                        Err(e) => {
                            eprintln!("Failed to parse 2FA response: {}", e);
                            Err("Failed to parse 2FA response".to_string())
                        }
                    }
                } else {
                    Err("No data in 2FA response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "2FA verification failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to submit 2FA: {}", e)),
    }
}

/// Logout from Trade Republic
#[tauri::command]
pub async fn tr_logout(engine: State<'_, Arc<PythonEngine>>) -> Result<LogoutResponse, String> {
    if !engine.is_connected().await {
        return Err("Python engine not connected".to_string());
    }

    match engine.send_command("tr_logout", json!({})).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let logout_response: Result<LogoutResponse, _> = serde_json::from_value(data);
                    match logout_response {
                        Ok(resp) => Ok(resp),
                        Err(e) => {
                            eprintln!("Failed to parse logout response: {}", e);
                            Err("Failed to parse logout response".to_string())
                        }
                    }
                } else {
                    Err("No data in logout response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Logout failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to logout: {}", e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineResult {
    pub success: bool,
    pub errors: Vec<String>,
    pub duration_ms: u32,
}

/// Trigger analytics pipeline manually
#[tauri::command]
pub async fn run_pipeline(engine: State<'_, Arc<PythonEngine>>) -> Result<PipelineResult, String> {
    if !engine.is_connected().await {
        return Err("Python engine not connected".to_string());
    }

    match engine.send_command("run_pipeline", json!({})).await {
        Ok(response) => {
            if response.status == "success" {
                if let Some(data) = response.data {
                    let result: Result<PipelineResult, _> = serde_json::from_value(data);
                    match result {
                        Ok(p) => Ok(p),
                        Err(e) => {
                            eprintln!("Failed to parse pipeline result: {}", e);
                            Err("Failed to parse pipeline result".to_string())
                        }
                    }
                } else {
                    Err("No data in pipeline response".to_string())
                }
            } else {
                Err(response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Pipeline failed".to_string()))
            }
        }
        Err(e) => Err(format!("Failed to run pipeline: {}", e)),
    }
}

/// Get the latest pipeline health report from disk
#[tauri::command]
pub async fn get_pipeline_report(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    use std::fs;

    // Resolve app data dir
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let report_path = data_dir.join("outputs").join("pipeline_health.json");

    if !report_path.exists() {
        return Err("Report file not found".to_string());
    }

    let content =
        fs::read_to_string(report_path).map_err(|e| format!("Failed to read report: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse report: {}", e))?;

    Ok(json)
}
