-- BUG-003: Add error logging to contribute_alias RPC function
-- This matches the error logging pattern used in contribute_asset

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
