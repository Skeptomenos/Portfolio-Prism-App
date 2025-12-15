# Data Schema Spec (State at Rest)

> **Purpose:** Source of Truth for the Database (SQLite) and Analytics Cache (Parquet).
> **Usage:** Used by Python (Pydantic/SQLAlchemy) and Rust (SQLx) to ensure data integrity.
> **See Tech Spec:** `anamnesis/specs/tech.md` for technology choices.

---

## 1. Relational Database (SQLite)

This database stores **User State** and **Transactional Data**. It is the Single Source of Truth for "What do I own?".

### 1.1 `assets` Table
Master universe of all known securities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `isin` | TEXT | PRIMARY KEY | International Securities Identification Number |
| `symbol` | TEXT | | Ticker symbol (e.g., AAPL, VOO) |
| `name` | TEXT | NOT NULL | Human-readable name |
| `asset_class`| TEXT | NOT NULL | 'Equity', 'ETF', 'Cash', 'Crypto' |
| `updated_at` | DATETIME| DEFAULT NOW | Last metadata update |

### 1.2 `portfolios` Table
Supports future multi-portfolio features (though MVP uses only one).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-increment ID |
| `name` | TEXT | NOT NULL | User-defined name (e.g., "My Retirement") |
| `currency` | TEXT | DEFAULT 'EUR' | Base currency for this portfolio |

### 1.3 `positions` Table
Current snapshot of holdings (derived from transactions or direct sync).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `portfolio_id`| INTEGER | FK -> portfolios(id) | |
| `isin` | TEXT | FK -> assets(isin) | |
| `quantity` | REAL | NOT NULL | Number of shares (supports fractional) |
| `cost_basis` | REAL | | Average buy price per share |
| `updated_at` | DATETIME| | Timestamp of last sync |
| **PK** | | (portfolio_id, isin) | Composite Primary Key |

### 1.4 `transactions` Table (Ledger)
Immutable history of all buys/sells/dividends.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique Transaction ID (from Broker or UUID) |
| `portfolio_id`| INTEGER | FK -> portfolios(id) | |
| `isin` | TEXT | FK -> assets(isin) | |
| `type` | TEXT | NOT NULL | 'Buy', 'Sell', 'Dividend', 'Interest' |
| `date` | DATETIME| NOT NULL | Execution time |
| `quantity` | REAL | | Positive for Buy, Negative for Sell |
| `amount` | REAL | NOT NULL | Total cash impact (signed) |
| `currency` | TEXT | NOT NULL | Currency of the transaction |

---

## 2. Analytics Cache (Parquet)

This storage handles **Calculated Data** and **Market Data**. It is optimized for read performance (columnar) and is effectively a cache (can be rebuilt).

### 2.1 `market_data.parquet`
Latest price and metadata snapshot.

| Column | Type | Description |
|--------|------|-------------|
| `isin` | String | Join Key |
| `price` | Double | Latest close price |
| `currency`| String | Price currency |
| `date` | Date | Date of price |
| `sector` | String | GICS Sector |
| `region` | String | Geographical Region |
| `country` | String | Country Code (ISO) |

### 2.2 `holdings_lookthrough.parquet`
Decomposed view of ETF holdings (The "X-Ray").

| Column | Type | Description |
|--------|------|-------------|
| `parent_isin`| String | The ETF ISIN |
| `child_isin` | String | The underlying stock ISIN |
| `weight` | Double | % of the ETF (0.0 to 1.0) |
| `date` | Date | Date of holdings snapshot |

### 2.3 `analytics_snapshot.parquet`
Pre-calculated dashboard metrics for the UI.

| Column | Type | Description |
|--------|------|-------------|
| `portfolio_id`| Int | |
| `metric` | String | 'total_value', 'pnl', 'volatility' |
| `dimension` | String | 'all', 'sector:Tech', 'region:US' |
| `value` | Double | The calculated number |
| `timestamp` | Datetime| When this was calculated |

---

## 3. Data Contracts (Pydantic Models)

These Python classes define the strict interface for the Analytics Engine.

```python
# contracts.py

class Asset(BaseModel):
    isin: str = Field(pattern=r"^[A-Z]{2}[A-Z0-9]{9}\d$")
    name: str
    asset_class: Literal['Equity', 'ETF', 'Cash', 'Crypto']

class Position(BaseModel):
    isin: str
    quantity: float
    cost_basis: float = 0.0

class PortfolioSnapshot(BaseModel):
    """Input for the Pipeline"""
    id: int
    positions: List[Position]
    cash_balance: float

class AnalyticsResult(BaseModel):
    """Output from the Pipeline"""
    portfolio_id: int
    total_value: float
    performance_abs: float
    performance_rel: float
    exposures: Dict[str, float]  # {'sector:Tech': 0.25}
```
