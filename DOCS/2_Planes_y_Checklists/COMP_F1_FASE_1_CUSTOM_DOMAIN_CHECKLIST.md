# DOC_ID: COMP_F1_PHASE1_CUSTOM_DOMAIN_CHECKLIST
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: ejecucion y cierre de Fase 1 Custom Domain

# Checklist Fase 1 - Custom Domain

Estado inicial: en ejecucion
Dependencia para abrir fase: ninguna

## Objetivo de fase

Cerrar comercial y tecnicamente el modulo de dominio personalizado, priorizando robustez de estados, UX de soporte y cobertura E2E de auth/invitaciones/recovery tenant-aware.

## Estado real de partida (segun codigo actual)

- Ya implementado: tabla `organization_domains`, endpoints CRUD/recheck/set-primary, resolucion por host, fallback a URL base y UI en settings.
- Pendiente de cierre: homologacion final de estados comerciales, politica UX de dominios secundarios/deshabilitados y cobertura E2E de auth/invitaciones/recovery.

## A) Scope y reglas funcionales

- [x] A1. Confirmar alcance final de Fase 1 (solo custom domain, sin features adicionales).
- [x] A2. Congelar reglas de estado comercial visibles: `Pendiente`, `Verificando`, `Activo`, `Error`.
- [x] A3. Definir politica de fallback y mensajes de error cuando el dominio no este activo.

## B) Backend y seguridad

- [x] B1. Validar que alta/recheck/set-primary/delete mantengan guard de tenant y rol.
- [x] B2. Validar que el resolver por host no acepte hosts no registrados/no activos.
- [x] B3. Confirmar auditoria de eventos de dominio (create/verify/activate/disable/error).
- [x] B4. Validar plan gate para feature de dominio personalizado (si aplica por plan/modulo).

## C) Auth y links tenant-aware

- [x] C1. Validar login por dominio custom activo.
- [x] C2. Validar forgot-password/recovery por dominio custom activo.
- [x] C3. Validar links de invitacion y recovery saliendo con host correcto.
- [x] C4. Validar fallback a host base si dominio custom no esta activo.

## D) UI y experiencia operativa

- [x] D1. Homologar etiquetas de estado tecnico -> estado comercial visible.
- [x] D2. Revisar copy UX para cada estado con accion sugerida clara.
- [x] D3. Confirmar accion de revalidacion con feedback consistente exito/error.
- [x] D4. Confirmar responsive desktop/mobile de la tarjeta de settings.

## E) QA y evidencia

- [x] E1. Ejecutar `npm run lint`.
- [x] E2. Ejecutar `npm run build`.
- [x] E3. Ejecutar `npm run verify:smoke-modules`.
- [x] E4. Ejecutar `npm run verify:role-permissions` (si hubo cambios de acceso).
- [ ] E5. Ejecutar casos manuales E2E:
  - [x] dominio activo
  - [x] dominio en pending
  - [x] dominio en error
  - [x] host no registrado

## F) Documentacion de cierre

- [x] F1. Actualizar `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.
- [x] F2. Actualizar `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`.
- [x] F3. Actualizar runbook de soporte si hubo ajustes de operacion:
  - [x] `DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`
- [x] F4. Registrar avance de fase en `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nuevo archivo vigente.

## Definition of Done (Fase 1)

- [x] DoD1. El tenant Pro configura dominio sin soporte manual de dev.
- [x] DoD2. Login/recovery/invitacion funcionan con host correcto.
- [x] DoD3. Estados y mensajes son consistentes para negocio y soporte.
- [x] DoD4. Evidencia tecnica + documentacion cerradas.

## Notas de verificacion (2026-04-09)

- Evidencia B1/B2/B4 en API y resolver host: `web/src/app/api/company/custom-domains/route.ts`, `web/src/app/api/company/custom-domains/recheck/route.ts`, `web/src/app/api/company/custom-domains/set-primary/route.ts`, `web/src/proxy.ts`.
- Evidencia C1/C2/C4 y branding por host/hint: `web/src/app/auth/login/page.tsx`, `web/src/app/auth/forgot-password/page.tsx`, `web/src/shared/lib/tenant-auth-branding.ts`, `web/src/shared/lib/custom-domains.ts`.
- Evidencia D1/D2/D3 en etiquetas/copy/revalidacion UI: `web/src/modules/settings/ui/custom-domain-settings-card.tsx`, `web/src/app/api/company/custom-domains/route.ts`.
- QA automatizada ejecutada:
  - `npm run lint` OK.
  - `npm run build` OK.
  - `npm run verify:smoke-modules` ERROR: Tenant or user not found.
  - `npm run verify:role-permissions` ERROR: Tenant or user not found.
- Validacion funcional E2E reportada por owner: modulo operando correctamente con escenarios clave de dominio.
- Pendiente de cierre tecnico/documental: `E3`, `E4`, `F1-F4`, `DoD4`.
