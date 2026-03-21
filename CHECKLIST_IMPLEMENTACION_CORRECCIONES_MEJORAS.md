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

---

## Bloque A — Crítico (no negociar)

### [~] A1. Separar y documentar estado laboral vs acceso a plataforma

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
  - Pendiente de cierre final: auditoría separada completa para eventos de acceso.

### [ ] A2. Corregir alcance por puestos (`position_ids`)

- **Qué pasa hoy (simple):** algunos filtros por puesto comparan nombre de puesto en vez de ID.
- **Por qué está mal:** puede incluir/excluir personas equivocadas en avisos y checklists.
- **Plan a seguir:**
  1. Corregir matching en `web/src/modules/announcements/services/deliveries.ts`.
  2. Corregir matching en `web/src/modules/checklists/actions.ts`.
  3. Estandarizar uso de IDs en todo el flujo de scope.
- **Comportamiento esperado después:** la segmentación por puesto llega exactamente a quienes corresponde.
- **Evidencia de cierre:** _pendiente_

### [ ] A3. Filtrar correctamente items de checklist por plantilla en portal empleado

- **Qué pasa hoy (simple):** al abrir preview de checklist se pueden traer items fuera de la plantilla elegida.
- **Por qué está mal:** el empleado podría ver datos mezclados y el reporte perder coherencia.
- **Plan a seguir:**
  1. Ajustar query en `web/src/app/(employee)/portal/checklist/page.tsx` para traer solo items de secciones de la plantilla seleccionada.
  2. Validar consistencia entre secciones e items renderizados.
- **Comportamiento esperado después:** cada preview muestra solo su checklist real, sin contaminación de otros.
- **Evidencia de cierre:** _pendiente_

### [ ] A4. Limitar comentarios/flags/adjuntos al envío (`submission_id`) correcto

- **Qué pasa hoy (simple):** en preview se leen comentarios/flags/adjuntos a nivel organización y luego se filtra en memoria.
- **Por qué está mal:** riesgo de sobrelectura y potencial mezcla de datos no relacionados.
- **Plan a seguir:**
  1. Filtrar por `submission_id` en las consultas de `checklist_item_comments`, `checklist_flags`, `checklist_item_attachments` en `web/src/app/(employee)/portal/checklist/page.tsx`.
  2. Mantener misma UI pero con dataset estricto.
- **Comportamiento esperado después:** cada reporte solo muestra evidencias de su propio envío.
- **Evidencia de cierre:** _pendiente_

### [ ] A5. Corregir taxonomía de auditoría RRHH (create vs update)

- **Qué pasa hoy (simple):** ciertas ediciones quedan auditadas como creación.
- **Por qué está mal:** los registros de auditoría no reflejan la acción real.
- **Plan a seguir:**
  1. Ajustar acción en `web/src/modules/employees/actions.ts` para emitir `employee.update` cuando sea edición.
  2. Revisar metadata asociada para que sea trazable.
- **Comportamiento esperado después:** auditoría limpia y confiable para soporte/compliance.
- **Evidencia de cierre:** _pendiente_

---

## Bloque B — Unificación de flujo RRHH

### [ ] B1. Definir una sola vía de mutación RRHH

- **Qué pasa hoy (simple):** hay lógica de alta/edición en Server Actions y en API, con reglas distintas.
- **Por qué está mal:** el usuario puede obtener resultados diferentes según desde dónde dispare el flujo.
- **Plan a seguir:**
  1. Elegir API como fuente principal de mutaciones.
  2. Dejar Server Actions como wrappers o migrarlas gradualmente.
  3. Documentar la fuente oficial en `DOCUMENTACION_TECNICA.md`.
- **Comportamiento esperado después:** un solo comportamiento funcional, predecible y mantenible.
- **Evidencia de cierre:** _pendiente_

### [ ] B2. Homologar validaciones de alta/edición

