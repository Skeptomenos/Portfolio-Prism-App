//! Tauri Commands for IPC Bridge
//!
//! These commands are invoked from the React frontend via `invoke()`.
//! Currently returning mock data - will connect to Python sidecar in TASK-201/202.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::thread;
use std::time::Duration;

// =============================================================================
// Response Types (match TypeScript types in src/types/index.ts)
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineHealth {
    pub version: String,
    pub memory_usage_mb: f64,
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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Allocations {
    pub sector: std::collections::HashMap<String, f64>,
    pub region: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub total_value: f64,
    pub total_gain: f64,
    pub gain_percentage: f64,
    pub allocations: Allocations,
    pub top_holdings: Vec<Holding>,
    pub last_updated: String,
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
// Commands
// =============================================================================

/// Get engine health status
#[tauri::command]
pub async fn get_engine_health() -> Result<EngineHealth, String> {
    // TODO: Query Python sidecar via stdin/stdout (TASK-201)
    // For now, return mock data
    
    Ok(EngineHealth {
        version: "0.1.0".to_string(),
        memory_usage_mb: 45.2,
    })
}

/// Get dashboard data for a portfolio
#[tauri::command]
pub async fn get_dashboard_data(portfolio_id: u32) -> Result<DashboardData, String> {
    // TODO: Read from SQLite/Parquet via Python (TASK-201)
    // For now, return mock data
    
    let _ = portfolio_id; // Suppress unused warning
    
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
        },
        Holding {
            isin: "US5949181045".to_string(),
            name: "Microsoft Corp.".to_string(),
            ticker: Some("MSFT".to_string()),
            value: 7150.0,
            weight: 0.057,
            pnl: 650.0,
            pnl_percentage: 10.0,
        },
        Holding {
            isin: "US67066G1040".to_string(),
            name: "NVIDIA Corp.".to_string(),
            ticker: Some("NVDA".to_string()),
            value: 6890.0,
            weight: 0.055,
            pnl: 1240.0,
            pnl_percentage: 21.9,
        },
        Holding {
            isin: "US0231351067".to_string(),
            name: "Amazon.com Inc.".to_string(),
            ticker: Some("AMZN".to_string()),
            value: 5320.0,
            weight: 0.043,
            pnl: 420.0,
            pnl_percentage: 8.6,
        },
        Holding {
            isin: "US30303M1027".to_string(),
            name: "Meta Platforms".to_string(),
            ticker: Some("META".to_string()),
            value: 4280.0,
            weight: 0.034,
            pnl: -120.0,
            pnl_percentage: -2.7,
        },
    ];
    
    Ok(DashboardData {
        total_value: 124592.0,
        total_gain: 12459.0,
        gain_percentage: 11.1,
        allocations: Allocations { sector, region },
        top_holdings,
        last_updated: chrono::Utc::now().to_rfc3339(),
    })
}

/// Trigger portfolio sync
#[tauri::command]
pub async fn sync_portfolio(
    app_handle: AppHandle,
    portfolio_id: u32,
    force: bool,
) -> Result<SyncResult, String> {
    // TODO: Send command to Python sidecar (TASK-201)
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
            thread::sleep(Duration::from_millis(500));
        }
        
        // Emit portfolio-updated event
        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct PortfolioUpdated {
            timestamp: String,
            portfolio_id: u32,
        }
        
        let _ = handle.emit("portfolio-updated", PortfolioUpdated {
            timestamp: chrono::Utc::now().to_rfc3339(),
            portfolio_id,
        });
    });
    
    Ok(SyncResult {
        success: true,
        message: "Sync started".to_string(),
    })
}
