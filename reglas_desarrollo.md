# Reglas de Desarrollo

## Objetivo de estas reglas

Estas reglas definen el estándar obligatorio de desarrollo para esta plataforma.

## Fuente de verdad funcional vigente (obligatoria)

Para el modulo de Recursos Humanos, la fuente de verdad actual es:

- `ACTUALIZACION_2.0_SAAS.md`

Todas las directrices de implementacion, naming, flujos y persistencia de RRHH deben seguir ese documento.

La meta no es solo que el sistema funcione, sino que quede:

- profesional
- seguro
- escalable
- modular
- mantenible
- bien documentado
- preparado para crecer como producto SaaS internacional

Todas las decisiones de desarrollo deben respetar estas reglas.

## 0. Regla de oro (obligatoria y permanente)

No se debe realizar ningun cambio visual de UI/UX (layout, estilos, jerarquia, componentes visibles, navegacion o comportamiento visual) sin una orden explicita del usuario.

Esto incluye:

- no mover, ocultar, fusionar o eliminar elementos visuales existentes
- no cambiar estructura de menu lateral, paneles, modales o pantallas por iniciativa propia
- no alterar flujos visuales ya aprobados sin confirmacion explicita

Excepcion unica:

- correcciones tecnicas invisibles al usuario final (seguridad, validacion backend, performance interna, errores de compilacion)

Si existe duda, se mantiene la UI actual y se pide instruccion explicita antes de tocar lo visual.

---

## 1. Idioma obligatorio

Siempre responder, documentar y explicar en **español**.

Además:
- explicar en palabras básicas cuando se describan decisiones técnicas
- no responder de forma críptica
- no asumir que el interlocutor es un senior técnico
- primero claridad, después complejidad

### Naming oficial del producto

- El nombre oficial de la plataforma es **GetBackplate**.
- Toda etiqueta visible de marca en UI, metadata de paginas y documentacion funcional debe usar `GetBackplate`.
- Evitar referencias legacy como "SaaS Resto Ops" en componentes nuevos o refactorizados.

---

## 2. Base del producto

Este sistema debe construirse como un **SaaS multiempresa / multi-tenant**.

Eso significa:
- una sola plataforma
- múltiples empresas
- datos aislados por tenant
- módulos activables por empresa
- panel superadmin global
- panel interno por empresa

No desarrollar esto como una app única para un solo cliente.

---

## 3. Superadmin separado del admin de empresa

Debe existir una separación absoluta entre:

### Superadmin global
Puede:
- crear empresas
- editar empresas
- activar módulos
- asignar planes
- definir límites
- monitorear uso global
- administrar configuraciones globales

### Admin de empresa
Puede:
- administrar su empresa
- gestionar sucursales
- empleados
- documentos
- anuncios
- checklist
- configuraciones internas

Nunca mezclar ambos niveles.

---

## 4. Uso obligatorio de mockups

La carpeta `mockups` es una fuente clave de verdad para:
- frontend
- flujos
- interfaz
- módulos visibles
- relaciones funcionales sugeridas

Reglas:
- analizar todos los HTML
- detectar la versión más completa de cada pantalla
- unificar pantallas duplicadas
- respetar el espíritu visual y funcional
- mejorar consistencia, accesibilidad y robustez
- cuando se indique "interfaz gemela", replicar de forma 1:1 los bloques visuales del mockup objetivo (ejemplo: modal "Nuevo Aviso" de `Mockups/Dashboard admin final.html`), manteniendo backend real y persistencia en DB

Prohibido:
- ignorar los mockups
- construir una interfaz totalmente desconectada
- tratar los HTML como simple inspiración decorativa

---

## 5. Stack técnico obligatorio

Usar como base:

- Next.js moderno
- TypeScript estricto
- Supabase
- PostgreSQL
- Tailwind CSS

Si se agregan librerías o herramientas:
- deben justificarse
- deben aportar valor real
- no deben meter complejidad innecesaria

---

## 6. Supabase: uso profesional obligatorio

Supabase debe usarse de manera seria para:

- auth
- base de datos relacional
- storage
- RLS
- policies
- manejo de sesión
- aislamiento multi-tenant
- migraciones
- seguridad

Prohibido:
- usar Supabase solo como un backend superficial
- dejar seguridad solo en frontend
- omitir RLS donde corresponda

---

## 7. Multi-tenancy obligatorio

Toda la arquitectura debe estar preparada para múltiples empresas.

