# Checklist Implementacion 2.1 - Chatbot IA Flotante

## Objetivo

Implementar un chatbot flotante para panel empresa que responda con datos reales de la organizacion y respete seguridad multiempresa.

## Alcance de modulo

Esta implementacion se considera un **nuevo modulo** del sistema, integrado con los modulos existentes.

- modulo nuevo: `ai_assistant`
- dependencia funcional: empleados, documentos, checklists, anuncios, reportes, settings
- regla: no reemplaza modulos existentes; los complementa como capa de consulta inteligente.

---

## Estado global

- Version: `2.1`
- Estado: `[x] Completado (fase inicial)`

---

## Checklist por fases

### [x] 2.1.1 Backend base seguro

- [x] Crear ruta `POST /api/company/ai/chat`
- [x] Validar auth + tenant + rol + modulo
- [x] Estructura base de request/response

### [x] 2.1.2 UI chatbot flotante

- [x] Boton flotante en panel empresa
- [x] Panel de chat (input + lista de mensajes)
- [x] Estados: loading, error, sin datos

### [x] 2.1.3 Herramientas de datos iniciales

- [x] Consulta de empleados activos
- [x] Consulta de pendientes checklists
- [x] Consulta de documentos pendientes
- [x] Consulta de modulos habilitados

### [x] 2.1.4 Seguridad operativa

- [x] Auditoria de uso del chatbot
- [x] Rate limit por usuario/sesion
- [x] Sanitizacion de preguntas

### [x] 2.1.4.b Integracion de modulo en planes

- [x] Crear/actualizar `module_catalog.code = ai_assistant`
- [x] Habilitar `ai_assistant` en `plan_modules` para `basico` y `pro`
- [x] Sincronizar `organization_modules` para organizaciones con plan `basico/pro`
- [x] Verificar contrato con `verify:official-plan-packaging`

### [x] 2.1.5 QA y cierre

- [x] QA por rol (admin/manager permitido, employee restringido por diseño)
- [x] QA multiempresa (aislamiento)
- [x] QA performance (no degradar navegacion)
- [x] Documentacion final de release 2.1

## Evidencia de cierre 2.1

- API operativa: `POST /api/company/ai/chat`
- UI operativa: boton flotante + panel chat en shell empresa
- Modo por plan:
  - `basico`: OpenRouter -> fallback estructurado
  - `pro`: OpenAI -> OpenRouter -> fallback estructurado
- Integracion de modulo:
  - `module_catalog.code = ai_assistant`
  - `plan_modules` habilitado para `basico/pro`
  - `organization_modules` sincronizado para tenants con esos planes
- Verificaciones:
  - `npm run verify:official-plan-packaging` OK
  - `npm run build` OK
- Mejora 2.1.1 (fase A) aplicada:
  - prompt por dominio activo
  - contexto operacional (`originModule`, rol, intencion) activo
  - etiqueta de confianza visible en respuesta

## Evidencia de cierre 2.1.1 (OpenRouter Pro)

- Guardrails sensibles activos (bloqueo de preguntas fuera de alcance)
- Memoria corta por sesion activa (ultimos turnos, con expiracion)
- Reintento de calidad activo cuando respuesta inicial sale debil
- Cache FAQ por tenant/pregunta activa (TTL corto)
- Enrutamiento por complejidad activo (modelo rapido vs complejo)
- Telemetria de costo/latencia activa en auditoria (`duration_ms`, tokens, costo estimado)
- QA tecnico: build OK

---

## Regla de cierre

Solo se marca completo cada item con:

1. implementacion hecha
2. prueba validada
3. evidencia documentada
