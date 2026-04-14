# GUIA FLUJO DOCUMENTOS CUSTOM - EMPLEADOS

## Objetivo

Definir el comportamiento oficial de los documentos `custom_*` para que sean equivalentes al flujo de los 6 slots fijos (`photo`, `id`, `ssn`, `rec1`, `rec2`, `other`) en interfaz, estados y reglas de negocio.

## Comportamiento esperado

### 1) Creacion de slot custom (sin archivo)

- Desde modal de empresa (editar empleado), al usar `Agregar documento` se crea un slot custom persistente.
- El slot aparece en panel empresa y portal empleado como **pendiente de carga**.
- No debe mostrar botones `Ver`/`Descargar` mientras no exista archivo real.
- El estado visual debe parecerse a un slot fijo vacio.

### 2) Carga de archivo sobre slot custom

- Si sube **empresa**: estado inicial del link `employee_documents.status = approved`.
- Si sube **empleado**: estado inicial `employee_documents.status = pending`.
- En ambos casos, una vez cargado archivo, habilitar flujo normal de:
  - revision (aprobar/rechazar),
  - vencimiento (fecha o sin vencimiento),
  - firma (requested/viewed/completed/declined/expired/failed).

### 3) Reemplazo/re-carga

- Si se vuelve a subir al mismo slot custom, debe reemplazar el vinculo activo de ese slot sin duplicar comportamiento visual.
- Debe preservar la misma logica que slots fijos para comentarios/rechazo/aprobacion.

## UX requerida (boton Agregar documento)

- Al confirmar alta de slot custom:
  - mostrar estado de carga (`Agregando...` + spinner),
  - bloquear doble click,
  - deshabilitar input y botones del popover,
  - mostrar toast de progreso (`Creando documento solicitado...`),
  - resolver mismo toast a exito o error.

## Alcance tecnico implementado

- Endpoint de solicitud de slot custom: `web/src/app/api/company/employees/documents/request/route.ts`
- Mapping de slots custom en empresa: `web/src/app/(company)/app/employees/page.tsx`
- Mapping de slots custom en portal empleado: `web/src/app/(employee)/portal/layout.tsx`
- Upload empleado para `custom_*`: `web/src/app/api/employee/profile/documents/route.ts`
- UX/estado del modal: `web/src/modules/employees/ui/new-employee-modal.tsx`

## Base de datos

- Para este alcance no se agregaron tablas/columnas.
- No requiere migracion estructural.
- Se utiliza modelo existente (`documents` + `employee_documents`) y deteccion de slot solicitado sin archivo en capa de aplicacion.

## QA minimo (regresion)

1. Empresa crea custom sin archivo -> aparece en ambos lados sin `Ver`/`Descargar`.
2. Empleado sube archivo en ese custom -> estado `pending` y acciones de revision en empresa.
3. Empresa sube archivo en custom -> estado `approved`.
4. Rechazo y re-subida del empleado -> vuelve a `pending`.
5. Aprobado -> configurar vencimiento o sin vencimiento.
6. Con vencimiento configurado -> solicitar firma y completar ciclo de firma.

## Verificacion automatizada (smoke)

- Script: `web/scripts/verify-employee-documents-custom-flow.mjs`
- Comando: `npm run verify:employee-documents-custom-flow`
- Objetivo: validar con datos temporales que el flujo base custom/fijo mantenga transiciones esperadas y limpiar datos al finalizar.

## E2E UI (Playwright)

- Configuracion: `web/playwright.config.ts`
- Tests:
  - `web/e2e/documents-custom-flow.spec.ts`
  - `web/e2e/documents-view-mode.spec.ts`
- Comandos:
  - `npm run e2e:install`
  - `npm run e2e:setup-documents`
  - `npm run e2e:documents`
- Variables de entorno requeridas para el test UI:
  - `E2E_BASE_URL` (ej. `http://127.0.0.1:3000`)
  - `E2E_COMPANY_EMAIL`
  - `E2E_COMPANY_PASSWORD`
  - `E2E_EMPLOYEE_ID`

## Pipeline CI

- Estado actual: pendiente de habilitar en repositorio (se difirio para no tocar permisos `workflow` de GitHub en este push).
- Cuando se habilite, debe incluir estos checks:
  - `npm run e2e:setup-documents`
  - `npm run verify:employee-documents-custom-flow`
  - `npm run e2e:documents`
- Secrets minimos requeridos al habilitarlo:
  - `SUPABASE_DB_POOLER_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `E2E_COMPANY_EMAIL`
  - `E2E_COMPANY_PASSWORD`

## Vista Arbol / Columnas (empresa + portal empleado)

- Empresa (`/app/documents`): toggle de vista con persistencia local por usuario/organizacion.
- Empleado (`/portal/documents`): mismo toggle de vista con persistencia local por usuario/organizacion.
- El modo columnas mantiene seleccion de carpeta y panel de detalle con acciones de archivo.
- El panel `Detalle` incluye preview embebida con altura adaptativa y comportamiento sticky en desktop.
- Preview usa endpoint dedicado `GET /api/documents/preview?documentId=...`.
- Hardening aplicado al preview: rate-limit liviano por usuario + telemetria/auditoria de errores de render.

## Norte recomendado (siguiente etapa)

1. Mover deteccion de `requested_without_file` a metadata explicita en DB para eliminar heuristicas por `mime_type/file_path`.
2. Agregar tests E2E (Playwright) del flujo custom completo (empresa + empleado).
3. Agregar metricas/auditoria de embudo documental (slot creado -> cargado -> aprobado -> firmado).
4. Definir SLA operativo para documentos pendientes (alertas a administrador y empleado).
