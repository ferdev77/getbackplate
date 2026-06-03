-- Add max_r365_connections to plans table.
-- Only meaningful for plan_type = 'qbo_r365'.
-- NULL = unlimited connections allowed.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_r365_connections INTEGER
    CONSTRAINT plans_max_r365_connections_positive CHECK (max_r365_connections IS NULL OR max_r365_connections > 0);

COMMENT ON COLUMN public.plans.max_r365_connections IS
  'Maximum number of R365 customer connections (qbo_r365_sync_configs rows) allowed for this integration plan. NULL = unlimited.';
