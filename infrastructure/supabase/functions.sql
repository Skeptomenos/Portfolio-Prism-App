-- Hive PL/pgSQL Functions
-- Version: 1.0.0
-- Reference: anamnesis/strategy/hive-architecture.md

-- =============================================================================
-- FUNCTION: contribute_asset
-- Purpose: Safely insert/update an asset and its listing in a single transaction.
-- Handles "Stub" creation and prevents overwriting clean data with stub data.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_asset(
    p_isin VARCHAR,
    p_ticker VARCHAR,
    p_exchange VARCHAR,
    p_name TEXT,
    p_asset_class asset_class_type,
    p_base_currency VARCHAR,
    p_trading_currency VARCHAR
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as the definer (e.g., supabase_admin) to bypass RLS
AS $$
BEGIN
    -- 1. UPSERT ASSETS TABLE
    INSERT INTO public.assets (
        isin, name, asset_class, base_currency, enrichment_status, updated_at
    )
    VALUES (
        p_isin, p_name, p_asset_class, p_base_currency, 'active', NOW()
    )
    ON CONFLICT (isin) DO UPDATE
    SET
        name = EXCLUDED.name,
        asset_class = EXCLUDED.asset_class,
        base_currency = EXCLUDED.base_currency,
        updated_at = NOW(),
        -- CRITICAL: Prevent a 'stub' update from overwriting a verified 'active' status
        enrichment_status = CASE
            WHEN assets.enrichment_status = 'stub' THEN EXCLUDED.enrichment_status
            ELSE assets.enrichment_status -- Keep 'active' if it's already active
        END;

    -- 2. UPSERT LISTINGS TABLE
    INSERT INTO public.listings (
        ticker, exchange, isin, currency
    )
    VALUES (
        p_ticker, p_exchange, p_isin, p_trading_currency
    )
    ON CONFLICT (ticker, exchange) DO UPDATE
    SET
        isin = EXCLUDED.isin,
        currency = EXCLUDED.currency;

    -- 3. RETURN SUCCESS
    RETURN QUERY SELECT TRUE, 'Asset and listing contributed successfully.';

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error for debugging
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES ('asset_rpc_error', to_jsonb(p_isin), 0.0, SQLERRM);

        -- Return the error message to the client
        RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$;

-- 4. GRANT EXECUTE PERMISSIONS
-- This is necessary for the anonymous client (our Python sidecar) to call the RPC.
GRANT EXECUTE ON FUNCTION public.contribute_asset(VARCHAR, VARCHAR, VARCHAR, TEXT, asset_class_type, VARCHAR, VARCHAR) TO anon;

-- =============================================================================
-- FUNCTION: contribute_listing
-- Purpose: Adds secondary listing (ticker/exchange) without updating the core asset.
-- Used for Yahoo Tickers, etc.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_listing(
    p_isin VARCHAR,
    p_ticker VARCHAR,
    p_exchange VARCHAR,
    p_currency VARCHAR
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only upsert the listing; assume asset already exists.
    INSERT INTO public.listings (
        ticker, exchange, isin, currency
    )
    VALUES (
        p_ticker, p_exchange, p_isin, p_currency
    )
    ON CONFLICT (ticker, exchange) DO UPDATE
    SET
        isin = EXCLUDED.isin,
        currency = EXCLUDED.currency;

    RETURN QUERY SELECT TRUE, 'Listing contributed successfully.';

EXCEPTION
    WHEN foreign_key_violation THEN
        RETURN QUERY SELECT FALSE, 'Foreign Key Violation: The ISIN provided does not exist in the assets table.';
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contribute_listing(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon;

-- =============================================================================
-- FUNCTION: contribute_mapping
-- Purpose: Adds non-ticker aliases (e.g. name variations) to provider_mappings.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_mapping(
    p_isin VARCHAR,
    p_provider VARCHAR,
    p_provider_id VARCHAR
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.provider_mappings (
        isin, provider, provider_id
    )
    VALUES (
        p_isin, p_provider, p_provider_id
    )
    ON CONFLICT (provider, provider_id) DO NOTHING;

    RETURN QUERY SELECT TRUE, 'Mapping contributed successfully.';

EXCEPTION
    WHEN foreign_key_violation THEN
        RETURN QUERY SELECT FALSE, 'Foreign Key Violation: The ISIN provided does not exist in the assets table.';
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contribute_mapping(VARCHAR, VARCHAR, VARCHAR) TO anon;

-- =============================================================================
-- FUNCTION: resolve_ticker_rpc
-- Purpose: Resolve a single ticker+exchange to ISIN, bypassing RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_ticker_rpc(
    p_ticker VARCHAR,
    p_exchange VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    currency VARCHAR(3)
)
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS
STABLE            -- Read-only, cacheable
AS $$
BEGIN
    IF p_exchange IS NOT NULL AND p_exchange != '' THEN
        -- Exact match on ticker + exchange
        RETURN QUERY
        SELECT
            l.isin,
            a.name,
            a.asset_class::VARCHAR(20),
            l.currency
        FROM public.listings l
        JOIN public.assets a ON l.isin = a.isin
        WHERE UPPER(l.ticker) = UPPER(p_ticker)
          AND UPPER(l.exchange) = UPPER(p_exchange)
        LIMIT 1;
    ELSE
        -- Match on ticker only (any exchange)
        RETURN QUERY
        SELECT
            l.isin,
            a.name,
            a.asset_class::VARCHAR(20),
            l.currency
        FROM public.listings l
        JOIN public.assets a ON l.isin = a.isin
        WHERE UPPER(l.ticker) = UPPER(p_ticker)
        LIMIT 1;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_ticker_rpc(VARCHAR, VARCHAR) TO anon;

COMMENT ON FUNCTION public.resolve_ticker_rpc IS
    'Resolve ticker to ISIN. SECURITY DEFINER bypasses RLS for read access.';

-- =============================================================================
-- FUNCTION: batch_resolve_tickers_rpc
-- Purpose: Batch resolve multiple tickers to ISINs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.batch_resolve_tickers_rpc(
    p_tickers VARCHAR[]
)
RETURNS TABLE (
    ticker VARCHAR(30),
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    currency VARCHAR(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (UPPER(l.ticker))
        l.ticker,
        l.isin,
        a.name,
        a.asset_class::VARCHAR(20),
        l.currency
    FROM public.listings l
    JOIN public.assets a ON l.isin = a.isin
    WHERE UPPER(l.ticker) = ANY(
        SELECT UPPER(t) FROM unnest(p_tickers) AS t
    )
    ORDER BY UPPER(l.ticker), l.exchange;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_resolve_tickers_rpc(VARCHAR[]) TO anon;

COMMENT ON FUNCTION public.batch_resolve_tickers_rpc IS 
    'Batch resolve tickers to ISINs. Max recommended: 100 tickers per call. Deduplicates by ticker.';

-- =============================================================================
-- BULK DATA RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_all_assets_rpc()
RETURNS SETOF assets
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.assets; $$;

CREATE OR REPLACE FUNCTION public.get_all_listings_rpc()
RETURNS SETOF listings
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.listings; $$;

CREATE OR REPLACE FUNCTION public.get_all_aliases_rpc()
RETURNS SETOF aliases
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.aliases; $$;

GRANT EXECUTE ON FUNCTION public.get_all_assets_rpc() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_listings_rpc() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_aliases_rpc() TO anon;

COMMENT ON FUNCTION public.get_all_assets_rpc IS 'Fetch all assets. SECURITY DEFINER bypasses RLS.';
COMMENT ON FUNCTION public.get_all_listings_rpc IS 'Fetch all listings. SECURITY DEFINER bypasses RLS.';
COMMENT ON FUNCTION public.get_all_aliases_rpc IS 'Fetch all aliases. SECURITY DEFINER bypasses RLS.';

-- =============================================================================
-- FUNCTION: lookup_alias_rpc
-- Purpose: Resolve a name/alias to ISIN (case-insensitive).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_alias_rpc(
    p_alias VARCHAR
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    alias_type VARCHAR(20),
    contributor_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.isin,
        a.name,
        a.asset_class::VARCHAR(20),
        al.alias_type,
        al.contributor_count
    FROM public.aliases al
    JOIN public.assets a ON al.isin = a.isin
    WHERE UPPER(al.alias) = UPPER(p_alias)
    ORDER BY al.contributor_count DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_alias_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.lookup_alias_rpc IS
    'Resolve name/alias to ISIN. Returns highest contributor_count match.';

-- =============================================================================
-- FUNCTION: contribute_alias
-- Purpose: Add or update an alias mapping.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_alias(
    p_alias VARCHAR,
    p_isin VARCHAR,
    p_alias_type VARCHAR DEFAULT 'name',
    p_language VARCHAR DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Upsert: increment contributor_count if exists
    INSERT INTO public.aliases (alias, isin, alias_type, language, contributor_count)
    VALUES (p_alias, p_isin, p_alias_type, p_language, 1)
    ON CONFLICT (alias, isin) DO UPDATE
    SET contributor_count = aliases.contributor_count + 1;

    RETURN QUERY SELECT TRUE, 'Alias contributed successfully.'::TEXT;

EXCEPTION
    WHEN foreign_key_violation THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES ('alias_rpc_error', jsonb_build_object('alias', p_alias, 'isin', p_isin), 0.0,
                'ISIN does not exist in assets table.');
        RETURN QUERY SELECT FALSE, 'ISIN does not exist in assets table.'::TEXT;
    WHEN OTHERS THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES ('alias_rpc_error', jsonb_build_object('alias', p_alias, 'isin', p_isin), 0.0, SQLERRM);
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contribute_alias(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon;
