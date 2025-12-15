//! Tauri Commands for IPC Bridge
//!
//! These commands are invoked from the React frontend via `invoke()`.
//! Commands communicate with the Python engine via stdin/stdout IPC.
//! Falls back to mock data if Python engine is not connected.

use crate::python_engine::PythonEngine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub status: String,
    pub progress: u8,
    pub message: String,
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

/// Trigger portfolio sync
#[tauri::command]
pub async fn sync_portfolio(
    app_handle: AppHandle,
    portfolio_id: u32,
    force: bool,
) -> Result<SyncResult, String> {
    // TODO: Implement real sync via Python engine (TASK-205)
    // For now, simulate sync with progress events

    let _ = force; // Suppress unused warning

    // Clone app_handle for the async block
    let handle = app_handle.clone();

    // Spawn a task to emit progress events
    tauri::async_runtime::spawn(async move {
        let steps = vec![
            (10, "Connecting to Trade Republic..."),
            (30, "Fetching portfolio data..."),
            (50, "Enriching holdings data..."),
            (70, "Calculating analytics..."),
            (90, "Finalizing..."),
            (100, "Sync complete!"),
        ];

        for (progress, message) in steps {
            let status = if progress == 100 { "complete" } else { "syncing" };

            let payload = SyncProgress {
                status: status.to_string(),
                progress,
                message: message.to_string(),
            };

            let _ = handle.emit("sync-progress", payload);
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // Emit portfolio-updated event
        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct PortfolioUpdated {
            timestamp: String,
            portfolio_id: u32,
        }

        let _ = handle.emit(
            "portfolio-updated",
            PortfolioUpdated {
                timestamp: chrono::Utc::now().to_rfc3339(),
                portfolio_id,
            },
        );
    });

    Ok(SyncResult {
        success: true,
        message: "Sync started".to_string(),
    })
}
