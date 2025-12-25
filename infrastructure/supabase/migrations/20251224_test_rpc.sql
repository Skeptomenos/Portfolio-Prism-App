-- =============================================================================
-- TEST FUNCTION: get_table_counts
-- Purpose: Verify RLS bypass via SECURITY DEFINER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_table_counts()
RETURNS TABLE (table_name TEXT, row_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT 'assets'::TEXT, count(*) FROM assets;
    RETURN QUERY SELECT 'listings'::TEXT, count(*) FROM listings;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_table_counts() TO anon;
