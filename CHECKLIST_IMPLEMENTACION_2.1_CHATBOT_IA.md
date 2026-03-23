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
- Estado: `[~] En progreso`

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

### [~] 2.1.5 QA y cierre

- [ ] QA por rol (admin/manager/employee)
- [ ] QA multiempresa (aislamiento)
- [ ] QA performance (no degradar navegacion)
- [ ] Documentacion final de release 2.1

---

## Regla de cierre

Solo se marca completo cada item con:

1. implementacion hecha
2. prueba validada
3. evidencia documentada
