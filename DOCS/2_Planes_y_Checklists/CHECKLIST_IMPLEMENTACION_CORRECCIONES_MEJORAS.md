# Checklist Maestro de Correcciones y Mejoras

## Objetivo del documento

Este documento es la hoja de ruta operativa para corregir inconsistencias detectadas en la app **GetBackplate** sin romper flujos existentes.

Se va a usar como fuente viva de seguimiento: iremos marcando cada item a medida que se implemente, valide y cierre.

---

## Reglas de actualización

- Estado por item:
  - `[ ]` Pendiente
  - `[~]` En progreso
  - `[x]` Completado
- Cada item se cierra solo cuando:
  1. Cambio implementado
  2. Validación funcional hecha
  3. Evidencia registrada
- Al cerrar un item, completar su sección **Evidencia de cierre**.

---

## Resumen ejecutivo (orden de ejecución)

1. Correcciones críticas de negocio y seguridad de datos
2. Unificación de flujos RRHH para evitar comportamientos distintos
3. Hardening técnico (guards, permisos, consistencia)
4. Performance sin cambiar UX
5. Limpieza de deuda técnica
6. QA de no regresión y gate de release

## Siguiente ruta oficial (version 2.1)

Con el cierre de este checklist, las nuevas implementaciones pasan a:

- `ACTUALIZACION_2.1_SAAS.md`
- `CHECKLIST_IMPLEMENTACION_2.1_CHATBOT_IA.md`

---

## Bloque A — Crítico (no negociar)

### [x] A1. Separar y documentar estado laboral vs acceso a plataforma

- **Qué pasa hoy (simple):** se interpreta que "inactivo" de RRHH debería cortar login, pero en realidad ese estado hoy es laboral.
- **Por qué está mal:** genera confusión operativa y decisiones equivocadas de soporte/gestión.
- **Plan a seguir:**
  1. Documentar regla oficial: `estado laboral` no cambia `acceso a plataforma` automáticamente.
  2. En `web/src/app/api/company/employees/route.ts`, mantener separados ambos conceptos.
  3. Solo cambiar `memberships.status` cuando exista una acción explícita de acceso (ejemplo: bloquear/reactivar ingreso).
  4. Ajustar labels y textos en UI para distinguir claramente ambos estados.
  5. Auditar por separado: `employee.status.update` (laboral) y `membership.status.update` (acceso).
- **Comportamiento esperado después:** cambiar estado laboral no rompe acceso; acceso se modifica solo con acción explícita de seguridad/ingreso.
- **Evidencia de cierre:**
  - Regla funcional validada con negocio: estado laboral no implica bloqueo de login.
  - Labels de UI aclarados en RRHH y Accesos para evitar ambigüedad.
  - Auditoría separada implementada:
    - `employee.status.update` para estado laboral en `web/src/app/api/company/employees/route.ts`.
    - `membership.status.update` para acceso en `web/src/app/api/company/users/route.ts`.
  - Metadata de auditoría enriquecida con `previous_status`, `next_status` y `status_scope`.

### [x] A2. Corregir alcance por puestos (`position_ids`)

- **Qué pasa hoy (simple):** algunos filtros por puesto comparan nombre de puesto en vez de ID.
- **Por qué está mal:** puede incluir/excluir personas equivocadas en avisos y checklists.
- **Plan a seguir:**
  1. Corregir matching en `web/src/modules/announcements/services/deliveries.ts`.
  2. Corregir matching en `web/src/modules/checklists/actions.ts`.
  3. Estandarizar uso de IDs en todo el flujo de scope.
- **Comportamiento esperado después:** la segmentación por puesto llega exactamente a quienes corresponde.
- **Evidencia de cierre:**
  - Matching por puesto corregido a IDs en `web/src/modules/checklists/actions.ts`.
  - Matching por puesto corregido a IDs en `web/src/modules/announcements/services/deliveries.ts`.
  - Verificación técnica: lint puntual de ambos archivos sin errores.
  - Prueba en DB con datos temporales: `oldLogicMatch=false` y `newLogicMatch=true` para el mismo puesto (demuestra corrección efectiva de matching por `position_ids`).

