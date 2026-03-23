# Plan Maestro de Optimizacion de Velocidad y UX

## Estado de vigencia (2026-03-23)

- Este documento se mantiene como **fuente de verdad para mejoras futuras de velocidad/UX**.
- Ajustes de contexto ya aplicados:
  - El build de produccion actualmente compila (`npm run build` OK).
  - El contrato oficial de planes vigente es `basico/pro` (no `starter/growth/enterprise`).
  - Ya se implementaron optimizaciones parciales en panel admin (queries y skeletons).

## Objetivo en palabras simples

Queremos que la web:

- cargue mas rapido,
- responda mas fluido,
- use menos recursos del navegador,
- y se sienta mas clara para el usuario final.

Este plan esta hecho para ejecutar por fases, con control y sin romper funcionalidades.

---

## Reglas de trabajo (acuerdo de ejecucion)

En cada fase siempre te voy a explicar 3 cosas con lenguaje basico:

1. **Que sucede ahora** (problema actual).
2. **Que voy a hacer** (cambio puntual).
3. **Como trabajara despues** (resultado esperado para usuario y sistema).

Y siempre vamos a trabajar asi:

- no hacemos cambios grandes de golpe,
- medimos antes y despues,
- validamos que no se rompa nada,
- avanzamos a la siguiente fase solo con tu aprobacion.

---

## Estado actual (resumen claro)

Hoy vemos estos focos de mejora:

1. Landing con mucho codigo de cliente en el primer render.
2. Imagen principal sin optimizacion de Next.js (`<img>` normal).
3. Varias rutas forzadas a dinamicas (`force-dynamic`) que impiden cache util.
4. Consultas pesadas y repetidas en layout/paginas (modulos habilitados por RPC repetida).
5. Un cuello de botella fuerte en portal empleado: loop paginado y filtrado en JS para documentos.
6. Componente de shell de empresa muy grande en cliente (hidratacion pesada).
7. Build de produccion con error de tipos (impide medir optimizacion final de forma confiable).

---

## Metricas objetivo (KPIs)

Mediremos progreso con estas referencias:

- **TTFB** (tiempo de respuesta inicial) en paginas clave.
- **LCP** (tiempo de elemento principal visible) en landing.
- **Total JS cargado** en landing y dashboard.
- **Tiempo de navegacion interna** entre vistas.
- **Errores de build** y estabilidad de CI.

Objetivo inicial realista:

- reducir 25% a 45% el JS inicial de landing,
- mejorar TTFB en paginas internas pesadas,
- eliminar el cuello de botella de documentos en empleado,
- dejar build estable para medir continuo.

---

## Plan por fases (completo)

## Fase 0 - Baseline y seguridad (sin tocar logica de negocio)

### Que sucede ahora

No tenemos una foto completa de rendimiento antes de optimizar.

### Que voy a hacer

- levantar baseline de tiempos de carga y rutas principales,
- registrar errores actuales de build,
- definir checklist de no regresion.

### Como trabajara despues

Tendremos un punto de partida claro para demostrar mejora real, no "sensacion".

### Entregables

- tabla de baseline (antes),
- lista de rutas prioritarias,
- lista de pruebas rapidas funcionales.

### Riesgo

Muy bajo (fase de medicion/documentacion).

---

## Fase 1 - Estabilidad tecnica minima (build y tipos)

### Que sucede ahora

El build falla por un error de tipos en autenticacion, y eso bloquea validaciones finales.

### Que voy a hacer

- corregir tipado puntual que rompe `next build`,
- validar que compila completo,
- dejar log de verificacion.

### Como trabajara despues

La app podra construir en produccion sin bloqueos y podremos medir bundle/tiempos correctamente.

### Entregables

- fix de tipo aplicado,
- build verde,
- nota de causa raiz y prevencion.

### Riesgo

Bajo (cambio acotado y validable rapido).

---

## Fase 2 - Landing mas liviana (impacto directo UX)

### Que sucede ahora

La landing envia demasiado JS porque gran parte vive como componente cliente.

### Que voy a hacer

- separar componentes server/client en landing,
- dejar en cliente solo lo necesario para interaccion (ej: checkout),
- cambiar imagen principal a `next/image` con `sizes`.

### Como trabajara despues

La pagina principal mostrara contenido mas rapido, con menos trabajo del navegador en moviles.

### Entregables

- estructura landing dividida por responsabilidad,
- imagen optimizada,
- comparativa de peso JS antes/despues.

### Riesgo

Medio-bajo (puede afectar detalles visuales/animaciones si no se cuida).

### Validaciones

- verificar navegacion desktop/movil,
- verificar CTA/login/checkout,
- verificar que animaciones clave sigan correctas.

---

## Fase 3 - Render y cache inteligente en rutas internas

### Que sucede ahora

Hay uso amplio de `force-dynamic` y eso hace que paginas/layout siempre rendericen de forma dinamica.

### Que voy a hacer

- auditar cada `force-dynamic`,
- quitar los que no son obligatorios,
- aplicar cache/revalidacion por seccion donde conviene,
- mantener dinamico solo donde hay datos de sesion o cambios inmediatos.

### Como trabajara despues

Las vistas internas responderan mas rapido y el servidor trabajara menos en cada request.

### Entregables

- mapa de rutas: dinamica vs cacheada,
- cambios de estrategia de render,
- comparativa de TTFB por ruta.

