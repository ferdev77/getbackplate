# DOC_ID: COMP_F1_NEXT_PHASE_EXEC_WORKFLOW
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: que sigue implementar y en que orden operativo

## Objetivo

Definir en una sola hoja el siguiente paso de implementacion para Complemento Fase 1, sin mezclarlo con fases globales del producto.

## Orden de ejecucion canonico

1. `COMP_F1_SUBPHASE_1`: Stripe branding + cierre UX/etiquetas de Custom Domain.
2. `COMP_F1_SUBPHASE_2`: Shift Communication Log + Supplier Directory.
3. `COMP_F1_SUBPHASE_3`: Upload documental desde portal + review loop + vencimientos/alertas.
4. `COMP_F1_SUBPHASE_4`: DocuSeal end-to-end (envio, webhook, auditoria, archivado).

## Flujo de trabajo por subfase

Para cada subfase ejecutar siempre este flujo:

1. Definir alcance cerrado (entradas/salidas y exclusiones).
2. Definir datos (tablas, RLS, indices, auditoria).
3. Definir API (rutas, contratos, permisos por rol).
4. Implementar UI/UX en panel y/o portal.
5. Correr QA funcional + seguridad + regresion.
6. Actualizar documentacion canonica y checklist de cierre.

## Definition of Done minima

- Rol y permisos verificados (`company_admin`, `manager`, `employee`, `superadmin`).
- Tenant isolation validado.
- Auditoria de acciones clave activa.
- Flujos criticos cubiertos por pruebas de smoke/manual guiado.
- Runbook operativo actualizado si toca cron/webhooks/proveedores externos.

## Fuentes primarias

- `DOCS/complemento_etapa_1/COMP_F1_ESTADO_REAL_Y_ROADMAP.md`
- `DOCS/complemento_etapa_1/COMP_F1_ALCANCE_Y_FLUJOS.md`