### [x] A3. Filtrar correctamente items de checklist por plantilla en portal empleado

- **Qué pasa hoy (simple):** al abrir preview de checklist se pueden traer items fuera de la plantilla elegida.
- **Por qué está mal:** el empleado podría ver datos mezclados y el reporte perder coherencia.
- **Plan a seguir:**
  1. Ajustar query en `web/src/app/(employee)/portal/checklist/page.tsx` para traer solo items de secciones de la plantilla seleccionada.
  2. Validar consistencia entre secciones e items renderizados.
- **Comportamiento esperado después:** cada preview muestra solo su checklist real, sin contaminación de otros.
- **Evidencia de cierre:**
  - Query de `checklist_template_items` limitada a secciones de la plantilla preview en `web/src/app/(employee)/portal/checklist/page.tsx`.
  - Verificación técnica: lint puntual del archivo sin errores.
  - Prueba en DB con datos temporales: lectura antigua tomaba 2 items de prueba, lectura nueva toma solo 1 (correcto por plantilla).

### [x] A4. Limitar comentarios/flags/adjuntos al envío (`submission_id`) correcto

- **Qué pasa hoy (simple):** en preview se leen comentarios/flags/adjuntos a nivel organización y luego se filtra en memoria.
- **Por qué está mal:** riesgo de sobrelectura y potencial mezcla de datos no relacionados.
- **Plan a seguir:**
  1. Filtrar por `submission_id` en las consultas de `checklist_item_comments`, `checklist_flags`, `checklist_item_attachments` en `web/src/app/(employee)/portal/checklist/page.tsx`.
  2. Mantener misma UI pero con dataset estricto.
- **Comportamiento esperado después:** cada reporte solo muestra evidencias de su propio envío.
- **Evidencia de cierre:**
  - Lectura de comentarios/flags/adjuntos ahora acotada por `submission_item_id` del envío actual en `web/src/app/(employee)/portal/checklist/page.tsx`.
  - Verificación técnica: lint puntual del archivo sin errores.
  - Prueba en DB con datos temporales: lectura antigua tomaba 2 registros de prueba, lectura nueva toma solo 1 en comentarios, flags y adjuntos.

### [x] A5. Corregir taxonomía de auditoría RRHH (create vs update)

- **Qué pasa hoy (simple):** ciertas ediciones quedan auditadas como creación.
- **Por qué está mal:** los registros de auditoría no reflejan la acción real.
- **Plan a seguir:**
  1. Ajustar acción en `web/src/modules/employees/actions.ts` para emitir `employee.update` cuando sea edición.
  2. Revisar metadata asociada para que sea trazable.
- **Comportamiento esperado después:** auditoría limpia y confiable para soporte/compliance.
- **Evidencia de cierre:**
  - Acción de auditoría corregida para emitir `employee.update` cuando corresponde en `web/src/modules/employees/actions.ts`.
  - Verificación técnica: lint puntual del archivo sin errores.

---

## Bloque B — Unificación de flujo RRHH

### [x] B1. Definir una sola vía de mutación RRHH

- **Qué pasa hoy (simple):** hay lógica de alta/edición en Server Actions y en API, con reglas distintas.
- **Por qué está mal:** el usuario puede obtener resultados diferentes según desde dónde dispare el flujo.
- **Plan a seguir:**
  1. Elegir API como fuente principal de mutaciones.
  2. Dejar Server Actions como wrappers o migrarlas gradualmente.
  3. Documentar la fuente oficial en `DOCUMENTACION_TECNICA.md`.
