# ADR-003: Modelo de Dos Planes Simultáneos (Plataforma + Integración)

**Fecha:** 2026-06-02  
**Estado:** Implementado  

---

## Contexto

La plataforma originalmente soportaba un único plan por organización (`organizations.plan_id`). Los módulos de integración QBO→R365 se ofrecían como addons sobre ese plan. Esto generaba:

- Empresas "solo integración" (como Prodel) sin plan formal asignado → mostraban "Sin plan" en SuperAdmin
- La integración QBO aparecía como addon de segunda clase, no como un plan en sí mismo
- El flujo de compra de integración era diferente al de plataforma (addon vs plan)

## Decisión

Se agrega la columna `integration_plan_id` a `organizations`, paralela a `plan_id`. Una empresa puede tener:

- Solo plan de plataforma (`plan_id` seteado, `integration_plan_id` null)
- Solo plan de integración (`plan_id` null, `integration_plan_id` seteado)
- Ambos planes activos

Los planes de integración (Connect, Grow, Scale, Enterprise) mantienen `plan_type = 'qbo_r365'` en la tabla `plans` y tienen sus módulos (`qbo_r365`, `custom_branding`, `settings`) en `plan_modules`.

## Implementación

### Base de datos
- Migración: `supabase/migrations/20260602000001_integration_plan_id.sql`
- Nueva columna: `organizations.integration_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL`
- Seed: los 4 planes QBO ahora tienen `qbo_r365 + custom_branding + settings` en `plan_modules`

### Lógica de módulos
- `syncOrganizationPlan()` y `provisionOrganizationFromPlan()` aceptan `integrationPlanId` opcional
- Los módulos activos son la **unión** de ambos planes: `planModuleIds` de `plan_id` + `integration_plan_id`
- Los core modules siempre activos independientemente de los planes

### Webhook de Stripe
- `checkout.session.completed` (addon): ahora también escribe `organizations.integration_plan_id`
- `customer.subscription.updated/deleted` (addon): sincroniza o limpia `organizations.integration_plan_id`

### Billing gate
- `getBillingGateForOrganization()` ahora consulta `organization_addons` además de `subscriptions`
- Una org con addon activo nunca se bloquea, aunque no tenga plan de plataforma

### SuperAdmin UI
- Dos selectores de plan en el formulario de edición/creación, filtrados por `plan_type`
- La card de cada org muestra: nombre de plan plataforma + pill del plan de integración
- Las pills de addons se ocultan cuando `integration_plan_id` está seteado (evita redundancia)

## Estado de empresas en producción

| Empresa | plan_id | integration_plan_id | Notas |
|---|---|---|---|
| Prodel Distribution | null | Connect | Migrada manualmente 2026-06-02 |
| Puntos Cardinales | Custom | null | Tiene QBO vía plan Custom — pendiente asignar integration_plan_id si corresponde |
| Otras | varies | null | No usan integración QBO |

## Consecuencias

- El flujo de compra de integración vía Stripe actualiza automáticamente `organizations.integration_plan_id`
- El SuperAdmin puede asignar/cambiar ambos planes independientemente
- Los `organization_addons` siguen siendo la fuente de verdad para billing/Stripe; `organizations.integration_plan_id` es un campo de display/acceso sincronizado desde el webhook
- `addon_companion_module_codes` en `module_catalog` sigue funcionando para orgs sin plan que compran el addon directo
