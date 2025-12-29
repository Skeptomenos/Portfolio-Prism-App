-- Migration: Add error_message column to contributions table
-- Purpose: Allow RPC functions to log error details when operations fail
-- Fixes: GitHub issue #38 - column "error_message" does not exist

ALTER TABLE public.contributions 
ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN public.contributions.error_message IS 
    'Error message logged when RPC operations fail (e.g., batch_contribute_assets exception)';