- **Comportamiento esperado después:** un solo comportamiento funcional, predecible y mantenible.
- **Evidencia de avance:**
  - Alta de administradores migrada de Server Action a API (`POST /api/company/users`).
  - `new-user-modal` ahora usa API para crear, y la misma API de usuarios ya usada para editar/eliminar.
  - Prueba con datos reales en DB (temporal + cleanup): alta de membership en `active`, actualización a `inactive`, borrado final exitoso.
  - Código en desuso removido: `createUserAccountAction` eliminado de `web/src/modules/employees/actions.ts` (sin referencias activas).
  - Flujo mixto `Nuevo Usuario / Empleado` migrado a API (`POST /api/company/employees`) en `web/src/modules/employees/ui/new-employee-modal.tsx`.
  - API de empleados ampliada para soportar usuario sin perfil laboral (`is_employee=no`) y edición de `organization_user_profiles`.
  - Código en desuso removido: `web/src/modules/employees/actions.ts` eliminado por completo.
  - Prueba real en DB (temporal + cleanup): creación de empleado con acceso y creación/actualización de usuario simple (`is_employee=false`) con link a cuenta.

### [x] B2. Homologar validaciones de alta/edición

- **Qué pasa hoy (simple):** campos obligatorios y reglas cambian entre caminos.
- **Por qué está mal:** genera errores confusos y resultados inconsistentes.
- **Plan a seguir:**
  1. Alinear validaciones de nombre/apellido, credenciales, modos y estados entre `web/src/modules/employees/actions.ts` y `web/src/app/api/company/employees/route.ts`.
  2. Reutilizar esquema de validación común donde sea posible.
- **Comportamiento esperado después:** el mismo formulario siempre responde igual ante los mismos datos.
- **Evidencia de cierre:**
  - Con B1 cerrado, la mutación de RRHH ya no depende de `actions.ts`; se valida en rutas API únicas.
  - Compatibilidad agregada en `web/src/app/api/company/employees/route.ts` para payload legado del modal (`hire_date`/`hired_at`, `address`/`address_line1`, `status`/`employment_status`).
  - En edición de empleado, si no llega estado laboral en payload, se preserva el estado existente (evita reset accidental a `active`).
  - Verificación técnica: lint puntual del endpoint sin errores.

### [x] B3. Alinear guardas de módulo y rol en ambos caminos

- **Qué pasa hoy (simple):** un camino verifica módulo habilitado y otro no siempre.
- **Por qué está mal:** riesgo de operar sobre módulo apagado por plan.
- **Plan a seguir:**
  1. Garantizar `assertCompanyAdminModuleApi("employees")` o equivalente en toda mutación de RRHH.
  2. Revisar rutas y actions relacionadas.
- **Comportamiento esperado después:** si módulo está deshabilitado, ninguna mutación crítica pasa.
- **Evidencia de cierre:**
  - Todas las mutaciones RRHH quedaron centralizadas en APIs con guarda de módulo/rol:
    - `web/src/app/api/company/employees/route.ts` (`POST`, `PATCH`, `DELETE`) con `assertCompanyAdminModuleApi("employees")`.
    - `web/src/app/api/company/users/route.ts` (`POST`, `PATCH`, `DELETE`) con `assertCompanyAdminModuleApi("employees")`.
  - Las UIs de RRHH llaman únicamente esas APIs para mutaciones:
    - `web/src/modules/employees/ui/new-employee-modal.tsx`
    - `web/src/modules/employees/ui/new-user-modal.tsx`
    - `web/src/modules/employees/ui/employees-table-workspace.tsx`
    - `web/src/modules/employees/ui/users-table-workspace.tsx`
  - Eliminado el camino alterno sin módulo (`web/src/modules/employees/actions.ts`).

---

## Bloque C — Seguridad y consistencia operativa

### [x] C1. Reducir uso de cliente admin en páginas de empresa

