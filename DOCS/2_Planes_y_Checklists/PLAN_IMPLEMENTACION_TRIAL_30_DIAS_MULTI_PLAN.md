# Plan de Implementacion - Trial de 30 Dias (Cualquier Plan)

Fecha: 2026-03-30  
Estado: Ejecutado  
Alcance: Plataforma Company (tenant billing + accesos por modulos)

---

## 1) Objetivo

Implementar un periodo de prueba de **30 dias** para cualquier plan, de forma segura y consistente, sin romper flujos actuales.

Regla de negocio principal:

- Todo tenant nuevo puede iniciar con **30 dias de prueba** en el plan que elija.
- El trial es **una sola vez por tenant**.

---

## 2) Principios de arquitectura (obligatorios)

- Stripe define el estado de cobro.
- El backend de GetBackplate define el estado de acceso del tenant.
- La UI no decide permisos de trial.
- Toda operacion multi-tenant mantiene filtro por `organization_id`.
- Webhooks con idempotencia persistente (no solo en memoria).

---

## 3) Regla funcional del Trial 30 dias

- Duracion fija: **30 dias**.
- Aplica a cualquier plan (Starter/Pro/Enterprise, etc.).
- Si cambia de plan durante trial:
  - se cambian modulos/limites del plan,
  - **no** se reinicia ni extiende el reloj de 30 dias.
- Al terminar trial:
  - si hay metodo de pago valido -> pasa a activo pago,
  - si no hay pago -> estado restringido (o gracia corta, segun politica final).
- Un tenant no puede volver a iniciar trial si ya lo uso.

---

## 4) Modelo de estados recomendado

Estados internos de acceso (tenant entitlement):

- `trial_active`
- `trial_expiring`
- `active_paid`
- `grace_period` (si se define)
- `restricted`
- `canceled`

Transiciones esperadas:

- `trial_active -> trial_expiring -> active_paid | grace_period | restricted`
- `grace_period -> active_paid | restricted`
- `active_paid -> grace_period | canceled`

---

## 5) Datos minimos a persistir

Guardar/asegurar en dominio de tenant:

- `trial_started_at`
- `trial_ends_at`
- `trial_used` (boolean)
- `subscription_status` (normalizado interno)
- `grace_ends_at` (si aplica gracia)

Notas:

- `trial_used` debe quedar irreversible una vez iniciado.
- No exponer actualizacion de estos campos desde cliente.

---

## 6) Servicio central de acceso (single source of truth)

Crear un servicio unico en backend, por ejemplo:

- `resolveTenantEntitlement(organizationId)`

Debe devolver:

- estado actual (trial/paid/restricted),
- fecha fin trial,
- dias restantes,
- modulos efectivos habilitados,
- flags de UI (ej. mostrar banner de trial).

Este servicio se usa en:

- middleware/guards,
- rutas API sensibles,
- layout/shell para mostrar estado.

---

## 7) Integracion Stripe (flujo profesional)

### 7.1 Creacion de suscripcion con trial

- Iniciar suscripcion con `trial_end` o `trial_period_days=30`.
- Enviar metadata con `organization_id` para trazabilidad.

### 7.2 Webhooks obligatorios

Procesar minimo:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end`

### 7.3 Idempotencia duradera

- Registrar `event.id` procesado en almacenamiento persistente.
- Si el evento ya existe: responder OK y no reprocesar.

---

## 8) Enforcement de acceso (sin romper UX)

- Durante trial: acceso normal segun plan elegido.
- Al expirar sin pago:
  - bloquear acciones operativas,
  - mantener visibles pantallas de cuenta/configuracion/billing para recuperar.
- Mensajes claros de estado y accion requerida.

---

## 9) UX minima requerida

- Badge/banner: `Te quedan X dias de prueba`.
- Avisos de vencimiento: D-7, D-3, D-1, D0.
- CTA principal: `Agregar metodo de pago` / `Activar plan`.
- Estado post-vencimiento claro y no ambiguo.

---

## 10) Seguridad y anti-abuso

- Un trial por tenant (`trial_used=true` bloquea reinicio).
- Auditar:
  - inicio trial,
  - fin trial,
  - cambio de estado,
  - intentos bloqueados.
- Monitorear desalineaciones entre Stripe y estado interno.

---

## 11) Plan de ejecucion por fases

### Fase A - Contrato funcional

- Cerrar reglas finales (gracia o restriccion directa).
- Definir mensajes de estado para usuarios.

### Fase B - Dominio y servicio central

- Persistencia de campos trial.
- Implementar `resolveTenantEntitlement`.

### Fase C - Stripe + webhooks

- Trial 30 dias en suscripcion.
- Normalizacion de estados.
- Idempotencia persistente.

### Fase D - Enforcement

- Aplicar guard en modulos/rutas.
- Mantener acceso de recuperacion de cuenta/billing.

### Fase E - UX y comunicacion

- Banner, contador, alertas y CTA.

### Fase F - QA y salida controlada

- Validacion completa.
- Habilitacion gradual por feature flag.

---

## 12) QA de aceptacion

Casos minimos:

- Tenant nuevo con plan A inicia trial 30 dias.
- Cambio a plan B durante trial mantiene misma fecha de fin.
- Fin de trial con pago valido -> `active_paid`.
- Fin de trial sin pago -> `restricted` (o `grace_period` segun politica).
- Reintento de webhook no duplica efectos.
- Tenant con trial usado no puede reiniciar trial.
- Verificacion de aislamiento por `organization_id` en toda mutacion.

---

## 13) Metricas de seguimiento

- `trial_started_total`
- `trial_to_paid_conversion_rate`
- `trial_expired_without_payment_total`
- `webhook_duplicate_ignored_total`
- `webhook_processing_error_total`
- `entitlement_mismatch_total`

---

## 14) Riesgos y mitigacion

- Riesgo: eventos fuera de orden en webhooks.  
  Mitigacion: normalizacion por timestamp + idempotencia.

- Riesgo: trial reaplicable por caminos alternos.  
  Mitigacion: `trial_used` irreversible + validacion central.

- Riesgo: bloqueos bruscos al expirar.  
  Mitigacion: estado de recuperacion claro y UX de pago inmediata.

---

## 15) Decision de negocio fijada en este plan

Queda definido para esta implementacion:

- **Trial de 30 dias para cualquier plan**.
- **Sin extender trial por cambio de plan**.
- **Un solo trial por tenant**.

---

## 16) Implementacion aplicada (estado real)

Quedo implementado y funcional con este comportamiento:

- El trial de 30 dias se aplica en el flujo de checkout para tenant elegible.
- Elegibilidad: tenant sin suscripcion activa y sin historial previo en `subscriptions`.
- Si el tenant ya tuvo suscripcion, no recibe trial nuevamente.
- Si el tenant ya tiene suscripcion activa/trialing y cambia plan, no se reinicia trial.
- Se registra auditoria de creacion de checkout con metadata de trial aplicado.
- En panel empresa se muestra badge lateral de trial activo con dias restantes.

Archivos clave implementados:

- `web/src/modules/billing/services/trial-policy.service.ts`
- `web/src/app/api/stripe/checkout/route.ts`
- `web/src/modules/organizations/queries.ts`
- `web/src/app/(company)/app/layout.tsx`
- `web/src/shared/ui/company-shell.tsx`
