# DOC_ID: PERF_REPORT_CACHE_LOCAL_AND_SERVER_DOCUMENTS_2026_04_22
# DOC_LEVEL: OPERATIONS_REPORT
# PHASE_NAMESPACE: PERFORMANCE_AND_CACHE
# SOURCE_OF_TRUTH_FOR: contexto, diagnostico, implementacion y funcionamiento del plan de performance con cache local + server

# Reporte Completo - Performance con Cache Local y Server (Documentos)

Fecha: 2026-04-22  
Estado: implementado (fase actual + invalidacion por tags en mutaciones)  
Alcance principal: Company Shell + pagina de Documentos (empresa) + base reutilizable para portal/otros modulos

---

## 1) Problema original (que pasaba y por que dolia)

Antes de esta mejora, la UX tenia friccion por latencia en flujos frecuentes:

- Cada apertura de modales/cargas de catalogos en shell hacia fetch directo, incluso cuando el dato era muy similar al de la accion anterior.
- En Documentos se repetian consultas pesadas (carpetas, documentos, branches, departamentos, puestos y usuarios scope) en cada render server de pagina.
- No habia una capa comun de cache cliente reutilizable para estandarizar TTL, versionado, invalidacion y observabilidad.
- El sistema dependia mas del roundtrip red/DB de lo necesario para datos de soporte (catalogos/listas base), generando espera perceptible.

Impacto operativo:

- Mayor tiempo percibido en primera interaccion y reinteracciones.
- Mayor costo de consultas repetidas en backend.
- Mayor riesgo de inconsistencias de comportamiento entre modulos por no tener un contrato unico de cache cliente.

---

## 2) Diagnostico y hallazgos (que se detecto)

Se detectaron tres causas raiz:

1. **Falta de estrategia uniforme en cliente**
   - Habia logica de fetch + estado local, pero sin capa comun de cache reutilizable.
   - No existia medicion uniforme de hit/miss para validar rendimiento.

2. **Dependencia fuerte de consultas completas server-side**
   - La pagina de Documentos hacia consultas amplias por request.
   - Parte del dataset podia cachearse temporalmente sin comprometer seguridad.

3. **Invalidacion no estandarizada en cache local**
   - Se necesitaba invalidar cache local cuando llegaban eventos realtime relevantes.
   - Sin eso, el riesgo es mostrar informacion vieja mas tiempo del deseado.

---

## 3) Objetivo de la solucion

Reducir latencia percibida y costo de consultas repetidas, manteniendo consistencia de datos y seguridad multi-tenant.

Objetivos concretos:

- Mostrar datos de soporte mas rapido (cache hit local).
- Revalidar en background sin bloquear UX.
- Invalidar de forma deterministica cuando cambian tablas relevantes.
- Reutilizar el patron en mas modulos sin duplicar implementacion.

---

## 4) Implementacion realizada (que se hizo y como)

## 4.1 Capa comun de cache cliente (sessionStorage)

Archivo nuevo:

- `web/src/shared/lib/client-cache.ts`

Se implemento una libreria comun para cache cliente con contrato unificado:

- `readSessionCacheSnapshot({ key, version, ttlMs })`
- `writeSessionCacheSnapshot({ key, snapshot })`
- `clearSessionCacheSnapshot(key)`

Caracteristicas tecnicas:

- Versionado de snapshot (permite invalidar estructuras antiguas al cambiar contrato).
- TTL por tipo de dato.
- Limpieza automatica de snapshots invalidos/vencidos.
- Modo best-effort (si falla storage, no rompe funcionalidad).
- Emision de metricas en evento browser:
  - `gb:client-cache-metric`
  - acciones: `hit`, `miss`, `write`, `clear`, `stale`, `invalid`, `read_error`, `write_error`.

## 4.2 Integracion en Company Shell (cache local + revalidacion)

Archivo actualizado:

- `web/src/shared/ui/company-shell.tsx`

