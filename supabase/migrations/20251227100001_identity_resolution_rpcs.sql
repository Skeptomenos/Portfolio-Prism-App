-- Migration: Identity Resolution RPC Function Updates
-- Date: 2025-12-27
-- Purpose: Update RPC functions to support identity resolution metadata
-- Reference: keystone/plans/identity_resolution_schema_implementation.md

-- =============================================================================
-- FUNCTION: lookup_alias_rpc (Updated)
-- Note: Must DROP first because return type is changing (5 cols -> 9 cols)
-- =============================================================================

DROP FUNCTION IF EXISTS public.lookup_alias_rpc(VARCHAR);

CREATE OR REPLACE FUNCTION public.lookup_alias_rpc(
    p_alias VARCHAR
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    alias_type VARCHAR(20),
    contributor_count INTEGER,
    source VARCHAR(30),
    confidence DECIMAL(3, 2),
    currency VARCHAR(3),
    exchange VARCHAR(10)
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
        al.contributor_count,
        al.source,
        al.confidence,
        al.currency,
        al.exchange
    FROM public.aliases al
    JOIN public.assets a ON al.isin = a.isin
    WHERE UPPER(al.alias) = UPPER(p_alias)
    ORDER BY al.confidence DESC, al.contributor_count DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_alias_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.lookup_alias_rpc IS
    'Resolve alias to ISIN with full identity resolution metadata. Returns highest confidence match.';

-- =============================================================================
-- FUNCTION: contribute_alias (Updated with new parameters)
-- =============================================================================

DROP FUNCTION IF EXISTS public.contribute_alias(VARCHAR, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.contribute_alias(
    p_alias VARCHAR,
    p_isin VARCHAR,
    p_alias_type VARCHAR DEFAULT 'name',
    p_language VARCHAR DEFAULT NULL,
    p_source VARCHAR DEFAULT 'user',
    p_confidence DECIMAL DEFAULT 0.80,
    p_currency VARCHAR DEFAULT NULL,
    p_exchange VARCHAR DEFAULT NULL,
    p_currency_source VARCHAR DEFAULT NULL,
    p_contributor_hash VARCHAR DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.aliases (
        alias, 
        isin, 
        alias_type, 
        language, 
        contributor_count,
        source, 
        confidence, 
        currency, 
        exchange, 
        currency_source, 
        contributor_hash
    )
    VALUES (
        p_alias, 
        p_isin, 
        p_alias_type, 
        p_language, 
        1,
        p_source, 
        p_confidence, 
        p_currency, 
        p_exchange, 
        p_currency_source, 
        p_contributor_hash
    )
    ON CONFLICT (alias, isin) DO UPDATE
    SET 
        contributor_count = aliases.contributor_count + 1,
        confidence = GREATEST(aliases.confidence, EXCLUDED.confidence),
        source = CASE 
            WHEN EXCLUDED.confidence > aliases.confidence THEN EXCLUDED.source 
            ELSE aliases.source 
        END,
        currency = COALESCE(aliases.currency, EXCLUDED.currency),
        exchange = COALESCE(aliases.exchange, EXCLUDED.exchange),
        currency_source = COALESCE(aliases.currency_source, EXCLUDED.currency_source);

    RETURN QUERY SELECT TRUE, 'Alias contributed successfully.'::TEXT;

EXCEPTION
    WHEN foreign_key_violation THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES (
            'alias_rpc_error', 
            jsonb_build_object(
                'alias', p_alias, 
                'isin', p_isin,
                'source', p_source,
                'confidence', p_confidence
            ), 
            0.0,
            'ISIN does not exist in assets table.'
        );
        RETURN QUERY SELECT FALSE, 'ISIN does not exist in assets table.'::TEXT;
    WHEN OTHERS THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES (
            'alias_rpc_error', 
            jsonb_build_object(
                'alias', p_alias, 
                'isin', p_isin,
                'source', p_source
            ), 
            0.0, 
            SQLERRM
        );
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contribute_alias(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR
) TO anon;

COMMENT ON FUNCTION public.contribute_alias IS
    'Add or update alias mapping with full identity resolution metadata. Increments contributor_count on conflict.';
