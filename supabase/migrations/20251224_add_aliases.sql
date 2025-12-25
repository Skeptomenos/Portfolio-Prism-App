-- Migration: Add aliases table for name-based ISIN resolution
-- Date: 2025-12-24
-- Author: OptiPie

-- =============================================================================
-- ALIASES Table
-- =============================================================================
-- Maps name variations (aliases) to ISINs for fuzzy matching.
-- Example: "NVIDIA" -> US67066G1040, "NVIDIA Corp" -> US67066G1040

CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alias VARCHAR(100) NOT NULL,
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    alias_type VARCHAR(20) DEFAULT 'name',  -- 'name', 'abbreviation', 'local_name'
    language VARCHAR(5),                     -- 'en', 'de', 'ja' for localized names
    contributor_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(alias, isin)
);

-- Index for case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases (UPPER(alias));

-- Index for ISIN reverse lookup
CREATE INDEX IF NOT EXISTS idx_aliases_isin ON aliases (isin);

COMMENT ON TABLE aliases IS 'Name variations mapping to ISINs for fuzzy resolution';
COMMENT ON COLUMN aliases.alias_type IS 'Type: name, abbreviation, local_name';
COMMENT ON COLUMN aliases.contributor_count IS 'Number of users who contributed this alias';
