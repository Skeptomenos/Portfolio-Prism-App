-- Migration: Add batch_contribute_assets RPC
-- Purpose: Batch upsert multiple assets in a single transaction
-- Fixes: GitHub issue #34 - Hive batch contribution failed

CREATE OR REPLACE FUNCTION public.batch_contribute_assets(
    assets JSONB
)
RETURNS TABLE (success BOOLEAN, error_message TEXT, count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    asset_record JSONB;
    upserted_count INTEGER := 0;
BEGIN
    FOR asset_record IN SELECT * FROM jsonb_array_elements(assets)
    LOOP
        INSERT INTO public.assets (
            isin, name, asset_class, base_currency, enrichment_status, updated_at
        )
        VALUES (
            asset_record->>'isin',
            asset_record->>'name',
            (asset_record->>'asset_class')::asset_class_type,
            asset_record->>'base_currency',
            COALESCE(asset_record->>'enrichment_status', 'active'),
            NOW()
        )
        ON CONFLICT (isin) DO UPDATE
        SET
            name = CASE 
                WHEN assets.name = 'Unknown' OR assets.name IS NULL 
                THEN EXCLUDED.name 
                ELSE assets.name 
            END,
            asset_class = CASE 
                WHEN assets.asset_class = 'Unknown' OR assets.asset_class IS NULL 
                THEN EXCLUDED.asset_class 
                ELSE assets.asset_class 
            END,
            base_currency = COALESCE(assets.base_currency, EXCLUDED.base_currency),
            updated_at = NOW(),
            enrichment_status = CASE
                WHEN assets.enrichment_status = 'stub' THEN EXCLUDED.enrichment_status
                ELSE assets.enrichment_status
            END;
        
        upserted_count := upserted_count + 1;
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Batch contribution successful.'::TEXT, upserted_count;

EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES ('batch_assets_rpc_error', assets, 0.0, SQLERRM);
        
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_contribute_assets(JSONB) TO anon;

COMMENT ON FUNCTION public.batch_contribute_assets IS
    'Batch upsert assets to Hive. Accepts JSONB array of {isin, name, asset_class, base_currency, enrichment_status}.';
