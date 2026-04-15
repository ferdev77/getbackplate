# DOC_ID: COMP_F1_PHASE3_STRIPE_BRANDING_COLUMNS_CHECKLIST
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: ejecucion y cierre de Fase 3 Stripe branding + Vista de columnas

# Checklist Fase 3 - Stripe Branding + Vista de Columnas

Estado inicial: en ejecucion (sub-bloque Stripe launch branding + columnas base completado)
Dependencia para abrir fase: Fase 2 cerrada

## Objetivo de fase

Mejorar conversion y experiencia de cobro/navegacion documental con ajustes de marca en Stripe y una navegacion por columnas para documentos sin romper permisos ni acciones actuales.

## Estado real de partida (segun codigo actual)

- Ya implementado: checkout y billing portal de Stripe funcionando de punta a punta.
- Pendiente de cierre: branding comercial consistente en Stripe y vista de columnas (hoy solo existe vista arbol).

## A) Stripe branding (checkout + billing portal)

- [x] A1. Definir lineamientos de marca aplicables en app (pantalla intermedia) y fallback tenant/platform.
- [x] A2. Homologar experiencia dentro de app con pantalla launch branded para checkout/portal.
- [x] A3. Verificar experiencia funcional de redireccion y retorno tenant-aware (backend + UI).
- [x] A4. Confirmar fallback de marca de plataforma cuando `custom_branding` no aplica.
- [x] A5. Homologar branding hosted en Stripe Dashboard (pendiente manual fuera de codigo. HECHO MANUALMENTE).

## B) Vista de columnas en Documentos

- [x] B1. Diseñar contrato funcional del toggle `arbol <-> columnas` sin romper acciones.
- [x] B2. Implementar componente de navegacion por columnas (estilo finder).
- [x] B3. Mantener acciones existentes: descargar, compartir, eliminar segun permisos.
- [x] B4. Persistir preferencia de vista por usuario.
- [x] B5. Confirmar permisos por rol en ambas vistas.

## C) Integracion UX y performance

- [x] C1. Asegurar carga progresiva y feedback visual consistente en vista columnas.
- [x] C2. Validar que no empeore tiempos de respuesta en carpetas con alto volumen.
- [x] C3. Revisar responsive de la vista columnas en tablet/mobile.

## D) QA y evidencia

- [x] D1. Ejecutar `npm run lint`.
- [x] D2. Ejecutar `npm run build`.
- [x] D3. Ejecutar `npm run verify:smoke-modules`.
- [x] D4. Ejecutar `npm run verify:role-permissions`.
- [x] D5. Casos funcionales minimos:
  - [x] checkout launch branded en desktop
  - [x] checkout launch branded en mobile
  - [x] billing portal launch branded consistente
  - [x] toggle arbol/columnas conserva contexto
  - [x] acciones de documentos funcionan igual en ambas vistas

## E) Documentacion de cierre

- [x] E1. Actualizar `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.
- [x] E2. Actualizar `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`.
- [x] E3. Documentar decision UX de persistencia de vista por usuario.
- [x] E4. Registrar avance de fase en `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nuevo archivo vigente.

## Definition of Done (Fase 3)

- [x] DoD1. Stripe checkout y portal transmiten marca de forma consistente (en app launch flow).
- [x] DoD2. Vista columnas esta operativa, usable y segura por permisos.
- [x] DoD3. No hay regresion funcional en acciones de documentos.
- [x] DoD4. Evidencia tecnica + documentacion cerradas.

Notas de alcance:
- El branding hosted de Stripe (checkout/portal en dominio Stripe) sigue dependiendo de Stripe Dashboard; no se define por request en codigo app.
