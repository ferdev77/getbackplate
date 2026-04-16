# Guia Canonica - Validacion de Flujos DB (Local y Produccion)

Esta es la guia oficial para validar rapidamente los flujos de:
- anuncios (`announcements`)
- checklists (`checklist_templates`)
- documentos (`documents`)

Script oficial:
- `web/scripts/verify-announcements-documents-checklists-flow.mjs`

## Uso rapido (comandos npm)

Desde `web/`:

```bash
npm run verify:flow:local
npm run verify:flow:local:cleanup
npm run verify:flow:prod:cleanup
```

Comando opcional para inspeccion en produccion sin borrar datos (solo para debugging controlado):

```bash
npm run verify:flow:prod:dry
```

## Que hace el script

1. Lee contexto de organizacion, locaciones y membresias.
2. Crea 1 registro de prueba por flujo (announcement/checklist/document + job).
3. Verifica incremento de conteos.
4. Si `CLEANUP_TEST_DATA=true`, limpia todo lo creado en ese run.
5. Imprime reporte `before -> after_create -> final`.

## Reglas operativas obligatorias

- En local (`verify:flow:local`): conserva los datos de prueba.
- En local (`verify:flow:local:cleanup`): valida y limpia al final.
- En produccion (`verify:flow:prod:cleanup`): siempre limpiar al final.
- `verify:flow:local` usa `E2E_ORG_ID` automaticamente si esta definido en `web/.env.local`.
- Si necesitas fijar organizacion objetivo, setea `TARGET_ORG_ID` antes de ejecutar.
- No ejecutar `verify:flow:prod:dry` en operacion normal.

## Evidencia y trazabilidad

- Reporte de ejecucion inicial:
  - `DOCS/4_Operaciones_y_Guias/REPORTE_VALIDACION_FLUJOS_LOCAL_PROD_2026-04-16.md`
