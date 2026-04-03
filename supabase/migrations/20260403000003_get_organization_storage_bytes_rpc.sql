-- ============================================================
-- RPC: get_organization_storage_bytes
-- Reemplaza el .select("file_size_bytes") + .reduce() en JS
-- por un SUM() que corre en PostgreSQL.
--
-- Antes: trae TODOS los documentos a Node.js para sumarlos
-- Ahora: Postgres retorna un solo BIGINT
-- ============================================================

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION get_organization_storage_bytes(p_org_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(file_size_bytes), 0)::BIGINT
  FROM documents
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL;
$$;

-- Solo service_role puede llamar esta función (admin client del backend)
REVOKE ALL ON FUNCTION get_organization_storage_bytes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_organization_storage_bytes(UUID) TO service_role;
