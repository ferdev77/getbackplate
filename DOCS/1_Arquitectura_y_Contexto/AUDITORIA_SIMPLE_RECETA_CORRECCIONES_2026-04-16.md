# Auditoria Simple + Receta de Correcciones (16-04-2026)

Este documento explica en palabras simples lo que encontre en la auditoria tecnica.

Objetivo: que puedas entender rapidamente:
- que funciona,
- que no funciona,
- que esta mal,
- por que esta mal,
- como lo voy a arreglar,
- y como quedara despues.

Importante: este documento describe el plan. Todavia no ejecuta cambios.

---

## 1) Resumen rapido

### Que funciona hoy

- La base multi-tenant esta bien encaminada (aislamiento por tenant, RLS, modulos por empresa).
- Hay mucho hardening ya hecho en seguridad y permisos.
- Hay auditoria de eventos y trazabilidad en acciones sensibles.
- Hay jobs cron, webhooks, y una arquitectura modular razonable para crecer.

### Que no funciona hoy (bloqueantes)

- El build de produccion esta roto por un cambio de firma en una accion de ordenamiento.
- El lint esta ensuciado por archivos generados de Playwright y algunos errores reales.

### Que esta inestable o riesgoso

- Inconsistencia en variables de entorno para rate limit/cache (puede quedar apagado).
- Cron de recurrencias sin lock distribuido fuerte (riesgo de ejecucion duplicada).
- Algunos endpoints tienen limites fijos y consultas pesadas que no escalan bien.
- Observabilidad con configuracion cara y con PII alta para escalar mundialmente.

---

## 2) Punto por punto (simple y accionable)

## Punto A - Build roto (bloqueante)

- Que funciona:
  - La accion de reorder existe y la logica de negocio esta.
- Que no funciona:
  - El frontend la invoca con 2 parametros separados, pero ahora la accion espera un objeto.
- Que anda mal:
  - Hay incompatibilidad de contrato entre UI y backend.
- Por que anda mal:
  - Se cambio la firma de la funcion y una llamada quedo vieja.
- Como lo voy a arreglar:
  - Actualizar la llamada para enviar `{ departmentId, positionIds }`.
  - Ejecutar typecheck/build para confirmar.
- Como va a quedar:
  - Build verde nuevamente, deploy habilitado, sin regresion funcional.

Referencias:
- `web/src/modules/settings/ui/reorderable-position-list.tsx`
- `web/src/modules/organizations/actions.ts`

## Punto B - Lint sucio por artefactos de test

- Que funciona:
  - ESLint corre y detecta problemas.
- Que no funciona:
  - Tambien analiza archivos generados (reportes gigantes de Playwright) y mete ruido.
- Que anda mal:
  - La senal real de calidad queda mezclada con basura de tooling.
- Por que anda mal:
  - Faltan ignores especificos en configuracion ESLint.
- Como lo voy a arreglar:
  - Ignorar `playwright-report/**`, `test-results/**` y otros artefactos.
  - Dejar lint enfocado en codigo fuente real.
- Como va a quedar:
  - Lint limpio, util y confiable para CI.

Referencias:
- `web/eslint.config.mjs`

## Punto C - Rate limit/cache con variables inconsistentes

- Que funciona:
  - Existe rate limit en borde y store compartido para IA.
- Que no funciona:
  - Se usan nombres distintos de variables en distintas partes.
- Que anda mal:
  - En algunos entornos el rate limit puede no activarse aunque Redis exista.
- Por que anda mal:
  - Un archivo espera `KV_*` y otro `UPSTASH_*`.
- Como lo voy a arreglar:
  - Unificar variables en un solo estandar.
  - Agregar fallback controlado para compatibilidad temporal.
- Como va a quedar:
  - Rate limit y cache compartida funcionando de forma consistente en todos los entornos.

Referencias:
- `web/src/proxy.ts`
- `web/src/shared/lib/ai-runtime-store.ts`

## Punto D - Cron de recurrencias sin lock robusto

- Que funciona:
  - El cron procesa tareas y actualiza proxima ejecucion.
- Que no funciona:
  - Si hay ejecuciones paralelas, puede intentar procesar lo mismo mas de una vez.
- Que anda mal:
  - Falta un mecanismo fuerte de claim/lock por job.
- Por que anda mal:
  - El flujo actual busca lote por fecha y procesa en loop sin lock transaccional por item.
- Como lo voy a arreglar:
  - Pasar a patron de claim atomico (`FOR UPDATE SKIP LOCKED` o equivalente).
  - Añadir idempotencia por job/ventana.
- Como va a quedar:
  - Cron estable, sin duplicados, apto para serverless y escala horizontal.

Referencias:
- `web/src/app/api/webhooks/cron/process-recurrence/route.ts`

## Punto E - Endpoints con limites fijos (no escalan bien)

- Que funciona:
  - Las respuestas salen rapido en volumen bajo/medio.
- Que no funciona:
  - En volumen alto, puede recortar informacion o degradar precision.
- Que anda mal:
  - Hay `.limit(2000)`, `.limit(5000)`, `.limit(1000)` en rutas de negocio.
- Por que anda mal:
  - Son topes defensivos utiles al inicio, pero no suficientes para escala global.
- Como lo voy a arreglar:
  - Reemplazar por paginacion/cursor o agregaciones SQL eficientes.
  - Mover cargas pesadas a jobs/reportes asincronos cuando corresponda.
- Como va a quedar:
  - Respuestas consistentes y predecibles aun con muchos datos.

