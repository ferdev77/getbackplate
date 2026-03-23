# Plan 2.1.1 Pro OpenRouter

## Objetivo

Subir el nivel del modulo `ai_assistant` en modo OpenRouter para que responda con mayor calidad, seguridad y velocidad, manteniendo costos controlados.

---

## Resultado esperado

- respuestas mas utiles y precisas
- menos respuestas genericas
- mas consistencia de tono y formato
- mejor seguridad de datos
- menor costo por consulta en plan `basico`

---

## Fase A (impacto rapido)

### A1. Prompt profesional por dominio

- Crear prompt base por tipo de pregunta:
  - empleados
  - checklists
  - documentos
  - modulos
  - resumen ejecutivo
- Estandar de salida:
  - Resumen
  - Dato clave
  - Siguiente accion

### A2. Contexto operacional en cada consulta

- Agregar al request interno:
  - plan actual
  - rol del usuario
  - modulo/pantalla origen (si aplica)
  - timestamp local

### A3. Etiqueta de confianza

- Mostrar en respuesta:
  - nivel de confianza: alto / medio / bajo
  - advertencia cuando faltan datos

---

## Fase B (calidad y seguridad)

### B1. Guardrails de informacion sensible

- Bloquear respuesta de datos no permitidos por rol
- Enmascarar campos sensibles en metadata
- Responder rechazo claro cuando no corresponde mostrar info

### B2. Memoria corta de sesion

- Mantener ultimos N turnos relevantes (ej: 6)
- No persistir secretos
- Limpiar contexto al cerrar sesion

### B3. Reintento controlado de calidad

- Si respuesta sale vacia, ambigua o con baja utilidad:
  - 1 reintento automatico con prompt de correccion

---

## Fase C (performance y costo)

### C1. Cache de preguntas frecuentes

- Cache por tenant + pregunta normalizada + ventana corta
- Evitar costo repetido para preguntas identicas

### C2. Enrutamiento por complejidad

- Preguntas simples -> modelo rapido/economico
- Preguntas complejas -> modelo de mayor calidad

### C3. Telemetria de costo y latencia

- Registrar por consulta:
  - proveedor
  - modelo
  - duracion
  - tokens estimados
  - modo final (OpenRouter/OpenAI/estructurado)

---

## Checklist de implementacion

- [x] A1 Prompt profesional por dominio
- [x] A2 Contexto operacional
- [x] A3 Etiqueta de confianza
- [x] B1 Guardrails sensibles
- [x] B2 Memoria corta
- [x] B3 Reintento de calidad
- [x] C1 Cache FAQ
- [x] C2 Enrutamiento por complejidad
- [x] C3 Telemetria costo/latencia
- [x] QA final (rol, tenant, performance)

## Estado

- `2.1.1` completado

---

## Criterios de cierre

Se considera completado cuando:

1. calidad de respuesta mejora de forma visible en pruebas internas
2. no se filtran datos fuera de permiso
3. latencia media y costo por consulta se mantienen dentro del objetivo
4. QA funcional y de seguridad en verde
