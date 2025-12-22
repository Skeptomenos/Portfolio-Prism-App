-- Portfolio Prism SQLite Schema
-- Version: 1.0.0
-- See: keystone/specs/data_schema.md

-- =============================================================================
-- ASSETS: Master securities universe
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
    isin TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT NOT NULL,
    asset_class TEXT NOT NULL CHECK (asset_class IN ('Stock', 'ETF', 'Cash', 'Crypto', 'Derivative', 'Bond', 'Fund')),
    sector TEXT,
    region TEXT,
    country TEXT,
    confidence REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- HISTORICAL_PRICES: Daily close prices for sparklines & day change
-- =============================================================================
CREATE TABLE IF NOT EXISTS historical_prices (
    isin TEXT NOT NULL,
    date_str TEXT NOT NULL,  -- YYYY-MM-DD
    close_price REAL NOT NULL,
    currency TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (isin, date_str),
    FOREIGN KEY (isin) REFERENCES assets(isin)
);

-- Index for symbol lookups
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);

-- =============================================================================
-- PORTFOLIOS: Multi-portfolio support
-- =============================================================================
CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'EUR',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- POSITIONS: Current holdings snapshot
-- =============================================================================
CREATE TABLE IF NOT EXISTS positions (
    portfolio_id INTEGER NOT NULL,
    isin TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity >= 0),
    cost_basis REAL,
    current_price REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (portfolio_id, isin),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (isin) REFERENCES assets(isin)
);

-- Index for portfolio lookups
CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id);

-- =============================================================================
-- TRANSACTIONS: Immutable ledger (optional for MVP)
-- =============================================================================
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    portfolio_id INTEGER NOT NULL,
    isin TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Buy', 'Sell', 'Dividend', 'Interest', 'Fee', 'Transfer')),
    date DATETIME NOT NULL,
    quantity REAL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (isin) REFERENCES assets(isin)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(portfolio_id, date);

-- =============================================================================
-- SYNC_STATE: Track sync status per data source
-- =============================================================================
CREATE TABLE IF NOT EXISTS sync_state (
    source TEXT PRIMARY KEY,
    last_sync DATETIME,
    status TEXT CHECK (status IN ('success', 'error', 'pending')),
    message TEXT
);

CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    source TEXT NOT NULL CHECK (source IN ('python', 'frontend')),
    message TEXT NOT NULL,
    context TEXT,
    processed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_logs_session ON system_logs(session_id, level);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);

-- =============================================================================
-- DEFAULT DATA
-- =============================================================================

-- Insert default portfolio (id=1)
INSERT OR IGNORE INTO portfolios (id, name, currency) VALUES (1, 'Main Portfolio', 'EUR');

-- Insert initial sync state
INSERT OR IGNORE INTO sync_state (source, status, message) VALUES 
    ('trade_republic', 'pending', 'Not yet synced'),
    ('manual', 'pending', 'No manual positions added');