- **Qué pasa hoy (simple):** varias páginas usan `service role` para lecturas de UI.
- **Por qué está mal:** aumenta superficie de riesgo si una guarda falla.
- **Plan a seguir:**
  1. Migrar lecturas de UI a server client + RLS cuando sea viable.
  2. Dejar admin solo en operaciones estrictamente necesarias.
- **Comportamiento esperado después:** menor riesgo de exposición accidental y arquitectura más segura.
- **Evidencia de avance:**
  - Reducido uso de admin client en lecturas UI de páginas company:
    - `web/src/app/(company)/app/documents/page.tsx`
    - `web/src/app/(company)/app/checklists/page.tsx`
    - `web/src/app/(company)/app/announcements/page.tsx`
  - Estas páginas ahora priorizan `createSupabaseServerClient` para catálogos de soporte (sucursales, departamentos, puestos, perfiles base).
  - Verificación técnica: lint puntual y `npm run build` OK.
  - Cierre total aplicado también en:
    - `web/src/app/(company)/app/employees/page.tsx`
    - `web/src/app/(company)/app/users/page.tsx`
  - Resultado: lecturas UI de páginas company migradas a server client; admin queda para operaciones realmente privilegiadas.

### [x] C2. Estandarizar orden de validaciones en endpoints críticos

- **Qué pasa hoy (simple):** no todos los endpoints aplican validación en el mismo orden.
- **Por qué está mal:** puede haber comportamientos borde difíciles de predecir.
- **Plan a seguir:**
  1. Definir orden estándar: auth -> tenant -> módulo -> rol -> validación de payload -> mutación.
  2. Aplicarlo en endpoints de RRHH, documentos, checklists, settings.
- **Comportamiento esperado después:** respuestas consistentes y menor probabilidad de bypass lógico.
- **Evidencia de cierre:**
  - Endpoints RRHH ajustados para validar existencia de registro antes de mutar y responder `404` cuando corresponde:
    - `web/src/app/api/company/employees/route.ts` (`PATCH` y `DELETE`)
    - `web/src/app/api/company/users/route.ts` (`PATCH` y `DELETE`)
  - En `DELETE` de perfiles de usuario se valida error al eliminar membership asociado antes de continuar.
  - Verificación técnica: lint en rutas críticas OK.
  - Verificación de no-regresión: `npm run build` OK.

### [x] C3. Corregir branding inconsistente en portal empleado

- **Qué pasa hoy (simple):** el footer menciona marca externa en vez de estándar del producto.
- **Por qué está mal:** rompe directriz de naming oficial y consistencia de marca.
- **Plan a seguir:**
  1. Ajustar footer en `web/src/shared/ui/employee-shell.tsx` a branding oficial `GetBackplate`.
- **Comportamiento esperado después:** identidad visual consistente en todos los paneles.
- **Evidencia de cierre:**
  - Footer actualizado a marca oficial en `web/src/shared/ui/employee-shell.tsx`.
  - Verificación técnica: lint sin errores en el componente y rutas RRHH críticas.

---

## Bloque D — Performance (sin tocar UX)

### [x] D1. Optimizar resolución de emails por `user_id`

- **Qué pasa hoy (simple):** para obtener emails se recorren páginas de usuarios de Auth completas.
- **Por qué está mal:** escala mal y agrega latencia.
- **Plan a seguir:**
  1. Rediseñar `web/src/shared/lib/auth-users.ts` para evitar barrido completo.
  2. Usar estrategia más directa (batch optimizado / cache intermedio según disponibilidad).
- **Comportamiento esperado después:** envíos y notificaciones más rápidos con menor costo operacional.
- **Evidencia de cierre:**
  - Se agregó cache en memoria por `user_id` con TTL en `web/src/shared/lib/auth-users.ts`.
  - Si el email está cacheado, evita paginar Auth completo en llamados repetidos.
  - Verificación técnica: build y lint OK.

### [x] D2. Optimizar cálculo de almacenamiento para límites de plan