Aplicar correctamente:
- company_id / organization_id
- branch_id cuando corresponda
- aislamiento de datos
- permisos por empresa
- módulos por empresa

Toda consulta, acción o acceso debe respetar el tenant actual.

Debe prevenirse cualquier fuga de datos entre empresas.

---

## 8. Módulos como servicio

Cada módulo debe ser diseñado para poder activarse, desactivarse y ofrecerse como servicio.

Ejemplos de módulos:
- empleados
- onboarding
- documentos
- anuncios
- checklist
- reportes
- dashboards
- configuraciones

La activación de módulos debe impactar en:
- navegación
- permisos
- acciones
- backend
- reglas de negocio

Prohibido:
- limitarse a ocultar botones en frontend
- dejar acciones activas en backend aunque el módulo no esté habilitado

---

## 9. Roles y permisos serios

Debe existir un sistema robusto de roles y permisos.

Separar como mínimo:
- superadmin
- admin de empresa
- manager / encargado
- empleado

Y definir claramente:
- qué ve cada rol
- qué crea
- qué edita
- qué elimina
- qué aprueba
- qué descarga
- qué administra por sucursal
- qué administra a nivel empresa

No simplificar permisos de forma ingenua.

---

## 10. Seguridad obligatoria

Toda decisión debe priorizar seguridad real.

Aplicar:
- principio de mínimo privilegio
- validación server-side
- autorización real
- sanitización
- RLS
- protección de endpoints
- control de acceso por tenant
- control de acceso por rol
- manejo seguro de secretos
- variables de entorno correctas
- errores sin exponer datos sensibles
- protección de subida de archivos
- validación de tipo y tamaño de archivos
- auditoría mínima de acciones relevantes

Nunca confiar solo en el frontend para seguridad.

---

## 11. Calidad de código

Todo el código debe ser:

- limpio
- legible
- tipado
- desacoplado
- reutilizable
- mantenible
- profesional
- consistente
- fácil de entender

Aplicar cuando corresponda:
- separation of concerns
- arquitectura modular
- servicios claros
- helpers reutilizables
- validaciones centralizadas
- manejo serio de errores
- nombres claros
- evitar duplicación innecesaria

Prohibido:
- código parcheado
- lógica crítica repetida
- archivos gigantes sin separación
- decisiones improvisadas
- deuda técnica evitable

---

## 12. Arquitectura modular

La arquitectura debe dividir claramente:

- presentación / UI
- lógica de aplicación
- acceso a datos
- dominio / reglas de negocio
- utilidades compartidas

Cada módulo debe poder evolucionar sin romper todo el sistema.

No desarrollar como una masa única de componentes y queries mezcladas.

---

## 12.1 Fuente de verdad de datos (obligatorio)

Todos los datos funcionales visibles en UI deben leerse desde Supabase (DB/Storage), no desde arreglos mock hardcodeados en frontend.

Reglas obligatorias:

- evitar listas mock para documentos, avisos, checklists, usuarios, empleados y reportes
- si un flujo requiere datos para demostración y la base está vacía, generar datos de prueba coherentes en Supabase
- mantener esos datos de prueba consistentes con el dominio (tenant, sucursal, roles, permisos)
- no romper aislamiento multi-tenant al crear datos de prueba

Objetivo:

- que cada vista opere sobre datos reales
- que cada flujo sea verificable de punta a punta
- reducir discrepancias entre mockup, backend y producción

## 12.2 Premisa suprema: lectura y reflejo en tiempo real

Todo cambio de datos del usuario o de operación debe reflejarse en la interfaz de forma inmediata, sin depender de recargas manuales.

Reglas obligatorias:

- después de crear, editar, activar/desactivar o subir archivos, la UI debe refrescar su estado visible en tiempo real
- evitar flujos donde el dato se guarda pero el usuario no lo ve actualizado hasta refrescar la página
- priorizar actualizaciones optimistas o refresco inmediato de estado local cuando aplique
- mantener coherencia entre componentes que muestran el mismo dato (ejemplo: avatar en profile y avatar en menú lateral)
- si existe procesamiento asíncrono, mostrar estado claro (pending/processing/done/failed) en UI

Objetivo:

- experiencia confiable y profesional
- menor confusión operativa
- consistencia total entre backend y frontend

---

## 13. Responsive obligatorio

La plataforma debe funcionar bien en:
- desktop
- tablet
- mobile

