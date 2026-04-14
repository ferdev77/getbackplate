# DOC_ID: COMP_F1_DOCUSEAL_SIGNATURE_PLAN
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: Reglas de negocio, modelo de datos, API y plan de rollout para integración de firma con DocuSeal

# Employee Document Signature Plan (DocuSeal)

> **ESTADO ACTUAL DE IMPLEMENTACIÓN (Fase 1 MVP):** 
> - **[✔] UI DocuSeal Modal (Empleado):** Integración nativa de `<docuseal-form>`, problemas de renderizado de altura absoluta en móviles (`Absolute inset-0` y scroll truncado) corregidos mediante inyección de contenedor flexible (`overflow-y-auto`, `min-h-full` y scroll nativo táctil de iOS). Fallbacks para bloqueadores de anuncios operativos.
> - **[✔] Backend / Endpoints:** Creación de solicitud (`/api/company/employees/documents/signature/request`).
> - **[✔] Webhook / Estado:** Endpoint (`/api/integrations/docuseal/webhook`), modelo de BD (`employee_documents` columns + views) y validación de idempotencia.
> - **[✔] UI Badges (Empresa/Empleado):** Lógica visual de sincronización (Badge "Firma solicitada" y listados actualizados).

Objetivo: habilitar el boton `Solicitar firma` en documentos de empleado una vez que el documento fue aprobado y su regla de vencimiento fue configurada (con fecha o `sin vencimiento`), permitiendo firma electronica via DocuSeal con trazabilidad completa.

## Alcance funcional

- Panel empresa:
  - Si documento `approved` + configuracion de vencimiento guardada -> mostrar `Solicitar firma`.
  - Al solicitar firma -> estado visible (`Firma solicitada`) y opcion de reenvio (fase 2).
- Panel empleado:
  - Ver estado de firma por documento (`Pendiente de firma`, `Firmado`, `Rechazado/Expirado`).
  - Si hay URL activa de firma -> CTA `Firmar ahora`.
- Integracion DocuSeal:
  - Crear solicitud de firma con metadata del tenant/empleado/documento.
  - Recibir webhook y sincronizar estados de firma.

## Reglas de negocio

1. Solo se puede solicitar firma si:
   - `employee_documents.status = approved`, y
   - `expiration_configured = true` (fecha guardada o `has_no_expiration = true`).
2. No se permiten solicitudes paralelas activas para el mismo documento.
3. Si el documento se reemplaza, se cancela/inhabilita el ciclo de firma anterior.
4. Todo evento de firma debe quedar auditado.

## Modelo de datos propuesto

Nueva tabla: `employee_document_signatures`

- `id uuid pk`
- `organization_id uuid not null`
- `employee_id uuid not null`
- `document_id uuid not null`
- `provider text not null default 'docuseal'`
- `provider_submission_id text null`
- `provider_envelope_id text null`
- `provider_sign_url text null`
- `requested_by uuid not null`
- `requested_at timestamptz not null default now()`
- `status text not null` (`requested|viewed|completed|declined|expired|failed|cancelled`)
- `completed_at timestamptz null`
- `declined_at timestamptz null`
- `expires_at timestamptz null`
- `error_message text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indices:

- `(organization_id, employee_id, document_id)`
- `(organization_id, status)`
- unique parcial para solicitud activa por documento (evitar duplicadas).

Campos de cache rapido en `employee_documents` (opcional recomendado):

- `signature_status text null`
- `signature_last_requested_at timestamptz null`
- `signature_required boolean not null default false`

## Endpoints a implementar

### 1) Solicitar firma (empresa)

`POST /api/company/employees/documents/signature/request`

Input:

- `employeeId`
- `documentId`

Proceso:

1. Validar permisos (`assertCompanyAdminModuleApi("employees")`).
2. Validar reglas (`approved` + configuracion vencimiento + no solicitud activa).
3. Crear submission en DocuSeal.
4. Persistir en `employee_document_signatures`.
5. Actualizar cache en `employee_documents`.
6. Registrar auditoria.

Output:

- `ok`
- `signatureStatus`
- `signUrl` (si aplica)

### 2) Webhook DocuSeal

`POST /api/integrations/docuseal/webhook`

Proceso:

1. Verificar firma webhook (`DOCUSEAL_WEBHOOK_SECRET`).
2. Resolver registro por `provider_submission_id`.
3. Mapear evento -> estado interno:
   - `viewed` -> `viewed`
   - `completed` -> `completed`
   - `declined` -> `declined`
   - `expired` -> `expired`
4. Actualizar `employee_document_signatures` y cache en `employee_documents`.
5. Auditoria + idempotencia por `event_id`.

### 3) Reenviar solicitud (fase 2)

`POST /api/company/employees/documents/signature/remind`

### 4) Cancelar solicitud (fase 2)

`POST /api/company/employees/documents/signature/cancel`

## UI - Modal Empresa

Ubicacion: `src/modules/employees/ui/new-employee-modal.tsx`

Mostrar `Solicitar firma` cuando:

- `status === approved`
- `expiration_configured === true`
- `signature_status` no sea `completed`

Estados visuales:

- `requested`: badge `Firma solicitada`
- `viewed`: badge `Firma vista`
- `completed`: badge `Firmado` + `Ver documento firmado`
- `declined|expired|failed`: badge de alerta + CTA para reintentar

## UI - Modal Empleado

Mostrar por documento:

- `Pendiente de firma`: CTA `Firmar ahora`
- `Firmado`: fecha de firma + descarga del firmado
- `Rechazado/Expirado`: mensaje de estado

## Emails y notificaciones

1. Al solicitar firma:
   - Email al empleado con CTA de firma.
2. Al completar firma:
   - Email al admin solicitante.
3. Al expirar/rechazar:
   - Email al admin (y opcional al empleado).

## Variables de entorno

- `DOCUSEAL_API_URL`
- `DOCUSEAL_API_KEY`
- `DOCUSEAL_WEBHOOK_SECRET`

## Seguridad y auditoria

- Validar siempre tenant + permisos.
- Webhook con verificacion criptografica obligatoria.
- Idempotencia en webhook.
- Eventos de auditoria:
  - `employee_document.signature.request`
  - `employee_document.signature.completed`
  - `employee_document.signature.declined`
  - `employee_document.signature.expired`
  - `employee_document.signature.failed`

## Plan de rollout

### Fase 1 (MVP)

- Migraciones tabla `employee_document_signatures` (+ cache minima en `employee_documents`).
- Endpoint `signature/request`.
- Webhook `docuseal/webhook` con `completed`.
- UI empresa: boton + badge `Firma solicitada`.
- UI empleado: `Firmar ahora`.

### Fase 2

- Estados `viewed/declined/expired`.
- Reenvio/cancelacion.
- Emailing completo por estado.

### Fase 3

- Cron de reconciliacion con DocuSeal.
- Metricas y dashboard de conversion de firma.

## Criterios de aceptacion

1. No se puede solicitar firma si el documento no esta aprobado.
2. No se puede solicitar firma sin configuracion de vencimiento/sin vencimiento.
3. El empleado puede firmar desde su modal cuando hay solicitud activa.
4. Al completar en DocuSeal, ambos modales reflejan `Firmado`.
5. Cada transicion queda auditada.
