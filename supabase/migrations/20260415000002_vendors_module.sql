-- DOC_ID: MIGRATION_VENDORS_MODULE
-- PURPOSE: Crea tablas vendors y vendor_locations con RLS, índices y registro en catálogo de módulos.
-- FASE: Fase 4 - Valor operativo net-new

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLA: vendors
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  category         text        NOT NULL CHECK (category IN ('alimentos','bebidas','equipos','limpieza','mantenimiento','empaque','otro')),
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  website_url      text,
  address          text,
  notes            text,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: vendor_locations (asignación de proveedor a sucursales)
-- NULL en branch_id significa visible en todas las sucursales de la org.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_locations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id        uuid        REFERENCES branches(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, branch_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICES DE RENDIMIENTO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendors_organization_id       ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_org_active            ON vendors(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_org_category          ON vendors(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_vendor_locations_vendor_id    ON vendor_locations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_locations_org_branch   ON vendor_locations(organization_id, branch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UPDATED_AT AUTOMÁTICO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_vendors_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_vendors_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vendors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_locations ENABLE ROW LEVEL SECURITY;

-- 5.1 vendors — company_admin: acceso completo dentro de su organización
CREATE POLICY "vendors_admin_all"
  ON vendors
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'company_admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'company_admin'
    )
  );

-- 5.2 vendors — employee: solo SELECT, solo proveedores activos de su org
--     visibles si: vendor tiene una location sin branch_id (global) O con su branch_id
CREATE POLICY "vendors_employee_select"
  ON vendors
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'employee'
    )
    AND (
      -- Hay una location global (sin branch) para este proveedor
      EXISTS (
        SELECT 1 FROM vendor_locations vl
        WHERE vl.vendor_id = vendors.id
          AND vl.branch_id IS NULL
      )
      OR
      -- Hay una location que coincide con la sucursal del empleado
      EXISTS (
        SELECT 1 FROM vendor_locations vl
        INNER JOIN memberships m ON m.organization_id = vl.organization_id
        WHERE vl.vendor_id = vendors.id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.branch_id = vl.branch_id
      )
    )
  );

-- 5.3 vendor_locations — company_admin: acceso completo
CREATE POLICY "vendor_locations_admin_all"
  ON vendor_locations
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'company_admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'company_admin'
    )
  );

-- 5.4 vendor_locations — employee: solo SELECT
CREATE POLICY "vendor_locations_employee_select"
  ON vendor_locations
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT m.organization_id FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND r.code = 'employee'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. REGISTRO EN CATÁLOGO DE MÓDULOS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO module_catalog (code, name, description, is_core)
VALUES (
  'vendors',
  'Proveedores',
  'Directorio de proveedores y contactos asignados por locación',
  false
)
ON CONFLICT (code) DO NOTHING;
