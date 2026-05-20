-- ============================================================
-- Módulos compañeros por add-on (addon_companion_module_codes)
--
-- CONTEXTO
-- --------
-- Cuando una empresa compra un add-on sin tener un plan activo
-- (organizations.plan_id IS NULL), el webhook de Stripe solo activa
-- el módulo del add-on en organization_modules (relación 1:1).
-- Pero ciertos módulos base —como `settings` y `custom_branding`—
-- son necesarios para que la empresa pueda operar aunque no tenga plan.
--
-- Esta columna define qué módulos extra se activan automáticamente
-- junto con el add-on cuando la empresa no tiene plan.
-- El webhook lee este array y provisiona cada módulo listado.
--
-- EXTENSIBILIDAD
-- --------------
-- Para añadir compañeros a otro add-on en el futuro basta con:
--   UPDATE module_catalog
--   SET addon_companion_module_codes = array['modulo_a', 'modulo_b']
--   WHERE code = 'nuevo_addon';
-- No se requiere cambio de código.
-- ============================================================

alter table public.module_catalog
  add column if not exists addon_companion_module_codes text[] not null default '{}';

comment on column public.module_catalog.addon_companion_module_codes is
  'Códigos de módulos que se activan automáticamente junto a este add-on '
  'cuando la organización compradora no tiene un plan activo (plan_id IS NULL). '
  'El webhook de Stripe lee este array en checkout.session.completed.';

-- qbo_r365: al contratar sin plan activo, se provisionan settings y custom_branding
-- para que la empresa pueda configurar su cuenta y branding desde el primer día.
update public.module_catalog
set addon_companion_module_codes = array['settings', 'custom_branding']
where code = 'qbo_r365';