- **Qué pasa hoy (simple):** campos obligatorios y reglas cambian entre caminos.
- **Por qué está mal:** genera errores confusos y resultados inconsistentes.
- **Plan a seguir:**
  1. Alinear validaciones de nombre/apellido, credenciales, modos y estados entre `web/src/modules/employees/actions.ts` y `web/src/app/api/company/employees/route.ts`.
  2. Reutilizar esquema de validación común donde sea posible.
- **Comportamiento esperado después:** el mismo formulario siempre responde igual ante los mismos datos.
- **Evidencia de cierre:** _pendiente_

### [ ] B3. Alinear guardas de módulo y rol en ambos caminos

- **Qué pasa hoy (simple):** un camino verifica módulo habilitado y otro no siempre.
- **Por qué está mal:** riesgo de operar sobre módulo apagado por plan.
- **Plan a seguir:**
  1. Garantizar `assertCompanyManagerModuleApi("employees")` o equivalente en toda mutación de RRHH.
  2. Revisar rutas y actions relacionadas.
- **Comportamiento esperado después:** si módulo está deshabilitado, ninguna mutación crítica pasa.
- **Evidencia de cierre:** _pendiente_

---

## Bloque C — Seguridad y consistencia operativa

### [ ] C1. Reducir uso de cliente admin en páginas de empresa

- **Qué pasa hoy (simple):** varias páginas usan `service role` para lecturas de UI.
- **Por qué está mal:** aumenta superficie de riesgo si una guarda falla.
- **Plan a seguir:**
  1. Migrar lecturas de UI a server client + RLS cuando sea viable.
  2. Dejar admin solo en operaciones estrictamente necesarias.
- **Comportamiento esperado después:** menor riesgo de exposición accidental y arquitectura más segura.
- **Evidencia de cierre:** _pendiente_

### [ ] C2. Estandarizar orden de validaciones en endpoints críticos

- **Qué pasa hoy (simple):** no todos los endpoints aplican validación en el mismo orden.
- **Por qué está mal:** puede haber comportamientos borde difíciles de predecir.
- **Plan a seguir:**
  1. Definir orden estándar: auth -> tenant -> módulo -> rol -> validación de payload -> mutación.
  2. Aplicarlo en endpoints de RRHH, documentos, checklists, settings.
- **Comportamiento esperado después:** respuestas consistentes y menor probabilidad de bypass lógico.
- **Evidencia de cierre:** _pendiente_

### [ ] C3. Corregir branding inconsistente en portal empleado

- **Qué pasa hoy (simple):** el footer menciona marca externa en vez de estándar del producto.
- **Por qué está mal:** rompe directriz de naming oficial y consistencia de marca.
- **Plan a seguir:**
  1. Ajustar footer en `web/src/shared/ui/employee-shell.tsx` a branding oficial `GetBackplate`.
- **Comportamiento esperado después:** identidad visual consistente en todos los paneles.
- **Evidencia de cierre:** _pendiente_

---

## Bloque D — Performance (sin tocar UX)

### [ ] D1. Optimizar resolución de emails por `user_id`

- **Qué pasa hoy (simple):** para obtener emails se recorren páginas de usuarios de Auth completas.
- **Por qué está mal:** escala mal y agrega latencia.
- **Plan a seguir:**
  1. Rediseñar `web/src/shared/lib/auth-users.ts` para evitar barrido completo.
  2. Usar estrategia más directa (batch optimizado / cache intermedio según disponibilidad).
- **Comportamiento esperado después:** envíos y notificaciones más rápidos con menor costo operacional.
- **Evidencia de cierre:** _pendiente_

### [ ] D2. Optimizar cálculo de almacenamiento para límites de plan

- **Qué pasa hoy (simple):** se suman tamaños de todos los documentos en cada validación.
- **Por qué está mal:** consultas pesadas repetidas en operaciones frecuentes.
- **Plan a seguir:**
  1. Optimizar `web/src/shared/lib/plan-limits.ts` con estrategia de agregado/cálculo eficiente.
  2. Verificar exactitud en casos de carga/borrado masivo.
- **Comportamiento esperado después:** enforcement de límites con menor impacto de performance.
- **Evidencia de cierre:** _pendiente_