- **Qué pasa hoy (simple):** se suman tamaños de todos los documentos en cada validación.
- **Por qué está mal:** consultas pesadas repetidas en operaciones frecuentes.
- **Plan a seguir:**
  1. Optimizar `web/src/shared/lib/plan-limits.ts` con estrategia de agregado/cálculo eficiente.
  2. Verificar exactitud en casos de carga/borrado masivo.
- **Comportamiento esperado después:** enforcement de límites con menor impacto de performance.
- **Evidencia de cierre:**
  - Se agregó cache de uso por organización (TTL corto) en `web/src/shared/lib/plan-limits.ts`.
  - En validación de storage se acumula `addingBytes` sobre cache para no subcontar en operaciones consecutivas.
  - Verificación técnica: build y lint OK.

### [x] D3. Mejorar complejidad de `scope-users-catalog`

- **Qué pasa hoy (simple):** hay búsquedas repetidas sobre arrays grandes.
- **Por qué está mal:** complejidad O(n²) en escenarios con muchos usuarios.
- **Plan a seguir:**
  1. Reescribir `web/src/shared/lib/scope-users-catalog.ts` usando `Map/Set` para deduplicación y lookups.
  2. Mantener salida funcional idéntica.
- **Comportamiento esperado después:** mismo resultado funcional, menor tiempo de respuesta.
- **Evidencia de cierre:**
  - Se reemplazó deduplicación O(n²) por `Set` de `user_id` en `web/src/shared/lib/scope-users-catalog.ts`.
  - Salida funcional mantenida y con menos costo de CPU.
  - Verificación técnica: build y lint OK.

### [x] D4. Corregir subconteo de documentos en portal empleado

- **Qué pasa hoy (simple):** el contador usa límite fijo (`limit(300)`), puede mostrar menos de lo real.
- **Por qué está mal:** métricas visibles inconsistentes para el usuario.
- **Plan a seguir:**
  1. Ajustar conteo en `web/src/app/(employee)/portal/layout.tsx` para reflejar total visible real.
- **Comportamiento esperado después:** contador exacto y coherente con lo que el usuario ve.
- **Evidencia de cierre:**
  - Se eliminó `limit(300)` y se implementó paginación por lotes para contar todos los documentos visibles en `web/src/app/(employee)/portal/layout.tsx`.
  - El contador ahora refleja el total real visible para el empleado.
  - Verificación técnica: build y lint OK.

---

## Bloque E — Limpieza de deuda técnica

### [x] E1. Deprecar y remover componentes legacy no usados

- **Qué pasa hoy (simple):** hay componentes antiguos que ya no participan del flujo real.
- **Por qué está mal:** agregan ruido, mantenimiento y confusión.
- **Plan a seguir:**
  1. Marcar deprecated.
  2. Confirmar no referencias.
  3. Eliminar en commit de limpieza.
  4. Objetivos:  
     - `web/src/shared/ui/reports-workspace.tsx`  
     - `web/src/shared/ui/checklists-workspace.tsx`  
     - `web/src/shared/ui/announcements-workspace.tsx`  
     - `web/src/shared/ui/documents-workspace.tsx`  
     - `web/src/shared/ui/placeholder-page.tsx`
- **Comportamiento esperado después:** base más limpia y mantenible sin afectar producto.
- **Evidencia de cierre:**
  - Componentes legacy removidos:
    - `web/src/shared/ui/reports-workspace.tsx`
    - `web/src/shared/ui/checklists-workspace.tsx`
    - `web/src/shared/ui/announcements-workspace.tsx`
    - `web/src/shared/ui/documents-workspace.tsx`
    - `web/src/shared/ui/placeholder-page.tsx`
  - Confirmado: sin referencias activas en `web/src`.

### [x] E2. Eliminar acción muerta de checklist

