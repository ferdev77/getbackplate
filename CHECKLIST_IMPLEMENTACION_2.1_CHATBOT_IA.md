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
- Estado: `[ ] Pendiente`

---

## Checklist por fases

### [ ] 2.1.1 Backend base seguro

- [ ] Crear ruta `POST /api/company/ai/chat`
- [ ] Validar auth + tenant + rol + modulo
- [ ] Estructura base de request/response

### [ ] 2.1.2 UI chatbot flotante

- [ ] Boton flotante en panel empresa
- [ ] Panel de chat (input + lista de mensajes)
- [ ] Estados: loading, error, sin datos

### [ ] 2.1.3 Herramientas de datos iniciales

- [ ] Consulta de empleados activos
- [ ] Consulta de pendientes checklists
- [ ] Consulta de documentos pendientes
- [ ] Consulta de modulos habilitados

### [ ] 2.1.4 Seguridad operativa

- [ ] Auditoria de uso del chatbot
- [ ] Rate limit por usuario/sesion
- [ ] Sanitizacion de preguntas

### [ ] 2.1.5 QA y cierre

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