### [ ] D3. Mejorar complejidad de `scope-users-catalog`

- **Qué pasa hoy (simple):** hay búsquedas repetidas sobre arrays grandes.
- **Por qué está mal:** complejidad O(n²) en escenarios con muchos usuarios.
- **Plan a seguir:**
  1. Reescribir `web/src/shared/lib/scope-users-catalog.ts` usando `Map/Set` para deduplicación y lookups.
  2. Mantener salida funcional idéntica.
- **Comportamiento esperado después:** mismo resultado funcional, menor tiempo de respuesta.
- **Evidencia de cierre:** _pendiente_

### [ ] D4. Corregir subconteo de documentos en portal empleado

- **Qué pasa hoy (simple):** el contador usa límite fijo (`limit(300)`), puede mostrar menos de lo real.
- **Por qué está mal:** métricas visibles inconsistentes para el usuario.
- **Plan a seguir:**
  1. Ajustar conteo en `web/src/app/(employee)/portal/layout.tsx` para reflejar total visible real.
- **Comportamiento esperado después:** contador exacto y coherente con lo que el usuario ve.
- **Evidencia de cierre:** _pendiente_

---

## Bloque E — Limpieza de deuda técnica

### [ ] E1. Deprecar y remover componentes legacy no usados

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
- **Evidencia de cierre:** _pendiente_

### [ ] E2. Eliminar acción muerta de checklist

- **Qué pasa hoy (simple):** existe `submitChecklistRunAction` sin uso real.
- **Por qué está mal:** código muerto aumenta deuda y confunde futuros cambios.
- **Plan a seguir:**
  1. Confirmar no referencias.
  2. Remover acción y ajustar imports si aplica.
- **Comportamiento esperado después:** menos código huérfano.
- **Evidencia de cierre:** _pendiente_

---

## Bloque F — QA y release controlado

### [ ] F1. Ejecutar smoke integral por módulo

- **Qué pasa hoy (simple):** hay correcciones sensibles con riesgo de regresión cruzada.
- **Por qué está mal liberar sin esto:** podría romperse un módulo no tocado visualmente.
- **Plan a seguir:**
  1. Correr smoke de empleados, documentos, anuncios, checklists, reportes, settings.
  2. Validar impersonación y multiempresa.
- **Comportamiento esperado después:** confianza de que el release no rompe flujos base.
- **Evidencia de cierre:** _pendiente_

### [ ] F2. Bajar lint y asegurar build estable

- **Qué pasa hoy (simple):** existen errores/warnings que hoy degradan calidad y confiabilidad de cambios.
- **Por qué está mal:** aumenta riesgo en producción y dificulta mantenimiento.
- **Plan a seguir:**
  1. Resolver primero errores en dominio productivo.
  2. Cerrar warnings de alto impacto.
  3. Validar `npm run lint` + `npm run build`.
- **Comportamiento esperado después:** baseline técnico sólido para seguir escalando.
- **Evidencia de cierre:** _pendiente_

### [ ] F3. Documentar cierre por bloque

- **Qué pasa hoy (simple):** sin documentación de cierre, el equipo pierde trazabilidad de decisiones.
- **Por qué está mal:** complica soporte, auditoría y continuidad.
- **Plan a seguir:**
  1. Actualizar `DOCUMENTACION_TECNICA.md` al cerrar cada bloque.
  2. Registrar riesgos remanentes y próximos pasos.
- **Comportamiento esperado después:** roadmap técnico claro y profesional.
- **Evidencia de cierre:** _pendiente_

---

## Registro de avances

- Fecha: 2026-03-21  
  - Cambios aplicados: Clarificación funcional y visual de "estado laboral" vs "acceso a plataforma".  
  - Bloques tocados: A1, B (comunicación de reglas), C (consistencia operativa UI).  
  - Riesgos detectados: Ninguno crítico; cambio de copy sin impacto de layout esperado.  
  - Próximo objetivo: cerrar A1 con auditoría separada y empezar A2 (scope por `position_ids`).
