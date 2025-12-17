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
