-- Portfolio Prism Hive Database Schema (Supabase PostgreSQL)
-- Version: 1.0.0
-- Strategy: Normalized Relational Model (Hybrid History)
-- Reference: anamnesis/strategy/hive-architecture.md

-- =============================================================================
-- 0. EXTENSIONS & ENUMS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Defines asset enrichment status (e.g., auto-created stub or fully enriched)
CREATE TYPE asset_enrichment_status AS ENUM ('active', 'stub');

-- Defines the type of financial instrument
CREATE TYPE asset_class_type AS ENUM ('Equity', 'ETF', 'Cash', 'Crypto', 'Bond', 'Fund');

-- =============================================================================
-- 1. ASSETS Table (The Entity - Source of Truth)
-- =============================================================================
-- Stores properties inherent to the company/fund, not the market.

CREATE TABLE IF NOT EXISTS assets (
    isin VARCHAR(12) PRIMARY KEY,
    name TEXT NOT NULL,
    wkn VARCHAR(12),
    asset_class asset_class_type NOT NULL,
    base_currency VARCHAR(3) NOT NULL,
    sector VARCHAR(50),
    geography VARCHAR(50),
    enrichment_status asset_enrichment_status DEFAULT 'stub' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Index for quick lookups via German ID
CREATE INDEX IF NOT EXISTS idx_assets_wkn ON assets (wkn);

-- =============================================================================
-- 2. LISTINGS Table (The Quote/Resolution Layer)
-- =============================================================================
-- Maps Ticker + Exchange to ISIN. Solves multi-currency/exchange problem.

CREATE TABLE IF NOT EXISTS listings (
    ticker VARCHAR(30) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL, -- ISO 4217 code (The trading currency)
    
    PRIMARY KEY (ticker, exchange)
);
CREATE INDEX IF NOT EXISTS idx_listings_isin ON listings (isin);

-- =============================================================================
-- 3. ETF_HOLDINGS Table (Live X-Ray - Current State Only)
-- =============================================================================
-- Stores the most recent composition. This table is overwritten on new updates.

CREATE TABLE IF NOT EXISTS etf_holdings (
    etf_isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    holding_isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    
    weight DECIMAL(5, 4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    confidence_score DECIMAL(3, 2) NOT NULL DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    last_updated DATE NOT NULL,

    PRIMARY KEY (etf_isin, holding_isin)
);
-- Index for efficient reverse lookup (e.g., "Which ETFs hold this stock?")
CREATE INDEX IF NOT EXISTS idx_holdings_holding_isin ON etf_holdings (holding_isin);

-- =============================================================================
-- 4. ETF_HISTORY Table (Archival Layer)
-- =============================================================================
-- Stores full composition JSON blobs for historical reference/backtesting.

CREATE TABLE IF NOT EXISTS etf_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    etf_isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    holdings_json JSONB NOT NULL,
    contributor_id UUID, -- Can be linked to a user profile in a separate auth table
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_etf_isin ON etf_history (etf_isin);

-- =============================================================================
-- 5. PROVIDER_MAPPINGS Table (Aliases/Normalization)
-- =============================================================================
-- Maps non-standard provider IDs/aliases to the official ISIN.

CREATE TABLE IF NOT EXISTS provider_mappings (
    provider VARCHAR(30) NOT NULL, -- e.g., 'Yahoo', 'Finnhub'
    provider_id VARCHAR(50) NOT NULL, -- The specific ticker/ID used by the provider
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,

    PRIMARY KEY (provider, provider_id)
);

-- =============================================================================
-- 6. ALIASES Table (Name-based Resolution)
-- =============================================================================
-- Maps name variations to ISINs for fuzzy matching.

CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alias VARCHAR(100) NOT NULL,
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    alias_type VARCHAR(20) DEFAULT 'name',
    language VARCHAR(5),
    source VARCHAR(30) DEFAULT 'user',
    confidence DECIMAL(3, 2) DEFAULT 0.80,
    currency VARCHAR(3),
    exchange VARCHAR(10),
    currency_source VARCHAR(20),
    contributor_hash VARCHAR(64),
    contributor_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(alias, isin),
    CONSTRAINT chk_currency_length CHECK (currency IS NULL OR LENGTH(currency) = 3),
    CONSTRAINT chk_currency_source CHECK (currency_source IS NULL OR currency_source IN ('explicit', 'inferred')),
    CONSTRAINT chk_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases (UPPER(alias));
CREATE INDEX IF NOT EXISTS idx_aliases_isin ON aliases (isin);
CREATE INDEX IF NOT EXISTS idx_aliases_contributor ON aliases (contributor_hash);

-- =============================================================================
-- 7. CONTRIBUTIONS Table (Audit Log for Crowdsourced Data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS contributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contributor_id UUID, -- Anonymous/Hashed User ID
    target_table VARCHAR(30) NOT NULL, -- e.g., 'assets', 'etf_holdings'
    payload JSONB NOT NULL, -- The raw data submitted
    trust_score DECIMAL(3, 2) NOT NULL DEFAULT 0.0,
    error_message TEXT, -- Error details when RPC operations fail
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NOTE: RPC functions (contribute_asset, contribute_etf) are not included in this file.
-- They are complex procedural logic (PL/pgSQL) that will be implemented by the user
-- after this core schema is successfully deployed to Supabase.
