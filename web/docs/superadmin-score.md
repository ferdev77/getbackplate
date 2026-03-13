# Superadmin Score Operativo

Este documento deja asentado como se calcula el `score` mostrado en el radar de organizaciones del panel superadmin.

## Objetivo

- Dar una senal rapida de salud operativa por organizacion.
- Priorizar revision de tenants con mayor riesgo.

## Formula

- Puntaje base: `100`.
- Se restan penalizaciones por condiciones de riesgo.
- Piso final: `0` (no puede bajar de cero).

### Penalizaciones actuales

- Tenant no activo (`paused` o `suspended`): `-20`
- Sin admins activos: `-35`
- Sin modulos habilitados: `-25`
- Sin empleados activos: `-15`
- Sin actividad reciente (`docs30d = 0` y `checklist7d = 0` y `avisos activos = 0`): `-10`

## Lectura visual

- `>= 85`: saludable (verde)
- `65 - 84`: atencion (ambar)
- `< 65`: riesgo alto (rojo)

## Fuentes de datos

- Estado tenant: `organizations.status`
- Admins activos: `memberships` + rol `company_admin` + `status = active`
- Modulos habilitados: `organization_modules.is_enabled = true`
- Empleados activos: `employees.status = active`
- Actividad reciente:
  - Documentos 30 dias: `documents.created_at`
  - Checklists 7 dias: `checklist_submissions.created_at`
  - Avisos activos: `announcements` segun `publish_at/expires_at`

## Implementacion

- Vista: `web/src/app/(superadmin)/superadmin/dashboard/page.tsx`
- Constantes de peso: `SCORE_PENALTIES`