Se aplico cache local a catalogos de modales:

- announcements
- checklists
- documents
- employees
- users

Como se implemento:

1. Claves de cache con scope fuerte:
   - `tenantId + sessionUserEmail + catalogName + version`.
2. Hydration inicial:
   - al montar shell, intenta leer snapshots validos por TTL y precarga estado local.
3. Revalidacion:
   - cuando corresponde (por TTL o accion), fetch normal y write de snapshot actualizado.
4. Invalidacion por realtime:
   - al detectar cambios en tablas relevantes, limpia estado y snapshot local asociado.

Resultado:

- Apertura de modales mas rapida en navegacion repetida.
- Menor dependencia de red en interacciones consecutivas.

## 4.3 Cache server-side del seed de Documentos

Archivo nuevo:

- `web/src/modules/documents/cached-queries.ts`

Se creo cache server con `unstable_cache` para dataset base de Documentos:

- carpetas
- documentos
- branches
- departments
- positions
- set de documentos del dominio empleado (serializado)
- scope users (cacheado por separado)

Funciones principales:

- `getDocumentsWorkspaceSeedCached(organizationId)`
  - `revalidate: 20s`
- `getDocumentsScopeUsersCached(organizationId)`
  - `revalidate: 60s`

Archivos integrados:

- `web/src/app/(company)/app/documents/page.tsx`
- `web/src/app/(employee)/portal/documents/page.tsx`

Como funciona tecnicamente:

- En vez de reconstruir todo con queries inline en cada request, la pagina consume seed cacheado.
- Luego aplica filtros de negocio por contexto (empresa vs empleado) sobre ese seed.
- Esto reduce consultas repetidas y estabiliza tiempos de respuesta.

## 4.4 Invalidacion activa por tags en mutaciones (nueva pasada)

Problema detectado en la fase anterior:

- Aunque ya habia cache server temporal por ventana (`revalidate`), faltaba invalidacion inmediata y deterministica cuando un usuario mutaba Documentos (crear/editar/mover/eliminar).
- Eso podia dejar una ventana corta donde algunas vistas leian seed stale hasta que venciera el TTL.

Que se implemento:

- Se agregaron tags canonicos del cache de Documentos en:
  - `web/src/modules/documents/cached-queries.ts`
  - `DOCUMENTS_WORKSPACE_SEED_TAG`
  - `DOCUMENTS_SCOPE_USERS_TAG`
- Se agrego helper centralizado de invalidacion:
  - `web/src/modules/documents/revalidate-cache.ts`
  - `revalidateDocumentsCaches()`
- Se integraron invalidaciones post-exito en mutaciones de empresa y portal empleado:
  - `web/src/app/api/company/documents/route.ts`
  - `web/src/app/api/company/document-folders/route.ts`
  - `web/src/app/api/employee/documents/manage/route.ts`
  - `web/src/app/api/employee/document-folders/route.ts`
  - `web/src/shared/lib/employee-delegation-persistence.ts` (cuando permisos delegados impactan estructura/visibilidad de documentos)

Como funciona ahora tecnicamente:

1. Query de seed/scope users queda cacheada con `unstable_cache` + `tags`.
2. Cuando una mutacion termina en success, se llama `revalidateDocumentsCaches()`.
3. Ese helper ejecuta:
   - `revalidateTag(DOCUMENTS_WORKSPACE_SEED_TAG, "max")`
   - `revalidateTag(DOCUMENTS_SCOPE_USERS_TAG, "max")`
4. Resultado: siguiente lectura no espera TTL para actualizarse; fuerza refresh de cache server de forma inmediata.

Beneficio concreto:

- Menor ventana de inconsistencia entre acciones de escritura y lectura posterior.
- Comportamiento mas predecible para usuarios en flujos colaborativos/realtime.
- Base lista para escalar a invalidacion selectiva por dominio sin depender solo de tiempo.

---

## 5) Como funciona ahora (version basica)

En simple:

