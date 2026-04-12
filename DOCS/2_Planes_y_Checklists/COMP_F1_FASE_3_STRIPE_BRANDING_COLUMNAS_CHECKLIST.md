# DOC_ID: COMP_F1_PHASE3_STRIPE_BRANDING_COLUMNS_CHECKLIST
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: ejecucion y cierre de Fase 3 Stripe branding + Vista de columnas

# Checklist Fase 3 - Stripe Branding + Vista de Columnas

Estado inicial: pendiente
Dependencia para abrir fase: Fase 2 cerrada

## Objetivo de fase

Mejorar conversion y experiencia de cobro/navegacion documental con ajustes de marca en Stripe y una navegacion por columnas para documentos sin romper permisos ni acciones actuales.

## Estado real de partida (segun codigo actual)

- Ya implementado: checkout y billing portal de Stripe funcionando de punta a punta.
- Pendiente de cierre: branding comercial consistente en Stripe y vista de columnas (hoy solo existe vista arbol).

## A) Stripe branding (checkout + billing portal)

- [ ] A1. Definir lineamientos de marca aprobados para Stripe (logo, colores, tono).
- [ ] A2. Homologar configuracion entre Dashboard Stripe y experiencia dentro de app.
- [ ] A3. Verificar consistencia visual en checkout y billing portal (desktop/mobile).
- [ ] A4. Confirmar mensajes de fallback si branding externo no aplica por cuenta/config.

## B) Vista de columnas en Documentos

- [ ] B1. Diseñar contrato funcional del toggle `arbol <-> columnas` sin romper acciones.
- [ ] B2. Implementar componente de navegacion por columnas (estilo finder).
- [ ] B3. Mantener acciones existentes: descargar, compartir, eliminar segun permisos.
- [ ] B4. Persistir preferencia de vista por usuario.
- [ ] B5. Confirmar permisos por rol en ambas vistas.

## C) Integracion UX y performance

- [ ] C1. Asegurar carga progresiva y feedback visual consistente en vista columnas.
- [ ] C2. Validar que no empeore tiempos de respuesta en carpetas con alto volumen.
- [ ] C3. Revisar responsive de la vista columnas en tablet/mobile.

## D) QA y evidencia

- [ ] D1. Ejecutar `npm run lint`.
- [ ] D2. Ejecutar `npm run build`.
- [ ] D3. Ejecutar `npm run verify:smoke-modules`.
- [ ] D4. Ejecutar `npm run verify:role-permissions`.
- [ ] D5. Casos funcionales minimos:
  - [ ] checkout branded en desktop
  - [ ] checkout branded en mobile
  - [ ] billing portal branded consistente
  - [ ] toggle arbol/columnas conserva contexto
  - [ ] acciones de documentos funcionan igual en ambas vistas

## E) Documentacion de cierre

- [ ] E1. Actualizar `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.
- [ ] E2. Actualizar `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`.
- [ ] E3. Documentar decision UX de persistencia de vista por usuario.
- [ ] E4. Registrar avance de fase en `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nuevo archivo vigente.

## Definition of Done (Fase 3)

- [ ] DoD1. Stripe checkout y portal transmiten marca de forma consistente.
- [ ] DoD2. Vista columnas esta operativa, usable y segura por permisos.
- [ ] DoD3. No hay regresion funcional en acciones de documentos.
- [ ] DoD4. Evidencia tecnica + documentacion cerradas.
