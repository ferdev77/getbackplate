ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS setup_fee_annual_discount_pct smallint NOT NULL DEFAULT 25
    CONSTRAINT setup_fee_annual_discount_pct_range CHECK (setup_fee_annual_discount_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN plans.setup_fee_annual_discount_pct IS
  'Percentage discount applied to the setup fee when billing period is annual (0-100). Default 25.';
