# ACTUALIZACION 2.1 SAAS

## Objetivo de la version 2.1

Definir la ruta oficial de implementacion para un **chatbot flotante con IA** dentro del panel de empresa.

Este asistente debe responder preguntas del negocio usando datos reales de la organizacion, sin romper aislamiento entre empresas ni reglas de permisos.

## Naturaleza del alcance 2.1

La version 2.1 define un **nuevo modulo funcional** a integrar sobre los modulos ya existentes del producto.

- Nombre oficial del modulo: `ai_assistant`
- Tipo: modulo opcional habilitable por tenant
- Integracion: consulta datos de modulos existentes (empleados, documentos, checklists, anuncios, reportes, settings) respetando permisos.

---

## Estado de esta version

- Version: `2.1`
- Estado: `implementada (fase inicial operativa)`
- Tipo: `nueva capacidad funcional`
- Ambito inicial: panel empresa (`/app/*`)

---

## Alcance funcional esperado

El chatbot debe poder responder, en lenguaje natural, preguntas como:

- cuantos empleados activos tengo hoy
- cuantas tareas/checklists pendientes hay
- que documentos faltan firmar
- que modulos estan habilitados
- resumen rapido de actividad reciente

Debe incluir:

- boton flotante persistente en panel empresa
- panel de chat lateral o modal
- historial corto de conversacion por sesion
- respuestas basadas en consultas reales (no inventadas)

---

## Reglas obligatorias de seguridad y datos

1. **Aislamiento por tenant obligatorio**
   - nunca leer datos de otra organizacion

2. **Respeto de permisos por rol obligatorio**
   - el chatbot no puede responder datos que el usuario no podria ver en UI

3. **Sin acceso directo a service role desde cliente**
   - toda lectura sensible debe pasar por backend controlado

4. **Auditoria de consultas sensibles**
   - registrar eventos de uso del asistente cuando consulte datos operativos

5. **Respuestas trazables**
   - cuando sea posible, responder con datos concretos y contexto temporal

---

## Arquitectura recomendada

1. UI flotante (cliente)
   - componente `floating-ai-assistant`
   - estados: cerrado/abierto/cargando/error

2. Endpoint backend de chat
   - ruta sugerida: `POST /api/company/ai/chat`
   - valida auth + tenant + rol + modulo

3. Capa de herramientas seguras
   - funciones backend permitidas para consultar datos
   - cada herramienta con filtros por `organization_id`

4. Motor de IA
   - recibe pregunta + contexto permitido
   - devuelve respuesta final en espanol claro

## Comportamiento IA (agnostico al nombre del plan)

- Si el modulo `ai_assistant` esta habilitado para el tenant:
  - usa Anthropic como motor principal
  - fallback a OpenRouter
  - fallback final a modo estructurado (consultas directas con reglas)
- El nombre del plan no condiciona el motor IA. Se pueden crear/renombrar/eliminar planes sin romper IA.

## Variables de entorno requeridas para IA real

- `ANTHROPIC_API_KEY` (obligatoria para IA principal generativa)
- `ANTHROPIC_MODEL` (opcional, por defecto `claude-sonnet-4-6`)
- `OPENROUTER_API_KEY` (opcional, fallback IA)
- `OPENROUTER_MODEL` (opcional, por defecto `openai/gpt-4o-mini`)

## Etiquetas visibles de modo en UI

- `Modo estructurado` (sin proveedor IA)
- `Modo OpenRouter` (respuesta via OpenRouter)
- `Modo IA Pro` (respuesta via Anthropic)

## Mejora 2.1.1 aplicada (OpenRouter Pro)

- prompt profesional por dominio (empleados/checklists/documentos/modulos/resumen)
- contexto operacional inyectado en consulta IA:
  - rol del usuario
  - modulo/pantalla origen
  - intencion detectada de la pregunta
- etiqueta de confianza en respuesta:
  - `alto`, `medio`, `bajo`
- guardrails sensibles activos
- memoria corta por sesion activa
- reintento automatico de calidad activo
- cache de FAQ por tenant activa
- enrutamiento por complejidad activo
- telemetria de costo/latencia activa

---

## Fases de implementacion 2.1

### Fase 2.1.1 - Base segura

- crear endpoint backend de chat
- validar auth/tenant/rol/modulo
- responder con mensaje controlado de prueba

### Fase 2.1.2 - UI flotante

- agregar boton flotante en panel empresa
- abrir panel de chat con input y respuestas
- estados de carga/errores

### Fase 2.1.3 - Primeras herramientas de negocio

- empleados activos
- pendientes de checklist
- documentos pendientes
- modulos habilitados

### Fase 2.1.4 - Calidad y control

- auditoria de consultas
- limites de uso por ventana (rate limit)
- mensajes de fallback cuando no hay datos

### Fase 2.1.5 - Cierre

- smoke funcional completo
- pruebas por rol
- pruebas multiempresa
- documentacion final de operacion

---

## Criterios de aceptacion de 2.1

Se considera implementado cuando:

1. chatbot visible y usable en panel empresa
2. responde datos reales del tenant actual
3. respeta permisos y aislamiento
4. no degrada performance de navegacion principal
5. QA funcional y tecnico en verde

---

## Fuente de verdad para esta version

- especificacion funcional 2.1: `ACTUALIZACION_2.1_SAAS.md`
- checklist operativo 2.1: `CHECKLIST_IMPLEMENTACION_2.1_CHATBOT_IA.md`
- mejora continua OpenRouter (2.1.1): `PLAN_2.1.1_PRO_OPENROUTER.md`
