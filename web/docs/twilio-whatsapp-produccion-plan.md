# Plan de Implementacion Twilio/WhatsApp en Produccion

## Objetivo

Dejar listo el modulo de notificaciones de `avisos` y `checklists` por `SMS` y `WhatsApp` para uso productivo, con trazabilidad, control de costos, monitoreo y cumplimiento.

## Alcance

- Incluye:
  - envio de avisos por `sms` y `whatsapp`
  - envio de eventos de checklist por `sms` y `whatsapp`
  - templates, observabilidad y controles operativos
- No incluye:
  - campañas masivas de marketing
  - automatizaciones complejas de chatbot

## Estrategia de ejecucion (fases)

### Fase 0 - Precondiciones de negocio y compliance

- [ ] Definir paises objetivo iniciales para envio
- [ ] Definir politica de consentimiento (opt-in) por canal
- [ ] Definir politica de opt-out y baja inmediata
- [ ] Aprobar textos legales para uso de WhatsApp/SMS

**Criterio de salida**
- Marco legal y operativo aprobado por negocio.

### Fase 1 - Onboarding de WhatsApp produccion (Meta + Twilio)

- [ ] Cuenta Twilio en modo pago
- [ ] Business Verification de Meta completada
- [ ] Alta de `WhatsApp Sender` productivo en Twilio
- [ ] Configuracion de perfil de negocio (nombre, logo, categoria)
- [ ] Validacion de estado `approved/connected` del sender

**Criterio de salida**
- Sender WhatsApp productivo activo.

### Fase 2 - Templates y politicas de mensajeria

- [ ] Crear templates transaccionales para aviso/checklist
- [ ] Aprobar templates en Meta
- [ ] Versionar templates (v1, v2) en documento interno
- [ ] Definir fallback de contenido cuando template no aplique

**Criterio de salida**
- Templates aprobadas y listas para uso productivo.

### Fase 3 - Cambios en backend y configuracion

- [ ] Agregar envs productivas en plataforma de deploy (no en repo)
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
  - `TWILIO_WHATSAPP_NUMBER` (sender productivo)
- [ ] Agregar modo de ejecucion por entorno (`sandbox`/`production`)
- [ ] Implementar idempotencia de envio (evitar duplicados)
- [ ] Persistir resultado de entrega por destinatario/canal (sid, status, error)
- [ ] Homogeneizar normalizacion de telefonos a formato E.164

**Criterio de salida**
- Envio productivo controlado, auditable y sin duplicados.

### Fase 4 - Observabilidad y operacion

- [ ] Dashboard con metricas por canal:
  - enviados
  - entregados
  - fallidos
  - costo estimado
- [ ] Alertas operativas:
  - tasa de fallo alta
  - errores de autenticacion
  - problemas de template
- [ ] Trazabilidad por tenant y por evento (`announcement` / `checklist`)

**Criterio de salida**
- Operacion monitoreable en tiempo real.

### Fase 5 - Piloto controlado y go-live

- [ ] Habilitar feature flag por tenant
- [ ] Ejecutar piloto con 1-2 tenants reales
- [ ] Medir 72h: entregabilidad, errores, costo
- [ ] Ajustar templates/reglas segun resultados
- [ ] Habilitacion progresiva al resto de tenants

**Criterio de salida**
- Go-live estable con riesgo controlado.

## Plan tecnico recomendado (modulo avisos/checklists)

1. Crear tabla de tracking de entregas por destinatario:
   - `notification_dispatches`
   - campos: tenant, modulo, evento, canal, to, twilio_sid, status, error, attempts, created_at
2. Centralizar envio en servicio unico:
   - `notification service` con adapters (`email`, `sms`, `whatsapp`)
3. Mover envios pesados a job/cola:
   - cron/worker para retries y backoff
4. Definir politicas de retry:
   - reintentos maximos y codigos no reintentables
5. Exponer panel operativo en superadmin (lectura)

## Riesgos y mitigacion

- Riesgo: bloqueo por template no aprobado
  - Mitigacion: fallback a SMS/email + monitoreo de error code
- Riesgo: costos inesperados
  - Mitigacion: limites por tenant y alertas de consumo
- Riesgo: mensajes duplicados
  - Mitigacion: idempotency key por evento+canal+destino
- Riesgo: baja entregabilidad
  - Mitigacion: saneo de telefonos + opt-in valido + observabilidad

## Definition of Done (DoD)

- [ ] Envio WhatsApp/SMS productivo para avisos y checklists
- [ ] Tracking completo por mensaje y destinatario
- [ ] Alertas y dashboard operativos activos
- [ ] Politica de opt-in/opt-out aplicada
- [ ] Piloto y despliegue progresivo completados

## Sugerencia de guardado y gestion

Si, esta bien guardarlo como plan futuro en docs.

Adicionalmente, recomendado:
- mantener este plan en `web/docs/`
- abrir un checklist ejecutable por fases en backlog (Jira/Linear/GitHub Projects)
- registrar decisiones clave en `DOCUMENTACION_TECNICA.md` al cerrar cada fase
