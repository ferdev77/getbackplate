# Reporte de validacion de flujos (local + produccion)

Fecha: 2026-04-16

Objetivo:
- Validar flujo base de `announcements`, `documents` y `checklists` en DB local y DB produccion.
- Mantener datos de prueba en local.
- Limpiar datos de prueba en produccion al finalizar.

## Script utilizado

- Nuevo script: `web/scripts/verify-announcements-documents-checklists-flow.mjs`

Que hace:
- Lee contexto de organizacion, locaciones (branches) y membresias activas.
- Crea 1 registro de prueba por flujo:
  - `announcements` (+ `announcement_audiences`)
  - `checklist_templates` (+ section + item)
  - `documents` (+ `document_processing_jobs`)
- Verifica incrementos de conteo.
- Opcionalmente limpia los datos creados por este run.

## Auditoria de contexto previo

### Local

- Organizaciones detectadas: 4
- Organizacion objetivo: `E2E Master Corp 1776326162230` (`643630b0-5e8a-47a3-8e4c-919e22f2d52d`)
- Locaciones activas detectadas: 4
- Membresias detectadas (muestra): 5

### Produccion

- Organizaciones detectadas: 1
- Organizacion objetivo: `Juans Restaurants` (`14cc9746-b234-4f0b-8347-66821f91ed73`)
- Locaciones activas detectadas: 7
- Membresias detectadas (muestra): 8

## Ejecucion local (sin cleanup)

Comando:

```bash
FLOW_ENV_LABEL=local KEEP_TEST_DATA=true TARGET_ORG_ID="643630b0-5e8a-47a3-8e4c-919e22f2d52d" node --env-file=".env.local" "scripts/verify-announcements-documents-checklists-flow.mjs"
```

Resultado:
- `cleanup_executed: false`
- IDs creados (local):
  - announcement: `32d63314-e3fb-4d6e-bae3-0b71e17efd23`
  - checklist_template: `2ed3f1cf-be2a-40de-9a33-38e2555dc5e1`
  - document: `a922789f-a532-432d-9e66-251ce8cff5b7`
  - document_job: `8c2685a9-b054-4d82-b8c6-d45a5972fb18`

Contadores:
- before: announcements=2, checklist_templates=1, documents=2, document_processing_jobs=0
- after_create: announcements=3, checklist_templates=2, documents=3, document_processing_jobs=1
- final: announcements=3, checklist_templates=2, documents=3, document_processing_jobs=1

Confirmacion de persistencia local:
- Se encontraron filas con tag `[FLOW_TEST:flow-1776366708404]` en announcements/checklists/documents.

## Ejecucion produccion (con cleanup)

Comando:

```bash
FLOW_ENV_LABEL=production CLEANUP_TEST_DATA=true TARGET_ORG_ID="14cc9746-b234-4f0b-8347-66821f91ed73" node --env-file=".env.production.local" "scripts/verify-announcements-documents-checklists-flow.mjs"
```

Resultado:
- `cleanup_executed: true`
- IDs creados y limpiados (produccion):
  - announcement: `fb74b8a8-86ec-4865-a990-dc518ee352e1`
  - checklist_template: `745c7e0d-db66-47fd-b7f2-57639feeaf18`
  - document: `07cf4a52-f4e3-4a55-b6b4-959761f88aa0`
  - document_job: `64f2b18d-df56-4a0d-be04-41bf08d1aeab`

Contadores:
- before: announcements=1, checklist_templates=2, documents=1, document_processing_jobs=0
- after_create: announcements=2, checklist_templates=3, documents=2, document_processing_jobs=1
- final: announcements=1, checklist_templates=2, documents=1, document_processing_jobs=0

Confirmacion post-cleanup en produccion:
- `announcements` con tag `[FLOW_TEST:%]`: 0
- `checklist_templates` con tag `[FLOW_TEST:%]`: 0
- `documents` con tag `[FLOW_TEST:%]`: 0
- `document_processing_jobs` residuales del run: 0

## Conclusion

- Flujo DB de anuncios, documentos y checklists validado correctamente en local y produccion.
- Local: datos de prueba conservados (como solicitado).
- Produccion: datos de prueba eliminados y verificados en cero residuos (como solicitado).