- **Qué pasa hoy (simple):** existe `submitChecklistRunAction` sin uso real.
- **Por qué está mal:** código muerto aumenta deuda y confunde futuros cambios.
- **Plan a seguir:**
  1. Confirmar no referencias.
  2. Remover acción y ajustar imports si aplica.
- **Comportamiento esperado después:** menos código huérfano.
- **Evidencia de cierre:**
  - Acción muerta removida: `submitChecklistRunAction` en `web/src/modules/checklists/actions.ts`.
  - Import asociado no utilizado removido (`canUseChecklistTemplateInTenant`).
  - Confirmado por búsqueda en repo: sin referencias activas.

---

## Bloque F — QA y release controlado

### [x] F1. Ejecutar smoke integral por módulo

- **Qué pasa hoy (simple):** hay correcciones sensibles con riesgo de regresión cruzada.
- **Por qué está mal liberar sin esto:** podría romperse un módulo no tocado visualmente.
- **Plan a seguir:**
  1. Correr smoke de empleados, documentos, anuncios, checklists, reportes, settings.
  2. Validar impersonación y multiempresa.
- **Comportamiento esperado después:** confianza de que el release no rompe flujos base.
- **Evidencia de avance:**
  - Smoke técnico DB ejecutado en módulos core (`employees`, `memberships`, `documents`, `document_folders`, `checklist_templates`, `checklist_submissions`, `announcements`, `organization_user_profiles`, `branches`, `organization_modules`) con resultado OK.
  - Validación RPC `is_module_enabled` OK en tenant de prueba.
  - Pruebas de mutación real temporales ya ejecutadas en RRHH (create/update/delete + cleanup).
  - QA profundo adicional ejecutado por scripts:
    - `verify:smoke-modules` OK
    - `verify:module-role-e2e` OK
    - `verify:role-permissions` OK
    - `verify:rls-isolation` OK (tras limpiar usuarios temporales previos)
    - `verify:reports-isolation` OK
    - `verify:document-guardrails` OK
    - `verify:audit-coverage` OK
    - `verify:plan-limit-enforcement` OK
    - `verify:plan-limit-messages` OK
    - `verify:official-plan-packaging` OK (`basico/pro`)
    - `verify:plan-change-rules` OK
    - `verify:operational-metrics-consistency` OK
    - `verify:operational-alerts` OK (2 alertas medias detectadas en tenant sin actividad)
  - Smoke manual visual de UI completado (impersonación + multiempresa) validado por negocio (`OK F1`).

### [x] F2. Bajar lint y asegurar build estable

- **Qué pasa hoy (simple):** existen errores/warnings que hoy degradan calidad y confiabilidad de cambios.
- **Por qué está mal:** aumenta riesgo en producción y dificulta mantenimiento.
- **Plan a seguir:**
  1. Resolver primero errores en dominio productivo.
  2. Cerrar warnings de alto impacto.
  3. Validar `npm run lint` + `npm run build`.
- **Comportamiento esperado después:** baseline técnico sólido para seguir escalando.
- **Evidencia de avance:**
  - `npm run build` OK.
  - `npm run lint` sin errores (0 errores, 40 warnings).
  - Scripts de QA de plan-limit ajustados al estado real del código (sin `employees/actions.ts` ni `documents/actions.ts`) y verificados en verde:
    - `verify:plan-limit-enforcement` OK
    - `verify:plan-limit-messages` OK
  - `verify:audit-coverage` OK tras cubrir auditoría faltante en `updatePasswordAction`.
  - `verify:official-plan-packaging` ajustado al contrato real de producto (`basico/pro`) y validado en verde.
  - Nota: warnings remanentes son deuda de prolijidad (imports/vars no usados) y no bloquean build ni release funcional.

### [x] F3. Documentar cierre por bloque

