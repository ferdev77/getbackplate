# Guia QBO Webhook - Developer (modo captura manual)

## Objetivo

En este modo, la plataforma:

- escucha webhooks de QuickBooks Online,
- guarda el evento crudo recibido,
- no ejecuta importacion automatica,
- permite importar manualmente una Invoice/CreditMemo por evento.

## Flujo funcional

1. QBO envia webhook a `POST /api/webhooks/qbo`.
2. El backend valida firma (`intuit-signature`) con `QBO_WEBHOOK_VERIFIER_TOKEN`.
3. Se guarda un registro por entidad en `qbo_webhook_events` con estado `captured`.
4. Un usuario company admin revisa eventos en `GET /api/company/integrations/qbo-r365/webhook-events`.
5. Cuando decide importar, ejecuta `POST /api/company/integrations/qbo-r365/webhook-events/{id}/replay`.
6. El backend consulta QBO por `entity_id` y guarda el documento en `fetched_entity` con estado `imported_manual`.

## Configuracion Intuit

- Endpoint URL (Production): `https://app.getbackplate.com/api/webhooks/qbo`
- Endpoint URL (Development): `https://getbackplate-dev-3959-getbackplates-projects.vercel.app/api/webhooks/qbo`
- `Enable cloud event payload format`: OFF
- Eventos sugeridos:
  - Invoice: Create, Update, Emailed
  - CreditMemo: Create, Update (Emailed si aparece)

## Variables de entorno

- `QBO_WEBHOOK_VERIFIER_TOKEN`
  - Debe ser exactamente el verifier token mostrado por Intuit para cada entorno.

## Endpoints

- `POST /api/webhooks/qbo`
  - Recibe webhook y persiste evento.
- `GET /api/company/integrations/qbo-r365/webhook-events`
  - Lista historial de eventos de la organizacion.
- `POST /api/company/integrations/qbo-r365/webhook-events/{id}/replay`
  - Importa manualmente desde QBO para ese evento.
- `GET|POST /api/webhooks/cron/qbo-webhook-process`
  - Deshabilitado para importacion automatica en este modo (respuesta informativa).

## Estados de eventos

- `captured`: webhook recibido y guardado.
- `imported_manual`: documento traido manualmente desde QBO.
- `ignored`: evento descartado por regla/manual.
- `failed`: error de firma o error de consulta.

## Columnas clave en DB

Tabla: `public.qbo_webhook_events`

- `raw_payload`: entidad cruda del webhook.
- `raw_notification`: notificacion completa de Intuit.
- `raw_headers`: headers relevantes del request.
- `fetched_entity`: documento recuperado manualmente desde QBO.
- `imported_at`, `imported_by`: trazabilidad de importacion manual.

## Operacion diaria recomendada

1. Revisar eventos capturados.
2. Seleccionar evento de Invoice/CreditMemo.
3. Ejecutar importacion manual.
4. Validar payload recuperado en `fetched_entity`.

## Nota

Este modo es una base controlada para evolucionar luego a automatizacion, minimizando riesgo operativo.
