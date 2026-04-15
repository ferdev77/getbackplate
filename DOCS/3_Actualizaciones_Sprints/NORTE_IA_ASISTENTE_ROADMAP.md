# DOC_ID: NORTE_IA_ASISTENTE
# DOC_LEVEL: NORTE_TÉCNICO
# SOURCE_OF_TRUTH_FOR: dirección de evolución del módulo ai_assistant

# Norte Técnico — Asistente IA (ai_assistant)

Fecha de análisis: 2026-04-15

Este documento resume la arquitectura actual del asistente IA y las decisiones de evolución
evaluadas para guiar futuras iteraciones sin perder el contexto de las decisiones ya tomadas.

---

## 1. Cómo funciona actualmente

El asistente es un **dashboard en lenguaje natural**. No lee la pantalla ni el contenido de documentos.
Cada vez que el usuario hace una pregunta, el backend ejecuta ~20 consultas `COUNT(*)` en paralelo
contra Supabase (`Promise.all`) para obtener métricas numéricas, y luego las envía a Claude
junto con la pregunta del usuario para que redacte una respuesta.

### Datos que obtiene hoy (los "Facts")

| Campo | Descripción |
|---|---|
| `employeesActive / Total` | Conteo de empleados activos y totales |
| `usersActive` | Membresías activas |
| `branchesActive` | Sucursales activas |
| `departmentsActive` | Departamentos activos |
| `positionsActive` | Puestos de trabajo activos |
| `documentsTotal / Pending` | Documentos totales y sin aprobar |
| `foldersTotal` | Carpetas de documentos |
| `checklistTemplatesTotal` | Plantillas de checklist |
| `checklistRunsTotal / Pending` | Ejecuciones y pendientes |
| `announcementsActive / Featured / ExpiringSoon` | Avisos |
| `latestAnnouncementTitle` | Título del último aviso |
| `latestDocumentName` | Nombre del último documento |
| `latestChecklistTemplate` | Nombre de la última plantilla |
| `enabledModules` | Módulos activos del tenant |
| `planCode / planName` | Plan contratado |

### Lo que NO sabe hoy

- Nombres de empleados individuales
- Quién tiene documentos pendientes en particular
- Qué sucursal tiene checklists sin completar
- Contenidos de documentos, avisos, ítems de checklist
- Historial de cambios en el tiempo

---

## 2. Opción evaluada: RPC único de PostgreSQL

**Qué es:** En lugar de 20 queries HTTP separadas, crear una función SQL en Supabase que retorne
todos los conteos en una sola llamada `supabase.rpc('get_ai_facts', { org_id })`.

**Impacto:**
- Reduce 20 requests HTTP → 1 request HTTP
- Mejora de latencia: ~40ms → ~10ms
- NO cambia qué puede responder la IA — solo hace lo mismo más eficientemente

**Veredicto:** Mejora técnica válida pero de bajo impacto funcional. No priorizado.

---

## 3. Opción evaluada: Context Preloading + Extracción Inteligente ⭐ (NORTE)

**Qué es:** Cargar TODO el contexto de la organización en Redis (Upstash) al iniciar sesión,
con refresh cada 20 minutos (o via Supabase Realtime). En cada pregunta, en lugar de enviar
todo el contexto a Claude (muy caro), hacer una extracción quirúrgica del subconjunto relevante.

**Ejemplo:**
```
Usuario pregunta: "¿Qué empleados tienen documentos sin firmar?"

Sin Context Preloading (hoy):
→ Solo sabe: "hay 3 documentos pendientes" ❌ no sabe quiénes

Con Context Preloading + Extracción:
→ Busca en caché los empleados con documentos pendientes
→ Extrae: [{nombre: "Juan García", doc: "Contrato 2026", estado: "pending"}...]
→ Manda SOLO esos 3 registros a Claude → ~2.000 tokens
→ Claude responde: "Juan García tiene el contrato 2026 sin firmar" ✅
```

**Costo estimado:**
- Carga inicial en Redis: gratis (texto JSON, <1MB por org mediana)
- Extracción inteligente por pregunta: ~1.000-3.000 tokens (similar al costo actual)
- Sin Context Preloading pero mandando todo: 60.000-150.000 tokens por pregunta → costoso
- Con extracción inteligente: casi igual al costo actual

**Componentes técnicos ya disponibles:**
- ✅ Upstash Redis instalado y configurado (`UPSTASH_REDIS_REST_URL`)
- ✅ Supabase Realtime disponible (ya usado en otras partes)
- ✅ Anthropic SDK oficial ya integrado
- ✅ Sistema de caché FAQ ya existe en el endpoint actual

**Veredicto: ESTA ES LA DIRECCIÓN CORRECTA** para que el asistente responda con
nombres reales, casos concretos y contexto profundo de la organización.

---

## 4. Preguntas concretas que podría responder con Context Preloading

(No puede responder ninguna de estas hoy)

- "¿Qué empleados tienen documentos vencidos o sin firmar?"
- "¿Quién no completó el checklist de apertura esta semana?"
- "¿Cuántos empleados tiene la sucursal Norte?"
- "¿Hay empleados sin checklist asignado?"
- "¿Qué avisos vencen esta semana y quiénes no los leyeron?"
- "¿Qué empleado tiene más checklists incompletos?"

---

## 5. Decisión tomada

**No implementar ahora.** El módulo `ai_assistant` está funcional y es útil para
métricas de resumen. La inversión de Context Preloading debe evaluarse cuando:

1. Existan 3+ empresas activas usando el chat regularmente
2. Se tenga feedback de usuarios sobre qué preguntas específicas quieren hacer
3. Se haya completado el Complemento Etapa 1 (Custom Domain, DocuSeal, uploads empleado)

---

## 6. Implementación futura — pasos técnicos

Cuando se decida avanzar:

1. Crear función SQL `get_org_full_context(org_id uuid)` que retorne JSON completo del tenant
2. Al login del `company_admin`, llamar esta función y guardar resultado en Redis con TTL 20 min
3. Suscribir a Supabase Realtime para invalidar caché en cambios de tablas críticas
4. En el endpoint `/api/company/ai/chat`, antes de llamar a Claude, extraer del caché solo
   los documentos relevantes para la pregunta (búsqueda por palabras clave)
5. Inyectar esos documentos en el prompt en lugar de los 20 conteos actuales

**Archivos a modificar:**
- `web/src/app/api/company/ai/chat/route.ts` (función principal)
- Nuevo: `web/src/shared/lib/ai-context-cache.ts` (gestión del caché)
- Nuevo: `supabase/migrations/XXXXXXXX_get_org_full_context.sql` (función SQL)

---

## 7. Referencias

- Implementación actual: `web/src/app/api/company/ai/chat/route.ts`
- Frontend: `web/src/shared/ui/floating-ai-assistant.tsx`
- Sprint de migración al SDK oficial: `ACTUALIZACION_2.3_SAAS.md`
- Variables de entorno: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `UPSTASH_REDIS_REST_URL`