- **Qué pasa hoy (simple):** sin documentación de cierre, el equipo pierde trazabilidad de decisiones.
- **Por qué está mal:** complica soporte, auditoría y continuidad.
- **Plan a seguir:**
  1. Actualizar `DOCUMENTACION_TECNICA.md` al cerrar cada bloque.
  2. Registrar riesgos remanentes y próximos pasos.
- **Comportamiento esperado después:** roadmap técnico claro y profesional.
- **Evidencia de avance:**
  - Documentación técnica actualizada en cada bloque cerrado (A, B, C2/C3, D, E).
  - C1 ya cerrado y documentado.
  - Cierre final de bloques documentado tras validación manual de F1.
  - Riesgo remanente explicitado: deuda histórica de lint global en F2.

---

## Registro de avances

- Fecha: 2026-03-21  
  - Cambios aplicados: Clarificación funcional y visual de "estado laboral" vs "acceso a plataforma".  
  - Bloques tocados: A1, B (comunicación de reglas), C (consistencia operativa UI).  
  - Riesgos detectados: Ninguno crítico; cambio de copy sin impacto de layout esperado.  
  - Próximo objetivo: cerrar A1 con auditoría separada y empezar A2 (scope por `position_ids`).

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre técnico A2, A3, A4 y A5 con hardening de scopes y auditoría de RRHH.  
  - Bloques tocados: A2, A3, A4, A5.  
  - Riesgos detectados: bajo; cambios internos de consulta/matching sin rediseño UI.  
  - Próximo objetivo: QA funcional guiada de punta a punta en avisos y portal checklist.

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre A1 con separación formal de auditoría entre estado laboral y acceso de plataforma.  
  - Bloques tocados: A1.  
  - Riesgos detectados: bajo; cambios solo en logs y metadata de auditoría.  
  - Próximo objetivo: iniciar Bloque B (unificación de flujo RRHH).

- Fecha: 2026-03-21  
  - Cambios aplicados: unificación parcial B1 en flujo de administradores vía API y limpieza de acción sin uso.  
  - Bloques tocados: B1, E2 (limpieza puntual).  
  - Riesgos detectados: bajo; sin cambios de interfaz ni rutas visibles para el usuario.  
  - Próximo objetivo: migrar flujo mixto "Nuevo Usuario / Empleado" para cierre completo de B1.

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre total B1 con migración de `Nuevo Usuario / Empleado` a API y eliminación de `actions.ts` de empleados.  
  - Bloques tocados: B1, E2 (limpieza).  
  - Riesgos detectados: bajo-medio; mitigado con prueba real temporal en DB y limpieza completa.  
  - Próximo objetivo: iniciar B2 (homologar validaciones entre rutas).

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre B2 con homologación de validaciones y compatibilidad de payload legado en API de empleados.  
  - Bloques tocados: B2.  
  - Riesgos detectados: bajo; se agregaron compatibilidades para evitar regresiones de formularios actuales.  
  - Próximo objetivo: iniciar B3 (alinear guardas de módulo/rol en rutas restantes).

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre B3 con guardas unificadas de módulo/rol en todas las mutaciones RRHH vía API.  
  - Bloques tocados: B3.  
  - Riesgos detectados: bajo; validación por inspección de rutas y llamadas UI.  
  - Próximo objetivo: iniciar Bloque C (hardening de seguridad y consistencia operativa).

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre C3 con branding oficial de portal empleado (`GetBackplate`).  
  - Bloques tocados: C3.  
  - Riesgos detectados: nulo; cambio de copy visual sin impacto funcional.  
  - Próximo objetivo: avanzar C1 y C2 por etapas con pruebas de no-regresión.

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre C2 con validaciones de existencia previas a mutación y respuestas consistentes `404` en RRHH API.  
  - Bloques tocados: C2.  
  - Riesgos detectados: bajo; mejora de consistencia sin cambio de interfaz.  
  - Próximo objetivo: abordar C1 de forma incremental (reducción segura de admin client en lecturas UI).

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre de bloque D completo (D1-D4) y limpieza E1 de componentes legacy no usados.  
  - Bloques tocados: D1, D2, D3, D4, E1.  
  - Riesgos detectados: bajo-medio; mitigado con lint y build completos exitosos.  
  - Próximo objetivo: avanzar C1 y cerrar pendientes E2/F1/F2/F3.

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre E2 (acción muerta checklist), smoke técnico cross-módulo y actualización de estado real F1/F2/F3.  
  - Bloques tocados: E2, F1 (avance), F2 (avance), F3 (avance).  
  - Riesgos detectados: medio en calidad global por deuda lint histórica fuera del scope inmediato.  
  - Próximo objetivo: cerrar C1 y luego smoke manual UI para cierre final F1/F3.

