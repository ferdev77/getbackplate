# Politica Interna - Asistente IA

## Objetivo

Definir como el Asistente IA usa contexto de datos, conserva conversaciones, protege privacidad y mejora respuestas operativas sin inventar informacion.

## Alcance

- Aplica al endpoint `web/src/app/api/company/ai/chat/route.ts`.
- Aplica a usuarios del panel empresa con modulo `ai_assistant` habilitado.
- Aplica a almacenamiento de conversaciones y preferencias en tablas IA.

## Principios

1. Relevancia primero: responder exactamente lo que se pregunto.
2. No relleno: evitar informacion extra no solicitada.
3. Aislamiento estricto por tenant: no mezclar organizaciones.
4. Aislamiento por usuario: no mezclar historiales entre usuarios.
5. Seguridad por defecto: bloquear consultas sensibles y fuera de alcance.

## Memoria y retencion

### Memoria corta

- Se usa para continuidad de chat en tiempo real.
- TTL recomendado: 30 minutos.
- Limite recomendado: 6 turnos recientes.

### Memoria persistente

- Se guardan conversaciones y mensajes para continuidad entre sesiones.
- Retencion recomendada de mensajes: 90 dias.
- Conversaciones inactivas: archivar a 30 dias.
- Conversaciones archivadas sin mensajes: borrar a 180 dias.

### Memoria de preferencias

- Se guardan preferencias utiles por usuario:
  - estilo de respuesta (`short`, `normal`, `detailed`)
  - inclusion de siguiente accion (`true`/`false`)
- No guardar secretos ni datos sensibles en preferencias.

## Modelo de datos

- `public.ai_conversations`
- `public.ai_messages`
- `public.ai_user_memory`

Las tres tablas deben operar con RLS habilitado y politicas por `organization_id` + `user_id`.

## Limpieza automatica

- Funcion SQL: `public.cleanup_ai_assistant_data(...)`.
- Debe ejecutarse con scheduler (cron externo o job interno) al menos 1 vez por dia.
- Se recomienda registrar salida del job en monitoreo operativo.

## Respuesta operacional

- La IA debe contestar primero la pregunta puntual.
- Solo agregar contexto si aporta decision operativa.
- Si faltan datos, declararlo explicitamente.

## Proveedores IA y fallback

- Prioridad actual en runtime: OpenRouter (`mode: basic_ai`).
- Fallback automatico: Anthropic (`mode: pro_ai`).
- Si ambos fallan, usar respuesta estructurada local (reglas).

## Observabilidad

- Auditar cada consulta con metadata minima:
  - modo
  - proveedor
  - modelo
  - tokens
  - latencia
  - modulo origen
- No guardar secretos en logs.

## Operacion recomendada

1. Revisar semanalmente tasa de error y latencia.
2. Revisar calidad de respuesta por muestras reales.
3. Ajustar prompt y guardrails sin romper aislamiento de datos.
4. Confirmar que la limpieza diaria de IA se ejecute correctamente.