### Riesgo

Medio (si se cachea mal, puede mostrarse informacion vieja).

### Mitigacion

- reglas claras de que SI cachear y que NO,
- pruebas con usuarios/roles distintos,
- rollback rapido por archivo/ruta.

---

## Fase 4 - Reducir consultas repetidas (DB y red)

### Que sucede ahora

Se repite consulta de modulo habilitado varias veces por request en distintos puntos.

### Que voy a hacer

- centralizar obtencion de modulos habilitados en una sola lectura,
- reutilizar resultado en layout/paginas hijas,
- eliminar llamadas redundantes.

### Como trabajara despues

Menos viajes a base de datos, mejor tiempo de respuesta y menor costo por request.

### Entregables

- helper/flujo centralizado para modulos,
- reemplazo de llamadas repetidas,
- medicion simple de queries reducidas.

### Riesgo

Medio-bajo (si se mapea mal un modulo podria ocultar/mostrar algo mal).

### Validaciones

- matriz por rol y modulo,
- revisar menus, accesos y contenido visible.

---

## Fase 5 - Cuello de botella de portal empleado (prioridad alta)

### Que sucede ahora

El conteo de documentos del empleado hace loop por lotes y filtra en JS. Eso puede ser lento con muchos datos.

### Que voy a hacer

- mover logica de filtrado/conteo al lado de base de datos (RPC/consulta optimizada),
- traer solo el resultado necesario,
- mantener reglas de permisos actuales.

### Como trabajara despues

El portal empleado cargara mas rapido aun con gran volumen de documentos.

### Entregables

- nueva consulta optimizada,
- eliminacion de loop paginado en servidor,
- comparativa de tiempo antes/despues.

### Riesgo

Medio-alto (toca permisos y acceso por alcance).

### Mitigacion

- pruebas con casos de acceso (global/sucursal/departamento/posicion/asignado),
- validacion funcional con muestras reales,
- fallback temporal listo en caso de inconsistencias.

---

## Fase 6 - Reducir hidratacion del shell de empresa

### Que sucede ahora

El shell concentra mucha logica cliente en un solo componente grande.

### Que voy a hacer

- dividir en subcomponentes (sidebar/header/modales),
- cargar modales pesados bajo demanda (import dinamico),
- mantener comportamiento visual actual.

### Como trabajara despues

La vista principal se sentira mas ligera y el navegador trabajara menos al inicio.

### Entregables

- shell modular,
- modales lazy-load,
- mejora de tiempo de interaccion inicial.

### Riesgo

Medio (riesgo de pequenos bugs de estado/UI si no se integra bien).

---

## Fase 7 - Pulido UX y cierre

### Que sucede ahora

Aunque optimicemos backend/frontend, sin cierre formal pueden quedar detalles sueltos.

### Que voy a hacer

- revisar microinteracciones clave (cargas, botones, estados vacios),
- limpiar alertas bloqueantes y mejorar feedback no intrusivo,
- ejecutar validacion final integral.

### Como trabajara despues

La experiencia se sentira rapida y profesional, con menos friccion para el usuario final.

### Entregables

- checklist de UX final,
- comparativa global antes/despues,
- reporte de cierre de optimizacion.

### Riesgo

Bajo (ajustes finos).

---

## Criterios de aceptacion por fase

Una fase se considera terminada si cumple:

1. cambio funcional aplicado,
2. pruebas minimas ok,
3. metrica comparada antes/despues,
4. documentacion corta de lo hecho,
5. tu aprobacion para avanzar.

---

## Estrategia de pruebas por fase

Pruebas minimas recurrentes:

- login y navegacion principal,
- dashboard empresa,
- portal empleado,
- flujo de checkout,
- vistas con permisos distintos.

Pruebas tecnicas:

- `npm run build`,
- verificacion visual desktop/movil,
- chequeo de errores en consola del navegador (cuando aplique).

---

## Plan de rollback (si algo sale mal)

Para minimizar riesgo:

- cambios pequenos por fase,
- commits por bloque funcional,
- rollback por archivo/modulo si aparece regresion,
- nunca mezclar optimizacion con cambios de negocio no relacionados.

---

## Priorizacion recomendada (orden de ejecucion)

1. Fase 0 (baseline)
2. Fase 1 (build estable)
3. Fase 2 (landing)
4. Fase 4 (consultas repetidas)
5. Fase 5 (cuello de botella empleado)
6. Fase 3 (cache/render fino por ruta)
7. Fase 6 (shell modular)
8. Fase 7 (pulido final)

Nota: Fase 3 y Fase 4 pueden intercambiarse segun resultados de medicion inicial.

---

## Plantilla de reporte por fase (la que usare contigo)

En cada entrega te reportare asi:

1. **Que sucede ahora:**
2. **Que hice:**
3. **Como trabaja ahora:**
4. **Que mejoro (medicion):**
5. **Riesgos o pendientes:**
6. **Siguiente fase propuesta:**

---

## Resultado esperado al finalizar todo el plan

Al cerrar todas las fases deberiamos tener:

- web mas rapida en primera carga y navegacion,
- menos carga de JavaScript innecesaria,
- menos consultas repetidas a base de datos,
- paginas criticas con mejor tiempo de respuesta,
- UX mas fluida y consistente en desktop/movil,
- proceso de build estable y medible.
