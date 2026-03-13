# Security Incident Runbook

Protocolo operativo para incidentes de seguridad en GetBackplate.
Este documento no introduce cambios de UI, rutas, RLS ni estructura de base de datos.

## 1) Clasificacion de severidad

- `sev-1`: exposicion de datos entre tenants, acceso no autorizado confirmado, impacto legal o reputacional alto.
- `sev-2`: degradacion severa de seguridad sin evidencia de exfiltracion, bypass parcial de permisos.
- `sev-3`: riesgo bajo o potencial, sin impacto confirmado en datos.

## 2) Deteccion y apertura

1. Registrar incidente en canal interno con timestamp UTC.
2. Asignar `incident commander` y responsable tecnico.
3. Congelar cambios no relacionados hasta contener incidente.
4. Guardar evidencia inicial: request IDs, user IDs, organization IDs, acciones y endpoints.

## 3) Contencion inmediata

1. Identificar vector (auth, permisos, scope, storage, API).
2. Aplicar mitigacion de menor impacto posible:
   - bloquear endpoint afectado en capa app
   - deshabilitar modulo por tenant si aplica
   - revocar sesiones sospechosas
3. Confirmar que no se amplie el alcance del incidente.

## 4) Triage tecnico

- Correlacionar eventos en `audit_logs` por ventana temporal.
- Revisar denegaciones inusuales (`access.denied.*`) y auth failures.
- Confirmar aislamiento multi-tenant con scripts de verificacion:
  - `npm run verify:rls-isolation`
  - `npm run verify:reports-isolation`
  - `npm run verify:role-permissions`

## 5) Erradicacion y recuperacion

1. Corregir causa raiz en backend o reglas operativas (sin improvisar hotfixes sin trazabilidad).
2. Ejecutar validaciones minimas antes de cerrar:
   - `npm run verify:smoke-modules`
   - `npm run verify:document-guardrails`
   - `npm run lint`
   - `npm run build`
3. Reabrir funcionalidades de forma gradual si hubo mitigaciones temporales.

## 6) Comunicacion

- Interna: estado cada 30-60 min en incident channel.
- Cliente/tenant afectado: comunicar impacto, ventana temporal, mitigacion y estado.
- Evitar detalles sensibles en comunicacion externa.

## 7) Cierre y postmortem

Un incidente se cierra cuando:

- causa raiz confirmada
- mitigacion y fix validados
- no hay evidencia de impacto activo
- postmortem publicado con acciones preventivas

Postmortem minimo:

- timeline UTC
- impacto y alcance
- causa raiz tecnica
- acciones correctivas y preventivas
- responsables y fechas objetivo