Referencias:
- `web/src/app/api/company/dashboard/route.ts`
- `web/src/app/api/company/documents/export/route.ts`
- `web/src/modules/employees/services/document-expiration-reminders.ts`
- `web/src/app/(company)/app/documents/page.tsx`

## Punto F - Sobre-fetching en documentos

- Que funciona:
  - La pantalla carga y muestra documentos.
- Que no funciona:
  - Trae mas datos de los que realmente usa.
- Que anda mal:
  - Pide hasta 1000 y luego corta a 100 en memoria.
- Por que anda mal:
  - Es un patron que desperdicia DB/CPU/red.
- Como lo voy a arreglar:
  - Pedir desde SQL solo lo necesario (limit/paginacion real).
  - Preparar cursor para "ver mas".
- Como va a quedar:
  - Menor latencia, menos costo DB, mejor experiencia en tenants grandes.

Referencias:
- `web/src/app/(company)/app/documents/page.tsx`

## Punto G - Uso amplio de admin client en rutas sensibles

- Que funciona:
  - Permite resolver casos complejos y bypass de RLS cuando se necesita.
- Que no funciona:
  - Hay rutas donde se usa admin client para mas cosas de las necesarias.
- Que anda mal:
  - Aumenta el impacto potencial ante bug logico.
- Por que anda mal:
  - El service role es poderoso y reduce barreras de seguridad por defecto.
- Como lo voy a arreglar:
  - Dejar admin client solo para operaciones de sistema estrictas.
  - En resto, priorizar server client + RLS + validaciones.
- Como va a quedar:
  - Menor blast radius y postura de seguridad mas robusta.

Referencias:
- `web/src/app/api/company/vendors/[id]/route.ts`
- `web/src/app/(employee)/portal/checklist/page.tsx`

## Punto H - Observabilidad muy cara para escalar

- Que funciona:
  - Sentry esta integrado en cliente, server y edge.
- Que no funciona:
  - Sampling al 100% y PII habilitada por defecto para todos los entornos.
- Que anda mal:
  - Puede subir costo fuerte y riesgo de privacidad.
- Por que anda mal:
  - Config de inicio sin perfil por entorno.
- Como lo voy a arreglar:
  - Bajar sample rate en produccion.
  - Mantener alto en staging/dev si hace falta.
  - Revisar envio de PII segun politica.
- Como va a quedar:
  - Observabilidad util, mas barata y mas segura.

Referencias:
- `web/src/instrumentation-client.ts`
- `web/sentry.server.config.ts`
- `web/sentry.edge.config.ts`

## Punto I - CI/automatizacion de calidad insuficiente

- Que funciona:
  - Existen scripts de verificacion tecnica.
- Que no funciona:
  - No se detectaron workflows activos en `.github/workflows`.
- Que anda mal:
  - El control de calidad queda manual y depende de disciplina humana.
- Por que anda mal:
  - Falta pipeline obligatorio en PR.
- Como lo voy a arreglar:
  - Definir workflow minimo: lint + typecheck + build + smoke selectivo.
  - Bloquear merge si falla.
- Como va a quedar:
  - Releases mas estables y menos sorpresas en produccion.

Referencias:
- `.github/`

## Punto J - Inconsistencias de documentacion

- Que funciona:
  - Hay mucha documentacion y bastante detallada.
- Que no funciona:
  - Algunas partes no reflejan exactamente el estado actual (ej. version Next).
- Que anda mal:
  - Puede confundir onboarding y decisiones tecnicas.
- Por que anda mal:
  - Evolucion rapida sin sincronizacion completa de docs.
- Como lo voy a arreglar:
  - Actualizar docs fuente de verdad de arquitectura/estado.
  - Marcar claramente fecha y alcance de cada reporte.
- Como va a quedar:
  - Menos confusion y mejor handover tecnico.

Referencias:
- `DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md`
- `web/package.json`

## Punto K - Duplicidad de cliente de email (Brevo)

- Que funciona:
  - Se pueden enviar emails transaccionales.
- Que no funciona:
  - Hay dos implementaciones con criterios distintos.
- Que anda mal:
  - Riesgo de comportamiento inconsistente segun quien llame.
- Por que anda mal:
  - Evolucion incremental sin consolidar capa unica.
- Como lo voy a arreglar:
  - Unificar en un solo cliente oficial.
  - Migrar llamados y deprecar el duplicado.
- Como va a quedar:
  - Menos deuda, menos bugs raros, mantenimiento mas simple.

Referencias:
- `web/src/infrastructure/email/client.ts`
- `web/src/shared/lib/brevo.ts`

---

## 3) Orden de ejecucion propuesto (cuando des OK)

1. Arreglar bloqueantes (build + lint de artefactos).
2. Unificar variables de rate-limit/cache.
3. Endurecer cron de recurrencias (lock + idempotencia).
4. Optimizar endpoints pesados (paginacion y consultas).
5. Reducir superficie de admin client.
6. Ajustar observabilidad (sampling/PII por entorno).
7. Consolidar cliente de email.
8. Dejar CI minimo obligatorio.
9. Actualizar documentacion final.

---

## 4) Resultado esperado despues de la receta

- Plataforma desplegable y estable (build/lint verdes).
- Menos riesgo de duplicados y errores en jobs cron.
- Mejor performance en tenants grandes.
- Seguridad mas fuerte por menor dependencia de service-role.
- Menor costo operativo en observabilidad.
- Calidad de release mas consistente via CI.
- Documentacion alineada al estado real.

---

## 5) Estado

- Documento creado: SI.
- Cambios de codigo ejecutados: NO.
- Pendiente: tu OK para ejecutar la receta tecnica.