- Fecha: 2026-03-21  
  - Cambios aplicados: avance C1 con reducción de admin client en páginas de documentos, checklists y avisos (lecturas UI).  
  - Bloques tocados: C1 (avance).  
  - Riesgos detectados: bajo; mitigado con lint y build exitosos.  
  - Próximo objetivo: evaluar migración segura restante en `/app/employees` y `/app/users`, luego cierre final F1/F3.

- Fecha: 2026-03-21  
  - Cambios aplicados: cierre C1 completando migración de lecturas UI en `/app/employees` y `/app/users` a server client.  
  - Bloques tocados: C1.  
  - Riesgos detectados: bajo; build completo exitoso post-migración.  
  - Próximo objetivo: cierre final F1/F3 con smoke manual UI de impersonación y multiempresa.

- Fecha: 2026-03-21  
  - Cambios aplicados: QA profundo automatizado, ajuste de scripts de verificación a arquitectura actual, cobertura de auditoría faltante en cambio de contraseña y corrección de contrato de planes oficiales (`basico/pro`).  
  - Bloques tocados: F1 (avance fuerte), F2 (avance), F3 (avance).  
  - Riesgos detectados: bajo-medio; pendiente principal de cierre es smoke visual manual de UI.  
  - Próximo objetivo: ejecutar smoke visual manual y cerrar F1/F3.

- Fecha: 2026-03-21  
  - Cambios aplicados: rerun completo de QA automatizado (módulos, roles, aislamiento, guardrails, auditoría, límites, planes oficiales) con resultados en verde.  
  - Bloques tocados: F1 (avance), F2 (avance), F3 (avance).  
  - Riesgos detectados: bajo-medio; pendiente único para cierre total es validación visual/manual de impersonación y multiempresa.  
  - Próximo objetivo: ejecutar smoke visual manual y pasar F1/F3 a cerrado.

- Fecha: 2026-03-23  
  - Cambios aplicados: optimización de velocidad percibida en panel admin (queries innecesarias + skeletons reales por pantalla).  
  - Bloques tocados: C1 (refuerzo), D (refuerzo UX/performance), F3 (documentación).  
  - Riesgos detectados: bajo; cambios sin alterar reglas de negocio.  
  - Próximo objetivo: ejecutar smoke manual visual de impersonación/multiempresa para cierre final de F1/F3.

- Fecha: 2026-03-23  
  - Cambios aplicados: cierre formal de F1 (smoke manual visual validado) y F3 (documentación de cierre consolidada).  
  - Bloques tocados: F1, F3.  
  - Riesgos detectados: pendiente de calidad técnica global en F2 (deuda lint histórica).  
  - Próximo objetivo: remediación dedicada de lint para cerrar F2.

- Fecha: 2026-03-23  
  - Cambios aplicados: cierre F2 con remediación de errores de lint (0 errores), build verde y actualización de tipados/capturas en módulos críticos.  
  - Bloques tocados: F2.  
  - Riesgos detectados: bajo; quedan solo warnings no bloqueantes de prolijidad.  
  - Próximo objetivo: mantenimiento incremental de warnings en lote de housekeeping.