- Si ya abriste una vez ciertos modales, la siguiente apertura usa datos guardados localmente y aparece mas rapido.
- En Documentos, gran parte de la data base ya viene de cache server temporal, por eso la pagina responde mejor.
- Si hay cambios reales (realtime o TTL vencido), el sistema refresca y reemplaza cache automaticamente.

---

## 6) Como funciona ahora (version tecnica)

Flujo en cliente (Company Shell):

1. On mount: read snapshot por key/version/ttl.
2. Si `hit`: set state inmediato (render rapido).
3. En background o al abrir modal: fetch revalidate.
4. On success: write snapshot con `fetchedAt` nuevo.
5. On realtime change: clear snapshot + reset estado en memoria.

Flujo en server (Documentos):

1. Request page.
2. Obtener seed via `unstable_cache`.
3. Aplicar reglas de filtrado/contexto.
4. Render.
5. Revalidate automatico por ventana temporal.
6. Si hubo mutacion, invalidacion inmediata por `revalidateTag` (sin esperar TTL).

Consistencia y seguridad:

- Cache cliente en `sessionStorage` (aislado por sesion/pestana).
- Claves de cache scopiadas por tenant + usuario.
- No se cachean secretos ni archivos binarios.
- Se cachea metadata operativa y catalogos.

---

## 7) Validacion ejecutada

Comandos corridos durante implementacion:

- `npm run lint`
- `npm run build`

Estado:

- Lint: OK.
- Build: OK.
- Revalidacion por tags: integrada en rutas de mutacion de documentos y folders (empresa + empleado).

---

## 8) Archivos involucrados en esta fase

Nuevos:

- `web/src/shared/lib/client-cache.ts`
- `web/src/modules/documents/cached-queries.ts`
- `web/src/modules/documents/revalidate-cache.ts`

Actualizados:

- `web/src/shared/ui/company-shell.tsx`
- `web/src/app/(company)/app/documents/page.tsx`
- `web/src/app/(employee)/portal/documents/page.tsx`
- `web/src/app/api/company/documents/route.ts`
- `web/src/app/api/company/document-folders/route.ts`
- `web/src/app/api/employee/documents/manage/route.ts`
- `web/src/app/api/employee/document-folders/route.ts`
- `web/src/shared/lib/employee-delegation-persistence.ts`

---

## 9) Beneficios logrados

- Menor tiempo percibido en aperturas repetidas de modales de shell.
- Menor carga repetitiva en consultas server de Documentos.
- Base reutilizable de cache cliente para nuevos modulos.
- Mejor observabilidad de cache en desarrollo (hit/miss y eventos de invalidacion).

---

## 10) Limitaciones actuales y trade-offs

- `sessionStorage` no persiste entre sesiones completas (intencional para reducir riesgo de stale largo).
- Ya se agrego invalidacion por tags en mutaciones principales de documentos; aun asi, falta granularidad por tenant/tag dinamico para invalidacion mas fina.
- Aun falta extender el mismo patron a mas pantallas pesadas (ej. checklist/home portal con data operacional).

---

## 11) Proximas mejoras recomendadas

Orden sugerido:

1. Invalidacion por `revalidateTag` en mutaciones de Documentos (upload/move/delete).
2. Granularidad de tags por tenant/modulo para evitar invalidaciones globales innecesarias.
3. Paginacion/cursor en listados pesados para bajar payload inicial.
4. Virtualizacion de columnas/listas en workspaces de Documentos.
5. Extension de cache cliente a portal (home/checklists/documents) con mismo contrato.
6. Dashboard interno de metricas p95 + cache hit-rate por ruta.

---

## 12) Resumen ejecutivo

Se implemento una arquitectura de cache en dos capas (cliente + server) enfocada en velocidad percibida y costo de consultas. La solucion mantiene seguridad multi-tenant, agrega observabilidad y deja una base tecnica estandar para escalar la optimizacion al resto de modulos sin duplicar logica.