Especial cuidado en:
- tablas
- dashboards
- paneles
- modales
- checklist
- formularios
- onboarding

No dejar mobile como algo secundario o roto.

---

## 13.1 Directriz UX/UI global obligatoria (estilo premium)

Desde ahora, toda pantalla nueva o refactorizada debe seguir el mismo patrón visual y de interacción aplicado en `superadmin/plans`.

Patrón obligatorio:

- diseño minimalista premium
- tarjetas resumen con métricas clave
- acciones principales en bloques desplegables (no formularios largos abiertos por defecto)
- secciones secundarias en `details/summary` o equivalente colapsable
- iconografía consistente (Lucide)
- feedback claro de éxito/error después de cada acción
- confirmación obligatoria para acciones destructivas
- estados vacíos y mensajes de error entendibles
- jerarquía visual limpia (títulos, subtítulos, microcopy breve)
- responsive real en mobile/tablet/desktop

Regla de consistencia:

- no crear pantallas con estilo aislado
- no mezclar estilos viejos con estilos nuevos en un mismo módulo
- cuando se mejore un módulo, llevarlo al estándar visual actual completo

Regla de UX operativa:

- el usuario siempre debe entender qué puede hacer, qué pasó y qué falta
- evitar acciones silenciosas sin confirmación visual


---

## 14. Documentación obligatoria

Deben mantenerse siempre dos archivos actualizados:

### A. Documento técnico
Ejemplo:
`DOCUMENTACION_TECNICA.md`

Debe incluir:
- arquitectura
- stack
- módulos
- estructura del proyecto
- tablas y relaciones
- roles y permisos
- seguridad
- auth
- multi-tenancy
- RLS
- decisiones técnicas
- deploy
- variables de entorno
- roadmap técnico
- riesgos y deudas futuras

### B. Documento simple
Ejemplo:
`GUIA_BASICA_SISTEMA.md`

Debe incluir:
- explicación del sistema
- qué hace cada rol
- cómo se usan los módulos
- flujos simples
- lenguaje claro para usuarios o administradores no técnicos

La documentación no es opcional.

---

## 15. Análisis previo antes de desarrollar módulos

Antes de implementar cualquier módulo, debe definirse y documentarse:

- objetivo del módulo
- problema que resuelve
- entidades
- relaciones
- roles afectados
- permisos
- flujos
- validaciones
- riesgos
- integración con otros módulos
- si puede activarse o desactivarse por empresa

No comenzar desarrollos complejos sin este análisis.

---

## 16. Checklist y reportes

El módulo de checklist debe tratarse como un módulo serio, no como una lista simple.

Debe contemplar:
- plantillas
- categorías
- ítems
- prioridades
- comentarios
- flags
- evidencias
- envío final
- histórico
- filtros
- reportes por sucursal y fecha

Debe dejar base para evolución futura.

---

## 17. Onboarding y documentos

El módulo de onboarding/documentos debe implementarse con criterio profesional.

Contemplar:
- documentos por empleado
- estados
- storage seguro
- validaciones
- trazabilidad
- carga y consulta por permisos
- aceptación o firma interna si corresponde

Si hay firma, documentar claramente si es:
- firma simple interna
o
- preparación para evolución más robusta

No sobredimensionar sin documentar.
No subdimensionar algo que el mockup sugiera como importante.

---

## 18. Explicación obligatoria de decisiones

Cada vez que se tome una decisión importante, dejar documentado:

- qué se hizo
- por qué se hizo así
- qué alternativas había
- qué se gana en seguridad
- qué se gana en mantenibilidad
- qué se gana en escalabilidad

No resolver cosas importantes sin dejar criterio registrado.

---

## 19. Qué está prohibido

Está prohibido:

- responder en otro idioma
- ignorar los mockups
- ignorar multi-tenant
- ignorar RLS
- mezclar superadmin con admin de empresa
- depender solo de frontend para permisos
- hardcodear lógica sensible
- duplicar lógica crítica
- hacer arquitectura monolítica desordenada
- no documentar
- construir algo difícil de escalar
- sacrificar calidad por velocidad sin justificar
- usar soluciones mágicas sin entender impacto

---

## 20. Estándar esperado

El estándar esperado no es “que funcione”.

El estándar esperado es:
- excelencia técnica
- claridad
- seguridad
- modularidad
- escalabilidad
- experiencia profesional
- buena documentación
- visión de producto mundial

Cada parte del sistema debe sentirse construida con criterio de producto serio y de largo plazo.
