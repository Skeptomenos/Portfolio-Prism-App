-- Migration: Identity Resolution Schema Updates
-- Date: 2025-12-27
-- Purpose: Add columns to aliases and assets tables for identity resolution
-- Reference: keystone/plans/identity_resolution_schema_implementation.md

-- =============================================================================
-- 1. ALTER aliases TABLE
-- =============================================================================

-- Add source column (where the alias came from)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'user';

-- Add confidence column (resolution confidence score)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3, 2) DEFAULT 0.80;

-- Add currency column (trading currency for this alias, ISO 4217)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

-- Add exchange column (exchange code for this alias)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS exchange VARCHAR(10);

-- Add currency_source column (how currency was determined)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS currency_source VARCHAR(20);

-- Add contributor_hash column (anonymous contributor ID)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS contributor_hash VARCHAR(64);

-- =============================================================================
-- 2. ADD CONSTRAINTS (using DO block to handle "already exists" gracefully)
-- =============================================================================

DO $$ 
BEGIN
    -- Check constraint for currency length (ISO 4217 = 3 chars)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_currency_length'
    ) THEN
        ALTER TABLE public.aliases 
            ADD CONSTRAINT chk_currency_length 
            CHECK (currency IS NULL OR LENGTH(currency) = 3);
    END IF;

    -- Check constraint for currency_source values
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_currency_source'
    ) THEN
        ALTER TABLE public.aliases 
            ADD CONSTRAINT chk_currency_source 
            CHECK (currency_source IS NULL OR currency_source IN ('explicit', 'inferred'));
    END IF;

    -- Check constraint for confidence range
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_confidence'
    ) THEN
        ALTER TABLE public.aliases 
            ADD CONSTRAINT chk_confidence 
            CHECK (confidence >= 0 AND confidence <= 1);
    END IF;
END $$;

-- Add index for contributor tracking
CREATE INDEX IF NOT EXISTS idx_aliases_contributor ON public.aliases (contributor_hash);

-- =============================================================================
-- 3. ALTER assets TABLE
-- =============================================================================

-- Add sector column
ALTER TABLE public.assets 
    ADD COLUMN IF NOT EXISTS sector VARCHAR(50);

-- Add geography column
ALTER TABLE public.assets 
    ADD COLUMN IF NOT EXISTS geography VARCHAR(50);

-- =============================================================================
-- 4. COMMENTS
-- =============================================================================

COMMENT ON COLUMN public.aliases.source IS 'Resolution source: finnhub, wikidata, openfigi, user, seed';
COMMENT ON COLUMN public.aliases.confidence IS 'Resolution confidence score 0.0-1.0';
COMMENT ON COLUMN public.aliases.currency IS 'Trading currency for this alias (ISO 4217, optional)';
COMMENT ON COLUMN public.aliases.exchange IS 'Exchange code for this alias (optional)';
COMMENT ON COLUMN public.aliases.currency_source IS 'How currency was determined: explicit or inferred';
COMMENT ON COLUMN public.aliases.contributor_hash IS 'SHA256 hash of anonymous contributor ID';
COMMENT ON COLUMN public.assets.sector IS 'GICS sector (e.g., Technology)';
COMMENT ON COLUMN public.assets.geography IS 'Primary geography (e.g., United States)';
