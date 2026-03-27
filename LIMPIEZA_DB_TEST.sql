-- ============================================================
-- LIMPIEZA DE DATOS DE PRUEBA
-- Ejecutar en: https://supabase.com/dashboard/project/mfhyemwypuzsqjqxtbjf/sql/new
-- EJECUTAR EN ORDEN, UN BLOQUE A LA VEZ
-- ============================================================


-- ============================================================
-- PASO 1: VERIFICAR qué organizaciones existen (NO modifica nada)
-- ============================================================
SELECT id, name, slug, status, created_at
FROM public.organizations
ORDER BY created_at;


-- ============================================================
-- PASO 2: VER los IDs exactos de las empresas a eliminar
-- ============================================================
SELECT id, name, slug
FROM public.organizations
WHERE name ILIKE '%migue%'
   OR name ILIKE '%fer soliz%'
   OR slug ILIKE '%migue%'
   OR slug ILIKE '%fer-soliz%';


-- ============================================================
-- PASO 3: LIMPIAR memberships huérfanas (empleados ya eliminados
-- que dejaron su acceso colgado)
-- ============================================================
DELETE FROM public.memberships m
WHERE NOT EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.user_id = m.user_id
    AND e.organization_id = m.organization_id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.organization_user_profiles oup
  WHERE oup.user_id = m.user_id
    AND oup.organization_id = m.organization_id
    AND oup.is_employee = false
);


-- ============================================================
-- PASO 4: LIMPIAR organization_user_profiles huérfanos
-- (cuyo employee_id apunta a un empleado que ya no existe)
-- ============================================================
DELETE FROM public.organization_user_profiles oup
WHERE oup.employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = oup.employee_id
      AND e.organization_id = oup.organization_id
  );


-- ============================================================
-- PASO 5: ELIMINAR las organizaciones de prueba
-- ON DELETE CASCADE se encarga de borrar en cascada:
--   employees, branches, memberships, announcements,
--   checklists, documents, user_profiles, settings, etc.
-- "Juans Restaurants" NO se toca.
-- ============================================================
DELETE FROM public.organizations
WHERE (
  name ILIKE '%migue sol%'
  OR slug ILIKE 'migue-sol'
  OR name ILIKE '%fer soliz%'
  OR slug ILIKE 'fer-soliz-srl'
)
AND name NOT ILIKE '%juan%';


-- ============================================================
-- PASO 6: VERIFICACIÓN FINAL (deben quedar solo las orgs válidas)
-- ============================================================
SELECT id, name, slug, status FROM public.organizations ORDER BY created_at;

-- Confirmar que no quedaron datos huérfanos
SELECT COUNT(*) AS empleados_sin_org FROM public.employees e
WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = e.organization_id);

SELECT COUNT(*) AS memberships_sin_org FROM public.memberships m
WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = m.organization_id);
