# IPC API Spec (State in Motion)

> **Purpose:** Defines the Interface Protocol between Rust (Shell) and Python (Engine), and the Events for React (UI).
> **Usage:** Used by React devs (mocking) and Rust/Python devs (implementation) to ensure services can talk to each other.
> **See Strategy:** `keystone/strategy/architecture-overview.md` for the Data Cycle.

---

## 1. Command Protocol (Rust -> Python)

**Transport:** Rust writes JSON to Python's `stdin`. Python reads line-by-line.

### 1.1 `sync_portfolio`
Triggers the full ETL pipeline.

**Request:**
```json
{
  "command": "sync_portfolio",
  "payload": {
    "force_refresh": false,
    "portfolio_id": 1
  }
}
```

**Response (Success):**
```json
{
  "status": "success",
  "command": "sync_portfolio",
  "data": {
    "synced_assets": 15,
    "duration_ms": 1200
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "command": "sync_portfolio",
  "error": {
    "code": "DATA_FETCH_FAILED",
    "message": "Failed to fetch historical data for {isin}. Error: {error_details}"
  }
}
```

**Response (YFinance Error):**
```json
{
  "status": "error", 
  "command": "sync_portfolio",
  "error": {
    "code": "TICKER_INVALID",
    "message": "Invalid ticker format: {ticker}. Yahoo Finance error: {yf_error}"
  }
}
```

**Response (Security Delisted):**
```json
{
  "status": "warning",
  "command": "sync_portfolio",
  "error": {
    "code": "SECURITY_DELISTED", 
    "message": "Security {isin} may be delisted or inactive. Manual entry recommended.",
    "data": {
      "ticker": ticker,
      "name": security_name,
      "reason": "possibly_delisted"
    }
  }
}
```

### 1.2 `get_health`
Heartbeat check.

**Request:**
```json
{ "command": "get_health" }
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "version": "0.1.0",
    "memory_usage_mb": 45.2
  }
}
```

---

## 2. Event Protocol (Rust -> React)

**Transport:** Tauri Events (`window.emit`). React subscribes via `listen()`.

### 2.1 `portfolio-updated`
Emitted when the Python engine successfully completes a sync or calculation.

**Payload:**
```json
{
  "timestamp": "2023-10-27T10:00:00Z",
  "portfolio_id": 1
}
```
**React Action:** Invalidate TanStack Query cache for `dashboard_data`.

### 2.2 `engine-status`
Emitted periodically or on state change.

**Payload:**
```json
{
  "status": "processing", // or "idle", "error"
  "progress": 45, // 0-100
  "message": "Fetching ETF holdings..."
}
```
**React Action:** Update global progress bar / status indicator.

---

## 3. Frontend API (React -> Rust)

**Transport:** Tauri Commands (`invoke()`).

### 3.1 `get_dashboard_data`
Reads pre-calculated analytics from the Vault (SQLite/Parquet).

**Signature:**
```typescript
function get_dashboard_data(portfolioId: number): Promise<DashboardData>;
```

**Return Type:**
```typescript
interface DashboardData {
  totalValue: number;
  totalGain: number;
  allocations: {
    sector: Record<string, number>; // { "Tech": 0.45, "Health": 0.12 }
    region: Record<string, number>;
  };
  topHoldings: Array<{
    isin: string;
    name: string;
    weight: number;
  }>;
}
```

### 3.2 `sync_portfolio`
Triggers the background sync.

**Signature:**
```typescript
function sync_portfolio(force: boolean): Promise<void>;
```
