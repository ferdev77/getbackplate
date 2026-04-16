ALTER TABLE branches ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
COMMENT ON COLUMN branches.sort_order IS 'Determina la posición visual de la locación en el sidebar.';
