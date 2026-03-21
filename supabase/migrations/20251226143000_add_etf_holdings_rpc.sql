-- Migration: Add get_etf_holdings_rpc for RLS bypass
-- Date: 2025-12-26

CREATE OR REPLACE FUNCTION public.get_etf_holdings_rpc(p_etf_isin VARCHAR)
RETURNS TABLE (
    etf_isin VARCHAR(12),
    holding_isin VARCHAR(12),
    weight DECIMAL(5, 4),
    confidence_score DECIMAL(3, 2),
    last_updated DATE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT 
        etf_isin,
        holding_isin,
        weight,
        confidence_score,
        last_updated
    FROM public.etf_holdings
    WHERE etf_isin = p_etf_isin;
$$;

GRANT EXECUTE ON FUNCTION public.get_etf_holdings_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.get_etf_holdings_rpc IS 
    'Fetch ETF holdings by ETF ISIN. SECURITY DEFINER bypasses RLS.';
